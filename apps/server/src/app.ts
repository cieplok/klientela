import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import Fastify, { type FastifyInstance } from "fastify";
import { createDb, type DbHandle } from "./db/client.js";
import { migrate } from "./db/migrations.js";
import { loadEnv, type Env } from "./env.js";
import { registerSyncRoutes } from "./routes/sync.js";
import { startScheduler } from "./services/reminders.js";
import { createContextFactory } from "./trpc/context.js";
import { appRouter } from "./trpc/router.js";

export interface BuiltApp {
  app: FastifyInstance;
  handle: DbHandle;
  env: Env;
}

export async function buildApp(overrides: Partial<Env> = {}): Promise<BuiltApp> {
  const env = { ...loadEnv(), ...overrides };
  const handle = createDb(env.dbPath);
  migrate(handle.sqlite);

  const app = Fastify({ logger: env.nodeEnv !== "test" });
  await app.register(cookie);
  await app.register(cors, { origin: env.webOrigin, credentials: true });

  app.get("/health", async () => ({ ok: true }));

  registerSyncRoutes(app, handle);

  await app.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext: createContextFactory(handle),
    },
  });

  const stopScheduler = startScheduler(handle.db);
  app.addHook("onClose", async () => {
    stopScheduler();
    handle.sqlite.close();
  });

  return { app, handle, env };
}
