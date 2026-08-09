---
id: A13
title: "Ada server: playtest fixes — stress reduce, armor, ability descriptions, turf/notes/heal ops, vice purveyor, Mastery gating"
deps: [A2, C4]
track: ada
outputs:
  - backend-ada/server: stress.add negative delta reduces (mirror heat.add); New_Character armor hasStandard/hasHeavy true (special false); ability.take fills description from game data; turf.add/remove; note.add/remove (char+crew); harm.heal targeting; vice purveyor in dossier.update; Mastery-gated action caps
  - conformance: red-green semantics tests for each
acceptance:
  - "live probe: stress −2 reduces; armor.set standard works; ability.take shows description; turf clamps 0..6; note add/remove; heal removes chosen harm; vice purveyor stored; rating 4 blocked without crew Mastery (RATING_MAXED), allowed with"
  - "full conformance suite green; gnatprove gate stays green"
---

Playtest round 1 (2026-08-09) findings, see agent-docs/playtest-round1-plan.md:
#6 stress reduce broken (clamps negative to 0); #11 armor unusable (has* false
by default); #13 ability descriptions empty on take; #20 turf ops; #4/#19 note
arrays; #9 heal targeting; #18 vice purveyor; #7 Mastery gating. C4 defines the
contract changes; this task implements them server-side plus the pure bugs.
C# refs: Armor.cs (standard/heavy available by default), DossierVice.cs
(name+description only — purveyor is new), TalentAction.cs (rating cap).

## Log
- 2026-08-09: filed from playtest round 1 plan.
- 2026-08-09/10: DONE in three narrow dispatches (A13a stress/armor/desc,
  A13b notes/turf/vice DTO+ops, A13c heal-targeting + Mastery gating) — the
  broad single-prompt A13 died silently mid-implementation, so it was split.
  Orchestrator verified each part (build + own probes + full conformance):
  stress -2 reduces (floor 0, signed effective), armor standard/heavy
  available, ability.take description from game data, notes[] add/remove
  (NOT_FOUND), turf.add clamp 0..6 crew-only, harm.heal strict targeting
  (NOT_FOUND, no shifting, clock reset), Mastery cap 3→4 (RATING_MAXED).
  Conformance 176/176 green (8 new cases).
