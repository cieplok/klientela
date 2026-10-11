import { TRPCError } from "@trpc/server";
import { and, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { appointment, customer, device, reminder } from "../../db/schema.js";
import { runScheduler } from "../../services/reminders.js";
import { protectedProcedure, router } from "../trpc.js";

export const remindersRouter = router({
  list: protectedProcedure
    .input(z.object({ status: z.enum(["pending", "claimed", "sent", "failed", "cancelled"]).optional() }).optional())
    .query(({ ctx, input }) => {
      const conditions = input?.status ? [eq(reminder.status, input.status)] : [];
      return ctx.db
        .select({
          id: reminder.id,
          status: reminder.status,
          scheduledFor: reminder.scheduledFor,
          sentAt: reminder.sentAt,
          attempts: reminder.attempts,
          errorMessage: reminder.errorMessage,
          body: reminder.body,
          phoneE164: reminder.phoneE164,
          customerName: customer.name,
          appointmentStartAt: appointment.startAt,
          appointmentId: reminder.appointmentId,
          deviceName: device.name,
        })
        .from(reminder)
        .innerJoin(customer, eq(customer.id, reminder.customerId))
        .innerJoin(appointment, eq(appointment.id, reminder.appointmentId))
        .leftJoin(device, eq(device.id, reminder.claimedByDeviceId))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .all()
        .sort((a, b) => a.scheduledFor - b.scheduledFor);
    }),
  retry: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => {
    const row = ctx.db.select().from(reminder).where(eq(reminder.id, input.id)).get();
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    ctx.db
      .update(reminder)
      .set({ status: "pending", leaseUntil: null, claimedByDeviceId: null, errorMessage: null, updatedAt: Date.now() })
      .where(eq(reminder.id, input.id))
      .run();
    return { ok: true };
  }),
  cancel: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => {
    ctx.db.update(reminder).set({ status: "cancelled", updatedAt: Date.now() }).where(eq(reminder.id, input.id)).run();
    return { ok: true };
  }),
  runScheduler: protectedProcedure.mutation(({ ctx }) => runScheduler(ctx.db)),
  noShowCount: protectedProcedure
    .input(z.object({ from: z.number(), to: z.number() }))
    .query(({ ctx, input }) => {
      const rows = ctx.db
        .select({ status: appointment.status })
        .from(appointment)
        .where(and(gte(appointment.startAt, input.from), lte(appointment.startAt, input.to)))
        .all();
      return {
        total: rows.length,
        noShow: rows.filter((r) => r.status === "no_show").length,
      };
    }),
});
