# Execution plan — Employee hours & time-off UI

- Source doc: .ai/specs/2026-10-11-self-hosted-salon-booking-system.md
- Branch: feat/employee-hours-timeoff-ui
- Engine: om-auto-create-pr
- Date: 2026-10-11

## Goal

Make the availability engine's two per-employee inputs — the **weekly working hours** and **time-off** — maintainable from the admin UI, so a book that must respect when people work is actually usable. Today `Employees.tsx` can only add an employee (with a hard-coded Mon–Fri 09:00–17:00 schedule) and toggle active; hours and time-off are invisible even though the server implements both.

## Scope

- `apps/web/src/components/Employees.tsx` — an inline employee editor: name, capacity, colour, a **weekly-hours editor** (any number of windows per weekday, so breaks and split shifts are expressible), and a **time-off** section (list upcoming, add with reason, remove).
- `apps/web/src/styles.css` — only the handful of classes the editor needs.
- No server, schema, or contract change: `employees.get` / `employees.update` (replaces the schedule array in one transaction), and `employees.listTimeOff` / `addTimeOff` / `removeTimeOff` already exist and are the seam this UI drives.

This is the first of the "Phase 1 completion" slices called out as out-of-scope in PR #4 (employee hours/time-off, service editing, customer detail, ops). Those are independent and ship separately.

## Non-goals

- Service (appointment-type) editing, customer detail/search, reminder filters, device rotation — separate slices.
- Admin vs staff permission gating.
- Calendar-library decision (`A1`, ⚠ needs human confirmation); the free custom timeline is already implemented.
- No new test framework for `apps/web` (the package has none today; PR #4 shipped its UI change the same way). Verification is typecheck + build + a UI QA pass on the built app.

## Implementation Plan

### Phase 1: Employee hours & time-off UI

- 1.1 Weekly-hours editor — on the Employees screen, select an employee and edit name/capacity/colour plus a schedule list (weekday + start/end time rows, add/remove, split shifts); save via `employees.update` with the full `schedule` array.
- 1.2 Time-off management — show the employee's upcoming time-off from `employees.listTimeOff`, add a window (datetime + reason) via `addTimeOff`, and remove via `removeTimeOff`; refresh on success.
- 1.3 Validation — run the configured gate (`pnpm typecheck`, `pnpm test`, `pnpm build`) and capture a UI QA pass (employee hours + time-off flows) against the built app.

## Risks

- **Time conversion** — schedules are stored as minutes-from-local-midnight and time-off as UTC epoch ms; the UI must convert with the existing local-time helpers to avoid off-by-timezone rows. Addressed by keeping conversion in the component and verifying in the browser.
- **Schedule replacement semantics** — `employees.update` deletes and re-inserts the whole schedule when `schedule` is passed; the editor must always send the complete window list, never a partial patch of one window.
- **No web test harness** — no unit test can be added without new infrastructure; mitigated by the validation gate plus UI QA evidence, matching the project's existing precedent.

## Progress

PR: #5

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Employee hours & time-off UI

- [x] 1.1 Weekly-hours editor — 428978c
- [x] 1.2 Time-off management — 428978c
- [x] 1.3 Validation — 60494d5
