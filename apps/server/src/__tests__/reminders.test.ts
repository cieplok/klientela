import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { migrate } from "../db/migrations.js";
import {
  appointmentType,
  appointmentTypeSegment,
  customer,
  employee,
  employeeSchedule,
  reminder,
} from "../db/schema.js";
import { BookingError, createAppointment, updateAppointment } from "../services/booking.js";
import { queryAvailability } from "../services/availability.js";
import { runScheduler, scheduleReminder } from "../services/reminders.js";

// Monday 2026-10-12 10:00 Europe/Warsaw (CEST).
const T = Date.UTC(2026, 9, 12, 8, 0, 0);
const HOUR = 3_600_000;

function setup(): { handle: DbHandle; employeeId: string; customerId: string; typeId: string } {
  const handle = createDb(":memory:");
  migrate(handle.sqlite);
  const now = Date.now();
  const employeeId = randomUUID();
  const customerId = randomUUID();
  const typeId = randomUUID();
  handle.db
    .insert(employee)
    .values({ id: employeeId, name: "Alice", active: true, capacity: 1, color: "#fff", createdAt: now, updatedAt: now })
    .run();
  handle.db
    .insert(employeeSchedule)
    .values({ id: randomUUID(), employeeId, weekday: 1, startMin: 9 * 60, endMin: 17 * 60 })
    .run();
  handle.db
    .insert(customer)
    .values({ id: customerId, name: "Jane", phone: "+48123123123", phoneRaw: "+48 123 123 123", smsOptOut: false, createdAt: now, updatedAt: now })
    .run();
  handle.db
    .insert(appointmentType)
    .values({ id: typeId, name: "Haircut", active: true, bufferBeforeMin: 0, bufferAfterMin: 0, color: "#7c9cff", createdAt: now, updatedAt: now })
    .run();
  handle.db
    .insert(appointmentTypeSegment)
    .values({ id: randomUUID(), appointmentTypeId: typeId, position: 0, kind: "active", durationMin: 60, label: "Cut" })
    .run();
  return { handle, employeeId, customerId, typeId };
}

describe("reminder scheduling", () => {
  it("creates a pending reminder idempotently", () => {
    const { handle, employeeId, customerId, typeId } = setup();
    const appt = createAppointment(handle, { customerId, employeeId, appointmentTypeId: typeId, startAt: T });
    scheduleReminder(handle.db, appt.id);
    scheduleReminder(handle.db, appt.id);
    const rows = handle.db.select().from(reminder).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("pending");
    expect(rows[0]!.body).toContain("Haircut");
  });

  it("does not clobber an in-flight claim on a scheduler tick", () => {
    const { handle, employeeId, customerId, typeId } = setup();
    const appt = createAppointment(handle, { customerId, employeeId, appointmentTypeId: typeId, startAt: T });
    const row = handle.db.select().from(reminder).all()[0]!;
    handle.db
      .update(reminder)
      .set({ status: "claimed", leaseUntil: Date.now() + 30 * 60_000 })
      .where(eq(reminder.id, row.id))
      .run();
    runScheduler(handle.db);
    const after = handle.db.select().from(reminder).where(eq(reminder.id, row.id)).get()!;
    expect(after.status).toBe("claimed");
    void appt;
  });

  it("reschedules and releases a claim when the appointment moves", () => {
    const { handle, employeeId, customerId, typeId } = setup();
    const appt = createAppointment(handle, { customerId, employeeId, appointmentTypeId: typeId, startAt: T });
    const before = handle.db.select().from(reminder).all()[0]!;
    handle.db
      .update(reminder)
      .set({ status: "claimed", leaseUntil: Date.now() + 30 * 60_000 })
      .where(eq(reminder.id, before.id))
      .run();
    updateAppointment(handle, { appointmentId: appt.id, startAt: T + HOUR });
    const after = handle.db.select().from(reminder).where(eq(reminder.id, before.id)).get()!;
    expect(after.status).toBe("pending");
    expect(after.scheduledFor).toBeGreaterThan(before.scheduledFor);
  });

  it("cancels the reminder when the appointment is completed", () => {
    const { handle, employeeId, customerId, typeId } = setup();
    const appt = createAppointment(handle, { customerId, employeeId, appointmentTypeId: typeId, startAt: T });
    updateAppointment(handle, { appointmentId: appt.id, status: "completed" });
    expect(handle.db.select().from(reminder).all()[0]!.status).toBe("cancelled");
  });
});

describe("booking", () => {
  it("rejects an overlapping appointment", () => {
    const { handle, employeeId, customerId, typeId } = setup();
    createAppointment(handle, { customerId, employeeId, appointmentTypeId: typeId, startAt: T });
    expect(() => createAppointment(handle, { customerId, employeeId, appointmentTypeId: typeId, startAt: T })).toThrow(
      BookingError,
    );
  });

  it("re-checks availability when an appointment is un-cancelled", () => {
    const { handle, employeeId, customerId, typeId } = setup();
    const first = createAppointment(handle, { customerId, employeeId, appointmentTypeId: typeId, startAt: T });
    updateAppointment(handle, { appointmentId: first.id, status: "cancelled" });
    // The freed slot is taken by someone else.
    createAppointment(handle, { customerId, employeeId, appointmentTypeId: typeId, startAt: T });
    expect(() => updateAppointment(handle, { appointmentId: first.id, status: "scheduled" })).toThrow(BookingError);
  });
});

describe("availability query", () => {
  it("excludes the appointment being rescheduled from its own busy set", () => {
    const { handle, employeeId, customerId, typeId } = setup();
    const appt = createAppointment(handle, { customerId, employeeId, appointmentTypeId: typeId, startAt: T });
    const base = { employeeIds: [employeeId], typeId, from: T, to: T + HOUR, slotStepMin: 1 };

    const occupied = queryAvailability(handle.db, base);
    expect(occupied.some((s) => s.start === T)).toBe(false);

    const excludingSelf = queryAvailability(handle.db, { ...base, excludeAppointmentId: appt.id });
    expect(excludingSelf.some((s) => s.start === T)).toBe(true);
  });
});
