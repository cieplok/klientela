import { z } from "zod";
import { queryAvailability } from "../../services/availability.js";
import { protectedProcedure, router } from "../trpc.js";

export const availabilityRouter = router({
  query: protectedProcedure
    .input(
      z.object({
        employeeIds: z.array(z.string()).default([]),
        typeId: z.string(),
        from: z.number(),
        to: z.number(),
        slotStepMin: z.number().int().min(1).max(120).optional(),
      }),
    )
    .query(({ ctx, input }) => queryAvailability(ctx.db, input)),
});
