#!/bin/sh
# om-prepare-test-env: generated entrypoint (contract v2)
# regenerate with: om-prepare-test-env --regenerate
# history:
#   2026-10-11 generated for klientela (Fastify API + Vite web, SQLite file DB)
#   2026-10-11 repair: port_free() bind test was inverted (chose random ports even
#                      when the preferred 3000/5173 were free); it now returns 0
#                      when the port can be bound.
#   2026-10-11 repair: DB_PATH was relative, but `pnpm --filter seed` runs with cwd
#                      apps/server while the server runs from the repo root, so the
#                      seed wrote a different file and login 401'd. Use an absolute
#                      path; also added an authenticated probe so a boot with no
#                      seeded user can never be reported healthy.
set -eu

# --- project-specific variables (tweak here; logic below stays generic) ---
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
cd "$ROOT"

# pnpm is installed into a user prefix in this environment; keep it on PATH.
PATH="$HOME/.local/bin:$PATH"
export PATH

QA_DIR=".ai/qa"
ENV_DESCRIPTOR="$QA_DIR/test-env.json"
BUILD_CACHE="$QA_DIR/test-env-build-cache.json"
CREDENTIALS_FILE="$QA_DIR/test-env.env"
LOCK_DIR="$QA_DIR/test-env.lock"
DB_PATH="$ROOT/.ai/qa/klientela.db"
SERVER_LOG="$QA_DIR/server.log"
WEB_LOG="$QA_DIR/web.log"

PNPM="${PNPM:-pnpm}"
API_PORT="${TEST_ENV_API_PORT:-3000}"
WEB_PORT="${TEST_ENV_WEB_PORT:-5173}"
BASE_URL="http://127.0.0.1:$WEB_PORT"
API_URL="http://127.0.0.1:$API_PORT"

# preparation chain (install -> build the workspace packages the app needs)
PREP_CHAIN="install_core:pnpm install --frozen-lockfile
build_core:pnpm --filter @klientela/core build
build_server:pnpm --filter @klientela/server build"

BUILD_INPUTS="package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json packages apps"
BUILD_ENV_VARS=""
ARTIFACTS="packages/core/dist apps/server/dist"
TTL="${TEST_ENV_CACHE_TTL_SECONDS:-1800}"
FORCE=0
FORCE_REBUILD=0

for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --force-rebuild) FORCE_REBUILD=1 ;;
  esac
done

mkdir -p "$QA_DIR"

# --- helpers ---
now_utc() { date -u +%Y-%m-%dT%H:%M:%SZ; }
free_port() {
  if command -v node >/dev/null 2>&1; then
    node -e 's=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})'
  else
    awk 'BEGIN{srand();print 20000+int(rand()*20000)}'
  fi
}
port_free() {
  node -e "const n=require('net');const s=n.createServer();s.once('error',()=>process.exit(1));s.listen($1,'127.0.0.1',()=>{s.close();process.exit(0)})" >/dev/null 2>&1
}
http_ok() { curl -fsS -m 3 "$1" >/dev/null 2>&1; }
pid_alive() { [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null; }
# Deep readiness probe: a real login round trip using the demo credentials, so a
# boot that is serving HTTP but has no seeded user (or lost its DB) is not "ready".
auth_probe() {
  [ -f "$CREDENTIALS_FILE" ] || return 1
  pw=$(sed -n 's/^TEST_ADMIN_PASSWORD=//p' "$CREDENTIALS_FILE")
  [ -n "$pw" ] || return 1
  body=$(jq -n --arg e "admin@salon.local" --arg p "$pw" '{email:$e,password:$p}')
  resp=$(curl -fsS -m 5 "$API_URL/trpc/auth.login" -H 'content-type: application/json' --data "$body" 2>/dev/null) || return 1
  case "$resp" in *'"result"'*) return 0 ;; *) return 1 ;; esac
}

# --- build cache (generic) ---
fp_file() { stat -f '%z:%m' "$1" 2>/dev/null || stat -c '%s:%Y' "$1" 2>/dev/null; }
fingerprint() {
  {
    for p in $BUILD_INPUTS; do
      if [ -d "$p" ]; then
        find "$p" -type f \
          ! -path '*/node_modules/*' ! -path '*/.git/*' ! -path '*/dist/*' \
          ! -path '*/.cache/*' ! -path '*/coverage/*' ! -path '*/.turbo/*'
      elif [ -f "$p" ]; then echo "$p"; fi
    done | LC_ALL=C sort | while IFS= read -r f; do printf '%s:%s\n' "$f" "$(fp_file "$f")"; done
    for v in $BUILD_ENV_VARS; do eval "printf 'env:%s=%s\n' \"$v\" \"\${$v:-}\""; done
  } | cksum | awk '{print $1"-"$2}'
}
build_needed() {
  [ "$FORCE_REBUILD" = 1 ] && return 0
  [ -f "$BUILD_CACHE" ] || return 0
  CACHED_FP=$(sed -n 's/.*"sourceFingerprint": *"\([^"]*\)".*/\1/p' "$BUILD_CACHE")
  CACHED_ROOT=$(sed -n 's/.*"projectRoot": *"\([^"]*\)".*/\1/p' "$BUILD_CACHE")
  [ "$CACHED_FP" = "$(fingerprint)" ] || return 0
  [ "$CACHED_ROOT" = "$(pwd)" ] || return 0
  for a in $ARTIFACTS; do [ -s "$a" ] || [ -d "$a" ] || return 0; done
  return 1
}

