import type { FastifyReply, FastifyRequest } from "fastify";
import { resolveSession, SESSION_COOKIE, type SessionUser } from "../auth/session.js";
import type { DbHandle } from "../db/client.js";

export interface Context {
  db: DbHandle["db"];
  handle: DbHandle;
  req: FastifyRequest;
  res: FastifyReply;
  user: SessionUser | null;
}

export function createContextFactory(handle: DbHandle) {
  return function createContext({ req, res }: { req: FastifyRequest; res: FastifyReply }): Context {
    const cookies = (req as FastifyRequest & { cookies?: Record<string, string> }).cookies;
    const token = cookies?.[SESSION_COOKIE];
    const user = resolveSession(handle.db, token);
    return { db: handle.db, handle, req, res, user };
  };
}
