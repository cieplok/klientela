#!/bin/sh
# om-prepare-test-env: generated teardown (contract v2)
# regenerate with: om-prepare-test-env --regenerate
# history:
#   2026-10-11 generated for klientela
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
cd "$ROOT"
QA_DIR=".ai/qa"
ENV_DESCRIPTOR="$QA_DIR/test-env.json"

if [ ! -f "$ENV_DESCRIPTOR" ]; then
  echo "TEST_ENV_STATUS=stopped"; exit 0
fi

kill_group() {
  [ -n "${1:-}" ] || return 0
  kill -TERM "-$1" 2>/dev/null || kill -TERM "$1" 2>/dev/null || true
}
s_pid=$(jq -r '.app.pid // empty' "$ENV_DESCRIPTOR" 2>/dev/null || echo "")
w_pid=$(jq -r '.app.webPid // empty' "$ENV_DESCRIPTOR" 2>/dev/null || echo "")
kill_group "$s_pid"
kill_group "$w_pid"
sleep 1
[ -n "$s_pid" ] && (kill -KILL "-$s_pid" 2>/dev/null || kill -KILL "$s_pid" 2>/dev/null || true)
[ -n "$w_pid" ] && (kill -KILL "-$w_pid" 2>/dev/null || kill -KILL "$w_pid" 2>/dev/null || true)

tmp="$ENV_DESCRIPTOR.tmp"
jq '.status = "stopped"' "$ENV_DESCRIPTOR" > "$tmp" && mv "$tmp" "$ENV_DESCRIPTOR" || true
echo "TEST_ENV_STATUS=stopped"
