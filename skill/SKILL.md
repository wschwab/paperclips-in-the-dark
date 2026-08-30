---
name: paperclips-in-the-dark
description: Operate a local Paperclips in the Dark campaign sheet manager through its HTTP API. Use when an agent needs to discover or launch a compatible backend, inspect a campaign roster, repair or import sheets, update character or crew sheets, manage clocks or history, resolve lifecycle state (trauma, out-of-action, retirement, undo), or coordinate several sheet changes as a batch.
---

# Paperclips in the Dark

Use the service as a sheet manager. Make game decisions only when the user supplies them; the API enforces structural constraints but is not a rules engine. Consult [api-reference/README.md](api-reference/README.md) for generated endpoint details and request schemas — it is the authoritative agent reference, generated from the frozen contract, so trust it over any remembered details. Before driving lifecycle-sensitive or normalization workflows, read its generated sections: completeness predicates, capability endpoints, recovery instructions and typed error codes (one row per union code), and lifecycle attention codes.

## Capability manifest

Every contract `operationId` appears exactly once in the generated [api-reference/capability-manifest.json](api-reference/capability-manifest.json), with one of three dispositions:

- `agent` — documented for agent use (per-operation reference entry in the README); no reachable human control required. 86 of 110 operations.
- `human` — destructive, lifecycle, or designated sheet-management operations that require a reachable human UI control (24 of 110): entity create/delete/import/repair, batch, retire, end-score, end-downtime, undo, trauma resolution/correction, and dossier/notebook/note editing. When a human-required control is present, never bypass it; drive the workflow through the user's confirmation and the guardrails (preview tokens, `If-Match`, `confirm: true`).
- `exempt` — none currently. Exemptions require explicit contract-author approval with a reason in the manifest; never assume one.

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

Roster summaries carry derived state you must read, never guess:

- `isReadable` — the stored document parses and validates as canonical.
- `isRepairable` — a schema-valid canonical result can be produced from the stored bytes.
- `isComplete` — all completeness predicates hold; meaningful only when `isReadable`, otherwise false.
- `deleteToken` — opaque `sha256:<hex>` content token for degraded rows; empty string for readable rows. It is the degraded row's `If-Match` value, so the row stays reachable and deletable even when unreadable.
- `canUndo` and `historyCount` — derived at response time (`canUndo = historyCount > 0`), also on operation results (never on batch items or pure failures).

### Roster-first degraded recovery

A degraded row (`isReadable: false`) is not a dead end — it stays on the roster specifically so it can be recovered. Never fabricate a revision or token; the only sanctioned actions come from the row itself:

- **Repair** when `isRepairable`: `repair-preview` → `repair`, each with the row's `deleteToken` as `If-Match` (see Normalization preview/apply).
- **Delete** when `isRepairable: false` or the stored bytes are unparseable: `delete` accepts the `deleteToken` — deletion is the designed path for unreadable rows. Requires `confirm: true`.
- **Import** can replace the content of a degraded row using the same preview/apply flow.
- **Undo is not available** on a degraded entity (422 `INVALID_ENTITY` — repair or delete first); reads of the raw DTO still work byte-identically.

After a `STALE_REVISION`, refetch and reassess instead of retrying blindly.

## Normalization preview/apply

Both **import** and **repair** are strict preview-then-confirm flows. Preview never writes; the apply is confirm-guarded and token-bound. Never skip the preview, never guess values for pointers the preview flags as needing input, and never reuse a token after a `STALE_REVISION`.

**Repair** (`/characters/{id}/repair-preview`, `/crews/{id}/repair-preview`):

