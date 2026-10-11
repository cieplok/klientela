import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { hashPassword } from "./auth/password.js";
import { createDb } from "./db/client.js";
import { migrate } from "./db/migrations.js";
import {
  appointmentType,
  appointmentTypeEmployee,
  appointmentTypeSegment,
  customer,
  employee,
  employeeSchedule,
  setting,
  staffUser,
} from "./db/schema.js";
import { loadEnv } from "./env.js";
import { DEFAULT_SETTINGS } from "./services/settings.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const { db, sqlite } = createDb(env.dbPath);
  migrate(sqlite);
  const now = Date.now();

  const email = process.env.ADMIN_EMAIL ?? "admin@salon.local";
  const password = process.env.ADMIN_PASSWORD ?? "admin1234";
  if (!db.select().from(staffUser).where(eq(staffUser.email, email)).get()) {
    db.insert(staffUser)
      .values({ id: randomUUID(), email, passwordHash: await hashPassword(password), role: "admin", active: true, createdAt: now })
      .run();
    console.log(`✔ admin created — ${email} / ${password}`);
  }

  if (db.select().from(employee).all().length === 0) {
    const alice = randomUUID();
    const bob = randomUUID();
    db.insert(employee).values([
      { id: alice, name: "Alice", active: true, capacity: 1, color: "#e0a3c0", createdAt: now, updatedAt: now },
      { id: bob, name: "Bob", active: true, capacity: 1, color: "#7c9cff", createdAt: now, updatedAt: now },
    ]).run();
    for (const employeeId of [alice, bob]) {
      for (let weekday = 1; weekday <= 5; weekday += 1) {
        db.insert(employeeSchedule)
          .values({ id: randomUUID(), employeeId, weekday, startMin: 9 * 60, endMin: 17 * 60 })
          .run();
      }
    }

    const haircut = randomUUID();
    db.insert(appointmentType)
      .values({ id: haircut, name: "Haircut", active: true, bufferBeforeMin: 0, bufferAfterMin: 0, color: "#7c9cff", createdAt: now, updatedAt: now })
      .run();
    db.insert(appointmentTypeSegment)
      .values({ id: randomUUID(), appointmentTypeId: haircut, position: 0, kind: "active", durationMin: 45, label: "Cut" })
      .run();

    const color = randomUUID();
    db.insert(appointmentType)
      .values({ id: color, name: "Colour", active: true, bufferBeforeMin: 5, bufferAfterMin: 5, color: "#b57cff", createdAt: now, updatedAt: now })
      .run();
    const colorSegments = [
      { position: 0, kind: "active" as const, durationMin: 30, label: "Apply colour" },
      { position: 1, kind: "gap" as const, durationMin: 30, label: "Process" },
      { position: 2, kind: "active" as const, durationMin: 30, label: "Rinse & finish" },
    ];
    for (const segment of colorSegments) {
      db.insert(appointmentTypeSegment)
        .values({ id: randomUUID(), appointmentTypeId: color, position: segment.position, kind: segment.kind, durationMin: segment.durationMin, label: segment.label })
        .run();
    }
    for (const typeId of [haircut, color]) {
      for (const employeeId of [alice, bob]) {
        db.insert(appointmentTypeEmployee).values({ appointmentTypeId: typeId, employeeId }).run();
      }
    }

    db.insert(customer)
      .values({ id: randomUUID(), name: "Jane Doe", phone: "+48123123123", phoneRaw: "+48 123 123 123", smsOptOut: false, createdAt: now, updatedAt: now })
      .run();
    console.log("✔ sample employees, appointment types and a customer seeded");
  }

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (!db.select().from(setting).where(eq(setting.key, key)).get()) {
      db.insert(setting).values({ key, value: JSON.stringify(value) }).run();
    }
  }

  sqlite.close();
  console.log("✔ done");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
