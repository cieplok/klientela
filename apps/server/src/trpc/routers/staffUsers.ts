import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  StaffUserError,
  createStaffUser,
  listStaffUsers,
  setStaffPassword,
  updateStaffUser,
} from "../../services/staffUsers.js";
import { adminProcedure, router } from "../trpc.js";

function toTrpcError(error: unknown): never {
  if (error instanceof StaffUserError) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  throw error;
}

const role = z.enum(["admin", "staff"]);

export const staffUsersRouter = router({
  list: adminProcedure.query(({ ctx }) => listStaffUsers(ctx.db)),
  create: adminProcedure
    .input(z.object({ email: z.string().email(), password: z.string().min(8), role }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await createStaffUser(ctx.db, input);
      } catch (error) {
        toTrpcError(error);
      }
    }),
  update: adminProcedure
    .input(z.object({ id: z.string(), role: role.optional(), active: z.boolean().optional() }))
    .mutation(({ ctx, input }) => {
      try {
        return updateStaffUser(ctx.db, input);
      } catch (error) {
        toTrpcError(error);
      }
    }),
  setPassword: adminProcedure
    .input(z.object({ id: z.string(), password: z.string().min(8) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await setStaffPassword(ctx.db, input.id, input.password);
      } catch (error) {
        toTrpcError(error);
      }
    }),
});
