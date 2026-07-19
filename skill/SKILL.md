---
name: paperclips-in-the-dark
description: Operate a local Paperclips in the Dark campaign sheet manager through its HTTP API. Use when an agent needs to discover or launch a compatible backend, inspect a campaign roster, update character or crew sheets, manage clocks or history, or coordinate several sheet changes as a batch.
---

# Paperclips in the Dark

Use the service as a sheet manager. Make game decisions only when the user supplies them; the API enforces structural constraints but is not a rules engine. Consult [api-reference/README.md](api-reference/README.md) for generated endpoint details and request schemas.

## Discover the server

Start with `GET http://localhost:9657/api/health`. Treat a successful response as the capability check. Read `implementation` to identify the live backend (`ada` or `zero`); do not infer the implementation from files or process names. Also retain the returned `version` and `dataDir` when reporting or diagnosing the service.

If the health request fails and the user wants a local server, provision the Ada backend from the repository root:

```sh
backend-ada/server/bin/pitd --port 9657 --data ./campaign-data --static ./frontend/dist
```

The process must run with the repository root as its working directory because game data and the default static path are resolved relative to it. Flags:

- `--port <number>` selects the HTTP port; default `9657`.
- `--data <directory>` selects persistent campaign data; default `./campaign-data`.
- `--static <directory>` selects frontend assets; default `./frontend/dist`.

Wait for `/api/health` to succeed before issuing campaign requests. Do not start another server when a healthy compatible instance is already listening.

## Resolve entities before writing

Never invent IDs — roster first. At the start of a session and before any mutation whose target is not already established by a fresh API response:

1. Call `GET /api/campaign/roster`.
2. Match the user's character or crew description against the returned summaries.
3. Ask the user to disambiguate multiple matches.
4. Use only the server-returned ID in subsequent paths or batch entries.
5. Refetch the full entity when its current fields or `revision` matter; send `If-Match` for concurrency-sensitive writes.

After a `STALE_REVISION`, refetch and reassess instead of retrying blindly. Supply a stable `Idempotency-Key` when retrying the same intended mutation.

## Apply common workflows

- Start a session: discover with `/api/health`, fetch `/api/campaign/roster`, resolve IDs, then fetch the relevant full character or crew DTOs.
- Change stress: `POST /api/characters/{id}/ops/stress.add` with `{"delta": number}`. Inspect `applied.effective` and `sideEffects`; do not assume the requested delta was fully applied.
- Add or remove harm: use `harm.add` with a description and intensity, or `harm.remove` with intensity and slot. Trust the returned full DTO and reported landing or side effects.
- Award XP: use `playbook-xp.add`, `attribute-xp.add`, or `crew` `xp.add` as explicitly requested. Do not conflate these tracks or infer when XP is due.
- Undo: call the entity's `/undo` endpoint. Undo restores the newest available snapshot; report `NO_HISTORY` without fabricating recovery.
- Batch related changes: `POST /api/campaign/batch` with `{ "ops": [{ "entity": "character", "id": "<roster ID>", "op": "stress.add", "args": { "delta": 1 } }] }`. Treat it as all-or-nothing and inspect each returned per-op outcome.

Every mutation returns an `OperationResult`. Check `ok`, `error`, `applied`, `sideEffects`, and the returned full entity rather than predicting the resulting state. Read numeric limits and available names from the API's game-settings data; never hardcode maxima.

## Keep rulebook context ephemeral

When needed rules context is absent from the game-settings API, ask whether the user has a local rulebook file. If they provide one:

1. Read only the relevant section.
2. Use that context ephemerally for the immediate decision or explanation.
3. Never save rules text to memory, campaign state, notes, logs, generated references, or any other file.
4. Never quote or reproduce rules text; paraphrase only the minimum needed.

If no rulebook is available, use the game-settings data and ask the user to state the ruling or procedure they want applied. Never retrieve or supply an unauthorized copy.

## Respect the IP boundary

Treat content served from the repository's game-settings JSON as usable authored data, including names, descriptions, hooks, gear, abilities, triggers, and numeric structural settings. Treat rulebook prose and procedural rules as outside the persistent product boundary. Do not encode dice procedures, position/effect procedures, engagement or downtime procedures, GM judgment, or other rulebook-derived text in skill files, API data, campaign records, or agent memory.
