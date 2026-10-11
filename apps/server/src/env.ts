export interface Env {
  port: number;
  host: string;
  dbPath: string;
  nodeEnv: string;
  /** Default salon time zone used when no setting is stored. */
  defaultTimeZone: string;
  webOrigin: string;
}

export function loadEnv(): Env {
  return {
    port: Number(process.env.PORT ?? 3000),
    host: process.env.HOST ?? "0.0.0.0",
    dbPath: process.env.DB_PATH ?? "./data/klientela.db",
    nodeEnv: process.env.NODE_ENV ?? "development",
    defaultTimeZone: process.env.SALON_TZ ?? "Europe/Warsaw",
    webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  };
}
