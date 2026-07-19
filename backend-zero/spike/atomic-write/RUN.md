# Run `atomic-write`

```sh
export PATH="$HOME/.zero/bin:$PATH"
cd backend-zero/spike/atomic-write
zero run
# atomic write ok
```

Writes `.zero/out/atomic-target.json` via `std.fs.atomicWrite` (temp path + rename).
Temp file must not remain after success.
