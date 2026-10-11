# Backward compatibility

What this project treats as a **protected contract surface**, and how changes to one must be handled. Review skills check changes against this file; implementation skills warn when a change violates it.

**Current state: greenfield.** There are no shipped public surfaces yet, so there is nothing to break today. The surfaces below are the ones the design commits to; they become protected as soon as they land. Update this file when the real code fixes their exact shapes.

## Protected surfaces

| Surface | Where it will live | What counts as breaking | Required path |
|---|---|---|---|
| Reminder sync API | `apps/server` — the endpoints the Android gateway calls | Renaming/removing an endpoint, changing the request/response shape of a pending-reminders or send-result payload, or changing the idempotency key semantics | Version the endpoint or ship a compatibility shim; the sideloaded Android app cannot be force-updated in lockstep. Additive fields are safe. |
| `reminders` table schema | `apps/server` — Drizzle schema + migrations | Removing/renaming a column the sync contract uses; changing `status`/idempotency semantics | Forward migration + a stated rollback plan; treat as `risk-high` per `SDLC.md`. |
| Core domain API | `packages/core` exports | Changing a type the server/web consume in a way that drops or reinterprets a field | Update all in-repo consumers in the same change (a monorepo, so this is internal — no deprecation window needed, but the change must be complete). |
| Customers / phone-number data | `apps/server` database | Lossy PII changes; storing phone numbers in plaintext where the design specified otherwise | Data migration with a backup; document the retention change. |

## Rules

- A change that breaks a surface **and** ships the updated consumer in the same PR is allowed; a change that breaks a surface consumed by a component that cannot be updated simultaneously (notably the sideloaded Android app) needs a versioned or additive path.
- When a change is not compliant, the implementing skill warns the user and the reviewer treats it as at least a Major finding.
- This file is small on purpose: it grows as real surfaces appear, not ahead of them.
