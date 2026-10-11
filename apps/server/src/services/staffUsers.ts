import { randomUUID } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { hashPassword } from "../auth/password.js";
import type { Db } from "../db/client.js";
import { staffUser } from "../db/schema.js";

export type StaffRole = "admin" | "staff";

export class StaffUserError extends Error {}

function activeAdminCountExcept(db: Db, userId: string): number {
  return db
    .select()
    .from(staffUser)
    .where(and(eq(staffUser.role, "admin"), eq(staffUser.active, true), ne(staffUser.id, userId)))
    .all().length;
}

export async function createStaffUser(
  db: Db,
  input: { email: string; password: string; role: StaffRole },
): Promise<{ id: string }> {
  const email = input.email.trim().toLowerCase();
  if (db.select().from(staffUser).where(eq(staffUser.email, email)).get()) {
    throw new StaffUserError("A user with that email already exists");
  }
  const id = randomUUID();
  db.insert(staffUser)
    .values({
      id,
      email,
      passwordHash: await hashPassword(input.password),
      role: input.role,
      active: true,
      createdAt: Date.now(),
    })
    .run();
  return { id };
}

export function updateStaffUser(
  db: Db,
  input: { id: string; role?: StaffRole; active?: boolean },
): { id: string } {
  const row = db.select().from(staffUser).where(eq(staffUser.id, input.id)).get();
  if (!row) throw new StaffUserError("User not found");

  const leavingAdmin = row.role === "admin" && ((input.role && input.role !== "admin") || input.active === false);
  if (leavingAdmin && activeAdminCountExcept(db, input.id) === 0) {
    throw new StaffUserError("Cannot remove the last active admin");
  }

  db.update(staffUser)
    .set({ role: input.role ?? row.role, active: input.active ?? row.active })
    .where(eq(staffUser.id, input.id))
    .run();
  return { id: input.id };
}

export async function setStaffPassword(db: Db, id: string, password: string): Promise<{ id: string }> {
  const row = db.select().from(staffUser).where(eq(staffUser.id, id)).get();
  if (!row) throw new StaffUserError("User not found");
  db.update(staffUser).set({ passwordHash: await hashPassword(password) }).where(eq(staffUser.id, id)).run();
  return { id };
}

export function listStaffUsers(db: Db) {
  return db
    .select({
      id: staffUser.id,
      email: staffUser.email,
      role: staffUser.role,
      active: staffUser.active,
      createdAt: staffUser.createdAt,
    })
    .from(staffUser)
    .all()
    .sort((a, b) => a.email.localeCompare(b.email));
}
