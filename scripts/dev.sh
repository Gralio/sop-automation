#!/usr/bin/env bash
# Bring up the full demo stack: a dedicated Chrome (for the worker), the mock
# NetSuite gym, and the chat UI. Ctrl-C tears everything down.
#
#   scripts/dev.sh                 # headless worker Chrome
#   CHROME_HEADLESS=0 scripts/dev.sh   # watch the worker drive the browser
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

cleanup() {
  echo "shutting down…"
  [[ -n "${MOCK_PID:-}" ]] && kill "$MOCK_PID" 2>/dev/null || true
  [[ -n "${UI_PID:-}" ]] && kill "$UI_PID" 2>/dev/null || true
  scripts/chrome.sh stop 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "[1/3] starting dedicated Chrome on :9222 (headless=${CHROME_HEADLESS:-1})…"
CHROME_HEADLESS="${CHROME_HEADLESS:-1}" scripts/chrome.sh start

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
