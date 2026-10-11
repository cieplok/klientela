export const MS_PER_MIN = 60_000;

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function addDays(ts: number, days: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

export function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString([], { weekday: "short", day: "2-digit", month: "short" });
}

export function toLocalInput(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fromLocalInput(value: string): number {
  return new Date(value).getTime();
}

export function minutesBetween(a: number, b: number): number {
  return Math.round((b - a) / MS_PER_MIN);
}

/** Minutes from local midnight → `HH:MM` for an `<input type="time">`. */
export function minutesToTimeInput(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** `HH:MM` from an `<input type="time">` → minutes from local midnight. */
export function timeInputToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** `YYYY-MM-DD` (local) for the day containing `ts`. */
export function dateInputValue(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Local `[start, end)` epoch bounds for a `YYYY-MM-DD` string. */
export function dayBounds(dateStr: string): [number, number] {
  const [y, m, d] = dateStr.split("-").map(Number);
  const start = new Date(y!, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0).getTime();
  return [start, start + 24 * 60 * MS_PER_MIN];
}
