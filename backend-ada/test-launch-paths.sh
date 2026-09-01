#!/bin/sh
set -eu

# test-launch-paths.sh — launch-path regression for the Ada server.
#
# Every automated launch MUST own a unique mktemp data directory (never the
# repo's default campaign-data), bind an unused port, and verify health identity
# (implementation === "ada" AND dataDir matches the exact owned dir). The child
# is proven alive (health responds from the correct data dir). Exact owned
# resources are removed on every exit path.

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SERVER="${PITD_SERVER_BIN:-$SCRIPT_DIR/server/bin/pitd}"

# Owned data directory: never touches repo default campaign-data.
TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/pitd-launch-paths.XXXXXX")
DATA_DIR="$TMP_ROOT/data"
mkdir -p "$DATA_DIR"

# Owned log file inside the temp root so cleanup is exact.
LOG_FILE="$TMP_ROOT/server.log"

# Pick an unused port: bind to port 0 on a throwaway socket pair, read the
# kernel-assigned port, close it, and pass it to the server. The gap between
# close and bind is the usual small race; the server will fail fast if the port
# is taken and the trap will clean up.
PORT=$(
  python3 -c '
import socket, sys
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.bind(("127.0.0.1", 0))
print(s.getsockname()[1])
s.close()
'
)
export PITD_LAUNCH_TEST_PORT="$PORT"

server_pid=""
cleanup () {
  if [ -n "$server_pid" ]; then
     kill "$server_pid" 2>/dev/null || true
     wait "$server_pid" 2>/dev/null || true
  fi
  rm -rf "$TMP_ROOT"
}

# On INT/TERM, clean up then exit with conventional signal code (128 + signum).
trap cleanup EXIT
trap 'cleanup; exit 130' INT
trap 'cleanup; exit 143' TERM

# Verify the server executable exists before launching.
test -x "$SERVER" || { echo "server executable not found: $SERVER" >&2; exit 1; }

# Launch the server with the exact owned data dir and port.
"$SERVER" --port "$PORT" --data "$DATA_DIR" \
   --static "$SCRIPT_DIR/../frontend/dist" \
   --games "$SCRIPT_DIR/../data/games" \
   >"$LOG_FILE" 2>&1 &
server_pid=$!

# Readiness: poll /api/health until it returns 200 + JSON identity
# (implementation === "ada" AND dataDir === expected). This matches the
# canonical managed-run.mjs health check — status alone is insufficient.
ready=0
attempt=1
while [ "$attempt" -le 50 ]; do
  health=$(curl --silent --max-time 1 "http://127.0.0.1:$PORT/api/health" 2>/dev/null || true)
  if [ -n "$health" ]; then
     impl=$(echo "$health" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("implementation",""))' 2>/dev/null || echo "")
     ddir=$(echo "$health" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("dataDir",""))' 2>/dev/null || echo "")
     if [ "$impl" = "ada" ] && [ "$ddir" = "$DATA_DIR" ]; then
        ready=1
        break
     fi
  fi
  # Check if server died
  if ! kill -0 "$server_pid" 2>/dev/null; then
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

# Smoke: serve the SPA root and the games API from the owned server.
curl --fail --silent "http://127.0.0.1:$PORT/" >/dev/null
curl --fail --silent \
   "http://127.0.0.1:$PORT/api/games/blades-in-the-dark" >/dev/null

echo "launch-path regression passed from ${TMPDIR:-/tmp}"
echo "  dataDir: $DATA_DIR"
echo "  port: $PORT"
echo "  pid: $server_pid"
