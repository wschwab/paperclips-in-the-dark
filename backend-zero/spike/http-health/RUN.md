# Run `http-health`

```sh
export PATH="$HOME/.zero/bin:$PATH"
cd backend-zero/spike/http-health
./run.sh
# prints: listening on http://127.0.0.1:9658

# other terminal:
curl -sS http://127.0.0.1:9658/api/health
# {"status":"ok"}
```

Port is fixed: `std.http.listen(world, 9658_u16)`.
Listener binds **loopback IPv4 only**.

## Caveat

`std.http.listen` re-executes the bare binary name `zero` via `execve` without
PATH search. `./run.sh` creates a cwd `./zero` symlink for the duration of the
run. Plain `zero run` fails with:

```text
zero listen: No such file or directory
BLD002: std.http.listen could not prepare a handler graph
```
