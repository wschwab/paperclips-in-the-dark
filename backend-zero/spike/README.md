# Z0 spike artifacts

| Dir | Capability | Command | Expected stdout |
|---|---|---|---|
| `hello/` | compile + run | `zero run` | `hello from zero` |
| `json/` | parse + emit JSON | `zero run` | `json parse+emit ok` then a JSON object |
| `atomic-write/` | FS atomic write (tmp+rename) | `zero run` | `atomic write ok` |
| `http-health/` | HTTP GET `/api/health` | `./run.sh` then curl | `{"status":"ok"}` |

Requires `export PATH="$HOME/.zero/bin:$PATH"` and Zero **0.3.4**.
