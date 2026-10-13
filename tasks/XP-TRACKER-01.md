---
id: XP-TRACKER-01
title: "Score XP Tracker — approved mockups and lifecycle proposal"
track: design
deps: [GAME-MODE-01, GAME-MODE-02]
outputs:
  - docs/pages/contract/xp-tracker-proposal.mdx
  - Score collapsed/expanded and Resolution mockups with settings-derived xp-tracker-data.json
acceptance:
  - "Score-only separate XP Tracker; wide panel and accessible compact footer/bottom sheet"
  - "Real labels, Lurk trigger and game-settings maxima; inherited game-mode theme"
  - "Sheet retains Personal, playbook XP and attribute XP; no mode gating or campaign state"
  - "Resolution shows six steps; separate Playbook/Insight/Prowess/Resolve allocation, live available/unallocated XP, locked GM total with Adjust"
  - "Filled/empty and pending preview boxes show settings maxima and room; completion requires all XP placed without overflow or discard, then clears only three session counters"
  - "Expression controls faithfully match sheet stressTrack structure/classes with labels below boxes; all three wide rows visible in initial 1440 capture"
  - "Contract/backend/frozen-test grant and clear semantics cited; atomic completion recommended as proposal only, no implementation changes"
  - "Parent recaptures 27 baseline plus 18 adjusted/ready PNGs at 1440x1000, 768x1024 and 390x844 in light, dark and high-contrast, and one real-app comparison; reports actual evidence"
---

## Scope and status

**Revision captured and checked for the mockup behaviour (2026-10-13).** This revision changes mockups and their proposal only; no application, backend, contract or game-settings implementation is part of this card. Recaptures, the behaviour probe and the real-app Talents comparison are recorded in `docs/public/mockups/game-mode/xp-tracker-browser-evidence.json`. Compact keyboard, focus, Escape, drag and touch checks were **not** re-run for this revision; their earlier results are history. No independent review was requested for this revision. This proposal supersedes the earlier restriction that expression questions appear only in Resolution, without changing the implemented API.

## Approved design

