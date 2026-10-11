import { and, eq, gt, inArray, lt, lte } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { hashToken } from "../auth/session.js";
import type { DbHandle } from "../db/client.js";
import { appointment, customer, device, reminder } from "../db/schema.js";
import { getSettings } from "../services/settings.js";

const LEASE_MS = 30 * 60 * 1000;
const CUTOFF_MS = 15 * 60 * 1000;
const POLL_INTERVAL_MINUTES = 240;

const helloBody = z.object({ appVersion: z.string().optional() });
const resultsBody = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      idempotencyKey: z.string(),
      status: z.enum(["sent", "failed"]),
      sentAt: z.number().optional(),
      error: z.string().optional(),
    }),
  ),
});

type DeviceRow = typeof device.$inferSelect;

export function registerSyncRoutes(app: FastifyInstance, handle: DbHandle): void {
  const { db } = handle;

  function authenticate(req: FastifyRequest): DeviceRow | null {
    const header = req.headers.authorization ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) return null;
    const tokenHash = hashToken(match[1]!.trim());
    const row = db
      .select()
      .from(device)
      .where(and(eq(device.tokenHash, tokenHash), eq(device.active, true)))
      .get();
    return row ?? null;
  }

  function releaseExpiredLeases(now: number): void {
    const expired = db
      .select()
      .from(reminder)
      .where(and(eq(reminder.status, "claimed"), lt(reminder.leaseUntil, now)))
      .all();
    for (const row of expired) {
      db.update(reminder)
        .set({ status: "pending", leaseUntil: null, claimedByDeviceId: null, updatedAt: now })
        .where(eq(reminder.id, row.id))
        .run();
    }
  }

  app.post("/sync/v1/hello", async (req, reply) => {
    const deviceRow = authenticate(req);
    if (!deviceRow) return reply.code(401).send({ error: "unauthorized" });
    const parsed = helloBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
    db.update(device).set({ lastSeenAt: Date.now() }).where(eq(device.id, deviceRow.id)).run();
    const settings = getSettings(db);
    return {
      salonName: settings.salonName,
      address: settings.address,
      pollIntervalMinutes: POLL_INTERVAL_MINUTES,
    };
  });

  app.post("/sync/v1/reminders", async (req, reply) => {
    const deviceRow = authenticate(req);
    if (!deviceRow) return reply.code(401).send({ error: "unauthorized" });
    const now = Date.now();
    releaseExpiredLeases(now);

    const due = db
      .select({
        id: reminder.id,
        phoneE164: reminder.phoneE164,
        body: reminder.body,
        idempotencyKey: reminder.idempotencyKey,
        scheduledFor: reminder.scheduledFor,
        appointmentStartAt: appointment.startAt,
        optOut: customer.smsOptOut,
      })
      .from(reminder)
      .innerJoin(appointment, eq(appointment.id, reminder.appointmentId))
      .innerJoin(customer, eq(customer.id, reminder.customerId))
      .where(
        and(
          eq(reminder.status, "pending"),
          lte(reminder.scheduledFor, now),
          gt(appointment.startAt, now - CUTOFF_MS),
        ),
      )
      .all()
      .filter((row) => !row.optOut);

    const dueIds = due.map((row) => row.id);
    if (dueIds.length > 0) {
      db.update(reminder)
        .set({
          status: "claimed",
          leaseUntil: now + LEASE_MS,
          claimedByDeviceId: deviceRow.id,
          updatedAt: now,
        })
        .where(and(inArray(reminder.id, dueIds), eq(reminder.status, "pending")))
        .run();
    }

    return {
      reminders: due.map((row) => ({
        id: row.id,
        phoneE164: row.phoneE164,
        body: row.body,
        idempotencyKey: row.idempotencyKey,
        appointmentStartAt: row.appointmentStartAt,
        scheduledFor: row.scheduledFor,
      })),
      leaseSeconds: Math.floor(LEASE_MS / 1000),
      serverTime: now,
    };
  });

  app.post("/sync/v1/reminders/results", async (req, reply) => {
    const deviceRow = authenticate(req);
    if (!deviceRow) return reply.code(401).send({ error: "unauthorized" });
    const parsed = resultsBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
    const now = Date.now();
    let applied = 0;
    let ignored = 0;
    for (const result of parsed.data.results) {
      const row = db.select().from(reminder).where(eq(reminder.id, result.id)).get();
      if (
        !row ||
        row.idempotencyKey !== result.idempotencyKey ||
        row.status !== "claimed" ||
        row.claimedByDeviceId !== deviceRow.id
      ) {
        ignored += 1;
        continue;
      }
      db.update(reminder)
        .set({
          status: result.status === "sent" ? "sent" : "failed",
          sentAt: result.status === "sent" ? (result.sentAt ?? now) : null,
          errorMessage: result.error ?? null,
          attempts: row.attempts + 1,
          leaseUntil: null,
          claimedByDeviceId: deviceRow.id,
          updatedAt: now,
        })
        .where(eq(reminder.id, row.id))
        .run();
      applied += 1;
    }
    return { applied, ignored };
  });
}
