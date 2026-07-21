#!/usr/bin/env bash
# Launch the Zero JSONL child. HTTP belongs to conformance/bin/http-stdio-shim.mjs.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
export PATH="${HOME}/.zero/bin:${PATH}"
if [[ ! -x "${HOME}/.zero/bin/zero" ]]; then
  echo "missing ~/.zero/bin/zero — install: curl -fsSL https://zerolang.ai/install.sh | bash" >&2
  exit 1
fi
exec zero run
