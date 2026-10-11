import { MS_PER_MIN, type AppointmentType, type SegmentKind } from "./types.js";

export interface PlanInterval {
  kind: SegmentKind;
  startOffsetMs: number;
  endOffsetMs: number;
  label?: string;
}

export interface ActiveInterval {
  startOffsetMs: number;
  endOffsetMs: number;
}

export interface ResolvedPlan {
  totalMs: number;
  intervals: PlanInterval[];
  /** Only the `active` intervals — what actually occupies the employee. */
  activeIntervals: ActiveInterval[];
}

/**
 * Turn an appointment type's ordered segments (plus buffers) into a concrete plan
 * expressed as offsets from the start of the appointment. Buffers are rendered as
 * active segments so they occupy the employee exactly like normal work.
 */
export function resolvePlan(type: AppointmentType): ResolvedPlan {
  const intervals: PlanInterval[] = [];
  let offset = 0;

  const beforeMs = type.bufferBeforeMin * MS_PER_MIN;
  if (beforeMs > 0) {
    intervals.push({ kind: "active", startOffsetMs: 0, endOffsetMs: beforeMs, label: "buffer" });
    offset = beforeMs;
  }

  const segments = [...type.segments].sort((a, b) => a.position - b.position);
  for (const segment of segments) {
    const durationMs = segment.durationMin * MS_PER_MIN;
    intervals.push({
      kind: segment.kind,
      startOffsetMs: offset,
      endOffsetMs: offset + durationMs,
      ...(segment.label ? { label: segment.label } : {}),
    });
    offset += durationMs;
  }

  const afterMs = type.bufferAfterMin * MS_PER_MIN;
  if (afterMs > 0) {
    intervals.push({ kind: "active", startOffsetMs: offset, endOffsetMs: offset + afterMs, label: "buffer" });
    offset += afterMs;
  }

  return {
    totalMs: offset,
    intervals,
    activeIntervals: intervals
      .filter((interval) => interval.kind === "active")
      .map((interval) => ({ startOffsetMs: interval.startOffsetMs, endOffsetMs: interval.endOffsetMs })),
  };
}
