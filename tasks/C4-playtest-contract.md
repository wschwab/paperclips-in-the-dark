---
id: C4
title: "Contract batch: playtest round 1 — notes[], turf, heal targeting, vice purveyor, Mastery gating"
deps: [C0]
track: contract
assignee: orchestrator (contract authoring exception, per C0/C3 precedent)
outputs:
  - contract/schemas/character.json: dossier.notes → string[] (or notesList); dossier.vice gains purveyor {name, description}
  - contract/schemas/crew.json: notes → string[]; turf (0..6); note add/remove ops; turf.add/turf.remove ops
  - contract/openapi.yaml: harm.heal body {intensity, description} (heal a specific harm); note ops for char+crew; turf ops; RATING_MAXED semantics for Mastery gating
  - conformance additions (contract + semantics) for the new/changed ops
  - docs/pages/contract/ update
acceptance:
  - "redocly lint clean; golden fixtures validate via ajv"
  - "new conformance tests collect cleanly; fail red vs current backend where server support is missing (A13 follows)"
  - "no changes to unrelated op semantics; each change maps 1:1 to a playtest item"
---

HUMAN AUTHORIZATION 2026-08-09: the playtest list explicitly requests all of
these behaviors, which require contract changes. Design sketch:
- Multiple notes (playtest #4, #19): notes becomes an array of strings; ops
  note.add {text} / note.remove {index} for both characters (dossier.notes)
  and crews (crew.notes). Keep notebook.set for the freeform notebook?
  (character notebook exists — decide: notes[] = playtest 'notes', notebook
  stays as-is or merges).
- Crew turf (#20): crew DTO gains turf int 0..6; turf.add {delta} /
  turf.remove {delta} clamp 0..6. Rep dev threshold = 12 − turf (UI logic).
- Heal targeting (#9): harm.heal gains required body {intensity, description};
  clears that specific harm, consuming the healing clock. Server clamps
  severity per §5.1 (heal clears the listed harm; if not present → NOT_FOUND).
- Vice purveyor (#18): dossier.vice {name, description, purveyor {name,
  description}}; game data Vices[].Sources feed the purveyor menu.
- Mastery gating (#7): action.set-rating + attribute.levelup cap at 3 unless
  the character's crew (crewId) has the Mastery upgrade fully marked
  (boxesMarked == TotalBoxes == 4); error RATING_MAXED (already in enum).
  Characters with no crew: cap 3.
- Cohort types (#21): NOT contract — game data: add CohortGangTypes (Adepts,
  Rooks, Rovers, Skulls, Thugs) + CohortExpertTypes (Doctor, Investigator,
  Occultist, Assassin, Spy, Custom) to data/games/*.json.

## Log
- 2026-08-09: filed from playtest round 1 plan (agent-docs/playtest-round1-plan.md).
