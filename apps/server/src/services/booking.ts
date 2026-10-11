import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Db, DbHandle } from "../db/client.js";
import { appointment } from "../db/schema.js";
import { loadType, slotIsBookable } from "./availability.js";
import { cancelReminder, scheduleReminder } from "./reminders.js";

export class BookingError extends Error {}

export interface CreateAppointmentInput {
  customerId: string;
  employeeId: string;
  appointmentTypeId: string;
  startAt: number;
  notes?: string | undefined;
}

export function getAppointment(db: Db, id: string) {
  return db.select().from(appointment).where(eq(appointment.id, id)).get();
}

function assertCapable(db: Db, typeId: string, employeeId: string): number {
  const loaded = loadType(db, typeId);
  if (!loaded) throw new BookingError("Unknown appointment type");
  if (loaded.core.employeeIds.length > 0 && !loaded.core.employeeIds.includes(employeeId)) {
    throw new BookingError("Employee cannot perform this appointment type");
  }
  return loaded.plan.totalMs;
}

export function createAppointment(handle: DbHandle, input: CreateAppointmentInput) {
  const { db, sqlite } = handle;
  const totalMs = assertCapable(db, input.appointmentTypeId, input.employeeId);
  const id = randomUUID();
  const now = Date.now();
  const run = sqlite.transaction(() => {
    if (!slotIsBookable(db, input.employeeId, input.appointmentTypeId, input.startAt)) {
      throw new BookingError("The selected slot is not available");
    }
    db.insert(appointment)
      .values({
        id,
        customerId: input.customerId,
        employeeId: input.employeeId,
        appointmentTypeId: input.appointmentTypeId,
        startAt: input.startAt,
        endAt: input.startAt + totalMs,
        status: "scheduled",
        planJson: JSON.stringify(loadType(db, input.appointmentTypeId)!.plan),
        notes: input.notes ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    scheduleReminder(db, id);
  });
  run();
  return getAppointment(db, id)!;
}

export interface UpdateAppointmentInput {
  appointmentId: string;
  startAt?: number | undefined;
  employeeId?: string | undefined;
  status?: "scheduled" | "completed" | "cancelled" | "no_show" | undefined;
  notes?: string | undefined;
}

export function updateAppointment(handle: DbHandle, input: UpdateAppointmentInput) {
  const { db, sqlite } = handle;
  const existing = db.select().from(appointment).where(eq(appointment.id, input.appointmentId)).get();
  if (!existing) throw new BookingError("Unknown appointment");

  const employeeId = input.employeeId ?? existing.employeeId;
  const startAt = input.startAt ?? existing.startAt;
  const status = input.status ?? existing.status;
  const totalMs = assertCapable(db, existing.appointmentTypeId, employeeId);

  const run = sqlite.transaction(() => {
    if (
      status !== "cancelled" &&
      (startAt !== existing.startAt || employeeId !== existing.employeeId || existing.status === "cancelled")
    ) {
      const available = slotIsBookable(db, employeeId, existing.appointmentTypeId, startAt, existing.id);
      if (!available) throw new BookingError("The selected slot is not available");
    }
    db.update(appointment)
      .set({
        employeeId,
        startAt,
        endAt: startAt + totalMs,
        status,
        notes: input.notes ?? existing.notes,
        updatedAt: Date.now(),
      })
      .where(eq(appointment.id, input.appointmentId))
      .run();
    if (status === "cancelled") cancelReminder(db, input.appointmentId);
    else scheduleReminder(db, input.appointmentId);
  });
  run();
  return getAppointment(db, input.appointmentId)!;
}

export function cancelAppointment(handle: DbHandle, appointmentId: string) {
  return updateAppointment(handle, { appointmentId, status: "cancelled" });
}
