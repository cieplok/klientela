import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { verifyPassword } from "../../auth/password.js";
import { SESSION_COOKIE, createSession, destroySession } from "../../auth/session.js";
import { staffUser } from "../../db/schema.js";
import { protectedProcedure, publicProcedure, router } from "../trpc.js";

export const authRouter = router({
  me: publicProcedure.query(({ ctx }) => ctx.user),
  login: publicProcedure
    .input(z.object({ email: z.string().min(1), password: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const user = ctx.db
        .select()
        .from(staffUser)
        .where(eq(staffUser.email, input.email.trim().toLowerCase()))
        .get();
      if (!user || !user.active || !(await verifyPassword(user.passwordHash, input.password))) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      }
      const { token, expiresAt } = createSession(ctx.db, user.id);
      ctx.res.setCookie(SESSION_COOKIE, token, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        expires: new Date(expiresAt),
      });
      return { id: user.id, email: user.email, role: user.role };
    }),
  logout: protectedProcedure.mutation(({ ctx }) => {
    const token = (ctx.req as { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE];
    destroySession(ctx.db, token);
    ctx.res.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  }),
});
