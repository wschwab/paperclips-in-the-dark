# Paperclips in the Dark — Technical Specification

**Status:** Draft v1
**Date:** 2026-07-19
**Predecessor:** [blades-in-the-sheets](https://github.com/arazni/blades-in-the-sheets) (arazni) — used as reference implementation and data source, pending license confirmation
**Companion docs:** `docs/agent-api-spec.md` (operation catalog, adopted with corrections), `agent-docs/REVIEW.md` (review findings, all "What I'd lock" items resolved here)

---

## 1. Vision

Paperclips in the Dark is a **campaign sheet manager for Blades in the Dark** designed agent-first: the primary client is an AI agent assisting a GM or player at the table, with a human web UI as a styled thin client of the same API. It is a **sheet manager, not a rules engine** — it enforces structural constraints (bounded stress, harm slots, XP tracks) but never dice mechanics, position/effect, or GM judgment.

It is simultaneously a **language experiment**, with two parallel backend implementations built from one language-neutral contract:

- **Track A — Ada + SPARK.** Thesis: agent-written code fails by silent invariant violation; SPARK turns domain invariants into compiler-checked contracts, so a toolchain with thin LLM training data but loud, provable rejection may out-produce a familiar one.
- **Track Z — Zero (zerolang.ai).** Thesis: a language designed for agents (graph-first source, JSON diagnostics, typed repair metadata) helps agents ship faster. Pre-1.0; treated as an experiment with an explicit escape hatch (§10.3).

Both tracks must pass the **same black-box conformance suite** against the same OpenAPI contract. The suite, not either implementation, is the source of truth.

### 1.1 Non-goals

- No dice rolling, position/effect, engagement, downtime procedure, or any encoding of GM judgment.
- No reproduction of rulebook text. Game-mechanical structure comes from the game-settings JSON only; anything else the agent skill reads ephemerally from a user-supplied rulebook (see §12).
- No multi-tenant deployment, auth, or cloud hosting in v1. Target: **single local process, single table, trusted localhost user.**
- No migration of blades-in-the-sheets localStorage data.

---

## 2. What we salvage from blades-in-the-sheets

| Asset | How |
|---|---|
| Domain semantics (`Models/`, ~2.5k LOC C#) | Ported, not re-derived. §5 catalogs the load-bearing behaviors. The C# source is the reference for any ambiguity. |
| `Persistence.Test` suite | Semantics mined into the conformance suite (§8). Port test *cases*, not test code. |
| Game data JSON (`UI/wwwroot/data/*.json`) | Copied verbatim (games.json, blades-in-the-dark.json, crews, scum-and-villainy, translations, schema). Attribute arazni; SRD content is CC-BY per the Blades license. **Assumption: reuse is fine; revisit if arazni's licensing says otherwise.** |
| `docs/agent-api-spec.md` | Adopted as the operations catalog, with the corrections in §7.2. |

Everything else (Blazor UI, Blazored.LocalStorage, PWA/service workers, Newtonsoft pipeline, migrations V2–4) is left behind.

---

## 3. Architecture

```
                    ┌──────────────────────────────┐
                    │  contract/                   │
                    │  openapi.yaml  (truth)       │
                    │  schemas/*.json (DTOs)       │
                    └──────┬───────────────┬───────┘
                           │ must pass     │ must pass
              ┌────────────▼─────┐   ┌─────▼────────────┐
              │ backend-ada/     │   │ backend-zero/    │
              │ Ada + SPARK      │   │ Zero             │
              │ HTTP via AWS     │   │ HTTP (§10)       │
              └────────────▲─────┘   └─────▲────────────┘
                           │               │
                    ┌──────┴───────────────┴───────┐
                    │  conformance/  (TS + Effect) │
                    │  black-box HTTP suite,       │
                    │  runs against BASE_URL       │
                    └──────────────────────────────┘
                           ▲
              ┌────────────┴─────┐
              │ frontend/        │  static, TS + Effect,
              │ Blades aesthetic │  talks only to /api/*
              └──────────────────┘
```

Key properties:

- **Single write path.** The operation API is the only way anything — agent or UI — mutates state. No whole-object PUT for the UI. (Resolves REVIEW disagreement #2.)
- **DTO JSON is the only format** — on the wire *and* on disk (REVIEW option A). Agents may read data files directly; what they see is the documented format. Files are pretty-printed.
- **Contract-first.** `contract/openapi.yaml` + JSON Schemas are written before either backend. Backends are conforming servers; the agent skill's API reference is generated from the contract, never hand-maintained.
- The chosen backend serves the built frontend as static files plus `/api/*` from one port (default `9657`). No CORS.

### 3.1 New repository layout

```
paperclips-in-the-dark/
├── PAPERCLIPS.md            (this spec, moved to repo root)
├── contract/
│   ├── openapi.yaml
│   └── schemas/             (character.json, crew.json, operation-result.json, …)
├── conformance/             (TS + Effect + vitest; black-box HTTP tests)
│   ├── fixtures/            (seed characters/crews, golden files)
│   └── suites/
├── data/
│   └── games/               (salvaged game-settings JSON, verbatim)
├── backend-ada/
├── backend-zero/
├── frontend/
├── skill/                   (agent skill: SKILL.md + generated api-reference)
└── tasks/                   (orchestration task graph, §13)
```

---

## 4. Persistence

JSON files on disk, campaign-scoped. Layout (fixes REVIEW #3 — no file/dir collision, millisecond+entropy timestamps):

```
{DataDir}/                         default ./campaign-data (gitignored)
├── campaign.json                  (name, gameStem, createdAt, formatVersion)
├── characters/
│   └── {id}/
│       ├── current.json
│       └── history/{yyyyMMddHHmmssfff}-{shortid}.json
└── crews/
    └── {id}/
        ├── current.json
        └── history/…
```

Rules (all conformance-tested):

1. **Atomic writes**: write `*.tmp` in the same directory, fsync, rename.
2. **Concurrency**: per-entity mutex in-process (single process is an invariant of v1). Every entity DTO carries a monotonically increasing integer `revision`. Mutating requests MAY send `If-Match: <revision>`; a mismatch returns `409 CONFLICT` with error code `STALE_REVISION` and the current revision. (Resolves REVIEW #8.)
3. **History**: snapshot of `current.json` taken *before* each mutating operation that declares itself snapshot-worthy in the contract (`x-snapshot: true`). Micro-ops (armor tick, loadout toggle) are `x-snapshot: false` to avoid history spam; undo restores the newest snapshot and deletes it. Retention: `MaxHistorySnapshots = 50` per entity. Import clears history and takes one baseline snapshot.
4. **IDs**: UUIDv4, generated server-side only. Path components (`{id}`, game stems, friend names) are validated against `[A-Za-z0-9-]` / URL-encoded; no path traversal.
5. **formatVersion**: integer, starts at 1, with a migration pipeline that exists (and is tested) from day one even while empty. It versions the persistence format, not the game edition. (Resolves REVIEW #6.)

---

## 5. Domain model

Port of the C# `Models/` layer. Entities: **Character** (Dossier — heritage/background/vice; Talent — actions grouped by attribute; Monitor — stress/trauma/harm; Playbook — abilities + XP; Gear — loadout/commitment; Rolodex — friends/rivals; Fund — stash/satchel; Session; Armor), **Crew** (upgrades, cohorts, special abilities, claims, rep/tier/heat/wanted), **Clocks** (project, rollover), **GameSetting** (all numeric maxima and lists come from here — never hardcode "stress 9, trauma 4"; Scum & Villainy differs).

### 5.1 Load-bearing semantics (the port MUST preserve these; each gets conformance tests)

These are the behaviors REVIEW found even the first spec got wrong. The C# source is authoritative; verify each against it during contract authoring, not from memory:

1. **BoundedInteger** clamps rather than errors; operations report the clamped delta in the result (`requested: 3, applied: 2`).
2. **Harm spillover**: `AddHarm(intensity)` rolls *upward* when slots are full (lesser→moderate→severe→fatal). A "severe" request with severe full can land in fatal. The API reports where it landed as a `sideEffect`; it does not fail. Removing harm never cascades.
3. **Stress overflow does not auto-trauma.** Full stress yields a `sideEffect: "stress full — consider trauma"` advisory only. Marking trauma is a separate explicit op.
4. **Armor is loadout-derived.** Standard/heavy/special armor availability derives from committed gear; setting `specialUsed` without special armor in loadout is a typed error (`ARMOR_NOT_AVAILABLE`), precondition queryable via GET.
5. **XP tracks**: attribute track fill + level-up clears that track; playbook XP spend (take ability) is a *distinct, asymmetric* flow — document exactly what clears when, matching the C# `ExperienceTracker`/`Playbook` behavior, not intuition.
6. **Upgrades**: unmarking removes one box, not the whole upgrade (fix the C# `UnmarkUpgrade` semantics mismatch deliberately — spec the box-wise behavior, note the divergence from reference).
7. **Rolodex** supports the full transition set: upgrade/downgrade both friends and rivals (REVIEW found the first API surface incomplete).
8. **Fund** partial gains (satchel/stash caps) surface remainders as `sideEffects`, never silently drop coin.
9. **Retired / deadish**: roster summaries expose both `isRetired` and `isDeadish`. Mutating ops on retired characters return `RETIRED` except trauma-list edits; reads always work.
10. **Commitment lock** (`IsCommitmentLocked`) has explicit lock/unlock ops.
11. **Cross-links**: `crewId` on a character is validated to reference an existing crew (or empty string — no nulls anywhere in DTOs); deleting a crew unlinks members; roster `memberCount` = scan of characters by crewId.

### 5.2 SPARK mapping (Track A)

The domain core is a SPARK-provable library, `paperclips-core`, with no IO:

- `BoundedInteger` → discriminated record with `Value in 0 .. Max` predicate; `Add`/`Subtract` have postconditions expressing clamp behavior.
- Harm monitor → record with slot-count predicates; `Add_Harm` postcondition proves the spillover ladder (result intensity ≥ requested, or fatal-full error).
- Every mutating operation: `Pre` for structural preconditions, `Post` relating old/new state, `SPARK_Mode => On`. Target proof level: **absence of runtime errors (AoRTE, silver) for the whole core; gold (functional contracts) for BoundedInteger, Monitor, Fund, ExperienceTracker.**
- HTTP layer, JSON, and filesystem are outside the SPARK boundary (`SPARK_Mode => Off`), thin, and call only the proven core.

---

## 6. Serialization / DTO format

One format. Highlights (full schemas in `contract/schemas/`):

- camelCase keys; dictionaries keyed by name (`abilitiesByName`, `availableGearByName`); type discriminators as `"kind"`; **no nulls** — empty string / empty array / explicit booleans; `revision` and `formatVersion` on every entity; ISO-8601 UTC timestamps.
- `GET /api/characters/{id}` and export return byte-identical documents to `current.json` on disk (conformance-tested round-trip identity for every field). There is no separate export endpoint (REVIEW #17): export = GET with `?download=1` adding a content-disposition header.

---

## 7. API

### 7.1 Conventions

- Base: `/api`. `GET /api/health` → `{status, implementation: "ada"|"zero", version, dataDir}` — also the agent-skill discovery mechanism.
- **All mutations are POST** with JSON bodies (no DELETE-with-body; REVIEW #11). Deletion of entities is `POST /api/characters/{id}/delete` guarded by `confirm: true`.
- **Uniform response shape** (REVIEW #12): every operation returns `OperationResult`:

```json
{
  "ok": true,
  "character": { …full DTO… },
  "applied": { "op": "stress.add", "requested": 3, "effective": 2 },
  "sideEffects": ["stress full — consider trauma"],
  "error": null            // or { "code": "ARMOR_NOT_AVAILABLE", "message": "…" }
}
```

  Always the **full entity DTO**, never slices. Agents hate polymorphic shapes; entities are small.
- Idempotency: mutations accept optional `Idempotency-Key` header; the server keeps a small LRU of key→result for retry-safe agent tooling.
- Errors: typed codes (`STALE_REVISION`, `NOT_FOUND`, `RETIRED`, `VALIDATION`, `ARMOR_NOT_AVAILABLE`, `SLOT_FULL_FATAL`, `CONFIRM_REQUIRED`, …), enumerated in the contract.
- Request logging to stdout (structured, one JSON line per request) for agent debugging.
- Import endpoints: schema-validated, 1 MiB body cap.

### 7.2 Operations catalog

Adopted from `docs/agent-api-spec.md` §8–9 **with these corrections** (from REVIEW): harm ops document spillover (§5.1.2) not slot-full failure; unmark-upgrade is box-wise; rolodex gets the full transition set; playbook-XP/take-ability flow documented asymmetrically per the model; commitment lock ops added; fund partial-gain sideEffects; all maxima read from game settings. During contract authoring, every operation row is audited against the C# method it mirrors (REVIEW gap #35) — this audit is a named task, not an assumption.

**Composites** (REVIEW #5), each a single snapshot + single history entry:

- `POST /api/campaign/batch` — `{ops: [{entity, id, op, args}…]}`, executed sequentially, **all-or-nothing** (first failure rolls back to the pre-batch snapshot; result reports per-op outcomes).
- `POST /api/characters/{id}/end-score` — optional helper: clear armor used, reset loadout commitment; takes explicit flags for each sub-action so no procedure is encoded.
- `POST /api/characters/{id}/end-downtime` — clears session expressions, optional vice-relief stress clear amount (amount is caller-supplied — GM judgment stays outside).

### 7.3 Game data endpoints

`GET /api/games`, `GET /api/games/{stem}`, plus convenience projections (`/playbooks`, `/playbooks/{name}`, `/heritages`, …) served read-only from `data/games/` — single source of truth, no symlink dance.

---

## 8. Conformance suite (the real product of phase 1)

`conformance/` — TypeScript, **Effect** (Effect for HTTP client, schema decoding via `effect/Schema` mirroring `contract/schemas/`, and test orchestration), vitest runner. Runs against any `BASE_URL`; CI runs it against both backends.

Structure:

- `suites/contract/` — every endpoint: shapes, status codes, error codes, OpenAPI validation of responses.
- `suites/semantics/` — the §5.1 list, one file per behavior, with cases mined from `Persistence.Test`.
- `suites/persistence/` — round-trip identity, atomic-write crash simulation (kill server mid-write via test hook), history/undo, revision conflicts, concurrent-request races on one entity.
- `suites/lifecycle/` — creation flows, crew linking, import/export, retirement.
- `fixtures/` — golden character/crew JSON documents both backends must emit byte-identically.

**Scoring harness**: `conformance run --against <url> --report json` emits pass/fail per test with stable test IDs. This is both the CI gate and the measurement instrument for the language experiment (§11).

---

## 9. Track A — Ada + SPARK backend

- **Toolchain**: GNAT FSF + gnatprove via Alire (`alr`); crates: `aws` (Ada Web Server), `gnatcoll` (JSON), `spark_unbound` if useful. Pin versions in `alire.toml`.
- **Layout**: `backend-ada/core/` (SPARK library, §5.2), `backend-ada/server/` (AWS routes, JSON mapping, file store; SPARK off).
- **CI gates**: `alr build` clean; `gnatprove --level=2 --checks-as-errors` green on `core/`; conformance suite green.
- **Agent guidance** (`backend-ada/AGENTS.md` with `CLAUDE.md` symlinked to it, written in phase A0): Ada style crib sheet, common gnatprove counterexample patterns and fixes, "run `gnatprove` on the changed unit only" loop guidance, AWS routing idioms. This file is load-bearing — it compensates for thin training data and is updated whenever an agent burns >3 iterations on a toolchain issue.

## 10. Track Z — Zero backend

- Same contract, same conformance suite, same file-store rules.
- **Reality check first**: phase Z0 is a spike proving Zero can (a) serve HTTP or be fronted trivially, (b) parse/emit JSON, (c) touch the filesystem. Zero is pre-1.0 systems-level; expect to write or vendor scaffolding.
- **10.3 Escape hatch**: if the Z0 spike shows HTTP is impractical, Track Z narrows to **domain core + stdio harness**: Zero implements entities and operations behind a line-delimited JSON stdin/stdout protocol, and a ~200-line neutral shim (reused from conformance tooling) adapts HTTP↔stdio so the *same suite still runs*. The experiment then compares domain-logic authoring only — still a valid signal, honestly labeled in results.
- Zero's agent-facing features (JSON diagnostics, repair metadata) should be wired directly into the orchestrator's feedback loop — that's the point of the experiment.

## 11. The language experiment — measurement

Both tracks are built by comparable agent processes from the same contract and task graph. Record per track, per task (orchestrator writes `tasks/metrics/{track}/{task}.json`):

- agent iterations to green (compile/prove/test loop count), wall-clock, tokens if available
- conformance pass rate at first "done" claim vs after review
- defect classes caught by: compiler / gnatprove / conformance suite / human
- lines of implementation + scaffolding LOC

No grand claims from n=1; the deliverable is a written comparison memo (`agent-docs/EXPERIMENT.md` in the new repo) with the numbers and qualitative notes.

## 12. Frontend & aesthetic

`frontend/` — static build (Vite), TypeScript + **Effect** (HTTP client, `effect/Schema` decoders generated/derived from `contract/schemas/`, state via Effect services; keep framework minimal — plain DOM or a thin lib, decided in F0). Served by the backend; talks only to `/api/*`. Multi-tab safety comes free from revisions (a stale tab gets `STALE_REVISION` and refetches).

**Blades aesthetic** (the book/sheet look, without copying John Harper's actual layouts or art):

- Palette: near-black ink `#1a1a1a`, aged paper `#e8e0d0`, blood red accent `#a02c2c`; dark mode inverts to lamplit-dark (`#141210` ground, paper-toned text).
- Type: condensed industrial sans for headers, small-caps labels with wide tracking; serif or typewriter face for flavor text. All fonts self-hosted, all OFL-licensed (the official sheets' faces, e.g. Kirsty, are commercial — we use free lookalikes, never the originals):
  - **Headers / sheet titles**: League Gothic (primary) with Oswald as the variable-weight fallback — tall condensed industrial caps, closest free match to the book's title treatment.
  - **Labels / small-caps furniture** (action names, track labels, stamps): Oswald 500–600, uppercase, `letter-spacing: 0.08em`.
  - **Body / UI text**: Alegreya Sans; long-form notes in Alegreya (its serif sibling) for the book's humanist print feel.
  - **Flavor / handwritten-ledger accents** (trauma stamps, notes fields, the occasional scrawl): Special Elite (typewriter) sparingly; IM Fell English for aged-print epigraphs only.
  - Font stack rule: every face declared with a system fallback (`League Gothic, 'Arial Narrow', sans-serif`; `Alegreya Sans, system-ui, sans-serif`), subset to latin + latin-ext (the salvaged data includes French and Russian translations — include cyrillic subsets for Oswald/Alegreya Sans, and fall back to system fonts where a face lacks coverage).
- Texture: subtle paper grain, heavy rules and borders, stamp/label motifs; checkboxes and clocks drawn as inked circles/segments (SVG clock component with 4/6/8-segment variants).
- The distinctive sheet furniture: action dots, stress track as a row of heavy boxes, trauma as stamped labels, harm as a lined table.
- Deliverable F1 is a **style guide page** (`/styleguide`) rendering every component before any sheet page is built; frontend agents build to it.
- Honor the reference app's precedent on accessibility: visible focus, reduced-motion, and a high-contrast theme variant.

## 13. Task graph (model-agnostic orchestration)

Each task is a file `tasks/{id}.md` with frontmatter: `id`, `title`, `deps: []`, `track`, `outputs`, `acceptance` (mechanically checkable where possible: "conformance suite IDs X–Y pass", "gnatprove green on unit Z"). Any orchestrator — JAT, CCCC, Smithers, or hand-run subagents on any model — consumes the same files. Rules for the orchestrator:

- A task is done only when its acceptance commands pass in CI, not when the agent says so.
- Tracks A and Z are independent after phase C and may run as parallel agent teams; `contract/` and `conformance/` are frozen for them (changes go through a contract-change task that re-runs both tracks' suites).
- Subagents never edit `contract/` or `conformance/` from within an implementation task.

**Phases** (→ = depends on):

| Phase | Tasks | Output |
|---|---|---|
| **C0 Contract** | Audit ops catalog vs C# source (§7.2); write `contract/openapi.yaml` + schemas; golden fixtures | Frozen contract v1 |
| **C1 Conformance** | → C0. Build suite + scoring harness; suites for §5.1 semantics mined from Persistence.Test; HTTP↔stdio shim | Runnable suite (all tests failing — no server yet) |
| **A0 Ada bootstrap** | → C1. Alire project, AWS hello-world serving `/api/health` + static files, CI with gnatprove; write `backend-ada/AGENTS.md` (+ `CLAUDE.md` symlink) | Health check green |
| **A1 Ada core** | → A0. SPARK domain library, entity by entity (BoundedInteger → Monitor → Fund/XP → Gear/Armor → Character → Crew → Clocks), proofs per §5.2 | gnatprove green, unit-level checks |
| **A2 Ada server** | → A1. File store (§4), JSON mapping, routes, batch/composites, history/undo | Full conformance green |
| **Z0 Zero spike** | → C1. HTTP/JSON/FS feasibility; decide full-parallel vs escape hatch (§10.3) | Written go/no-go + scaffolding |
| **Z1 Zero core** | → Z0. Domain model + operations | Semantics suites green (via shim if needed) |
| **Z2 Zero server** | → Z1. Store + routes (or stdio harness) | Max achievable conformance green |
| **F0 Frontend bootstrap** | → C0. Vite + Effect setup, schema decoders from contract, framework decision | Builds, health-check page |
| **F1 Style guide** | → F0. §12 aesthetic as rendered component library | `/styleguide` |
| **F2 Sheets** | → F1, A2. Character sheet, crew sheet, roster, creation flow, history/undo UI | Playable UI against Track A |
| **S0 Skill** | → A2. `skill/SKILL.md`: discovery via `/api/health`, server provisioning, "never invent IDs — roster first", rulebook-ephemeral-read policy, api-reference generated from OpenAPI in CI | Installable agent skill |
| **E0 Experiment memo** | → A2, Z2. §11 metrics analysis | `EXPERIMENT.md` |

Critical path: C0 → C1 → A0 → A1 → A2 → {F2, S0}. Z-track and F0/F1 parallelize.

## 14. Open items

1. **License** — confirm arazni's terms for game-data JSON + ported semantics; plan assumes OK.
2. **Name** — working title **Paperclips in the Dark** (repo `paperclips-in-the-dark`, binary `pitd`). The tagline writes itself: *"maximizing coin, not paperclips — probably."*
3. Multi-campaign support (multiple `DataDir`s via `--data` flag) is trivial and in scope; campaign *switching* UI is F2-optional.
4. Scum & Villainy support rides for free if no maxima are hardcoded — S&V-specific conformance cases are included in C1 to keep everyone honest.
