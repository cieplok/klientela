import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { hashToken } from "../auth/session.js";
import type { Db } from "../db/client.js";
import { device } from "../db/schema.js";

/**
 * Issue a fresh bearer token for a device, replacing (and thereby invalidating) the
 * previous one, and reactivate the device. Returns the raw token exactly once — only
 * its hash is stored. `null` when the device does not exist.
 */
export function rotateDeviceToken(db: Db, id: string): { id: string; token: string } | null {
  const row = db.select().from(device).where(eq(device.id, id)).get();
  if (!row) return null;
  const token = randomBytes(32).toString("base64url");
  db.update(device).set({ tokenHash: hashToken(token), active: true }).where(eq(device.id, id)).run();
  return { id, token };
}
