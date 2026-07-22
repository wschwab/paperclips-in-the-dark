#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SERVER="$SCRIPT_DIR/server/bin/pitd"
PORT=${PITD_LAUNCH_TEST_PORT:-19657}
LOG_FILE="${TMPDIR:-/tmp}/pitd-launch-paths-$$.log"
server_pid=""

cleanup () {
   if [ -n "$server_pid" ]; then
      kill "$server_pid" 2>/dev/null || true
      wait "$server_pid" 2>/dev/null || true
   fi
   rm -f "$LOG_FILE"
}
trap cleanup EXIT INT TERM

(cd "${TMPDIR:-/tmp}" && "$SERVER" --port "$PORT") >"$LOG_FILE" 2>&1 &
server_pid=$!

ready=0
attempt=1
while [ "$attempt" -le 50 ]; do
   if curl --fail --silent "http://localhost:$PORT/api/health" >/dev/null 2>&1; then
      ready=1
      break
   fi
   sleep 0.1
   attempt=$((attempt + 1))
done

if [ "$ready" -ne 1 ]; then
   echo "server did not become ready; log follows" >&2
   sed -n '1,120p' "$LOG_FILE" >&2
   exit 1
fi

curl --fail --silent "http://localhost:$PORT/" >/dev/null
curl --fail --silent \
   "http://localhost:$PORT/api/games/blades-in-the-dark" >/dev/null

echo "launch-path regression passed from ${TMPDIR:-/tmp}"
