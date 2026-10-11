import { resolvePlan } from "./plan.js";
import { MS_PER_MIN, type AppointmentType } from "./types.js";

export interface AbsoluteInterval {
  employeeId: string;
  start: number;
  end: number;
}

export interface WorkWindow {
  employeeId: string;
  start: number;
  end: number;
}

export type TimeOffInterval = AbsoluteInterval;
/** Only `active` intervals of existing appointments belong here; gaps do not occupy. */
export type BusyInterval = AbsoluteInterval;

export interface AvailabilityInput {
  employeeIds: string[];
  type: AppointmentType;
  rangeStart: number;
  rangeEnd: number;
  /** slot granularity in minutes */
  slotStepMin: number;
  workWindows: WorkWindow[];
  timeOff: TimeOffInterval[];
  busy: BusyInterval[];
  capacityByEmployee: Record<string, number>;
}

export interface AvailabilitySlot {
  employeeId: string;
  start: number;
  end: number;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Maximum number of intervals overlapping at any instant (sweep line). */
export function maxConcurrency(intervals: AbsoluteInterval[]): number {
  const starts = intervals.map((i) => i.start).sort((a, b) => a - b);
  const ends = intervals.map((i) => i.end).sort((a, b) => a - b);
  let count = 0;
  let max = 0;
  let i = 0;
  let j = 0;
  while (i < starts.length) {
    // Process all starts at or before the next end.
    if (j >= ends.length || starts[i]! < ends[j]!) {
      count += 1;
      max = Math.max(max, count);
      i += 1;
    } else {
      count -= 1;
      j += 1;
    }
  }
  return max;
}

function candidateActiveIntervals(
  activeIntervals: { startOffsetMs: number; endOffsetMs: number }[],
  employeeId: string,
  start: number,
): AbsoluteInterval[] {
  return activeIntervals.map((interval) => ({
    employeeId,
    start: start + interval.startOffsetMs,
    end: start + interval.endOffsetMs,
  }));
}

/**
 * Compute every bookable slot in `[rangeStart, rangeEnd)` for the given employees
 * and appointment type, honouring work windows, time off, and per-employee capacity.
 * A `gap` segment in the candidate type does not consume capacity, so it can overlap
 * other work.
 */
export function computeAvailability(input: AvailabilityInput): AvailabilitySlot[] {
  const plan = resolvePlan(input.type);
  const stepMs = input.slotStepMin * MS_PER_MIN;
  const slots: AvailabilitySlot[] = [];

  for (const employeeId of input.employeeIds) {
    const capacity = input.capacityByEmployee[employeeId] ?? 1;
    const windows = input.workWindows.filter((w) => w.employeeId === employeeId);
    if (windows.length === 0) continue;
    const offs = input.timeOff.filter((t) => t.employeeId === employeeId);
    const existing = input.busy.filter((b) => b.employeeId === employeeId);

    for (let start = input.rangeStart; start + plan.totalMs <= input.rangeEnd; start += stepMs) {
      const end = start + plan.totalMs;
      if (!windows.some((w) => start >= w.start && end <= w.end)) continue;
      if (offs.some((t) => overlaps(start, end, t.start, t.end))) continue;

      const candidate = candidateActiveIntervals(plan.activeIntervals, employeeId, start);
      if (maxConcurrency([...existing, ...candidate]) > capacity) continue;

      slots.push({ employeeId, start, end });
    }
  }

  return slots.sort((a, b) => a.start - b.start || a.employeeId.localeCompare(b.employeeId));
}

/** True when a specific employee/start is bookable for the type. */
export function isSlotAvailable(
  input: AvailabilityInput,
  employeeId: string,
  start: number,
): boolean {
  return computeAvailability(input).some(
    (slot) => slot.employeeId === employeeId && slot.start === start,
  );
}