- **Score only:** separate **XP Tracker** containing **Desperate action XP**, **Playbook expressions**, **Scoundrel expressions**, and **Struggle expressions**. Do not duplicate the session controls in the sheet.
- At **width >=1100px**, place the distinct panel under/next to Game mode. At **width <1100px**, use the fixed footer's small, real **XP Tracker** button with `aria-expanded` and `aria-controls`; tap/click or Enter/Space opens/closes a bottom sheet. Include an explicit Close button and Escape dismissal, visible keyboard focus and focus return to the trigger. An expanded modal sheet has an accessible name, contained focus and an inert background. Dragging the handle is additional pointer/touch convenience, never the only way to open/close; scrolling the sheet contents must remain possible. Keep sheet content clear of the footer and device safe-area inset; reduced motion must not impair operation.
- Keep **Personal**, playbook XP and attribute XP tracks in the scoundrel sheet, along with all other sections. The tracker is assistance, not operation eligibility: no new mode gate, campaign-wide state or table-phase enforcement.
- Reuse the incumbent game-mode `mockup.css` imports, fonts, light/dark/high-contrast theme and 06d Resolution conventions. Retain the Nyelle Vale / Wren Lurk example, not a new visual identity.
- Real labels are `frontend/src/pages/character-sections/talents.ts:136-171`. Lurk trigger: **You addressed a challenge with stealth or evasion** (`data/games/blades-in-the-dark.json:389`). Session maximum **2** (`:1067`); XP maxima Playbook **8**, Attribute **6**, Crew **10** (`:1036-1040`). These numbers are source facts, not literals to embed in HTML/JS. Extract actual JSON into dedicated `xp-tracker-data.json`, record source path/JSON pointers and consume it dynamically.
- Other questions come from the [Advancement SRD](https://bladesinthedark.com/advancement): **You expressed your beliefs, drives, heritage, or background.** / **You struggled with issues from your vice or traumas.** Record this content provenance separately from game-settings values; these questions are not fields in the settings JSON.
- Expression controls must faithfully reproduce the real sheet component: `.stress` wraps a `.stress-track` group of `.stress-box` controls with `data-stress` filled/empty states, followed by `.stress-label.lbl` **below the boxes**. Follow `frontend/src/components/stress-track.ts`, `frontend/src/pages/character-sections/talents.ts:136–197`, and `.stress*` rules in `frontend/styles/components.css`; do not substitute a custom box row headed by an `h3`. Retain current/max numbers and per-track steppers. All three expression rows, including Struggle, must be fully visible in the initial 1440×1000 wide capture, not clipped in an internally scrolling rail.

## Resolution and timing

Keep the six-step Resolution stepper: **Scoundrel XP → Payoff → Heat → Entanglements → Crew XP → Crew Rep**. Preserve Back/Next, direct step selection, confirm-with-GM guidance, explicit crew editors and optional Crew XP/Crew Rep skips. Resolution remains within Score; leaving/resuming/backtracking does not award XP or clear counters.

During play a desperate action earns **1 XP immediately in the rolled action's attribute**, including desperate group actions. Expression counters instead record the session's three triggers, each 0–settings maximum: 1 if it happened, 2 if it happened a lot, no award for an absent trigger. They do not already grant XP.

At **Scoundrel XP**, review the recorded expressions and distribute XP through **four separate destination steppers: Playbook, Trait Insight, Trait Prowess, and Trait Resolve**. Example expression total: **2 + 1 + 1 = 4**; splitting between destinations is explicitly supported. Never add already-granted desperate XP again.

Show **live XP available** and **unallocated XP** (`available − sum of the four allocations`). The GM-confirmed total starts locked; an explicit **Adjust** toggle unlocks it for a nonnegative integer correction and locks it again when turned off. Do not invent a hard maximum for the GM total or confuse the session-counter maximum with that total.

Each destination shows the actual **filled and empty boxes**, visually distinct **pending allocation preview boxes**, and numeric current/max, allocation and remaining room. Maxima come dynamically from `xp-tracker-data.json`; room is `max − current`. **Block completion while any XP remains unallocated or allocations exceed available XP or any destination's room.** Full tracks accept no further allocation. No overflow may be silently clamped and no expression XP discarded. If insufficient room remains, preserve counters and pending allocation; any advancement needed to make room is a later implementation concern, not an invented mockup award.

Only **successful explicit completion** converts the allocations and clears the **three session expression counters**; visibly explain the clear. Preserve permanent playbook/attribute XP, including desperate XP. Merely opening, closing, revisiting, or navigating the step is not completion. Remove the old sheet **End downtime clears expressions** UI/behavior in the later implementation, not this design task.

## Current contract: inspection evidence, not test results

| Operation | Current semantics and exact evidence |
|---|---|
| `session.set` | Partial absolute setter; settings clamp; `x-snapshot:false`; no grant. `contract/openapi.yaml:1657-1674`; implemented counter-only case `backend-ada/server/src/pitd_ops.adb:1482-1513`. Zero is a valid clear; oracle `conformance/suites/semantics/session-set.test.ts:7-28`. |
| `playbook-xp.add` / `attribute-xp.add` | Signed deltas grant/reduce permanent XP, clamp to track limits. `contract/openapi.yaml:1230-1240,1257-1273`; implementation `pitd_ops.adb:972-981,1029-1039`. |
| XP `.clear` | Clears permanent advancement tracks, **not session expressions**. `contract/openapi.yaml:1246-1250,1279-1293`; `pitd_ops.adb:982,1029-1030`. Attribute level-up clears its spent track; playbook ability-taking does not automatically spend playbook XP (`openapi.yaml:1303,1347`). |
| `end-score` | No automatic XP; opens Resolution/scoundrel-xp, retains committed gear by default, preserves partial stress, resets downtime budget and out-of-action flags. `contract/openapi.yaml:1700-1723`; `pitd_ops.adb:1737-1786`. Game-mode oracle preserves playbook/talent `conformance/suites/semantics/game-mode.test.ts:376-411`; frozen lifecycle guards/snapshot/undo `conformance/suites/lifecycle/lifecycle-state-machine.test.ts:237-275`. |
| `mode.flow.set` | Cursor only: freely selected step; no XP, cleanup or budget reset. `contract/openapi.yaml:1771-1783`; `pitd_ops.adb:751-755`. Must not repurpose Next/Back into hidden awards. |
| `end-downtime` | OpenAPI exposes optional `clearSessionExpressions`; actual clear occurs **only when true**, not on every call. `contract/openapi.yaml:1917-1932`; `pitd_ops.adb:1799-1814`. Existing oracle explicitly supplies true and asserts three zeros plus one snapshot: `conformance/suites/semantics/composites.test.ts:135-165`. Current sheet button advertises that clear (`frontend/src/pages/character-sections/talents.ts:187-198`). |

**Does the approved clear timing require a contract change?** Existing explicit XP-add operations followed by `session.set` with all three zeros can express conversion and clearing without a new wire endpoint. They do not define atomic step completion, an allocation record or a replay-safe conversion guarantee, and a flow cursor move must continue to have no gameplay effects. The approved clean cutover that removes the old End Downtime clear responsibility **does require later contract/conformance/backend/client work**: the public `clearSessionExpressions` behavior and its frozen composite oracle cannot simply disappear in a mockup. A later implementation must declare conversion/completion semantics before coding; do not imply today's API already performs them.

## Recommended completion and remaining implementation questions

**Recommend one atomic server completion operation** that validates all four allocations against the GM-confirmed total and current destination room, credits every allocated point, and only then clears the three session expression counters. This is a proposal for later contract/backend/client/conformance work, **not an endpoint built by this task**. Keep `mode.flow.set` cursor-only; it never awards or clears.

The capacity decision is resolved: all XP must be placed within settings-derived room; block completion rather than discard or silently clamp. Remaining implementation questions are the exact completion wire schema and replay/concurrency/snapshot semantics, and how later advancement operations make room while retaining unconverted session XP. They do not reopen allocation, Adjust locking, capacity blocking or successful-completion clear timing.

## Deliverables and parent evidence

Proposal: [XP Tracker](/contract/xp-tracker-proposal).
Mockups: `/mockups/game-mode/xp-tracker-score.html`, `/mockups/game-mode/xp-tracker-expanded.html`, `/mockups/game-mode/xp-tracker-resolution.html`.

**Revision captures recorded.** The original **27** `xp-tracker-{score|expanded|resolution}-{1440|768|390}-{light|dark|high-contrast}.png` images and the **18** `xp-tracker-resolution-{adjusted|ready}-{1440|768|390}-{light|dark|high-contrast}.png` images (**45 prototype PNGs**) are recaptured at exactly 1440×1000, 768×1024 or 390×844 with device scale factor 1, with 0 px horizontal overflow and 0 page errors. The real-app Talents comparison `docs/public/mockups/game-mode/xp-tracker-real-talents.png` is embedded in the proposal. At 1440 the `score` and `expanded` PNGs are byte-identical: the wide panel is always open, so the expanded state renders the same. Capture harness: `agent-docs/test-audit/browser-evidence/xp-tracker-01/capture.mjs`. Wide initial framing must show all three expression rows; Resolution captures must show allocation, capacity and completion status. Record scroll positions where needed.

Measured for this revision (`xp-tracker-browser-evidence.json`, `behaviour`): split allocation across the four destinations; live available and remaining values; GM total locked by default, unlocked and relocked by Adjust; overflow past room blocks completion with an explanation; successful completion credits the allocations and clears only the three session counters. Preserve the incumbent footer, themes, keyboard, touch, modal focus and reduced-motion behaviour: these were **not** re-measured for this revision (see the status note).

Evidence filenames: `xp-tracker-browser-evidence.json` is updated for this revision. `xp-tracker-interaction-evidence.json`, `xp-tracker-touch-evidence.json` and `xp-tracker-review.json` still describe the earlier revision and are kept as history.

### Historical delivery record — before this revision

The preceding design recorded 27 exact-viewport Chromium images; no horizontal overflow; compact click/Enter/Space/Escape, focus containment/return and pointer-drag checks passing all six compact size/theme cases; touch checks passing at both compact widths. Its local Resolution preview converted illustrative 4 XP and zeroed three counters while retaining permanent XP.

That independent review initially found compact modal focus containment, an oversized desktop rail and full-page captures misrepresenting fixed footers. One correction batch and recapture led to its historical **SHIP** disposition. Its static detector had no findings using degraded regex fallback; no computed-contrast result was claimed. These results do **not** verify the revised allocation and expression-row design.

Historical publication record: Vocs **153 files generated**; metrics **176 files / 0 errors**; traceability **231/231**, reconciliation **17/17**. Origin was already at `b78d77dd`; Radicle advanced `6a168425 → b78d77dd` and synced with **3 seeds** before the preceding card's publication. These are retained history, not current revision gates.
