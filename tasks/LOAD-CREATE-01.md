---
id: LOAD-CREATE-01
title: Diagnose live scoundrel load/create failures without changing human data
track: ada
deps:
  - GAME-MODE-02
  - INTERNAL-ERROR-01
outputs:
  - docs/pages/backlog/load-create-stale-runtime.mdx
  - tasks/metrics/ada/LOAD-CREATE-01.json
  - tasks/metrics/ada/LOAD-CREATE-01-live-responses.log
  - tasks/metrics/ada/LOAD-CREATE-01-decoder-probe.log
---

# LOAD-CREATE-01

## Latest human direction

Run the CURRENT binary on a temporary copy of the human's actual campaign data;
verify legacy scoundrels, crew, roster and creation through the real frontend
client decoders. Report whether a restart alone fixes the reproduced issue.
Do not restart the human's server. Propose, but do not build, a compatibility
check. No VCS commands or writes to campaign-data/. No CSS/error-screen render
or playbook-description edits; those belong to the concurrent worker.

## Root cause and exact seams

The Vite proxy at `frontend/vite.config.ts:9` targets the old live listener9657.
Its Ada PID1054006 runs the October6 inode140904474. The current binary is the
October12 inode362380975. A file rebuild did not replace that process.
Both live scoundrel GETs are HTTP200 but omit mode/modeFlow/downtime.
Actual `getCharacter` fails at `frontend/src/api/client.ts:322`, with
`Character → ["mode"] → is missing`; exhaustive strict decoding finds all three
missing properties (`frontend/src/schema/character.ts:224–226`).
Creation's nested Character decode is `frontend/src/schema/operation-result.ts:151`,
through client lines219 and281–283, producing the generic unexpected-format copy.
The old live POST was not repeated or captured, since that would modify human
data. The recent Lurk is already persisted; do not blindly retry creation.

## Observed red and green, no production patch

Read-only live actual-client checks: original Spider and recent Lurk both fail
strict decoding; crew and roster decode. The generic health version cannot
separate runtimes: both report0.2.0.

Current binary, copied human data, port35431: **5/5 actual-client checks pass**:
original Spider, recent Lurk, existing crew, roster, and a new Lurk creation.
Creation is HTTP200 and only changes the temporary copy.
Both old files lack the new fields on disk even after loading, and cmp confirms
both remain byte-identical to their untouched originals. The returned defaults
are free-play, no active flow, and downtime free2/paid0/spent0/activities[].
This verifies the contract-defined backend normalization boundary already works
for the human's real legacy data: normalize lines1848–1849,1898–1899,2046–2054.
No latent migration or decoder defect was found for these documents. No schema
was loosened and no source patch was made to invent a redundant migration.

The isolated result supports restarting the live server with the current binary
and the same directories. That restart is reserved for the human; its actual
post-restart UI outcome is not claimed. The worker's own temporary server is
stopped after capture. No broad kills or changes to the live service.

## Conformance seam and proposal

Managed conformance builds/launches a current binary with isolated data/port,
not the human's old Vite-proxied listener. Its green result cannot validate that
long-running development process's executable identity.
A compatibility check before reads/creation is worth proposing, but health.version
alone is insufficient because both runtimes say0.2.0. Recommend a generated,
compiled-in contract compatibility identifier plus diagnostic build identity,
checked against the frontend's expected identifier. Report a restart/refresh
instruction, not a generic retry. This requires a separate approved contract/client
change and is deliberately not built. No automatic restart, retry or lax decoder.

## Verification scope and records

Latest assignment is investigation and proposal only. The evidence consists of
exact live read responses, actual frontend client red/green outcomes, current-copy
HTTP creation, and two legacy-byte preservation checks. Full implementation gates,
new permanent test changes and the mutation campaign are not claimed or run for
this no-source-patch investigation. No mutation target changed; no catalog hash
refresh is needed. The original implementation gates would apply to any later
approved compatibility feature.

Evidence and current details are in the linked backlog page and
`tasks/metrics/ada/LOAD-CREATE-01-*.log`. Raw current-copy responses are captured
by the real fetch/client boundary. No original live POST response is fabricated.
