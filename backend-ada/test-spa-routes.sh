#!/bin/sh
set -eu

# test-spa-routes.sh — SPA deep-link route regression for the Ada server.
#
# Every automated launch MUST own a unique mktemp data directory, bind an
# unused port, and verify health identity (implementation === "ada" AND
# dataDir matches the exact owned dir). The child is proven alive. Exact
# owned resources are removed on every exit path.

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

# Owned data directory and temp root.
TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/pitd-spa.XXXXXX")

SERVER_PID=""
cleanup () {
   if [ -n "${SERVER_PID:-}" ]; then
      kill "${SERVER_PID}" 2>/dev/null || true
      wait "${SERVER_PID}" 2>/dev/null || true
   fi
   if [ -n "${TMP_ROOT:-}" ]; then
      rm -rf "${TMP_ROOT}"
   fi
}

# Install cleanup trap IMMEDIATELY after TMP_ROOT creation, before any fallible
# command (mkdir, port probe, executable check, server launch).
trap cleanup EXIT
trap 'cleanup; exit 130' INT
trap 'cleanup; exit 143' TERM

DATA_DIR="$TMP_ROOT/data"
LOG_FILE="$TMP_ROOT/server.log"
mkdir -p "$DATA_DIR"

# Pick an unused port via the kernel.
PORT=$(
  python3 -c '
import socket, sys
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.bind(("127.0.0.1", 0))
print(s.getsockname()[1])
s.close()
'
)

SERVER_BIN="${PITD_SERVER_BIN:-$SCRIPT_DIR/server/bin/pitd}"
test -x "$SERVER_BIN" || { echo "server executable not found: $SERVER_BIN" >&2; exit 1; }
"${SERVER_BIN}" --port "$PORT" --data "$DATA_DIR" \
   --static "$SCRIPT_DIR/../frontend/dist" >"$LOG_FILE" 2>&1 &
SERVER_PID=$!

# Readiness: poll /api/health until 200 + JSON identity
# (implementation === "ada" AND dataDir === expected).
ready=0
attempt=1
while [ "$attempt" -le 50 ]; do
  health=$(curl --silent --max-time 1 "http://127.0.0.1:$PORT/api/health" 2>/dev/null || true)
  if [ -n "$health" ]; then
     impl=$(echo "$health" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("implementation",""))' 2>/dev/null || echo "")
     ddir=$(echo "$health" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("dataDir",""))' 2>/dev/null || echo "")
     if [ "$impl" = "ada" ] && [ "$ddir" = "$DATA_DIR" ]; then
        ready=1
       echo "  dataDir: $DATA_DIR"
       echo "  port: $PORT"
       echo "  pid: $SERVER_PID"
        break
     fi
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
     echo "server exited before readiness; log follows" >&2
     sed -n '1,120p' "$LOG_FILE" >&2
     exit 1
  fi
  sleep 0.1
  attempt=$((attempt + 1))
done

if [ "$ready" -ne 1 ]; then
   echo "server did not become ready with identity match; log follows" >&2
   sed -n '1,120p' "$LOG_FILE" >&2
   exit 1
fi

# SPA deep-link routes: all client-side routes must return index.html, not 404.
curl --fail --silent "http://127.0.0.1:$PORT/roster" >"$TMP_ROOT/roster.html"
grep -q '<div id="app"></div>' "$TMP_ROOT/roster.html"
curl --fail --silent \
   "http://127.0.0.1:$PORT/api/campaign/roster" \
   | python3 -c 'import sys,json; d=json.load(sys.stdin); assert "characters" in d'
test "$(curl --silent --output /dev/null --write-out '%{http_code}' \
   "http://127.0.0.1:$PORT/assets/does-not-exist.js")" = "404"

# Web app manifest: served with its registered media type (not octet-stream).
test "$(curl --silent --output /dev/null --write-out '%{content_type}' \
   "http://127.0.0.1:$PORT/site.webmanifest")" = "application/manifest+json"
