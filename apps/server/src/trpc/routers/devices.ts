import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { hashToken } from "../../auth/session.js";
import { device } from "../../db/schema.js";
import { rotateDeviceToken } from "../../services/devices.js";
import { adminProcedure, protectedProcedure, router } from "../trpc.js";

export const devicesRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db
      .select({
        id: device.id,
        name: device.name,
        active: device.active,
        lastSeenAt: device.lastSeenAt,
        createdAt: device.createdAt,
      })
      .from(device)
      .all(),
  ),
  create: adminProcedure.input(z.object({ name: z.string().min(1) })).mutation(({ ctx, input }) => {
    const token = randomBytes(32).toString("base64url");
    const id = randomUUID();
    ctx.db
      .insert(device)
      .values({ id, name: input.name.trim(), tokenHash: hashToken(token), active: true, createdAt: Date.now() })
      .run();
    // The raw token is shown once and never stored in plaintext.
    return { id, token };
  }),
  rotate: adminProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => {
    const result = rotateDeviceToken(ctx.db, input.id);
    if (!result) throw new TRPCError({ code: "NOT_FOUND" });
    return result;
  }),
  revoke: adminProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => {
    const row = ctx.db.select().from(device).where(eq(device.id, input.id)).get();
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    ctx.db.update(device).set({ active: false }).where(eq(device.id, input.id)).run();
    return { ok: true };
  }),
});
