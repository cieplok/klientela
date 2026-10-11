# Klientela

A self-hosted, single-tenant appointment-scheduling system for one hair/nail salon, plus a
companion Android app that sends customer SMS reminders from the salon's own dedicated phone
(no third-party SMS service). The full design lives in
[`.ai/specs/2026-10-11-self-hosted-salon-booking-system.md`](.ai/specs/2026-10-11-self-hosted-salon-booking-system.md).

**Status: Phase 1 complete (Android SMS sender deferred)** — the booking core and the server-side reminder queue / frozen
`/sync/v1` contract. Nothing sends SMS yet; the Android sender is deferred.

## What it does

- Customers, employees (capacity, weekly hours, time-off), and appointment **types** built from
  ordered **active** and **gap** segments (e.g. hair-colour processing time).
- A **gap-aware availability engine**: during a `gap` the employee is free, so a second client
  can be booked without overlapping the employee's *active* time. Capacity is per-employee.
- A resource-timeline calendar (employees as rows) that shows appointments with their gaps.
- A **reminder queue** with a scheduler (lead time, quiet hours, message template) and the
  versioned `/sync/v1` API the phone uses to pull due reminders and report results.

## Stack

pnpm workspaces + Turborepo · `packages/core` (pure TS domain + engine) · `apps/server`
(Fastify + tRPC + Drizzle/SQLite + argon2) · `apps/web` (React + Vite + TanStack Query + tRPC).

## Quick start (development)

```bash
pnpm install
pnpm --filter @klientela/core build      # server/web import the built core
pnpm --filter @klientela/server seed     # admin@salon.local / admin1234 + sample data
pnpm --filter @klientela/server dev      # API on :3000
pnpm --filter @klientela/web dev         # app on :5173 (proxies /trpc and /sync to :3000)
```

Open http://localhost:5173 and sign in with the seeded admin.

## Validation

```bash
pnpm typecheck
pnpm test
pnpm build
```

This is the configured gate in `.ai/agentic.config.json`. `packages/core` carries the
availability-engine unit tests.

## Layout

```
packages/core   domain types (Zod) + availability engine + time helpers
apps/server     Fastify/tRPC API, Drizzle schema, auth, reminders, /sync/v1
apps/web        React SPA (calendar, customers, employees, services, reminders, settings)
```

## Deployment

`docker-compose.yml` runs the server and Caddy (TLS + static web) on a mini-PC. Build the web
bundle first, then `docker compose up -d`. For remote access use a Tailscale tailnet rather than
port-forwarding.

> The compose file and `apps/server/Dockerfile` are provided but were not executed in the
> authoring environment; validate them on the target host.

## Backups

Back up the SQLite database with a consistent snapshot while the server keeps running:

```bash
pnpm backup                 # or: DB_PATH=/data/klientela.db BACKUP_DIR=/data/backups sh scripts/backup-db.sh
```

`scripts/backup-db.sh` uses `sqlite3 .backup` when available (WAL-safe) and prunes snapshots older
than `KEEP_DAYS` (default 14). Schedule it nightly from the host or a sidecar, e.g.:
`30 3 * * *  DB_PATH=/data/klientela.db BACKUP_DIR=/data/backups /path/to/scripts/backup-db.sh`

## Phase 2 — deferred

The dedicated-device Android sender (pure Kotlin, `SEND_SMS`) is **intentionally deferred**. It is a
client of the frozen `/sync/v1` seam, so nothing in the core, server or web depends on it yet: the
reminder queue, scheduler and dashboard all work with nothing ever sent. When SMS is picked up, it
begins with a deliverability pilot from the salon's SIM; the seam is versioned so the sender can be
swapped for a GSM modem or a paid API without touching booking logic.
