import { TRPCError } from "@trpc/server";
import { eq, like, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { appointment, customer } from "../../db/schema.js";
import { protectedProcedure, router } from "../trpc.js";

const E164 = /^\+[1-9]\d{7,14}$/;

const customerInput = z.object({
  name: z.string().min(1),
  phone: z.string().regex(E164, "Phone must be E.164, e.g. +48123123123"),
  email: z.string().optional(),
  notes: z.string().optional(),
  smsOptOut: z.boolean().default(false),
});

export const customersRouter = router({
  list: protectedProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(({ ctx, input }) => {
      const search = input?.search?.trim();
      const base = ctx.db.select().from(customer);
      const rows = search
        ? base.where(or(like(customer.name, `%${search}%`), like(customer.phone, `%${search}%`))).all()
        : base.all();
      return rows.sort((a, b) => a.name.localeCompare(b.name));
    }),
  get: protectedProcedure.input(z.object({ id: z.string() })).query(({ ctx, input }) => {
    const row = ctx.db.select().from(customer).where(eq(customer.id, input.id)).get();
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    const appointments = ctx.db
      .select()
      .from(appointment)
      .where(eq(appointment.customerId, input.id))
      .all()
      .sort((a, b) => b.startAt - a.startAt);
    return { ...row, appointments };
  }),
  create: protectedProcedure.input(customerInput).mutation(({ ctx, input }) => {
    const now = Date.now();
    const id = randomUUID();
    ctx.db
      .insert(customer)
      .values({
        id,
        name: input.name.trim(),
        phone: input.phone.trim(),
        phoneRaw: input.phone.trim(),
        email: input.email?.trim() || null,
        notes: input.notes ?? null,
        smsOptOut: input.smsOptOut,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return ctx.db.select().from(customer).where(eq(customer.id, id)).get()!;
  }),
  update: protectedProcedure
    .input(customerInput.partial().extend({ id: z.string() }))
    .mutation(({ ctx, input }) => {
      const { id, ...patch } = input;
      const existing = ctx.db.select().from(customer).where(eq(customer.id, id)).get();
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      ctx.db
        .update(customer)
        .set({
          name: patch.name?.trim() ?? existing.name,
          phone: patch.phone?.trim() ?? existing.phone,
          phoneRaw: patch.phone?.trim() ?? existing.phoneRaw,
          email: patch.email !== undefined ? patch.email || null : existing.email,
          notes: patch.notes !== undefined ? patch.notes : existing.notes,
          smsOptOut: patch.smsOptOut ?? existing.smsOptOut,
          updatedAt: Date.now(),
        })
        .where(eq(customer.id, id))
        .run();
      return ctx.db.select().from(customer).where(eq(customer.id, id)).get()!;
    }),
  remove: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => {
    const count = ctx.db.select().from(appointment).where(eq(appointment.customerId, input.id)).all().length;
    if (count > 0) throw new TRPCError({ code: "CONFLICT", message: "Customer has appointments" });
    ctx.db.delete(customer).where(eq(customer.id, input.id)).run();
    return { ok: true };
  }),
});
