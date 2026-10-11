import {
  AppointmentType as AppointmentTypeSchema,
  computeAvailability,
  localMidnightUtc,
  resolvePlan,
  workWindowsForDay,
  type AvailabilitySlot,
  type BusyInterval,
  type ResolvedPlan,
  type WorkWindow,
} from "@klientela/core";
import { and, eq, gte, inArray, lt, lte, ne } from "drizzle-orm";
import type { Db } from "../db/client.js";
import {
  appointment,
  appointmentType,
  appointmentTypeEmployee,
  appointmentTypeSegment,
  employee,
  employeeSchedule,
  timeOff,
} from "../db/schema.js";
import { getSettings } from "./settings.js";

export interface LoadedType {
  id: string;
  core: ReturnType<typeof AppointmentTypeSchema.parse>;
  plan: ResolvedPlan;
}

export function loadType(db: Db, typeId: string): LoadedType | null {
  const typeRow = db.select().from(appointmentType).where(eq(appointmentType.id, typeId)).get();
  if (!typeRow) return null;
  const segments = db
    .select()
    .from(appointmentTypeSegment)
    .where(eq(appointmentTypeSegment.appointmentTypeId, typeId))
    .all()
    .sort((a, b) => a.position - b.position);
  const employeeIds = db
    .select()
    .from(appointmentTypeEmployee)
    .where(eq(appointmentTypeEmployee.appointmentTypeId, typeId))
    .all()
    .map((r) => r.employeeId);

  const core = AppointmentTypeSchema.parse({
    name: typeRow.name,
    active: typeRow.active,
    bufferBeforeMin: typeRow.bufferBeforeMin,
    bufferAfterMin: typeRow.bufferAfterMin,
    color: typeRow.color,
    segments: segments.map((s) => ({
      position: s.position,
      kind: s.kind,
      durationMin: s.durationMin,
      ...(s.label ? { label: s.label } : {}),
    })),
    employeeIds,
  });
  return { id: typeId, core, plan: resolvePlan(core) };
}

export function parsePlan(planJson: string): ResolvedPlan {
  return JSON.parse(planJson) as ResolvedPlan;
}

function absoluteActiveIntervals(employeeId: string, startAt: number, plan: ResolvedPlan): BusyInterval[] {
  return plan.activeIntervals.map((interval) => ({
    employeeId,
    start: startAt + interval.startOffsetMs,
    end: startAt + interval.endOffsetMs,
  }));
}

export interface AvailabilityQuery {
  employeeIds: string[];
  typeId: string;
  from: number;
  to: number;
  slotStepMin?: number;
  /** Exclude this appointment from the busy set (used when rescheduling it). */
  excludeAppointmentId?: string;
}

export function queryAvailability(db: Db, query: AvailabilityQuery): AvailabilitySlot[] {
  const loaded = loadType(db, query.typeId);
  if (!loaded) return [];
  const settings = getSettings(db);
  const tz = settings.timezone;

  const allEmployees = db
    .select()
    .from(employee)
    .where(eq(employee.active, true))
    .all();

  let candidateIds = query.employeeIds.length > 0 ? query.employeeIds : allEmployees.map((e) => e.id);
  if (loaded.core.employeeIds.length > 0) {
    candidateIds = candidateIds.filter((id) => loaded.core.employeeIds.includes(id));
  }
  if (candidateIds.length === 0) return [];

  const capacityByEmployee: Record<string, number> = {};
  const schedules = db.select().from(employeeSchedule).all();
  const workWindows: WorkWindow[] = [];
  const seenDays = new Set<number>();
  const daySpan = Math.ceil((query.to - query.from) / 86_400_000) + 2;
  for (let d = 0; d <= daySpan; d += 1) {
    const ts = query.from + d * 86_400_000;
    const dayStart = localMidnightUtc(ts, tz);
    if (seenDays.has(dayStart)) continue;
    seenDays.add(dayStart);
    for (const emp of allEmployees) {
      if (!candidateIds.includes(emp.id)) continue;
      const schedule = schedules
        .filter((s) => s.employeeId === emp.id)
        .map((s) => ({ weekday: s.weekday, startMin: s.startMin, endMin: s.endMin }));
      workWindows.push(...workWindowsForDay(emp.id, schedule, ts, tz));
    }
  }

  for (const emp of allEmployees) capacityByEmployee[emp.id] = emp.capacity;
  for (const id of candidateIds) if (capacityByEmployee[id] === undefined) capacityByEmployee[id] = 1;

  const offRows = db
    .select()
    .from(timeOff)
    .where(and(inArray(timeOff.employeeId, candidateIds), lt(timeOff.startAt, query.to), gte(timeOff.endAt, query.from)))
    .all();

  const apptRows = db
    .select()
    .from(appointment)
    .where(
      and(
        inArray(appointment.employeeId, candidateIds),
        ne(appointment.status, "cancelled"),
        lt(appointment.startAt, query.to),
        gte(appointment.endAt, query.from),
        query.excludeAppointmentId ? ne(appointment.id, query.excludeAppointmentId) : undefined,
      ),
    )
    .all();

  const busy: BusyInterval[] = [];
  for (const row of apptRows) {
    busy.push(...absoluteActiveIntervals(row.employeeId, row.startAt, parsePlan(row.planJson)));
  }

  return computeAvailability({
    employeeIds: candidateIds,
    type: loaded.core,
    rangeStart: query.from,
    rangeEnd: query.to,
    slotStepMin: query.slotStepMin ?? 15,
    workWindows,
    timeOff: offRows.map((r) => ({ employeeId: r.employeeId, start: r.startAt, end: r.endAt })),
    busy,
    capacityByEmployee,
  });
}

/** True when `[startAt, startAt + duration)` is bookable for the employee/type. */
export function slotIsBookable(
  db: Db,
  employeeId: string,
  typeId: string,
  startAt: number,
  excludeAppointmentId?: string,
): boolean {
  const loaded = loadType(db, typeId);
  if (!loaded) return false;
  const slots = queryAvailability(db, {
    employeeIds: [employeeId],
    typeId,
    from: startAt,
    to: startAt + loaded.plan.totalMs,
    slotStepMin: 1,
    ...(excludeAppointmentId ? { excludeAppointmentId } : {}),
  });
  return slots.some((slot) => slot.employeeId === employeeId && slot.start === startAt);
}

export function upcomingAppointmentsForEmployee(db: Db, employeeId: string, from: number, to: number) {
  return db
    .select()
    .from(appointment)
    .where(
      and(
        eq(appointment.employeeId, employeeId),
        ne(appointment.status, "cancelled"),
        gte(appointment.startAt, from),
        lte(appointment.startAt, to),
      ),
    )
    .all();
}
