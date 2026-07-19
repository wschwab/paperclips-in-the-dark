#!/usr/bin/env python3
"""Rewrite set_text/set_buf on struct array fields to fillN + whole-field assign."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent / "src"


def inject_util_helpers() -> None:
    util = ROOT / "util.0"
    t = util.read_text()
    start = t.index("pub fn copy_to")
    end = t.index("pub fn text_view")
    sizes = [16, 24, 32, 40, 48, 64, 96, 256, 320]
    parts: list[str] = []
    parts.append(
        """pub fn copy_to(dst: MutSpan<u8>, src: Span<u8>) -> Maybe<Span<u8>> {
    if std.mem.len(src) > std.mem.len(dst) {
        return null
    }
    let n: usize = std.mem.copy(dst, src)
    return dst[0..n]
}

// Local-array MutSpan path only. Struct fields: use fillN + whole-field assign.
pub fn set_text(dst: MutSpan<u8>, src: Span<u8>) -> u32 {
    let n_maybe: Maybe<Span<u8>> = copy_to(dst, src)
    if !n_maybe.has {
        return 0
    }
    return std.mem.len(n_maybe.value) as u32
}

fn clamp_len(src_len: usize, cap: usize) -> usize {
    if src_len > cap {
        return cap
    }
    return src_len
}
"""
    )
    for n in sizes:
        parts.append(
            f"""type Fill{n} {{
    data: [{n}]u8,
    len: u32,
}}

pub fn fill{n}(src: Span<u8>) -> Fill{n} {{
    var d: [{n}]u8 = [0_u8; {n}]
    let nlen: usize = clamp_len(std.mem.len(src), {n})
    var i: usize = 0
    while i < nlen {{
        d[i] = src[i]
        i = i + 1
    }}
    return Fill{n} {{ data: d, len: nlen as u32 }}
}}
"""
        )
    util.write_text(t[:start] + "\n".join(parts) + "\n" + t[end:])
    print("util helpers injected")


FIELD_SIZE = {
    "applied_op": 32,
    "code": 32,
    "message": 96,
    "side0": 96,
    "side1": 96,
    "landed": 16,
    "id": 40,
    "stem": 32,
    "playbook": 24,
    "name": 48,
    "alias_text": 48,
    "look": 96,
    "notes": 96,
    "crew_id": 40,
    "bg_name": 32,
    "bg_desc": 64,
    "heritage_name": 32,
    "heritage_desc": 64,
    "vice_name": 32,
    "vice_desc": 64,
    "notebook": 256,
    "text": 64,
    "entry": 48,
    "desc": 320,
    "crew_type": 32,
    "lair": 48,
    "reputation": 48,
    "hunting": 48,
}


def field_basename(arr_expr: str) -> str:
    s = re.sub(r"\[.*?\]", "", arr_expr.strip())
    if "." in s:
        return s.split(".")[-1]
    return s


def infer_size(arr_expr: str) -> int:
    base = field_basename(arr_expr)
    if ".actions" in arr_expr and base == "name":
        return 16
    if ".attrs" in arr_expr and base == "name":
        return 16
    if ".abilities" in arr_expr and base == "name":
        return 32
    if ".upgrades" in arr_expr and base == "name":
        return 32
    if ".friends" in arr_expr and base == "entry":
        return 48
    if base in FIELD_SIZE:
        return FIELD_SIZE[base]
    raise KeyError(f"no size for {arr_expr!r} base={base!r}")


RE_IF = re.compile(
    r"^(\s*)if (.+?) \{ ([A-Za-z0-9_.\[\]]+)_len = set_(?:text|buf)\(([A-Za-z0-9_.\[\]]+), (.+)\) \}\s*$"
)
RE_ASSIGN = re.compile(
    r"^(\s*)([A-Za-z0-9_.\[\]]+)_len = set_(?:text|buf)\(([A-Za-z0-9_.\[\]]+), (.+)\)\s*$"
)
RE_LET = re.compile(
    r"^(\s*)let (\w+): u32 = set_(?:text|buf)\(([A-Za-z0-9_.\[\]]+), (.+)\)\s*$"
)
RE_SETBUF_FN = re.compile(r"^\s*fn set_buf\(")


def rewrite_source(text: str) -> str:
    out: list[str] = []
    counter = 0
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        raw = lines[i]
        # Drop set_buf helper entirely (2-3 line fn)
        if RE_SETBUF_FN.match(raw):
            i += 1
            while i < len(lines) and lines[i].strip() != "}":
                i += 1
            if i < len(lines) and lines[i].strip() == "}":
                i += 1
            # skip following blank
            if i < len(lines) and lines[i].strip() == "":
                i += 1
            continue

        m_if = RE_IF.match(raw)
        m_as = RE_ASSIGN.match(raw)
        m_let = RE_LET.match(raw)

        if m_if:
            ind, cond, lhs_prefix, arr, src = m_if.groups()
            size = infer_size(arr)
            counter += 1
            tmp = f"_fill{counter}"
            out.append(f"{ind}if {cond} {{")
            out.append(f"{ind}    let {tmp}: Fill{size} = fill{size}({src})")
            out.append(f"{ind}    {arr} = {tmp}.data")
            out.append(f"{ind}    {lhs_prefix}_len = {tmp}.len")
            out.append(f"{ind}}}")
            i += 1
            continue

        if m_as:
            ind, lhs_prefix, arr, src = m_as.groups()
            size = infer_size(arr)
            counter += 1
            tmp = f"_fill{counter}"
            out.append(f"{ind}let {tmp}: Fill{size} = fill{size}({src})")
            out.append(f"{ind}{arr} = {tmp}.data")
            out.append(f"{ind}{lhs_prefix}_len = {tmp}.len")
            i += 1
            continue

        if m_let:
            # let n: u32 = set_buf(slot.text, text) ; typically followed by slot.len = n
            ind, var, arr, src = m_let.groups()
            size = infer_size(arr)
            counter += 1
            tmp = f"_fill{counter}"
            out.append(f"{ind}let {tmp}: Fill{size} = fill{size}({src})")
            out.append(f"{ind}{arr} = {tmp}.data")
            out.append(f"{ind}let {var}: u32 = {tmp}.len")
            i += 1
            continue

        out.append(raw)
        i += 1

    return "\n".join(out) + "\n"


def main() -> None:
    inject_util_helpers()
    for name in ("character.0", "character_ops.0", "crew.0"):
        path = ROOT / name
        before = path.read_text()
        after = rewrite_source(before)
        # residual set_text/set_buf on non-local?
        residual = []
        for ln, line in enumerate(after.splitlines(), 1):
            if "set_text(" in line or "set_buf(" in line:
                residual.append(f"{ln}:{line.strip()}")
        path.write_text(after)
        print(f"{name}: residual set_* = {len(residual)}")
        for r in residual[:20]:
            print(" ", r)


if __name__ == "__main__":
    main()