# --- lock (one bootstrap at a time) ---
acquire_lock() {
  tries=0
  while ! mkdir "$LOCK_DIR" 2>/dev/null; do
    owner_pid=$(sed -n 's/.*"pid": *\([0-9]*\).*/\1/p' "$LOCK_DIR/owner.json" 2>/dev/null || echo "")
    if [ -n "$owner_pid" ] && ! pid_alive "$owner_pid"; then
      rm -rf "$LOCK_DIR"
      continue
    fi
    tries=$((tries + 1))
    [ "$tries" -ge 60 ] && { echo "lock held too long; giving up" >&2; exit 1; }
    sleep 5
  done
  printf '{"pid": %s, "source": "test-env-up.sh", "acquiredAt": "%s"}\n' "$$" "$(now_utc)" > "$LOCK_DIR/owner.json"
}
release_lock() { rm -rf "$LOCK_DIR" 2>/dev/null || true; }
trap release_lock EXIT INT TERM

# --- teardown of a stale environment this repo started ---
stop_recorded() {
  [ -f "$ENV_DESCRIPTOR" ] || return 0
  s_pid=$(jq -r '.app.pid // empty' "$ENV_DESCRIPTOR" 2>/dev/null || echo "")
  w_pid=$(jq -r '.app.webPid // empty' "$ENV_DESCRIPTOR" 2>/dev/null || echo "")
  [ -n "$s_pid" ] && kill -TERM "-$s_pid" 2>/dev/null || kill -TERM "$s_pid" 2>/dev/null || true
  [ -n "$w_pid" ] && kill -TERM "-$w_pid" 2>/dev/null || kill -TERM "$w_pid" 2>/dev/null || true
  sleep 1
}

acquire_lock

# --- reuse check (attach, don't reboot) ---
RUN_ID="$(date -u +%Y%m%d%H%M%S)-$$"
REUSED=0
if [ "$FORCE" != 1 ] && [ -f "$ENV_DESCRIPTOR" ] && [ "$(jq -r '.status // empty' "$ENV_DESCRIPTOR")" = "running" ]; then
  r_app=$(jq -r '.app.pid // empty' "$ENV_DESCRIPTOR")
  r_web=$(jq -r '.app.webPid // empty' "$ENV_DESCRIPTOR")
  r_started=$(jq -r '.startedAt // empty' "$ENV_DESCRIPTOR")
  r_base=$(jq -r '.baseUrl // empty' "$ENV_DESCRIPTOR")
  r_api=$(jq -r '.app.apiPort // empty' "$ENV_DESCRIPTOR")
  ok=1
  pid_alive "$r_app" || ok=0
  pid_alive "$r_web" || ok=0
  [ "$r_base" = "$BASE_URL" ] || ok=0
  [ "$r_api" = "$API_PORT" ] || ok=0
  # fresh: age within TTL and no tracked source newer than start
  if [ "$ok" = 1 ] && [ -n "$r_started" ]; then
    started_epoch=$(date -u -d "$r_started" +%s 2>/dev/null || echo 0)
    age=$(( $(date -u +%s) - started_epoch ))
    [ "$age" -lt "$TTL" ] || ok=0
    newer=$(find $BUILD_INPUTS -type f ! -path '*/node_modules/*' ! -path '*/.git/*' ! -path '*/dist/*' ! -path '*/.turbo/*' -newermt "$r_started" -print -quit 2>/dev/null || echo "")
    [ -z "$newer" ] || ok=0
  fi
  if [ "$ok" = 1 ]; then
    http_ok "$API_URL/health" || ok=0
    http_ok "$BASE_URL/" || ok=0
    auth_probe || ok=0
  fi
  if [ "$ok" = 1 ]; then
    REUSED=1
    RUN_ID=$(jq -r '.runId' "$ENV_DESCRIPTOR")
  else
    stop_recorded
  fi
fi

