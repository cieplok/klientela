import { MS_PER_MIN, type ScheduleWindow } from "./types.js";
import type { WorkWindow } from "./availability.js";

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function zonedParts(ts: number, timeZone: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(ts))) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour) % 24,
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/** Offset (ms) such that localTime = utcTime + offset, evaluated at `ts`. */
export function timeZoneOffsetMs(ts: number, timeZone: string): number {
  const p = zonedParts(ts, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - ts;
}

/** Epoch ms of local midnight for the day containing `ts` in `timeZone`. */
export function localMidnightUtc(ts: number, timeZone: string): number {
  const p = zonedParts(ts, timeZone);
  const naive = Date.UTC(p.year, p.month - 1, p.day, 0, 0, 0);
  // One correction pass keeps this correct across DST transitions.
  const offset = timeZoneOffsetMs(naive, timeZone);
  const candidate = naive - offset;
  const offset2 = timeZoneOffsetMs(candidate, timeZone);
  return naive - offset2;
}

/** Weekday (0=Sun..6=Sat) for the day containing `ts` in `timeZone`. */
export function weekdayInZone(ts: number, timeZone: string): number {
  const p = zonedParts(ts, timeZone);
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
}

/** Build absolute work windows for a day from an employee's weekly schedule. */
export function workWindowsForDay(
  employeeId: string,
  schedule: ScheduleWindow[],
  ts: number,
  timeZone: string,
): WorkWindow[] {
  const dayStart = localMidnightUtc(ts, timeZone);
  const weekday = weekdayInZone(ts, timeZone);
  return schedule
    .filter((s) => s.weekday === weekday)
    .map((s) => ({
      employeeId,
      start: dayStart + s.startMin * MS_PER_MIN,
      end: dayStart + s.endMin * MS_PER_MIN,
    }));
}

export function addMinutes(ts: number, minutes: number): number {
  return ts + minutes * MS_PER_MIN;
}

/** Minutes elapsed since local midnight, in `timeZone`. */
export function localMinutesOfDay(ts: number, timeZone: string): number {
  const p = zonedParts(ts, timeZone);
  return p.hour * 60 + p.minute;
}

/**
 * Shift a timestamp so its local time falls inside the [startMin, endMin] window,
 * moving it to the next window opening when it does not. Quiet hours default to
 * 09:00–20:00, so a 03:00 send becomes 09:00 the same day.
 */
export function shiftIntoWindow(
  ts: number,
  timeZone: string,
  startMin: number,
  endMin: number,
): number {
  const mins = localMinutesOfDay(ts, timeZone);
  if (mins >= startMin && mins <= endMin) return ts;
  const dayStart = localMidnightUtc(ts, timeZone);
  if (mins < startMin) return dayStart + startMin * MS_PER_MIN;
  // After the window: move to the *next* local day's opening. `dayStart + 24h`
  // lands on the next day's midnight (a 30-min nudge would resolve to the same
  // day and return a time in the past).
  const nextMidnight = localMidnightUtc(dayStart + 24 * 60 * MS_PER_MIN, timeZone);
  return nextMidnight + startMin * MS_PER_MIN;
}

/** Render a millisecond duration as "1 h 30 min" / "45 min". */
export function formatDuration(ms: number): string {
  const total = Math.round(ms / MS_PER_MIN);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}
