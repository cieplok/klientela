import { describe, expect, it } from "vitest";
import { computeAvailability, maxConcurrency, type AvailabilityInput } from "../availability.js";
import { resolvePlan } from "../plan.js";
import { AppointmentType, MS_PER_MIN } from "../types.js";
import { formatDuration, localMidnightUtc, shiftIntoWindow, weekdayInZone, workWindowsForDay } from "../tz.js";

const min = (n: number) => n * MS_PER_MIN;

function baseInput(overrides: Partial<AvailabilityInput> = {}): AvailabilityInput {
  const type = AppointmentType.parse({
    name: "Haircut",
    segments: [{ position: 0, kind: "active", durationMin: 60 }],
  });
  return {
    employeeIds: ["e1"],
    type,
    rangeStart: 0,
    rangeEnd: min(480),
    slotStepMin: 15,
    workWindows: [{ employeeId: "e1", start: 0, end: min(480) }],
    timeOff: [],
    busy: [],
    capacityByEmployee: { e1: 1 },
    ...overrides,
  };
}

describe("resolvePlan", () => {
  it("sums segments and renders buffers as active time", () => {
    const type = AppointmentType.parse({
      name: "Color",
      bufferBeforeMin: 10,
      bufferAfterMin: 5,
      segments: [
        { position: 1, kind: "active", durationMin: 30, label: "apply" },
        { position: 0, kind: "active", durationMin: 10, label: "consult" },
        { position: 2, kind: "gap", durationMin: 30, label: "process" },
        { position: 3, kind: "active", durationMin: 15, label: "finish" },
      ],
    });
    const plan = resolvePlan(type);
    expect(plan.totalMs).toBe(min(10 + 10 + 30 + 30 + 15 + 5));
    // order is by position, not array order
    expect(plan.intervals.map((i) => i.label)).toEqual([
      "buffer",
      "consult",
      "apply",
      "process",
      "finish",
      "buffer",
    ]);
    // active = buffers + non-gap segments (gap excluded)
    expect(plan.activeIntervals).toEqual([
      { startOffsetMs: 0, endOffsetMs: min(10) },
      { startOffsetMs: min(10), endOffsetMs: min(20) },
      { startOffsetMs: min(20), endOffsetMs: min(50) },
      { startOffsetMs: min(80), endOffsetMs: min(95) },
      { startOffsetMs: min(95), endOffsetMs: min(100) },
    ]);
  });
});

describe("maxConcurrency", () => {
  it("counts touching intervals as non-overlapping", () => {
    expect(
      maxConcurrency([
        { employeeId: "e1", start: 0, end: 10 },
        { employeeId: "e1", start: 10, end: 20 },
      ]),
    ).toBe(1);
  });
  it("counts true overlaps", () => {
    expect(
      maxConcurrency([
        { employeeId: "e1", start: 0, end: 30 },
        { employeeId: "e1", start: 10, end: 20 },
      ]),
    ).toBe(2);
  });
});

