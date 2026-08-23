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

echo "==> testing executable-relative launch defaults"
"$SCRIPT_DIR/test-launch-paths.sh"

echo "==> testing SPA deep-link routes"
"$SCRIPT_DIR/test-spa-routes.sh"

echo "==> proving core"
(cd "$SCRIPT_DIR/core" && XDG_RUNTIME_DIR=/tmp alr --non-interactive exec -- \
   gnatprove -P paperclips_core.gpr --level=2 --checks-as-errors=on)

if [ "${RUN_CONFORMANCE:-0}" = "1" ]; then
   # AUDIT-0 BUG-014: the SPA smoke needs a real frontend build.  Build it
   # (source maps off by default) so a clean checkout has no ignored-dist gap.
   echo "==> building frontend (SPA smoke prerequisite)"
   (cd "$SCRIPT_DIR/../frontend" && npm ci && npm run build)

   # AUDIT-0 BUG-014: RUN_CONFORMANCE=1 must run the FULL conformance suite
   # against fresh state, not a single smoke test.
   (cd "$SCRIPT_DIR/../conformance" && npm run test:ada -- --run)
fi
