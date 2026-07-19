#!/usr/bin/env bash
# std.http.listen re-execs bare argv0 "zero" without PATH search.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
export PATH="${HOME}/.zero/bin:${PATH}"
if [[ ! -x "${HOME}/.zero/bin/zero" ]]; then
  echo "missing ~/.zero/bin/zero — install: curl -fsSL https://zerolang.ai/install.sh | bash" >&2
  exit 1
fi
ln -sfn "${HOME}/.zero/bin/zero" "${ROOT}/zero"
cleanup() { rm -f "${ROOT}/zero"; }
trap cleanup EXIT INT TERM
# optional: wipe data for clean conformance run when PITD_RESET=1
if [[ "${PITD_RESET:-}" == "1" ]]; then
  rm -rf "${ROOT}/campaign-data"
fi
exec zero run "$@"
