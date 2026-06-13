#!/usr/bin/env bash
# Bring up the full demo stack: a dedicated Chrome (for the worker), the mock
# NetSuite gym, and the chat UI. Ctrl-C tears everything down.
#
#   scripts/dev.sh                 # headless worker Chrome
#   scripts/dev.sh --headed        # VISIBLE Chrome — watch the worker drive it
#   CHROME_HEADLESS=0 scripts/dev.sh   # same as --headed
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# The UI server runs with cwd = ui/, so tell it where the repo (SOPs, vendored
# harness) actually is.
export SOP_REPO_ROOT="$ROOT"

# --headed (or headed) shows the worker's Chrome window; default is headless.
for arg in "$@"; do
  case "$arg" in
    --headed | headed) CHROME_HEADLESS=0 ;;
    --headless | headless) CHROME_HEADLESS=1 ;;
  esac
done

cleanup() {
  echo "shutting down…"
  [[ -n "${MOCK_PID:-}" ]] && kill "$MOCK_PID" 2>/dev/null || true
  [[ -n "${UI_PID:-}" ]] && kill "$UI_PID" 2>/dev/null || true
  scripts/chrome.sh stop 2>/dev/null || true
}
trap cleanup EXIT INT TERM

HEADLESS="${CHROME_HEADLESS:-1}"
echo "[1/3] starting dedicated Chrome on :9222 ($([[ "$HEADLESS" == 0 ]] && echo 'HEADED — visible window' || echo headless))…"
CHROME_HEADLESS="$HEADLESS" scripts/chrome.sh start

echo "[2/3] starting mock NetSuite gym on :5180…"
pnpm --filter @sop/mock dev >/tmp/sop-mock.log 2>&1 &
MOCK_PID=$!

echo "[3/3] starting chat UI on :5190…"
pnpm --filter @sop/ui dev >/tmp/sop-ui.log 2>&1 &
UI_PID=$!

sleep 2
echo
echo "  mock gym → http://127.0.0.1:5180"
echo "  chat UI  → http://127.0.0.1:5190"
echo "  logs: /tmp/sop-mock.log /tmp/sop-ui.log"
echo
echo "Open the chat UI and submit a ticket. Ctrl-C to stop."
wait
