# Execution plan — Phase 1 completion (PR stack)

- Source doc: .ai/specs/2026-10-11-self-hosted-salon-booking-system.md
- Engine: om-auto-create-pr
- Date: 2026-10-11
- Phase 2 (Android SMS gateway) is intentionally **out of scope**: it is a client of the frozen `/sync/v1` seam and nothing in the core/server/web depends on it.

## Goal

Finish everything Phase 1 leaves open now that the Android sender is deferred: the remaining admin UI over already-shipped endpoints, the few backend gaps the spec names (device rotation, staff accounts, nightly backup), and the permission/ops hygiene around them.

## Stack

Each slice is a branch based on the previous one; PRs target their parent branch and merge bottom-up.

| # | Branch | PR base |
|---|--------|---------|
| 1 | `feat/ui-customers-services` | `master` |
| 2 | `feat/reminders-devices` | `feat/ui-customers-services` |
| 3 | `feat/staff-accounts-permissions` | `feat/reminders-devices` |
| 4 | `feat/calendar-week-drawer` | `feat/staff-accounts-permissions` |
| 5 | `chore/ops-backup-lint` | `feat/calendar-week-drawer` |

## Scope

- Web: Customers (search/detail/edit/delete), Services (edit/buffers/capabilities/deactivate), Reminders (status filter), Calendar (week view, capacity cue), Appointment drawer (customer search/create, resolved plan), Settings (Users), permission-aware UI.
- Server: `devices.rotate`; `staffUsers.*` (admin-only); tests for both.
- Ops: nightly SQLite backup script; lint gate / doc-config harmony.

## Non-goals

- Phase 2: Android app, `SEND_SMS`, deliverability pilot, any change to `/sync/v1` or the `reminders` schema.
- Payments, public booking, multi-tenant, realtime websockets.

## Risks

- **Stack maintenance** — merging a lower PR leaves upper PRs based on a merged branch; retarget the next PR to `master` (or use GitHub's stacked-PR auto-retarget) at merge time.
- **No web test harness** — UI slices rely on the validation gate plus browser QA, matching the existing precedent; server changes get unit tests.
- **Permission model** — `admin`/`staff` is enforced server-side; the UI change is presentation only and must never be the sole guard.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Customers & services UI

- [x] 1.1 Customer search + detail (history, edit, delete) — 22d4f15
- [x] 1.2 Service editing (segments, buffers, capabilities, deactivate) — 22d4f15

### Phase 2: Reminders filters + device rotation

- [ ] 2.1 Fix Reminders no-show refetch loop (#6)
- [ ] 2.2 Reminder status filter
- [ ] 2.3 Device token rotation (server + UI)

### Phase 3: Staff accounts + permissions

- [ ] 3.1 `staffUsers` router (list/create/update/reset) + tests
- [ ] 3.2 Settings "Users" admin UI
- [ ] 3.3 Permission-aware UI (hide admin-only, no-permission state)

### Phase 4: Calendar week view + drawer polish

- [ ] 4.1 Week view + capacity cue
- [ ] 4.2 Drawer customer search/create + resolved plan

### Phase 5: Ops & hygiene

- [ ] 5.1 Nightly SQLite backup script + docs
- [ ] 5.2 Lint gate / doc-config harmony
