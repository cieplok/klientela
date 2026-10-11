import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { setting } from "../db/schema.js";

export interface SalonSettings {
  salonName: string;
  address: string;
  salonPhone: string;
  timezone: string;
  reminderLeadMinutes: number;
  quietHoursStartMin: number;
  quietHoursEndMin: number;
  reminderTemplate: string;
}

export const DEFAULT_SETTINGS: SalonSettings = {
  salonName: "My Salon",
  address: "",
  salonPhone: "",
  timezone: "Europe/Warsaw",
  reminderLeadMinutes: 24 * 60,
  quietHoursStartMin: 9 * 60,
  quietHoursEndMin: 20 * 60,
  reminderTemplate:
    "{salonName}: reminder — {serviceName} on {date} at {time}. To change or cancel, call {salonPhone}.",
};

export function getSettings(db: Db): SalonSettings {
  const rows = db.select().from(setting).all();
  const merged: SalonSettings = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (row.key in merged) {
      (merged as unknown as Record<string, unknown>)[row.key] = JSON.parse(row.value);
    }
  }
  return merged;
}

export function updateSettings(db: Db, patch: Partial<SalonSettings>): SalonSettings {
  const now = Date.now();
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    db.insert(setting)
      .values({ key, value: JSON.stringify(value) })
      .onConflictDoUpdate({ target: setting.key, set: { value: JSON.stringify(value) } })
      .run();
    void now;
  }
  return getSettings(db);
}

export function getSetting<T>(db: Db, key: keyof SalonSettings): T {
  const row = db.select().from(setting).where(eq(setting.key, key)).get();
  if (!row) return DEFAULT_SETTINGS[key] as unknown as T;
  return JSON.parse(row.value) as T;
}
