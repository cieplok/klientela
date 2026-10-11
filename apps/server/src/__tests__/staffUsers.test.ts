import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { verifyPassword } from "../auth/password.js";
import { createDb } from "../db/client.js";
import { migrate } from "../db/migrations.js";
import { staffUser } from "../db/schema.js";
import {
  StaffUserError,
  createStaffUser,
  listStaffUsers,
  setStaffPassword,
  updateStaffUser,
} from "../services/staffUsers.js";

function setup() {
  const handle = createDb(":memory:");
  migrate(handle.sqlite);
  return handle;
}

describe("staff users", () => {
  it("creates a user with a hashed password and a lowercased email", async () => {
    const handle = setup();
    const { id } = await createStaffUser(handle.db, { email: "  Admin@Salon.local ", password: "secret123", role: "admin" });
    const row = handle.db.select().from(staffUser).where(eq(staffUser.id, id)).get()!;
    expect(row.email).toBe("admin@salon.local");
    expect(row.passwordHash).not.toBe("secret123");
    expect(await verifyPassword(row.passwordHash, "secret123")).toBe(true);
  });

  it("rejects a duplicate email regardless of case", async () => {
    const handle = setup();
    await createStaffUser(handle.db, { email: "a@salon.local", password: "secret123", role: "staff" });
    await expect(
      createStaffUser(handle.db, { email: "A@salon.local", password: "secret123", role: "staff" }),
    ).rejects.toBeInstanceOf(StaffUserError);
  });

  it("refuses to deactivate or demote the last active admin", async () => {
    const handle = setup();
    const { id } = await createStaffUser(handle.db, { email: "admin@salon.local", password: "secret123", role: "admin" });
    expect(() => updateStaffUser(handle.db, { id, active: false })).toThrow(StaffUserError);
    expect(() => updateStaffUser(handle.db, { id, role: "staff" })).toThrow(StaffUserError);
  });

  it("allows demoting an admin when another active admin remains", async () => {
    const handle = setup();
    const a = await createStaffUser(handle.db, { email: "a@salon.local", password: "secret123", role: "admin" });
    await createStaffUser(handle.db, { email: "b@salon.local", password: "secret123", role: "admin" });
    expect(updateStaffUser(handle.db, { id: a.id, role: "staff" })).toEqual({ id: a.id });
  });

  it("resets a password", async () => {
    const handle = setup();
    const { id } = await createStaffUser(handle.db, { email: "a@salon.local", password: "secret123", role: "staff" });
    await setStaffPassword(handle.db, id, "newpassword");
    const row = handle.db.select().from(staffUser).where(eq(staffUser.id, id)).get()!;
    expect(await verifyPassword(row.passwordHash, "newpassword")).toBe(true);
    expect(await verifyPassword(row.passwordHash, "secret123")).toBe(false);
  });

  it("lists users sorted by email", async () => {
    const handle = setup();
    await createStaffUser(handle.db, { email: "zoe@salon.local", password: "secret123", role: "staff" });
    await createStaffUser(handle.db, { email: "amy@salon.local", password: "secret123", role: "admin" });
    expect(listStaffUsers(handle.db).map((u) => u.email)).toEqual(["amy@salon.local", "zoe@salon.local"]);
  });
});
