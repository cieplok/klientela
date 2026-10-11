import { z } from "zod";
import { getSettings, updateSettings } from "../../services/settings.js";
import { protectedProcedure, router } from "../trpc.js";

const patch = z.object({
  salonName: z.string().min(1).optional(),
  address: z.string().optional(),
  salonPhone: z.string().optional(),
  timezone: z.string().min(1).optional(),
  reminderLeadMinutes: z.number().int().min(0).max(60 * 24 * 30).optional(),
  quietHoursStartMin: z.number().int().min(0).max(1440).optional(),
  quietHoursEndMin: z.number().int().min(0).max(1440).optional(),
  reminderTemplate: z.string().min(1).optional(),
});

export const settingsRouter = router({
  get: protectedProcedure.query(({ ctx }) => getSettings(ctx.db)),
  update: protectedProcedure.input(patch).mutation(({ ctx, input }) => updateSettings(ctx.db, input)),
});
