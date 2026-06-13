#!/usr/bin/env bash
# Launch / stop a DEDICATED Chrome for the worker (and tests) on a debug port
# with an isolated profile — never the user's everyday Chrome (Way 2 in the
# browser-harness docs). Point browser-harness at it via BU_CDP_URL.
#
#   scripts/chrome.sh start   # start (headless by default; CHROME_HEADLESS=0 for headed)
#   scripts/chrome.sh stop
#   scripts/chrome.sh status
#
# Env:
#   CHROME_PORT      debug port (default 9222)
#   CHROME_HEADLESS  1 (default) or 0
#   CHROME_PROFILE   user-data-dir (default a tmp dir under the OS temp)
set -euo pipefail

PORT="${CHROME_PORT:-9222}"
HEADLESS="${CHROME_HEADLESS:-1}"
PROFILE="${CHROME_PROFILE:-${TMPDIR:-/tmp}/sop-chrome-${PORT}}"
PIDFILE="${TMPDIR:-/tmp}/sop-chrome-${PORT}.pid"

chrome_bin() {
  if [[ "$(uname)" == "Darwin" ]]; then
    echo "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  else
    command -v google-chrome || command -v chromium || command -v chromium-browser
  fi
}

case "${1:-}" in
  start)
    if curl -s "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1; then
      echo "Chrome already listening on ${PORT}"
      exit 0
    fi
    BIN="$(chrome_bin)"
    mkdir -p "$PROFILE"
    ARGS=(
      --remote-debugging-port="${PORT}"
      --user-data-dir="${PROFILE}"
      --no-first-run --no-default-browser-check
      --disable-background-networking --disable-sync
      --disable-features=Translate,MediaRouter
      --force-device-scale-factor=1
      --window-size=1440,900
      about:blank
    )
    if [[ "$HEADLESS" == "1" ]]; then ARGS=(--headless=new "${ARGS[@]}"); fi
    "$BIN" "${ARGS[@]}" >/dev/null 2>&1 &
    echo $! > "$PIDFILE"
    for _ in $(seq 1 50); do
      if curl -s "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1; then
        echo "Chrome started on ${PORT} (headless=${HEADLESS}, profile=${PROFILE}, pid=$(cat "$PIDFILE"))"
        exit 0
      fi
      sleep 0.2
    done
    echo "Chrome failed to start on ${PORT}" >&2
    exit 1
    ;;
  stop)
    if [[ -f "$PIDFILE" ]]; then
      kill "$(cat "$PIDFILE")" 2>/dev/null || true
      rm -f "$PIDFILE"
      echo "stopped"
    else
      pkill -f "remote-debugging-port=${PORT}" 2>/dev/null || true
      echo "stopped (by pattern)"
    fi
    ;;
  status)
    if curl -s "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1; then
      curl -s "http://127.0.0.1:${PORT}/json/version"
      echo
    else
      echo "not listening on ${PORT}"
    fi
    ;;
  *)
    echo "usage: $0 {start|stop|status}" >&2
    exit 2
    ;;
esac
