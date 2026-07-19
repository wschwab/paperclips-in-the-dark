#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

echo "==> building core"
(cd "$SCRIPT_DIR/core" && XDG_RUNTIME_DIR=/tmp alr --non-interactive build)

echo "==> testing core"
(cd "$SCRIPT_DIR/core" && \
   XDG_RUNTIME_DIR=/tmp alr --non-interactive exec -- \
   gprbuild -p -P core_tests.gpr && ./bin/core_tests)

echo "==> building server"
(cd "$SCRIPT_DIR/server" && XDG_RUNTIME_DIR=/tmp alr --non-interactive build)

echo "==> proving core"
(cd "$SCRIPT_DIR/core" && XDG_RUNTIME_DIR=/tmp alr --non-interactive exec -- \
   gnatprove -P paperclips_core.gpr --level=2 --checks-as-errors=on)

if [ "${RUN_CONFORMANCE:-0}" = "1" ]; then
   server_pid=""
   stop_server () {
      if [ -n "$server_pid" ]; then
         kill "$server_pid" 2>/dev/null || true
         wait "$server_pid" 2>/dev/null || true
      fi
   }
   trap stop_server EXIT INT TERM

   "$SCRIPT_DIR/server/bin/pitd" --port 9657 --data /tmp/pitd-campaign-data \
      --static "$SCRIPT_DIR/../frontend/dist" \
      --games "$SCRIPT_DIR/../data/games" &
   server_pid=$!

   ready=0
   attempt=1
   while [ "$attempt" -le 50 ]; do
      if curl --fail --silent http://localhost:9657/api/health >/dev/null 2>&1; then
         ready=1
         break
      fi
      sleep 0.1
      attempt=$((attempt + 1))
   done
   if [ "$ready" -ne 1 ]; then
      echo "server did not become ready" >&2
      exit 1
   fi

   (cd "$SCRIPT_DIR/../conformance" && \
      BASE_URL=http://localhost:9657 npx vitest run \
         suites/contract/endpoints.test.ts -t CONTRACT-HEALTH-001)
fi
