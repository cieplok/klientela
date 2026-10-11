# Code review

Repository review rules, applied automatically by the `om-code-review` skill (and therefore by `om-auto-review-pr`) in addition to its built-in checklist. `om-setup-agent-pipeline` generated the first draft from the detected stack; refine it as the real code and conventions appear.

**Current state: greenfield.** No code exists yet, so the checks below are the ones the planned stack demands, not ones derived from an existing codebase. Update the "repo-specific checks" as real patterns emerge.

## Review priorities

1. **Correctness.** The scheduling engine in `packages/core` is the product's core value: gaps that free an employee mid-appointment, employee-capability mapping, and capacity must be provably correct. Require unit tests for any change to availability computation.
2. **Security.** Staff sessions and cookie auth; phone numbers are personal data. Validate input at every boundary; never log customer PII or secrets.
3. **Contracts.** The `reminders` sync API and the SQLite schema are shared surfaces — see `BACKWARD_COMPATIBILITY.md`.
4. **Simplicity.** Single salon, single tenant. Reject speculative multi-tenancy, distributed-system complexity, or abstraction without a concrete second use.

## Repo-specific checks

- All HTTP inputs validated with **Zod** at the server boundary; no untyped request bodies.
- Domain logic lives in `packages/core` and stays free of I/O and framework imports; the server wires it to Fastify/tRPC.
- The booking server must never import or depend on the Android sender; the only coupling is the `reminders` queue + sync endpoints.
- Reminder sends are **idempotent** — an idempotency key and a status column guard against duplicate SMS.
- Database changes ship as Drizzle migrations, reviewed up and down (see `SDLC.md` for the `risk-high` migration gate).
- Android SMS code path: `SEND_SMS` permission is used only for the reminder sender; the app is sideloaded and must not add Play-Store-only assumptions.

## Severity guidance

- **Blocker** — incorrect availability results, duplicate/missed reminders, auth bypass, customer data leakage, a breaking change to the reminders contract without a migration path.
- **Major** — missing validation on a boundary, missing tests for domain logic, a schema change without a rollback plan.
- **Minor** — naming, structure, or non-load-bearing inconsistency that does not affect behavior.

## Validation gate

Run `.ai/agentic.config.json`'s `validation.commands` in order before sign-off. The list is empty until code exists; once scaffolded it is expected to be typecheck → lint → test → build. A non-zero exit blocks the PR.
