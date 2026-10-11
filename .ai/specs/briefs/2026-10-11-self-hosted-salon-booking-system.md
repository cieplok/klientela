# Self-hosted, single-tenant salon booking system + Android SMS reminder gateway (TypeScript monorepo)

- Date: 2026-10-11
- Category: feature
- Priority signal: medium — the user wants to build it, but there is no external deadline or revenue tied to it yet; one salon.
- Risk signal: high — greenfield multi-component build; the mid-appointment gap scheduling UI/engine is the hardest part; the "send SMS from a dedicated phone, no third party" mechanism has untested carrier/ops failure modes; the repo has no pipeline yet.
- Routing: Next: om-auto-write-spec "Self-hosted single-tenant salon booking system: booking web app + server with gap-aware scheduling, then a dedicated-Android-phone SMS reminder gateway — brief: .ai/specs/briefs/2026-10-11-self-hosted-salon-booking-system.md"

## Problem

A single hair/nail salon needs to manage its own appointments. Today that means paper/phone/Google Calendar, which cannot express the salon's real scheduling model: an appointment type is not one solid block of the employee's time — it contains **gaps** (e.g. hair color processing time) during which the employee is free to start another client. The user checked mainstream salon SaaS (Fresha, Booksy, Square Appointments, Zenoti) and none fit this exact mid-service gap / shared-capacity semantics, so an off-the-shelf tool is not an option. The salon also wants to remind customers of upcoming appointments without paying a recurring third-party SMS API bill.

## Agreed direction

Build a **single-tenant, self-hosted, on-premises** booking system for one salon, delivered as one **TypeScript monorepo** (pnpm workspaces + Turborepo), **phased as one spec**:

- **Phase 1 — booking core + the reminder seam.** Customers database; appointment calendar; configurable employees and their capacity; parameterized appointment types (required duration, ordered segments including gap segments that free the employee for another client, and a mapping of which employees can perform each type); the availability engine that honors those gaps. Internal staff tool (staff enter all appointments; no public self-booking). Plus a **frozen `reminders` queue + sync API contract** so the sender is replaceable.
- **Phase 2 — the Android SMS gateway.** A business-owned, dedicated cheap Android phone kept at the salon, running a sideloaded app that syncs the reminder queue a few times a day and sends due SMS from its own SIM, reporting sent/failed back.

**Chosen stack (all TypeScript except the Android app):**

- `packages/core` — pure-TS domain model + Zod schemas (`Customer`, `Employee` + capacity, `AppointmentType` with ordered segments/gaps and employee mapping) and the availability engine. No runtime deps; shared by server and web; unit-tested.
- `apps/server` — Fastify + tRPC (typed client contract), Drizzle ORM on SQLite (WAL, `better-sqlite3`; Postgres is a config swap), Zod validation, argon2 cookie sessions for a few staff accounts. Owns the `reminders` queue (`scheduledFor`, status, attempts, idempotency key) and the device sync endpoints.
- `apps/web` — React + Vite SPA, TanStack Router + Query; calendar as a resource-timeline (employees = rows, time = columns, appointment gaps = open capacity). **Spike required** before locking the calendar library: `react-big-calendar` is free but weaker; FullCalendar's resource-timeline view needs a paid license.
- `apps/android` — **pure Kotlin** (chosen over React Native + native bridge, which is heavier than warranted for a single-purpose sender): WorkManager periodic sync + local Room outbox, `SmsManager.sendTextMessage` with `SEND_SMS`, sideloaded APK.
- Deployment — Docker Compose on a mini-PC/Raspberry Pi in the salon; Caddy for TLS; **Tailscale** for remote reachability (no port-forwarding); automated SQLite backups.

**The seam that de-risks the SMS mechanism:** the server computes due reminders into the queue; the phone is *only* a sender that polls and reports back. If the device is unreliable, it can be swapped for a GSM modem — or, last resort, a paid SMS API — without changing the booking side.

**Rejected alternatives:**

- **Adopt an off-the-shelf SaaS** (Fresha/Booksy/Square/Zenoti) — rejected: user checked; the mid-service gap semantics fit none; ownership/self-hosting is also a goal.
- **Third-party SMS API** (Twilio/MessageBird) — rejected on recurring cost.
- **MySQL/Postgres or a cloud VPS** — rejected: single salon + on-prem ownership; SQLite on-prem is simpler and sufficient, Postgres stays as an upgrade path.
- **React Native (Expo) Android app** — rejected in favor of pure Kotlin for a background-only sender.
- **"Build nothing"** lost: paper/phone/Google Calendar cannot model gap-based capacity, and the user wants ownership rather than a subscription.

## Resolved unknowns

| Question | Answer (from the conversation) |
|----------|--------------------------------|
| Who is it for / how many salons per deployment? | One salon, the user's own or one client. **Single-tenant — hard constraint** (no tenant column). |
| Why "no third-party SMS"? | No recurring cost / no paid API account (not privacy). |
| Which phone sends the SMS? | A dedicated business-owned Android phone kept at the salon (not a personal phone). Sideloaded APK, so Google Play's SMS-permission policy does not bind. |
| Public self-booking or internal tool? | Internal staff tool — staff enter all appointments; no customer accounts/public booking. |
| Where does the server run? | On-premises in the salon, reachable remotely. |
| Maintainer's stack? | JavaScript/TypeScript; monorepo requested explicitly. |
| Build vs. buy? | Build — user checked the major salon SaaS tools; none match the gap semantics. |
| SMS market? | Europe/EU; normal-SIM SMS expected to deliver. |
| Scope slice? | One phased spec: booking core first, Android gateway second. |

## Non-goals

- Public customer self-booking / customer-facing accounts.
- Multi-tenant / multi-salon / SaaS operation.
- Online payments, deposits, or POS.
- iOS app.
- Any third-party SMS service or paid SMS API in the default design.
- A staff mobile app (staff use the web app).
- Real-time collaborative editing of the calendar (simple polling/refetch is acceptable).

## Affected areas (if known)

Greenfield — the repository contains only a `README.md`; every area below is new:

- `apps/server`, `apps/web`, `apps/android`, `packages/core`
- `pnpm-workspace.yaml`, `turbo.json`, root `package.json`, `docker-compose.yml`, `Caddyfile`
- `.ai/` pipeline artifacts (see the open risk below)

## Open risks / cheapest experiments (carry into the spec)

- **SMS deliverability (Phase 2 gate).** Before building the Android app, send ~20 real messages from the actual SIM to different EU networks and confirm they arrive. EU A2P filtering is lighter than US 10DLC but not zero; a prepaid SIM still costs money, and the always-on phone has real failure modes (battery swelling on permanent charge, OEM background-killers, reboots, theft). The reminder seam makes the mechanism replaceable — the spec must state that the booking side must never depend on the phone.
- **Reminder ROI hypothesis (falsifiable).** State the assumption the gateway is meant to prove: reminders reduce customer no-shows enough to justify the device and its maintenance. If reminders do not move no-shows, the gateway is unnecessary.
- **Calendar timeline spike.** Prototype the resource-timeline with live mid-appointment free capacity (free library vs. FullCalendar license) before the spec locks the UI choice.
- **No pipeline exists.** The repo has no commits, CI, tracker, labels, or validation commands. Consider running `om-setup-agent-pipeline` before or alongside the spec run, or the spec must not assume those artifacts.
