# Task A1 — SPARK domain core

You are GPT 5.6 Luna, implementing task A1 of paperclips-in-the-dark.
Your A0 bootstrap is merged; build on it.

Read first: `PAPERCLIPS.md` §5 (ALL of §5.1 + §5.2 — the SPARK mapping is
your blueprint), `tasks/A1-ada-core.md`, `backend-ada/AGENTS.md` (your own
toolchain notes — keep extending it), `contract/openapi.yaml` +
`contract/schemas/` (FROZEN, read-only) for operation semantics and error
codes. The C# reference `blades-in-the-sheets/Models/` is read-only ground
truth for intent; the conformance suite (read-only) is ground truth for
behavior — read `conformance/suites/semantics/*.test.ts` to see exactly
what will be demanded of A2.

Build in `backend-ada/core/` (SPARK library, no IO, SPARK_Mode => On):
Entity order: BoundedInteger → Monitor (stress/trauma/harm+healing clock) →
Fund/ExperienceTracker → Gear/Armor → Character → Crew → Clocks.

Contracts-first is your red-green: for each operation, write the Pre/Post
FIRST (they must express the §5.1 behavior), watch gnatprove reject the
empty/wrong body, then implement until the proof closes. Use
`gnatprove -u <unit>` per your AGENTS.md loop guidance.

Proof targets (CI-gated):
- AoRTE (silver) for the whole core: `gnatprove --level=2
  --checks-as-errors=on` clean.
- Gold (functional Post conditions) for BoundedInteger, Monitor (harm
  spillover ladder!), Fund, ExperienceTracker. E.g. Add_Harm's Post must
  prove: landed intensity >= requested, or all-full-at-or-above error.

Semantics traps (all conformance-tested later; §5.1 numbering):
clamp-and-report (1), upward harm spillover / no remove-cascade (2),
no auto-trauma (3), loadout-derived armor (4), XP asymmetry (5),
box-wise upgrade unmark (6), full rolodex transitions (7), fund
remainders (8), retired guard w/ trauma-edit exception (9), commitment
lock (10). Maxima are generic parameters/record discriminants fed from
game settings at the boundary — NEVER constants in the core.

Also: unit tests for behaviors that contracts can't economically express
(a small plain-Ada test driver run by ci.sh is fine).

Rules: touch ONLY backend-ada/. No git/jj. Update backend-ada/AGENTS.md with
every gnatprove fight (counterexample patterns you actually hit).

Acceptance (orchestrator-run): `cd backend-ada && ./ci.sh` green including
gnatprove level 2 checks-as-errors on core with the gold units' functional
contracts present (I will read the .ads files for real Post conditions, not
just True).

When done print: proof summary (checks proved/total), per-unit notes, any
contract you had to weaken and why (honesty > gold-plating), AGENTS.md
additions.
