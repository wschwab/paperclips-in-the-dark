#!/usr/bin/env bash
# std.http.listen re-execs argv0 "zero" via execve(2) WITHOUT PATH search
# (strace: execve("zero", ["zero","dump",...]) -> ENOENT unless ./zero exists).
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
exec zero run "$@"
