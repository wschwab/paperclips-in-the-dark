# Task S0 — agent skill

You are GPT 5.6 Luna, implementing task S0 of paperclips-in-the-dark.
Track A is conformance-complete (131/131); the API surface is live reality.

Read first: PAPERCLIPS.md §12-adjacent skill notes in §13 S0 row + §1.1
non-goals + the IP-boundary sections of blades-in-the-sheets/docs/
agent-api-spec.md §11 (adopt its rulebook-ephemeral policy text, adapted);
tasks/S0-skill.md; contract/openapi.yaml (FROZEN).

Build under skill/ only:
- skill/SKILL.md: discovery via GET /api/health (implementation field tells
  the agent which backend it found); server provisioning (how to launch
  backend-ada/server/bin/pitd — note it must run from repo root; --port,
  --data, --static flags); "never invent IDs — roster first" workflow rule;
  rulebook-ephemeral-read policy (read user-supplied rulebook files
  ephemerally, never store or reproduce rules text); common workflows
  (session start via roster, stress/harm/xp ops, undo, batch); IP boundary
  (game-settings JSON content is fair game, rules text is not).
- skill/api-reference/: GENERATED from contract/openapi.yaml — write the
  generator script (skill/generate-api-reference.mjs, node, no network) so
  CI can regenerate; commit both script and output. Do not hand-write
  endpoint docs.

Rules: touch ONLY skill/. No git/jj. Everything else read-only.

Acceptance (orchestrator-run):
- node skill/generate-api-reference.mjs reproduces skill/api-reference/
  byte-identically (idempotent).
- SKILL.md covers the four mandated policies (discovery, provisioning,
  roster-first, rulebook-ephemeral) — I will read it.
- No rules text from the rulebook anywhere.

When done print: file tree and a 5-line summary of SKILL.md structure.
