# AGENTS.md

Guidance for agent skills working in this repository. Read this before starting a task.

## Project overview

`klientela` is a self-hosted, single-tenant appointment-scheduling system for one hair/nail salon, plus a companion Android app that sends customer SMS reminders from the salon's own dedicated phone (no third-party SMS service). It is delivered as a TypeScript monorepo. The full design lives in the spec under `.ai/specs/`; this file is the routing map for working in the code.

**Current state: greenfield.** The repository contains only process/docs setup and no application code yet. Every path below is the *planned* layout from the spec — treat the `Key rules` cells marked `TODO` as unset until the code exists and this file is updated from the real tree.

## Task-routing table

| When the task involves… | Read first | Key rules |
|---|---|---|
| Domain model, appointment types, gap/capacity logic | `packages/core` (planned) | Pure TypeScript, no runtime deps; the availability engine (ordered segments with gaps) is the product differentiator — unit-test it. TODO: exact module boundaries once scaffolded. |
| Server API, data access, auth, reminder queue | `apps/server` (planned) | Fastify + tRPC; Drizzle ORM on SQLite (WAL); Zod at every boundary. The `reminders` table + sync endpoints are a frozen contract the Android app depends on. TODO: confirm layering once scaffolded. |
| Web admin UI, calendar | `apps/web` (planned) | React + Vite SPA; TanStack Router/Query; resource-timeline calendar (employees = rows, gaps = free capacity). TODO: calendar library decision pending a spike. |
| Android SMS gateway | `apps/android` (planned) | Pure Kotlin; WorkManager + Room outbox; `SmsManager` with `SEND_SMS`; sideloaded APK. Never let the booking side depend on the phone. TODO: confirm module layout once scaffolded. |
| Shared schemas / types | `packages/core` (planned) | Zod schemas are the single source of truth shared by server and web. |
| Monorepo tooling, build pipeline | root `package.json`, `pnpm-workspace.yaml`, `turbo.json` (planned) | pnpm workspaces + Turborepo. TODO: create. |
| Deployment / ops | `docker-compose.yml`, `Caddyfile` (planned) | On-prem mini-PC; Caddy TLS; Tailscale for remote access; SQLite backups. TODO: create. |
| Process, labels, claim protocol | `SDLC.md` | The one hard rule: a `needs-qa` PR cannot merge without `qa-approved`. |
| Review rules | `CODE_REVIEW.md` | Applied automatically by `om-code-review`. |
| Protected contracts | `BACKWARD_COMPATIBILITY.md` | Warn, don't silently break. |
| Pipeline configuration | `.ai/agentic.config.json`, `.ai/trackers/github.md` | Tracker operations and label guards live in the descriptor. |

## Validation

`.ai/agentic.config.json` currently has an **empty** `validation.commands` list (no code yet). When the monorepo is scaffolded, set the ordered gate there — expected: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` — and mirror it in `SDLC.md`.

## Where things live

- `SDLC.md` — ticket flow, label state machine, QA gate, claim protocol.
- `CODE_REVIEW.md` — review priorities and severity guidance.
- `BACKWARD_COMPATIBILITY.md` — protected contract surfaces.
- `.ai/agentic.config.json` — machine-readable pipeline configuration.
- `.ai/trackers/github.md` — tracker operations and label guards.
- `.ai/browsers/agent-browser.md` — browser-provider operations.
- `.ai/specs/` — feature specifications and briefs.
