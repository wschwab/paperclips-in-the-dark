# Task A2 — Ada server: full conformance

You are GPT 5.6 Luna, implementing task A2 of paperclips-in-the-dark.
A0 (server skeleton) and A1 (proven SPARK core, 225/225) are merged. This is
the payoff task: FULL conformance green.

Read first: `PAPERCLIPS.md` §4 (persistence rules — every numbered rule is
conformance-tested), §6, §7; `tasks/A2-ada-server.md`; `backend-ada/AGENTS.md`
(keep extending); `contract/openapi.yaml` (FROZEN) — every path, x-snapshot
flag, error code and status-code mapping is normative.

Build in `backend-ada/server/` (SPARK off, thin over the proven core):
- File store per §4: campaign-scoped layout, atomic writes (tmp+fsync+rename),
  per-entity in-process mutex, integer revisions + If-Match → 409
  STALE_REVISION, history snapshots ONLY for x-snapshot:true ops
  (yyyyMMddHHmmssfff-shortid naming), MaxHistorySnapshots=50 pruning, undo
  restores+deletes newest snapshot, import clears history + baseline
  snapshot, formatVersion=1 with a real (empty) migration pipeline hook.
- JSON mapping core⇄DTO exactly per contract/schemas (camelCase, no nulls,
  byte-identical GET vs current.json — pretty-printed, stable key order).
- All routes from openapi.yaml incl. games endpoints (serve data/games/
  verbatim + projections), campaign/roster/members, batch (all-or-nothing,
  single snapshot), end-score, end-downtime, delete-with-confirm, ?download=1
  content-disposition, Idempotency-Key LRU, 1 MiB import cap, structured
  request logging (one JSON line/request).
- Wire the frontend static serving (./frontend/dist) as A0 left it.

Red-green loop: `cd conformance && BASE_URL=http://localhost:9657 npx vitest
run` — target is ALL 131 GREEN. Work suite by suite (contract → semantics →
persistence → lifecycle). The persistence crash-simulation tests may use a
test hook — read suites/persistence to see what they expect and implement
the hook (e.g. a /api/_test/kill endpoint enabled only via --test-hooks flag;
document it in AGENTS.md; it must be OFF by default).

Rules: touch ONLY backend-ada/. contract/, conformance/, data/, frontend/
read-only. No git/jj. Kill your server processes before exiting. If a
conformance test seems WRONG, do not work around it silently — implement
what the contract says, and report the discrepancy loudly in your summary
(contract changes are a human-gated task).

Acceptance (orchestrator-run): cold clone semantics — fresh data dir,
./ci.sh green, server up, full suite 131/131, then `conformance run
--against http://localhost:9657 --report json` archived as the Track-A
scorecard.

When done print: pass count trajectory (how many green after each major
chunk, for the experiment metrics), iterations, discrepancies found,
AGENTS.md additions.
