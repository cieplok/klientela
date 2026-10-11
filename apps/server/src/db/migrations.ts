import type Database from "better-sqlite3";

/**
 * Idempotent schema migration. The DDL matches `schema.ts`; each statement uses
 * `IF NOT EXISTS` so applying it repeatedly is safe. A destructive change would
 * ship as a new numbered statement in `STATEMENTS`, never by editing an existing one.
 */
export const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS customer (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    phone_raw TEXT,
    email TEXT,
    notes TEXT,
    sms_opt_out INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS customer_phone_unique ON customer (phone)`,

  `CREATE TABLE IF NOT EXISTS employee (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    capacity INTEGER NOT NULL DEFAULT 1,
    color TEXT NOT NULL DEFAULT '#e0a3c0',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS employee_schedule (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employee(id) ON DELETE CASCADE,
    weekday INTEGER NOT NULL,
    start_min INTEGER NOT NULL,
    end_min INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS employee_schedule_employee_idx ON employee_schedule (employee_id)`,

  `CREATE TABLE IF NOT EXISTS time_off (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employee(id) ON DELETE CASCADE,
    start_at INTEGER NOT NULL,
    end_at INTEGER NOT NULL,
    reason TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS time_off_employee_idx ON time_off (employee_id)`,

  `CREATE TABLE IF NOT EXISTS appointment_type (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    buffer_before_min INTEGER NOT NULL DEFAULT 0,
    buffer_after_min INTEGER NOT NULL DEFAULT 0,
    color TEXT NOT NULL DEFAULT '#7c9cff',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS appointment_type_segment (
    id TEXT PRIMARY KEY,
    appointment_type_id TEXT NOT NULL REFERENCES appointment_type(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    kind TEXT NOT NULL,
    duration_min INTEGER NOT NULL,
    label TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS segment_type_idx ON appointment_type_segment (appointment_type_id)`,

  `CREATE TABLE IF NOT EXISTS appointment_type_employee (
    appointment_type_id TEXT NOT NULL REFERENCES appointment_type(id) ON DELETE CASCADE,
    employee_id TEXT NOT NULL REFERENCES employee(id) ON DELETE CASCADE,
    PRIMARY KEY (appointment_type_id, employee_id)
  )`,

  `CREATE TABLE IF NOT EXISTS appointment (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customer(id) ON DELETE RESTRICT,
    employee_id TEXT NOT NULL REFERENCES employee(id) ON DELETE RESTRICT,
    appointment_type_id TEXT NOT NULL REFERENCES appointment_type(id) ON DELETE RESTRICT,
    start_at INTEGER NOT NULL,
    end_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled',
    plan_json TEXT NOT NULL,
    notes TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS appointment_employee_start_idx ON appointment (employee_id, start_at)`,

  `CREATE TABLE IF NOT EXISTS device (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    last_seen_at INTEGER,
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS reminder (
    id TEXT PRIMARY KEY,
    appointment_id TEXT NOT NULL REFERENCES appointment(id) ON DELETE CASCADE,
    customer_id TEXT NOT NULL REFERENCES customer(id) ON DELETE CASCADE,
    phone_e164 TEXT NOT NULL,
    body TEXT NOT NULL,
    scheduled_for INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    lease_until INTEGER,
    claimed_by_device_id TEXT REFERENCES device(id) ON DELETE SET NULL,
    sent_at INTEGER,
    error_message TEXT,
    idempotency_key TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS reminder_status_idx ON reminder (status, scheduled_for)`,

  `CREATE TABLE IF NOT EXISTS staff_user (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff',
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS session (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES staff_user(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS session_user_idx ON session (user_id)`,

  `CREATE TABLE IF NOT EXISTS setting (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
];

export function migrate(sqlite: Database.Database): void {
  sqlite.exec("BEGIN");
  try {
    for (const statement of STATEMENTS) sqlite.exec(statement);
    sqlite.exec("COMMIT");
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  }
}