describe("computeAvailability", () => {
  it("returns every grid slot that fits the window when nothing is booked", () => {
    const slots = computeAvailability(baseInput());
    expect(slots[0]).toEqual({ employeeId: "e1", start: 0, end: min(60) });
    expect(slots.at(-1)).toEqual({ employeeId: "e1", start: min(420), end: min(480) });
    expect(slots).toHaveLength(29); // 0..420 step 15
  });

  it("walks around a booked appointment at capacity 1", () => {
    const slots = computeAvailability(baseInput({ busy: [{ employeeId: "e1", start: min(120), end: min(180) }] }));
    const starts = slots.map((s) => s.start);
    expect(starts).toContain(min(60)); // ends exactly when the booking starts
    expect(starts).not.toContain(min(75)); // would overlap
    expect(starts).toContain(min(180)); // starts exactly when it ends
  });

  it("fits a new client into the gap of an existing colour appointment", () => {
    // A booked colour: active 0-30, gap 30-60, active 60-90.
    const busy = [
      { employeeId: "e1", start: min(0), end: min(30) },
      { employeeId: "e1", start: min(60), end: min(90) },
    ];
    // A short 30-minute service can be dropped into the 30-minute processing gap.
    const shortType = AppointmentType.parse({
      name: "Trim",
      segments: [{ position: 0, kind: "active", durationMin: 30 }],
    });
    const slots = computeAvailability(baseInput({ type: shortType, busy, rangeEnd: min(240) }));
    const starts = slots.map((s) => s.start);
    expect(starts).toContain(min(30)); // inside the existing processing gap
    expect(starts).not.toContain(min(0));
    expect(starts).not.toContain(min(45));
  });

  it("allows overlaps up to employee capacity and blocks beyond it", () => {
    const busy = [
      { employeeId: "e1", start: min(0), end: min(60) },
      { employeeId: "e1", start: min(10), end: min(70) },
    ];
    const blocked = computeAvailability(baseInput({ busy, capacityByEmployee: { e1: 2 } }));
    expect(blocked.map((s) => s.start)).not.toContain(0);

    const allowed = computeAvailability(baseInput({ busy, capacityByEmployee: { e1: 3 } }));
    expect(allowed.map((s) => s.start)).toContain(0);
  });

  it("counts buffers as occupying time", () => {
    const type = AppointmentType.parse({
      name: "Buffered",
      bufferBeforeMin: 15,
      bufferAfterMin: 15,
      segments: [{ position: 0, kind: "active", durationMin: 30 }],
    });
    const slots = computeAvailability(
      baseInput({ type, busy: [{ employeeId: "e1", start: min(0), end: min(15) }] }),
    );
    expect(slots.map((s) => s.start)).not.toContain(0); // buffer would collide
  });

  it("excludes starts that fall inside time off", () => {
    const slots = computeAvailability(baseInput({ timeOff: [{ employeeId: "e1", start: min(120), end: min(180) }] }));
    const starts = slots.map((s) => s.start);
    expect(starts).toContain(min(60));
    expect(starts).not.toContain(min(75));
    expect(starts).toContain(min(120 + 60));
  });

  it("only emits slots fully inside a work window", () => {
    const slots = computeAvailability(
      baseInput({ workWindows: [{ employeeId: "e1", start: min(60), end: min(180) }] }),
    );
    expect(slots.map((s) => s.start)).toEqual([min(60), min(75), min(90), min(105), min(120)]);
  });

  it("skips employees with no window and unknown employees default to capacity 1", () => {
    const slots = computeAvailability(baseInput({ employeeIds: ["e2"] }));
    expect(slots).toHaveLength(0);
  });
});

describe("time-zone helpers", () => {
  it("computes local midnight and weekday", () => {
    // 2025-01-06T00:30:00Z is Monday in Warsaw (UTC+1)
    const ts = Date.UTC(2025, 0, 6, 0, 30, 0);
    expect(weekdayInZone(ts, "Europe/Warsaw")).toBe(1); // Monday
    expect(localMidnightUtc(ts, "Europe/Warsaw")).toBe(Date.UTC(2025, 0, 5, 23, 0, 0));
  });

  it("builds absolute windows from a weekly schedule", () => {
    const ts = Date.UTC(2025, 0, 6, 12, 0, 0); // Monday midday UTC
    const windows = workWindowsForDay(
      "e1",
      [{ weekday: 1, startMin: 9 * 60, endMin: 17 * 60 }],
      ts,
      "Europe/Warsaw",
    );
    expect(windows).toHaveLength(1);
    expect(windows[0]!.start).toBe(Date.UTC(2025, 0, 6, 8, 0, 0)); // 09:00 CET = 08:00Z
  });

  it("formats durations", () => {
    expect(formatDuration(min(45))).toBe("45 min");
    expect(formatDuration(min(60))).toBe("1 h");
    expect(formatDuration(min(95))).toBe("1 h 35 min");
  });

  it("shifts a send time into the quiet-hours window, always forward in time", () => {
    const tz = "Europe/Warsaw"; // CET (UTC+1) in January
    const win = { start: 9 * 60, end: 20 * 60 };
    const inside = Date.UTC(2025, 0, 6, 10, 0, 0); // 11:00 local
    expect(shiftIntoWindow(inside, tz, win.start, win.end)).toBe(inside);

    const before = Date.UTC(2025, 0, 6, 2, 0, 0); // 03:00 local → 09:00 same day
    expect(shiftIntoWindow(before, tz, win.start, win.end)).toBe(Date.UTC(2025, 0, 6, 8, 0, 0));

    const after = Date.UTC(2025, 0, 6, 20, 30, 0); // 21:30 local → 09:00 NEXT day
    const shifted = shiftIntoWindow(after, tz, win.start, win.end);
    expect(shifted).toBe(Date.UTC(2025, 0, 7, 8, 0, 0));
    expect(shifted).toBeGreaterThan(after); // must never move backwards
  });
});

describe("split shifts", () => {
  it("never lets a slot span a break, and offers slots in both windows", () => {
    const slots = computeAvailability(
      baseInput({
        rangeEnd: min(360),
        workWindows: [
          { employeeId: "e1", start: min(60), end: min(120) },
          { employeeId: "e1", start: min(180), end: min(240) },
        ],
      }),
    );
    expect(slots.map((s) => s.start)).toEqual([min(60), min(180)]);
  });
});
