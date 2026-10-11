import { z } from "zod";

/** Milliseconds in one minute. */
export const MS_PER_MIN = 60_000;

export const SegmentKind = z.enum(["active", "gap"]);
export type SegmentKind = z.infer<typeof SegmentKind>;

/**
 * One ordered piece of an appointment. `active` segments occupy the employee;
 * `gap` segments (e.g. colour processing) free the employee so another client
 * can be booked during them.
 */
export const Segment = z.object({
  position: z.number().int().min(0),
  kind: SegmentKind,
  durationMin: z.number().int().positive(),
  label: z.string().optional(),
});
export type Segment = z.infer<typeof Segment>;

/**
 * A parameterized appointment type. Total duration = buffers + Σ segments.
 * Buffers are reserved *active* time (they count toward capacity).
 */
export const AppointmentType = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  active: z.boolean().default(true),
  bufferBeforeMin: z.number().int().min(0).default(0),
  bufferAfterMin: z.number().int().min(0).default(0),
  color: z.string().default("#7c9cff"),
  segments: z.array(Segment).min(1),
  /** Employee ids allowed to perform this type. Empty = any employee. */
  employeeIds: z.array(z.string()).default([]),
});
export type AppointmentType = z.infer<typeof AppointmentType>;

export const Customer = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  /** E.164, e.g. +48123123123. */
  phone: z.string().min(5),
  email: z.string().optional(),
  notes: z.string().optional(),
  smsOptOut: z.boolean().default(false),
});
export type Customer = z.infer<typeof Customer>;

export const Weekday = z.number().int().min(0).max(6);

export const ScheduleWindow = z.object({
  weekday: Weekday,
  /** minutes from local midnight */
  startMin: z.number().int().min(0).max(24 * 60),
  endMin: z.number().int().min(0).max(24 * 60),
});
export type ScheduleWindow = z.infer<typeof ScheduleWindow>;

export const Employee = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  active: z.boolean().default(true),
  /** max concurrent active segments; 1 by default */
  capacity: z.number().int().min(1).default(1),
  color: z.string().default("#e0a3c0"),
  schedule: z.array(ScheduleWindow).default([]),
});
export type Employee = z.infer<typeof Employee>;

export const ReminderStatus = z.enum(["pending", "claimed", "sent", "failed", "cancelled"]);
export type ReminderStatus = z.infer<typeof ReminderStatus>;

export const AppointmentStatus = z.enum(["scheduled", "completed", "cancelled", "no_show"]);
export type AppointmentStatus = z.infer<typeof AppointmentStatus>;
