# Execution plan — implement Phase 1 of the self-hosted salon booking system

- Source doc: .ai/specs/2026-10-11-self-hosted-salon-booking-system.md
- Spec PR: #1
- Branch: feat/self-hosted-salon-booking-system
- Engine: om-auto-create-pr
- Date: 2026-10-11

## Goal

Ship **Phase 1** of the salon booking system: a self-hosted, single-tenant TypeScript monorepo whose web app lets salon staff manage customers, employees (+capacity, hours, time-off), appointment types (gap segments + capability mapping), and appointments with **gap-aware availability**, plus the server-side **reminder queue** and the frozen `/sync/v1` contract. Phase 1 is fully usable with nothing ever sent.

## Scope

- `packages/core` — pure-TS domain model (Zod) and the gap-aware availability engine, unit-tested.
- `apps/server` — Fastify + tRPC + Drizzle/SQLite; auth; CRUD routers; transactional booking; reminder scheduler; `/sync/v1` device endpoints.
- `apps/web` — React + Vite + TanStack Router/Query; login; a custom CSS-grid resource-timeline calendar; CRUD screens; reminders dashboard; settings.
- Infra — Docker Compose (server + Caddy), README, `.env.example`.

## Non-goals

- Phase 2: the Android SMS app and the deliverability pilot (needs physical hardware + a human go/no-go). The seam it consumes is built here and left unchanged.
- Payments, public customer self-booking, iOS, multi-tenant, staff mobile app, realtime websockets.
- Committing to a paid calendar library (spec assumption **A1** stays open — the free custom timeline is implemented).

## Implementation Plan

### Phase 1: Booking core + reminder seam

- 1.1 Monorepo scaffold — pnpm workspaces + Turborepo, shared tsconfig/eslint/vitest, `packages/core` + `apps/server` + `apps/web` skeletons, validation gate configured.
- 1.2 Core domain model — Zod entities and enums for customer, employee, schedule, time-off, appointment type + segments, appointment, reminder, device, user, settings.
- 1.3 Availability engine — `computeAvailability` with gap/capacity/buffer/hours/time-off semantics; explicit unit tests for each rule.
- 1.4 Server foundation — Fastify + tRPC + Drizzle/SQLite, migrations for all tables, argon2 auth + sessions, seeded admin, config/health.
- 1.5 Customers & employees — tRPC routers + validation; capacity, weekly hours, time-off.
- 1.6 Appointment types — segments (active/gap, ordered, buffers) and employee capability mapping.
- 1.7 Appointments & availability — engine-validated transactional create/update/cancel; availability query.
- 1.8 Reminder queue + `/sync/v1` — scheduler (lead time, quiet hours, template), status lifecycle, leases, idempotency, device attribution, device tokens.
- 1.9 Web app — login, calendar timeline with gap sub-blocks, appointment drawer, customers/employees/types screens, reminders dashboard, settings.
- 1.10 Deployment — Docker Compose + Caddy, backup notes, `.env.example`, README.

## Risks

- **Dependency install / network** — the environment's network was intermittent; the validation gate needs a clean install. If install fails, the run is left `Status: in-progress` with the blocker named.
- **A1 (calendar library)** — ⚠ human-confirmed assumption; the free custom timeline is implemented so the choice stays reversible.
- **Reminder sending** — deliberately absent in Phase 1 (no sender). The queue + contract are complete and observable.

## Progress

PR: #2 (https://github.com/cieplok/klientela/pull/2)

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Booking core + reminder seam

- [x] 1.1 Monorepo scaffold — 802252c
- [x] 1.2 Core domain model — 802252c
- [x] 1.3 Availability engine — 802252c
- [x] 1.4 Server foundation — 802252c
- [x] 1.5 Customers & employees — 802252c
- [x] 1.6 Appointment types — 802252c
- [x] 1.7 Appointments & availability — 802252c
- [x] 1.8 Reminder queue + /sync/v1 — 802252c
- [x] 1.9 Web app — bce1b11
- [x] 1.10 Deployment — bce1b11
