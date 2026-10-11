# Execution plan — engine-driven booking slots + land the QA harness

- Branch: feat/availability-driven-booking
- Date: 2026-10-11
- Base: master

## Goal

Make the appointment drawer offer only the start times the availability engine
actually allows (instead of any time, relying on post-hoc server rejection), and
land the UI-verification harness that was stranded on the previous feature branch.

## Scope

- `apps/web/src/components/AppointmentDrawer.tsx` — date + engine-checked slot picker.
- `apps/web/src/lib/format.ts` — date/day-bound helpers.
- `apps/server/src/trpc/routers/availability.ts` — optional `excludeAppointmentId` (reschedule).
- `apps/server/src/__tests__/reminders.test.ts` — exclude-from-own-busy-set test.
- Harness carried over from `4a60c7a`: `.ai/scripts/test-env-*.sh`, `.gitattributes`,
  `apps/web/vite.config.ts` (`API_PROXY_TARGET`), `.gitignore`, repo-local notes.

## Non-goals

- The Android sender (Phase 2).
- Employee hours/time-off, service editing, customer detail, ops, staff accounts (later slices).

## Risks

- Availability query re-runs on every field change — bounded by `enabled` and a small range.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Engine-driven booking + harness

- [x] 1.1 Land the QA harness (cherry-pick from the prior branch) — 1e34920
- [x] 1.2 Server: `excludeAppointmentId` on `availability.query` + test — 790081f
- [x] 1.3 Web: engine-checked slot picker in the appointment drawer — 790081f
- [x] 1.4 Validation gate green — 790081f