if [ "$REUSED" != 1 ]; then
  stop_recorded

  # --- build (gated by the build cache) ---
  if build_needed; then
    printf '%s\n' "$PREP_CHAIN" | while IFS=: read -r label cmd; do
      [ -n "$cmd" ] || continue
      echo "prep[$label]: $cmd"
      sh -c "$cmd"
    done
    printf '{ "builtAt": "%s", "sourceFingerprint": "%s", "projectRoot": "%s", "artifactPaths": "%s" }\n' \
      "$(now_utc)" "$(fingerprint)" "$(pwd)" "$ARTIFACTS" > "$BUILD_CACHE"
  else
    echo "prep: build cache hit — skipping install/build"
  fi

  # --- pick free ports if the preferred ones are taken ---
  port_free "$API_PORT" || API_PORT=$(free_port)
  port_free "$WEB_PORT" || WEB_PORT=$(free_port)
  BASE_URL="http://127.0.0.1:$WEB_PORT"
  API_URL="http://127.0.0.1:$API_PORT"

  # --- seed the (fresh) SQLite database ---
  DB_PATH="$DB_PATH" ADMIN_EMAIL=admin@salon.local ADMIN_PASSWORD=admin1234 sh -c "pnpm --filter @klientela/server seed" >/dev/null 2>&1 || true

  # --- start the API ---
  DB_PATH="$DB_PATH" PORT="$API_PORT" HOST=127.0.0.1 NODE_ENV=production \
    setsid sh -c "exec node apps/server/dist/index.js" >"$SERVER_LOG" 2>&1 &
  SERVER_PID=$!
  i=0
  until http_ok "$API_URL/health"; do
    i=$((i + 1)); [ "$i" -ge 60 ] && { echo "API did not become healthy; see $SERVER_LOG" >&2; exit 1; }
    sleep 1
  done

  # --- start the web dev server (proxy -> API) ---
  API_PROXY_TARGET="$API_URL" WEB_PORT="$WEB_PORT" \
    setsid sh -c "cd apps/web && exec pnpm exec vite --host 127.0.0.1 --port $WEB_PORT --strictPort" >"$WEB_LOG" 2>&1 &
  WEB_PID=$!
  i=0
  until http_ok "$BASE_URL/"; do
    i=$((i + 1)); [ "$i" -ge 90 ] && { echo "web did not become healthy; see $WEB_LOG" >&2; exit 1; }
    sleep 1
  done

  STARTED_AT=$(now_utc)
  printf 'TEST_ADMIN_PASSWORD=admin1234\n' > "$CREDENTIALS_FILE"
  auth_probe || { echo "login probe failed after boot; see $SERVER_LOG" >&2; exit 1; }
  if ! grep -qF "$CREDENTIALS_FILE" .gitignore 2>/dev/null; then printf '%s\n' "$CREDENTIALS_FILE" >> .gitignore; fi
  if ! grep -qF "$BUILD_CACHE" .gitignore 2>/dev/null; then printf '%s\n' "$BUILD_CACHE" >> .gitignore; fi
  if ! grep -qF "$QA_DIR/test-env.lock" .gitignore 2>/dev/null; then printf '%s\n' "$QA_DIR/test-env.lock" >> .gitignore; fi

  jq -n \
    --arg runId "$RUN_ID" --arg baseUrl "$BASE_URL" \
    --argjson apiPort "$API_PORT" --argjson webPort "$WEB_PORT" \
    --argjson serverPid "$SERVER_PID" --argjson webPid "$WEB_PID" \
    --arg startedAt "$STARTED_AT" --arg dbPath "$DB_PATH" \
    '{version:1, runId:$runId, status:"running", mode:"dev", baseUrl:$baseUrl,
      startedByThisRepo:true, startScript:".ai/scripts/test-env-up.sh", stopScript:".ai/scripts/test-env-down.sh",
      app:{startCommand:"node apps/server/dist/index.js + vite dev", apiPort:$apiPort, port:$webPort, healthPath:"/", pid:$serverPid, webPid:$webPid},
      services:[],
      credentials:[{role:"admin", username:"admin@salon.local", passwordEnv:"TEST_ADMIN_PASSWORD"}],
      credentialsFile:".ai/qa/test-env.env",
      browser:{provider:"agent-browser", installed:true, command:"agent-browser", version:"v0.35.2", descriptor:".ai/browsers/agent-browser.md", notes:""},
      testRunner:{name:"none", config:""},
      platform:"linux", startedAt:$startedAt,
      notes:("Seeded admin admin@salon.local; sample employees/types/customer. SQLite at " + $dbPath + ". API on :" + ($apiPort|tostring) + ", web on :" + ($webPort|tostring) + ".")}' \
    > "$ENV_DESCRIPTOR"
fi

printf 'TEST_ENV_STATUS=running\n'
printf 'TEST_ENV_BASE_URL=%s\n' "$BASE_URL"
printf 'TEST_ENV_DESCRIPTOR=%s\n' "$ENV_DESCRIPTOR"
printf 'TEST_ENV_REUSED=%s\n' "$REUSED"
printf 'BROWSER_PROVIDER=agent-browser\n'
printf 'BROWSER_INSTALLED=1\n'
