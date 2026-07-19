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
child_pid=""
stop_child() {
  cleanup
  if [[ -n "${child_pid}" ]]; then
    kill "${child_pid}" 2>/dev/null || true
  fi
  exit 130
}
trap cleanup EXIT
trap stop_child INT TERM
PORT="${PITD_PORT:-9657}"
DATA_DIR="${PITD_DATA:-campaign-data}"
while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --data) DATA_DIR="$2"; shift 2 ;;
    *) echo "usage: $0 [--port PORT] [--data DIR]" >&2; exit 2 ;;
  esac
done
export PITD_PORT="$PORT"
export PITD_DATA="$DATA_DIR"
# optional: wipe data for clean conformance run when PITD_RESET=1
if [[ "${PITD_RESET:-}" == "1" ]]; then
  if [[ "$DATA_DIR" = /* ]]; then
    reset_target="$DATA_DIR"
  else
    reset_target="$ROOT/$DATA_DIR"
  fi
  rm -rf -- "$reset_target"
fi
set +e
zero run "$@" &
child_pid=$!
wait "${child_pid}"
status=$?
child_pid=""
set -e
cleanup
exit "${status}"
