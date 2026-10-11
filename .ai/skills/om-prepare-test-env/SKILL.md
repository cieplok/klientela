# om-prepare-test-env — repo-local notes (klientela)

The generated entrypoint lives at `.ai/scripts/test-env-up.sh` / `test-env-down.sh`.
**Run it; do not re-discover the stack.**

```sh
sh .ai/scripts/test-env-up.sh     # API :3000 + Vite web :5173, seeds SQLite, writes .ai/qa/test-env.json
sh .ai/scripts/test-env-down.sh
```

Consumers (`om-auto-qa-pr`, `om-integration-tests`) attach to `baseUrl` in `.ai/qa/test-env.json`.

## Working command chain

- prepare: `pnpm install --frozen-lockfile` → `pnpm --filter @klientela/core build` → `pnpm --filter @klientela/server build`
- seed: `DB_PATH` **must be absolute** — `pnpm --filter @klientela/server seed` runs with cwd `apps/server`
- start: `node apps/server/dist/index.js` (cwd repo root) + `apps/web` `vite dev` (proxy target from `API_PROXY_TARGET`)
- readiness/login probe: `POST /trpc/auth.login` with `admin@salon.local`

## Lessons baked into the script (each was a real failure)

- **DB_PATH mismatch.** A relative `DB_PATH` resolved against `apps/server` for the seed but
  against the repo root for the server, so the app booted "healthy" with an empty database and
  every login 401'd. Fixed with an absolute path, and the reuse check now runs a real login probe
  so a boot with no seeded user can never be reported healthy.
- **`port_free()` was inverted**, choosing random ports even when the preferred 3000/5173 were
  free.
- **SPA hydration race (for QA drivers, not the script).** The React app mounts asynchronously;
  wait ~2s (or poll for the login refs) after `open` before filling/clicking, or you stay on the
  login screen.
- **Chrome autofill.** The shared `agent-browser` profile can pre-fill a wrong password; always
  explicitly fill both fields rather than relying on the pre-filled values.