1. `POST repair-preview` with optional caller-supplied values for needs-input pointers, keyed by JSON pointer into the stored document (e.g. `{"/dossier/name": "..."}`). Keys that do not resolve to a needs-input pointer are ignored with a warning.
2. Responses: `200` PreviewResult with no token (entity already canonical — nothing to confirm); `409 NORMALIZATION_REQUIRED` with warnings, the previewed result, and the preview `token` (repairable); pointers still awaiting caller values are listed in the preview; `422 INVALID_ENTITY` means the stored bytes are unparseable — repair is impossible, deletion only.
3. Apply: `POST /characters/{id}/repair` with `If-Match` (entity revision, or the degraded row's `deleteToken`), the preview token from the preview step, and `confirm: true` (missing → `CONFIRM_REQUIRED`). It atomically writes the previewed normalized result — one snapshot, revision +1. Changed stored bytes since the preview → `STALE_REVISION` (restart the flow); no valid preview token → `NORMALIZATION_REQUIRED` (preview first).

**Import** (`/characters/{id}/import?preview=1`, `/crews/{id}/import?preview=1`):

1. Preview with `?preview=1` never writes: canonical document → `200` with the preview and preview token; normalization needed → `409 NORMALIZATION_REQUIRED` with warnings, the previewed document, and the preview token; needs-input pointers → `409` listing the exact pointers awaiting caller values.
2. Apply (no `preview` param) requires `If-Match`, the preview token, and `confirm: true`; it atomically writes the previewed result, clears history, and takes exactly one baseline snapshot.

Error distinction to report correctly: `INVALID_ENTRY` (400) means the submitted content cannot be normalized with the supplied values; `INVALID_ENTITY` (422) means the *stored* document is non-canonical or unparseable (repair or delete). Completeness is derived, never stored: a canonical empty at a locked pointer makes an entity readable and incomplete; an absent property is a canonicality question (repair/degraded), not a completeness question.

## Lifecycle attention

Lifecycle state demands explicit explanation and confirmation, never silent automation:

- **Pending trauma** — `stress.add` landing at maximum from below sets `traumaPending` and emits the typed attention sideEffect `stress full — trauma pending`. Never auto-trauma: prompt the trauma choice, and keep gameplay mutations and `end-score` blocked (`TRAUMA_REQUIRED`) until resolved via `trauma.add`.
- **Out of action** — stress operations are rejected (`OUT_OF_ACTION`) until `end-score`, which always clears stress, resets the out-of-action flags, and is the only sanctioned release. Explain this when it happens.
- **Retirement** is an explicit, confirm-guarded lifecycle operation (`{ "confirm": true }` + `If-Match`; missing confirm → `CONFIRM_REQUIRED`), legal in any state below maximum trauma. Retired characters stay readable and deletable; gameplay mutations are rejected (`RETIRED`) except the allow-list — dossier/notes/notebook edits, `trauma.remove`, undo, delete, import, and reads. Removing trauma does not reverse a completed retirement; **undo is the recovery path** (it restores the complete prior state, one snapshot). Offer it, don't silently un-retire.
- **Undo** restores the newest snapshot and deletes it (consecutive undos walk backwards); the undo itself is not undoable. `NO_HISTORY` means there is nothing to restore — report it without fabricating recovery. `canUndo`/`historyCount` on roster summaries and operation results tell you whether undo is possible before you offer it.

## Capabilities before mutations

Fetch the server-computed capability projection before a mutation when limits matter, and trust the mutation's result over the projection:

- `GET /api/capabilities` — service-level payload/history/batch limits.
- `GET /api/characters/{id}/capabilities` — effective action caps with Mastery derivation inputs, harm capacities per level with remaining slots, load limits per commitment option, remaining ability takes.
- `GET /api/crews/{id}/capabilities` — upgrade catalog total/marked/remaining, ability catalog max/taken/remaining takes, effective turf, rep develop threshold.

Projections are advisory for presentation and are never persisted in the entity DTO. Mutations remain authoritative: if state changes between projection and mutation, the server returns the typed failure (`RATING_MAXED`, `UPGRADE_MAXED`, `ABILITY_MAXED`, slot-full spillover, `OVER_BULK`, …) with recovery instructions. Always read `applied.effective` and the returned full entity — never predict the resulting state silently.

## Numeric result families

Operations report `applied.requested` and `applied.effective`; the family tells you what they mean:

- **Signed delta** (e.g. `stress.add`, `heat.add`, XP tracks, `turf.add`, coin/stash, clock progress): both are signed changes; negative deltas reduce the track and clamp at zero (`effective` never negative). When `requested ≠ effective`, report the clamp.
- **Absolute setter** (e.g. `hold.set`, `faction.set-status`, `action.set-rating`, partial field updates): `requested` is the requested target, `effective` the stored target (clamped to the settings-derived range).
- **Quantity / fund** (`fund.gain`, `fund.spend`, `fund.liquidate`): satchel first with overflow to stash; coins that fit nowhere are reported in `sideEffects` and `applied.effective` — never silently dropped. Insufficient → `INSUFFICIENT_FUNDS` with `{available, needed}`.
- **Clock-progress**: `effective` includes accepted progress and rollover; `visibleApplied`/`overflowAdded` report the split when nonzero.
- **Clear/reset** (e.g. `stress.clear`, `clock.reset`): no applied numeric fields.

Read numeric limits and available names from the API's game-settings data and capability projections; never hardcode maxima. E.g. `stress.add` lands at max from below → `traumaPending` (Lifecycle attention); `armor.set` used=true without availability → `ARMOR_NOT_AVAILABLE`.

## Apply common workflows

- Start a session: discover with `/api/health`, fetch `/api/campaign/roster`, resolve IDs, then fetch the relevant full character or crew DTOs.
- Change stress: `POST /api/characters/{id}/ops/stress.add` with `{"delta": number}`. Inspect `applied.effective`, `sideEffects`, and the trauma-pending token; do not assume the requested delta was fully applied or that a trauma is chosen automatically.
- Add or remove harm: use `harm.add` with a description and intensity, or `harm.remove` with intensity and slot. Trust the returned full DTO and reported landing or side effects. Healing a harm (requires the healing clock full, else `CANNOT_HEAL`) picks a specific currently-active harm and resets the healing clock.
- Award XP: use `playbook-xp.add`, `attribute-xp.add`, or `crew` `xp.add` as explicitly requested. Do not conflate these tracks or infer when XP is due; `attribute.levelup` and `action.set-rating` share the server-computed effective cap (published per action by the capabilities endpoint).
- Undo: call the entity's `/undo` endpoint with `If-Match`. Undo restores the newest available snapshot; report `NO_HISTORY` without fabricating recovery. Degraded entities reject undo (repair or delete first).
- Batch related changes: `POST /api/campaign/batch` with `{ "ops": [{ "entity": "character", "id": "<roster ID>", "op": "stress.add", "args": { "delta": 1 } }] }` (max 50 ops). Treat it as all-or-nothing — one snapshot, one history entry — and inspect each returned per-op outcome; per-op failures and top-level failures share the same typed error union.

Every mutation returns an `OperationResult`. Check `ok`, `error`, `applied`, `sideEffects`, typed `error.code` + `error.recovery`, and the returned full entity rather than predicting the resulting state. Add or remove harm, gear, ability, claim, cohort, contact, faction, and clock operations all work through the same uniform result and the same error-union recovery table.

## Idempotency is best-effort

Supplying a stable `Idempotency-Key` when retrying the same intended mutation is good hygiene, but it is an internal capacity, not a durable-replay API promise (governing decision W9) — never document or rely on exactly-once replay. On any retry, re-read the fresh state and reassess: typed errors (`STALE_REVISION`, `NORMALIZATION_REQUIRED`, …) still apply and still require their documented recovery action.

## Keep rulebook context ephemeral

When needed rules context is absent from the game-settings API, ask whether the user has a local rulebook file. If they provide one:

1. Read only the relevant section.
2. Use that context ephemerally for the immediate decision or explanation.
3. Never save rules text to memory, campaign state, notes, logs, generated references, or any other file.
4. Never quote or reproduce rules text; paraphrase only the minimum needed.

If no rulebook is available, use the game-settings data and ask the user to state the ruling or procedure they want applied. Never retrieve or supply an unauthorized copy.

## Respect the IP boundary

Treat content served from the repository's game-settings JSON as usable authored data, including names, descriptions, hooks, gear, abilities, triggers, and numeric structural settings. Treat rulebook prose and procedural rules as outside the persistent product boundary. Do not encode dice procedures, position/effect procedures, engagement or downtime procedures, GM judgment, or other rulebook-derived text in skill files, API data, campaign records, or agent memory.
