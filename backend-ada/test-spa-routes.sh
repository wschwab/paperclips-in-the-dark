#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PORT=${PITD_SPA_TEST_PORT:-19659}
TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/pitd-spa.XXXXXX")
SERVER_PID=""

cleanup () {
   if [ -n "$SERVER_PID" ]; then
      kill "$SERVER_PID" 2>/dev/null || true
      wait "$SERVER_PID" 2>/dev/null || true
   fi
   rm -rf "$TMP_ROOT"
}
trap cleanup EXIT INT TERM

"$SCRIPT_DIR/server/bin/pitd" --port "$PORT" --data "$TMP_ROOT/data" \
   --static "$SCRIPT_DIR/../frontend/dist" >"$TMP_ROOT/server.log" 2>&1 &
SERVER_PID=$!

attempt=1
while [ "$attempt" -le 50 ]; do
   if curl --fail --silent "http://127.0.0.1:$PORT/api/health" >/dev/null; then
      break
   fi
   sleep 0.1
   attempt=$((attempt + 1))
done

curl --fail --silent "http://127.0.0.1:$PORT/roster" >"$TMP_ROOT/roster.html"
grep -q '<div id="app"></div>' "$TMP_ROOT/roster.html"
curl --fail --silent "http://127.0.0.1:$PORT/api/campaign/roster" \
   | grep -q '"characters"'
test "$(curl --silent --output /dev/null --write-out '%{http_code}' \
   "http://127.0.0.1:$PORT/assets/does-not-exist.js")" = "404"
