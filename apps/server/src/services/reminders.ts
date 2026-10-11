import { MS_PER_MIN, shiftIntoWindow } from "@klientela/core";
import { and, eq, gte, lt, lte } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Db } from "../db/client.js";
import { appointment, appointmentType, customer, reminder } from "../db/schema.js";
import { getSettings, type SalonSettings } from "./settings.js";

export const REMINDER_LEAD_KEY = "lead";

export function reminderKey(appointmentId: string, kind = REMINDER_LEAD_KEY): string {
  return `appt:${appointmentId}:${kind}`;
}

function formatParts(ts: number, timeZone: string): { date: string; time: string } {
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(ts));
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
  return { date, time };
}

export function renderBody(settings: SalonSettings, serviceName: string, startAt: number): string {
  const { date, time } = formatParts(startAt, settings.timezone);
  const values: Record<string, string> = {
    salonName: settings.salonName,
    serviceName,
    date,
    time,
    salonPhone: settings.salonPhone,
    address: settings.address,
  };
  return settings.reminderTemplate.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? values[key]! : match,
  );
}

/**
 * Create or refresh the (single) reminder for an appointment. Idempotent on the
 * idempotency key: re-runs and reschedules update the row instead of duplicating.
 * A sent reminder is never rewritten. Missing phone or an opted-out customer
 * cancels any pending reminder instead.
 */
export function scheduleReminder(db: Db, appointmentId: string): void {
  const appt = db.select().from(appointment).where(eq(appointment.id, appointmentId)).get();
  if (!appt) return;
  const key = reminderKey(appointmentId);

  if (appt.status === "cancelled") {
    cancelReminder(db, appointmentId);
    return;
  }

  const cust = db.select().from(customer).where(eq(customer.id, appt.customerId)).get();
  const type = db.select().from(appointmentType).where(eq(appointmentType.id, appt.appointmentTypeId)).get();
  if (!cust || !cust.phone || cust.smsOptOut) {
    cancelReminder(db, appointmentId);
    return;
  }

  const settings = getSettings(db);
  const rawSend = appt.startAt - settings.reminderLeadMinutes * MS_PER_MIN;
  const scheduledFor = shiftIntoWindow(
    rawSend,
    settings.timezone,
    settings.quietHoursStartMin,
    settings.quietHoursEndMin,
  );
  const body = renderBody(settings, type?.name ?? "appointment", appt.startAt);
  const now = Date.now();

  const existing = db.select().from(reminder).where(eq(reminder.idempotencyKey, key)).get();
  if (existing) {
    if (existing.status === "sent") return;
    db.update(reminder)
      .set({
        phoneE164: cust.phone,
        body,
        scheduledFor,
        status: existing.status === "claimed" ? "pending" : existing.status,
        leaseUntil: null,
        updatedAt: now,
      })
      .where(eq(reminder.id, existing.id))
      .run();
    return;
  }

  db.insert(reminder)
    .values({
      id: randomUUID(),
      appointmentId,
      customerId: cust.id,
      phoneE164: cust.phone,
      body,
      scheduledFor,
      status: "pending",
      attempts: 0,
      idempotencyKey: key,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

export function cancelReminder(db: Db, appointmentId: string): void {
  const existing = db.select().from(reminder).where(eq(reminder.idempotencyKey, reminderKey(appointmentId))).get();
  if (!existing || existing.status === "sent") return;
  db.update(reminder)
    .set({ status: "cancelled", updatedAt: Date.now() })
    .where(eq(reminder.id, existing.id))
    .run();
}

export interface SchedulerResult {
  scheduled: number;
  cancelled: number;
  released: number;
}

/** Recompute the reminder horizon and clear stale/expired rows. Safe to run often. */
export function runScheduler(db: Db, now = Date.now()): SchedulerResult {
  const horizon = now + 7 * 24 * 60 * MS_PER_MIN;
  const upcoming = db
    .select()
    .from(appointment)
    .where(
      and(
        eq(appointment.status, "scheduled"),
        gte(appointment.startAt, now - 15 * MS_PER_MIN),
        lte(appointment.startAt, horizon),
      ),
    )
    .all();
  for (const appt of upcoming) scheduleReminder(db, appt.id);

  const cutoff = now - 15 * MS_PER_MIN;
  const stale = db
    .select({ id: reminder.id })
    .from(reminder)
    .innerJoin(appointment, eq(appointment.id, reminder.appointmentId))
    .where(and(eq(reminder.status, "pending"), lt(appointment.startAt, cutoff)))
    .all();
  for (const row of stale) {
    db.update(reminder).set({ status: "cancelled", updatedAt: now }).where(eq(reminder.id, row.id)).run();
  }

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

  return { scheduled: upcoming.length, cancelled: stale.length, released: expired.length };
}

/** Start a periodic in-process scheduler tick. Returns a stop function. */
export function startScheduler(db: Db, intervalMs = 5 * MS_PER_MIN): () => void {
  const tick = () => {
    try {
      runScheduler(db);
    } catch (error) {
      console.error("reminder scheduler tick failed", error);
    }
  };
  tick();
  const handle = setInterval(tick, intervalMs);
  handle.unref?.();
  return () => clearInterval(handle);
}
