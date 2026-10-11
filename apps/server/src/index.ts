import { buildApp } from "./app.js";

const { app, env } = await buildApp();

try {
  await app.listen({ port: env.port, host: env.host });
  app.log.info(`klientela server listening on http://${env.host}:${env.port}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
