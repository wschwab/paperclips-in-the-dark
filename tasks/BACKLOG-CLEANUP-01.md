---
id: BACKLOG-CLEANUP-01
title: Reconcile October playtest backlog with completed task records
track: docs
deps:
  - UNKNOWN-OP-01
  - XP-TRACKER-04
outputs:
  - docs/pages/backlog/playtest-2026-10-scoundrel.mdx
  - docs/pages/backlog/unknown-operation-status.mdx
  - docs/pages/backlog/load-create-stale-runtime.mdx
  - docs/pages/backlog/french-game-creation-500.mdx
  - tasks/SCORE-XP-REMOVAL-01.md
  - tasks/BACKLOG-CLEANUP-01.md
---

# BACKLOG-CLEANUP-01 — current-state backlog reconciliation

**Documentation gates passed; publication follows LOADOUT-ATOMIC-01.** The
human released its frontend handoff; implementation `794303bc` has its own
independent review and combined mutation records. This docs card does not
substitute for that implementation's acceptance.

## Scope and dispositions

- October Scoundrel feedback items 1–9 now distinguish completed approved scope
  from limitations and future ideas. Items 2, 3, 6 and 8 are no longer queued;
  items formerly pending independent review cite the completed verdicts.
- Current-build alignment items are done/reviewed. SCORE-XP-REMOVAL-01 is closed
  as superseded by XP-TRACKER-02..04; its original stop is preserved as history,
  not a present capability gap. The API End downtime capability remains.
- THUMBNAIL-01 replaces the historical SVG favicon. Hosted absolute social
  imagery URLs remain open rather than being described as complete.
- Resolution covers Payoff, Heat and Entanglements; no further entanglements
  work is planned. Incarceration is future/not planned.
- Explicit open limitations remain: missing stale-crew reconciliation test;
  approved-mockup (not game-data) Engagement/Loadout wording; CREW-ALIGN's
  source-text-only guard; absolute `og:image` URL once hosted.
- Edition dropdown and restart-server message remain future/not planned.
  Crew page feedback remains the pending placeholder.
- Related backlog pages identify closed fixes and separate historical failure
  captures from current behavior; the French GameStem frontend hand-off is done.
- LOADOUT-ATOMIC-01 is cited at implementation `794303bc`, separately from its
  independent review and combined mutation gate. No acceptance is inferred
  from this documentation cleanup.

## Record-derived citations

- `tasks/PLAYTEST-UI-01.md`: sheet fixes `12e62ff2`, original icon `aab6fa2a`,
  final Luna PASS/manifest MIME fix `d5847ce1`.
- `tasks/PLAYTEST-UI-02.md`: contract `588ecc1c`, backend `1108884f`, final Luna
  PASS `41945594` (supersedes its opening pending-review statement).
- `tasks/GAME-MODE-03.md`: backend roster `654c3cff`, final Sol PASS `a49bccbd`,
  focused residual F7 PASS `7fdd78ca`, French backend `c57ba179`, frontend
  GameStem mirror `e3f24d20`. Final acceptance supersedes the opening unaccepted
  and earlier provider-limit statements.
- `tasks/MODE-PANEL-ALIGN-01.md`: Sol PASS `159c703d`.
- `tasks/CREW-ALIGN-01.md`: Sol PASS `8a7cd0c1`; source-text-only guard is P3,
  not a failure of the reviewed visual fix.
- `tasks/PLAYBOOK-BLURBS-01.md`: implementation and completed campaign `69baf006`.
- `tasks/XP-TRACKER-02.md`: contract `0ebfc69b`;
  `tasks/XP-TRACKER-03.md`: backend `9557cc94`;
  `tasks/XP-TRACKER-04.md`: final Sol round-4 PASS `6cc54859`, completed clean
  cutover and human-approved journey/parity amendments.
- `tasks/INTERNAL-ERROR-01.md`: backend `8d24d530`, frontend `94d9cd86`.
- UNKNOWN-OP-01: closed commit `6fd4c199`, supplied explicitly in this assignment;
  `tasks/UNKNOWN-OP-01.md` supplies behavior and acceptance evidence.

## Additional verified publication citations

Read-only `jj log` file-history lookup established the identifiers absent from
the earlier card prose; none are inferred from filenames:
- THUMBNAIL-01: `970f67a9`.
- LOAD-CREATE-01 investigation records: `a4bfbe77`; human-confirmed restart
  closure: `6a168425`. There was no production patch.
- XP-TRACKER-02 contract: `0ebfc69b`; XP-TRACKER-03 backend: `9557cc94`.

## Exercised documentation gates

- Metrics: **184 files validated, 0 errors**.
- Finding traceability: **231/231**.
- Audit reconciliation: **17/17**, no errors or warnings.
- Vocs build: **155 files generated**.

Evidence: `tasks/metrics/docs/BACKLOG-CLEANUP-01-*.log`. No application code or
frozen assertions changed by this docs-only card. No frontend review, browser or
mutation run is claimed for it. Publication uses explicit paths separately from
the atomic-loadout implementation.
