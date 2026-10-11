import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { appointmentType, appointmentTypeEmployee, appointmentTypeSegment } from "../../db/schema.js";
import { protectedProcedure, router } from "../trpc.js";

const typeInput = z.object({
  name: z.string().min(1),
  active: z.boolean().default(true),
  bufferBeforeMin: z.number().int().min(0).default(0),
  bufferAfterMin: z.number().int().min(0).default(0),
  color: z.string().default("#7c9cff"),
  segments: z
    .array(
      z.object({
        position: z.number().int().min(0),
        kind: z.enum(["active", "gap"]),
        durationMin: z.number().int().positive(),
        label: z.string().optional(),
      }),
    )
    .min(1),
  employeeIds: z.array(z.string()).default([]),
});

function totalMinutes(input: z.infer<typeof typeInput>): number {
  return (
    input.bufferBeforeMin +
    input.bufferAfterMin +
    input.segments.reduce((sum, segment) => sum + segment.durationMin, 0)
  );
}

export const appointmentTypesRouter = router({
  list: protectedProcedure.query(({ ctx }) => {
    const types = ctx.db.select().from(appointmentType).all();
    const segments = ctx.db.select().from(appointmentTypeSegment).all();
    const mapped = ctx.db.select().from(appointmentTypeEmployee).all();
    return types
      .map((type) => {
        const segs = segments
          .filter((s) => s.appointmentTypeId === type.id)
          .sort((a, b) => a.position - b.position)
          .map((s) => ({ position: s.position, kind: s.kind, durationMin: s.durationMin, label: s.label ?? undefined }));
        const employeeIds = mapped.filter((m) => m.appointmentTypeId === type.id).map((m) => m.employeeId);
        const totalMin =
          type.bufferBeforeMin + type.bufferAfterMin + segs.reduce((sum, s) => sum + s.durationMin, 0);
        return { ...type, segments: segs, employeeIds, totalMin };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }),
  get: protectedProcedure.input(z.object({ id: z.string() })).query(({ ctx, input }) => {
    const type = ctx.db.select().from(appointmentType).where(eq(appointmentType.id, input.id)).get();
    if (!type) throw new TRPCError({ code: "NOT_FOUND" });
    const segs = ctx.db
      .select()
      .from(appointmentTypeSegment)
      .where(eq(appointmentTypeSegment.appointmentTypeId, input.id))
      .all()
      .sort((a, b) => a.position - b.position)
      .map((s) => ({ position: s.position, kind: s.kind, durationMin: s.durationMin, label: s.label ?? undefined }));
    const employeeIds = ctx.db
      .select()
      .from(appointmentTypeEmployee)
      .where(eq(appointmentTypeEmployee.appointmentTypeId, input.id))
      .all()
      .map((m) => m.employeeId);
    return { ...type, segments: segs, employeeIds };
  }),
  create: protectedProcedure.input(typeInput).mutation(({ ctx, input }) => {
    const id = randomUUID();
    const now = Date.now();
    const run = ctx.handle.sqlite.transaction(() => {
      ctx.db
        .insert(appointmentType)
        .values({
          id,
          name: input.name.trim(),
          active: input.active,
          bufferBeforeMin: input.bufferBeforeMin,
          bufferAfterMin: input.bufferAfterMin,
          color: input.color,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      for (const segment of input.segments) {
        ctx.db
          .insert(appointmentTypeSegment)
          .values({
            id: randomUUID(),
            appointmentTypeId: id,
            position: segment.position,
            kind: segment.kind,
            durationMin: segment.durationMin,
            label: segment.label ?? null,
          })
          .run();
      }
      for (const employeeId of input.employeeIds) {
        ctx.db.insert(appointmentTypeEmployee).values({ appointmentTypeId: id, employeeId }).run();
      }
    });
    run();
    return { id, totalMin: totalMinutes(input) };
  }),
  update: protectedProcedure
    .input(typeInput.partial().extend({ id: z.string() }))
    .mutation(({ ctx, input }) => {
      const { id, ...patch } = input;
      const existing = ctx.db.select().from(appointmentType).where(eq(appointmentType.id, id)).get();
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      const run = ctx.handle.sqlite.transaction(() => {
        ctx.db
          .update(appointmentType)
          .set({
            name: patch.name?.trim() ?? existing.name,
            active: patch.active ?? existing.active,
            bufferBeforeMin: patch.bufferBeforeMin ?? existing.bufferBeforeMin,
            bufferAfterMin: patch.bufferAfterMin ?? existing.bufferAfterMin,
            color: patch.color ?? existing.color,
            updatedAt: Date.now(),
          })
          .where(eq(appointmentType.id, id))
          .run();
        if (patch.segments) {
          ctx.db.delete(appointmentTypeSegment).where(eq(appointmentTypeSegment.appointmentTypeId, id)).run();
          for (const segment of patch.segments) {
            ctx.db
              .insert(appointmentTypeSegment)
              .values({
                id: randomUUID(),
                appointmentTypeId: id,
                position: segment.position,
                kind: segment.kind,
                durationMin: segment.durationMin,
                label: segment.label ?? null,
              })
              .run();
          }
        }
        if (patch.employeeIds) {
          ctx.db.delete(appointmentTypeEmployee).where(eq(appointmentTypeEmployee.appointmentTypeId, id)).run();
          for (const employeeId of patch.employeeIds) {
            ctx.db.insert(appointmentTypeEmployee).values({ appointmentTypeId: id, employeeId }).run();
          }
        }
      });
      run();
      return { ok: true };
    }),
});
