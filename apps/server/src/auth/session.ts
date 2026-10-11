import { and, eq, gt } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import type { Db } from "../db/client.js";
import { session, staffUser } from "../db/schema.js";

export const SESSION_COOKIE = "klientela_sid";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

export interface SessionUser {
  id: string;
  email: string;
  role: "admin" | "staff";
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createSession(db: Db, userId: string): { token: string; expiresAt: number } {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  db.insert(session)
    .values({ id: crypto.randomUUID(), userId, tokenHash: hashToken(token), expiresAt })
    .run();
  return { token, expiresAt };
}

export function resolveSession(db: Db, token: string | undefined): SessionUser | null {
  if (!token) return null;
  const row = db
    .select({
      userId: staffUser.id,
      email: staffUser.email,
      role: staffUser.role,
      active: staffUser.active,
    })
    .from(session)
    .innerJoin(staffUser, eq(staffUser.id, session.userId))
    .where(and(eq(session.tokenHash, hashToken(token)), gt(session.expiresAt, Date.now())))
    .get();
  if (!row || !row.active) return null;
  return { id: row.userId, email: row.email, role: row.role };
}

export function destroySession(db: Db, token: string | undefined): void {
  if (!token) return;
  db.delete(session).where(eq(session.tokenHash, hashToken(token))).run();
}
