# Z2 wave 2 resumption note

## Accepted local changes

- `backend-zero/server/src/z1_packed.0`: roster builder is 14 KiB; entity IDs
  use a persisted monotonic per-kind sequence with largest-indexed-ID fallback.
- `backend-zero/server/src/util.0`: per-kind `next-id.txt` path helper.
- `backend-zero/server/src/config.0`: runtime honors `PITD_DATA` for relative
  custom data directories.
- `conformance/suites/persistence/repeatability.test.ts`: roster growth and
  deletion/no-ID-reuse regressions.

## Verified results

- Ada focused regression: 2/2 green.
- Zero importer: green; JSON checker: `ok: true`, zero diagnostics.
- Zero focused regression on fresh relative data: 2/2 green.
- Fresh Zero full run before the ID regression was added: 132/132 green.
- Second run on that process: roster tests stayed green; two upgrade tests
  exposed ID reuse. The new ID regression reproduced this and Luna fixed it.
- With both regressions present, accumulated state eventually makes the roster
  return 500 once its serialized body approaches roughly 6 KiB. Raising the
  local roster builder from 14 KiB to 30 KiB did not change the boundary.

## Remaining boundary and next command

Zero's native `std.http.listen` response storage is the remaining observable
parity boundary. The next separately authorized wave should implement the spec
§10.3 neutral HTTP-to-stdio shim path instead of increasing native handler-local
arrays.

Start by reviewing the existing neutral shim and defining the smallest Zero
stdio protocol adapter:

```bash
sed -n '1,280p' conformance/src/stdio-shim.ts
sed -n '1,260p' conformance/src/stdio-shim-cli.ts
sed -n '1,220p' conformance/src/mock-stdio.mjs
```

Expected result: the same HTTP conformance tests run through the neutral shim
without the native response-size ceiling. Keep native HTTP available and report
the shim honestly as the transport escape hatch.

Generated verification state is preserved outside the repository under:

- `/tmp/pitd-z2-wave2-state.4YSzIl`
- `/tmp/pitd-z2-luna-state.lBtfmF`
- `/tmp/pitd-z2-final-state.V3SThg`
- `/tmp/pitd-z2-checkpoint-state.KwJ6AI`
