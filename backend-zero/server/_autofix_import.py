#!/usr/bin/env python3
from __future__ import annotations

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def parse(err: str):
    m = re.search(
        r"\./src/([^:]+):(\d+):\d+ (\w+): ([^\n]+)\n\s+expected: ([^\n]+)\n\s+actual: ([^\n]+)",
        err,
    )
    if not m:
        return None
    return {
        "path": m.group(1),
        "line": int(m.group(2)),
        "code": m.group(3),
        "message": m.group(4),
        "expected": m.group(5),
        "actual": m.group(6),
    }


def main() -> int:
    for rnd in range(120):
        (ROOT / "zero.graph").unlink(missing_ok=True)
        r = subprocess.run(
            ["zero", "import", "."],
            cwd=ROOT,
            capture_output=True,
            text=True,
        )
        err = r.stderr or r.stdout or ""
        if r.returncode == 0:
            print(f"IMPORT_OK round={rnd}")
            Path("/tmp/z1-import.err").write_text(err or "ok")
            return 0
        d = parse(err)
        if not d:
            print("UNPARSED")
            print(err[:2500])
            Path("/tmp/z1-import.err").write_text(err)
            return 1
        path = ROOT / "src" / d["path"]
        lines = path.read_text().splitlines()
        idx = d["line"] - 1
        line = lines[idx]
        print(
            f"r{rnd} {d['code']} {d['path']}:{d['line']} "
            f"expected={d['expected']!r} actual={d['actual']!r}"
        )
        print(" ", line.strip()[:160])
        fixed = None
        expected = d["expected"]
        if d["code"] == "TYP003" and expected.startswith("Maybe"):
            inner = expected[len("Maybe") :].strip()
            if inner.startswith("<") and inner.endswith(">"):
                inner = inner[1:-1].strip()
            news = re.sub(r"return (-?\d+)\b", rf"return \1_{inner}", line)
            if news != line:
                lines[idx] = news
                fixed = news
        if not fixed:
            Path("/tmp/z1-import.err").write_text(err)
            print("STOP no auto-fix")
            return 2
        path.write_text("\n".join(line for line in lines) + "\n")
        print("  ->", fixed.strip()[:160])
    print("too many rounds")
    return 3


if __name__ == "__main__":
    raise SystemExit(main())
