import { TRPCError } from "@trpc/server";
import { and, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { appointment, appointmentType, customer, employee } from "../../db/schema.js";
import { BookingError, cancelAppointment, createAppointment, updateAppointment } from "../../services/booking.js";
import { protectedProcedure, router } from "../trpc.js";

function toTrpcError(error: unknown): never {
  if (error instanceof BookingError) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  throw error;
}

export const appointmentsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        from: z.number(),
        to: z.number(),
        employeeId: z.string().optional(),
      }),
    )
    .query(({ ctx, input }) => {
      const conditions = [gte(appointment.startAt, input.from), lte(appointment.startAt, input.to)];
      if (input.employeeId) conditions.push(eq(appointment.employeeId, input.employeeId));
      return ctx.db
        .select({
          id: appointment.id,
          startAt: appointment.startAt,
          endAt: appointment.endAt,
          status: appointment.status,
          notes: appointment.notes,
          planJson: appointment.planJson,
          employeeId: appointment.employeeId,
          employeeName: employee.name,
          customerId: appointment.customerId,
          customerName: customer.name,
          customerPhone: customer.phone,
          appointmentTypeId: appointment.appointmentTypeId,
          typeName: appointmentType.name,
          typeColor: appointmentType.color,
        })
        .from(appointment)
        .innerJoin(employee, eq(employee.id, appointment.employeeId))
        .innerJoin(customer, eq(customer.id, appointment.customerId))
        .innerJoin(appointmentType, eq(appointmentType.id, appointment.appointmentTypeId))
        .where(and(...conditions))
        .all()
        .sort((a, b) => a.startAt - b.startAt);
    }),
  create: protectedProcedure
    .input(
      z.object({
        customerId: z.string(),
        employeeId: z.string(),
        appointmentTypeId: z.string(),
        startAt: z.number(),
        notes: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      try {
        const row = createAppointment(ctx.handle, input);
        return { id: row.id, endAt: row.endAt };
      } catch (error) {
        toTrpcError(error);
      }
    }),
  update: protectedProcedure
    .input(
      z.object({
        appointmentId: z.string(),
        startAt: z.number().optional(),
        employeeId: z.string().optional(),
        status: z.enum(["scheduled", "completed", "cancelled", "no_show"]).optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      try {
        const row = updateAppointment(ctx.handle, input);
        return { id: row.id, endAt: row.endAt, status: row.status };
      } catch (error) {
        toTrpcError(error);
      }
    }),
  cancel: protectedProcedure.input(z.object({ appointmentId: z.string() })).mutation(({ ctx, input }) => {
    try {
      const row = cancelAppointment(ctx.handle, input.appointmentId);
      return { id: row.id, status: row.status };
    } catch (error) {
      toTrpcError(error);
    }
  }),
});
