import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { hashToken } from "../auth/session.js";
import { createDb } from "../db/client.js";
import { migrate } from "../db/migrations.js";
import { device } from "../db/schema.js";
import { rotateDeviceToken } from "../services/devices.js";

describe("device token rotation", () => {
  it("replaces the token hash and reactivates the device", () => {
    const handle = createDb(":memory:");
    migrate(handle.sqlite);
    const id = randomUUID();
    const oldToken = "old-token";
    handle.db
      .insert(device)
      .values({ id, name: "Salon phone", tokenHash: hashToken(oldToken), active: false, createdAt: Date.now() })
      .run();

    const result = rotateDeviceToken(handle.db, id);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(id);

    const row = handle.db.select().from(device).where(eq(device.id, id)).get()!;
    expect(row.active).toBe(true);
    expect(row.tokenHash).toBe(hashToken(result!.token));
    expect(row.tokenHash).not.toBe(hashToken(oldToken));
  });

  it("returns null for an unknown device", () => {
    const handle = createDb(":memory:");
    migrate(handle.sqlite);
    expect(rotateDeviceToken(handle.db, "nope")).toBeNull();
  });
});
