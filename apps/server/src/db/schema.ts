import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const customer = sqliteTable(
  "customer",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    phoneRaw: text("phone_raw"),
    email: text("email"),
    notes: text("notes"),
    smsOptOut: integer("sms_opt_out", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [uniqueIndex("customer_phone_unique").on(t.phone)],
);

export const employee = sqliteTable("employee", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  capacity: integer("capacity").notNull().default(1),
  color: text("color").notNull().default("#e0a3c0"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const employeeSchedule = sqliteTable(
  "employee_schedule",
  {
    id: text("id").primaryKey(),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employee.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(),
    startMin: integer("start_min").notNull(),
    endMin: integer("end_min").notNull(),
  },
  (t) => [index("employee_schedule_employee_idx").on(t.employeeId)],
);

export const timeOff = sqliteTable(
  "time_off",
  {
    id: text("id").primaryKey(),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employee.id, { onDelete: "cascade" }),
    startAt: integer("start_at").notNull(),
    endAt: integer("end_at").notNull(),
    reason: text("reason"),
  },
  (t) => [index("time_off_employee_idx").on(t.employeeId)],
);

export const appointmentType = sqliteTable("appointment_type", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  bufferBeforeMin: integer("buffer_before_min").notNull().default(0),
  bufferAfterMin: integer("buffer_after_min").notNull().default(0),
  color: text("color").notNull().default("#7c9cff"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const appointmentTypeSegment = sqliteTable(
  "appointment_type_segment",
  {
    id: text("id").primaryKey(),
    appointmentTypeId: text("appointment_type_id")
      .notNull()
      .references(() => appointmentType.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    kind: text("kind", { enum: ["active", "gap"] }).notNull(),
    durationMin: integer("duration_min").notNull(),
    label: text("label"),
  },
  (t) => [index("segment_type_idx").on(t.appointmentTypeId)],
);

export const appointmentTypeEmployee = sqliteTable(
  "appointment_type_employee",
  {
    appointmentTypeId: text("appointment_type_id")
      .notNull()
      .references(() => appointmentType.id, { onDelete: "cascade" }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employee.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.appointmentTypeId, t.employeeId] })],
);

export const appointment = sqliteTable(
  "appointment",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customer.id, { onDelete: "restrict" }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employee.id, { onDelete: "restrict" }),
    appointmentTypeId: text("appointment_type_id")
      .notNull()
      .references(() => appointmentType.id, { onDelete: "restrict" }),
    startAt: integer("start_at").notNull(),
    endAt: integer("end_at").notNull(),
    status: text("status", { enum: ["scheduled", "completed", "cancelled", "no_show"] })
      .notNull()
      .default("scheduled"),
    planJson: text("plan_json").notNull(),
    notes: text("notes"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("appointment_employee_start_idx").on(t.employeeId, t.startAt)],
);

export const reminder = sqliteTable(
  "reminder",
  {
    id: text("id").primaryKey(),
    appointmentId: text("appointment_id")
      .notNull()
      .references(() => appointment.id, { onDelete: "cascade" }),
    customerId: text("customer_id")
      .notNull()
      .references(() => customer.id, { onDelete: "cascade" }),
    phoneE164: text("phone_e164").notNull(),
    body: text("body").notNull(),
    scheduledFor: integer("scheduled_for").notNull(),
    status: text("status", { enum: ["pending", "claimed", "sent", "failed", "cancelled"] })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    leaseUntil: integer("lease_until"),
    claimedByDeviceId: text("claimed_by_device_id").references(() => device.id, { onDelete: "set null" }),
    sentAt: integer("sent_at"),
    errorMessage: text("error_message"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("reminder_status_idx").on(t.status, t.scheduledFor)],
);

export const device = sqliteTable("device", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull(),
  lastSeenAt: integer("last_seen_at"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
});

export const staffUser = sqliteTable("staff_user", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "staff"] }).notNull().default("staff"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => staffUser.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const setting = sqliteTable("setting", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
