import { appointmentTypesRouter } from "./routers/appointmentTypes.js";
import { appointmentsRouter } from "./routers/appointments.js";
import { authRouter } from "./routers/auth.js";
import { availabilityRouter } from "./routers/availability.js";
import { customersRouter } from "./routers/customers.js";
import { devicesRouter } from "./routers/devices.js";
import { employeesRouter } from "./routers/employees.js";
import { remindersRouter } from "./routers/reminders.js";
import { settingsRouter } from "./routers/settings.js";
import { staffUsersRouter } from "./routers/staffUsers.js";
import { router } from "./trpc.js";

export const appRouter = router({
  auth: authRouter,
  customers: customersRouter,
  employees: employeesRouter,
  appointmentTypes: appointmentTypesRouter,
  appointments: appointmentsRouter,
  availability: availabilityRouter,
  reminders: remindersRouter,
  devices: devicesRouter,
  settings: settingsRouter,
  staffUsers: staffUsersRouter,
});

export type AppRouter = typeof appRouter;
