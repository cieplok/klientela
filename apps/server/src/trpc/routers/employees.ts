import { TRPCError } from "@trpc/server";
import { and, eq, gte, lte } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { employee, employeeSchedule, timeOff } from "../../db/schema.js";
import { protectedProcedure, router } from "../trpc.js";

const scheduleSchema = z.array(
  z.object({
    weekday: z.number().int().min(0).max(6),
    startMin: z.number().int().min(0).max(1440),
    endMin: z.number().int().min(0).max(1440),
  }),
);

const employeeInput = z.object({
  name: z.string().min(1),
  active: z.boolean().default(true),
  capacity: z.number().int().min(1).default(1),
  color: z.string().default("#e0a3c0"),
  schedule: scheduleSchema.default([]),
});

export const employeesRouter = router({
  list: protectedProcedure.query(({ ctx }) => {
    const rows = ctx.db.select().from(employee).all();
    const schedules = ctx.db.select().from(employeeSchedule).all();
    return rows
      .map((row) => ({
        ...row,
        schedule: schedules
          .filter((s) => s.employeeId === row.id)
          .map((s) => ({ weekday: s.weekday, startMin: s.startMin, endMin: s.endMin }))
          .sort((a, b) => a.weekday - b.weekday || a.startMin - b.startMin),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }),
  get: protectedProcedure.input(z.object({ id: z.string() })).query(({ ctx, input }) => {
    const row = ctx.db.select().from(employee).where(eq(employee.id, input.id)).get();
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    const schedule = ctx.db
      .select()
      .from(employeeSchedule)
      .where(eq(employeeSchedule.employeeId, input.id))
      .all()
      .map((s) => ({ weekday: s.weekday, startMin: s.startMin, endMin: s.endMin }));
    const off = ctx.db.select().from(timeOff).where(eq(timeOff.employeeId, input.id)).all();
    return { ...row, schedule, timeOff: off };
  }),
  create: protectedProcedure.input(employeeInput).mutation(({ ctx, input }) => {
    const now = Date.now();
    const id = randomUUID();
    const run = ctx.handle.sqlite.transaction(() => {
      ctx.db
        .insert(employee)
        .values({
          id,
          name: input.name.trim(),
          active: input.active,
          capacity: input.capacity,
          color: input.color,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      for (const window of input.schedule) {
        ctx.db
          .insert(employeeSchedule)
          .values({ id: randomUUID(), employeeId: id, weekday: window.weekday, startMin: window.startMin, endMin: window.endMin })
          .run();
      }
    });
    run();
    return { id };
  }),
  update: protectedProcedure
    .input(employeeInput.partial().extend({ id: z.string() }))
    .mutation(({ ctx, input }) => {
      const { id, schedule, ...patch } = input;
      const existing = ctx.db.select().from(employee).where(eq(employee.id, id)).get();
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      const run = ctx.handle.sqlite.transaction(() => {
        ctx.db
          .update(employee)
          .set({
            name: patch.name?.trim() ?? existing.name,
            active: patch.active ?? existing.active,
            capacity: patch.capacity ?? existing.capacity,
            color: patch.color ?? existing.color,
            updatedAt: Date.now(),
          })
          .where(eq(employee.id, id))
          .run();
        if (schedule) {
          ctx.db.delete(employeeSchedule).where(eq(employeeSchedule.employeeId, id)).run();
          for (const window of schedule) {
            ctx.db
              .insert(employeeSchedule)
              .values({ id: randomUUID(), employeeId: id, weekday: window.weekday, startMin: window.startMin, endMin: window.endMin })
              .run();
          }
        }
      });
      run();
      return { ok: true };
    }),
  addTimeOff: protectedProcedure
    .input(z.object({ employeeId: z.string(), startAt: z.number(), endAt: z.number(), reason: z.string().optional() }))
    .mutation(({ ctx, input }) => {
      const id = randomUUID();
      ctx.db
        .insert(timeOff)
        .values({ id, employeeId: input.employeeId, startAt: input.startAt, endAt: input.endAt, reason: input.reason ?? null })
        .run();
      return { id };
    }),
  removeTimeOff: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => {
    ctx.db.delete(timeOff).where(eq(timeOff.id, input.id)).run();
    return { ok: true };
  }),
  listTimeOff: protectedProcedure
    .input(z.object({ employeeId: z.string().optional(), from: z.number(), to: z.number() }))
    .query(({ ctx, input }) => {
      const conditions = [gte(timeOff.endAt, input.from), lte(timeOff.startAt, input.to)];
      if (input.employeeId) conditions.push(eq(timeOff.employeeId, input.employeeId));
      return ctx.db.select().from(timeOff).where(and(...conditions)).all();
    }),
});
