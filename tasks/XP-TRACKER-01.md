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
  - "Resolution shows six steps, explicit expression conversion and clear-on-completion notice"
  - "Contract/backend/frozen-test grant and clear semantics cited; no implementation changes"
  - "Parent captures 1440x1000, 768x1024 and 390x844 in light, dark and high-contrast; reports actual evidence"
---

## Scope and status

**Design/mockups delivered.** All 27 exact-viewport Chromium captures, responsive input checks and the independent correction review are complete; the reviewer returned **SHIP**. No application, backend or contract implementation is part of this card. This proposal supersedes the earlier restriction that expression questions appear only in Resolution, without changing the implemented API.

## Approved design

- **Score only:** separate **XP Tracker** containing **Desperate action XP**, **Playbook expressions**, **Scoundrel expressions**, and **Struggle expressions**. Do not duplicate the session controls in the sheet.
- At **width >=1100px**, place the distinct panel under/next to Game mode. At **width <1100px**, use the fixed footer's small, real **XP Tracker** button with `aria-expanded` and `aria-controls`; tap/click or Enter/Space opens/closes a bottom sheet. Include an explicit Close button and Escape dismissal, visible keyboard focus and focus return to the trigger. An expanded modal sheet has an accessible name, contained focus and an inert background. Dragging the handle is additional pointer/touch convenience, never the only way to open/close; scrolling the sheet contents must remain possible. Keep sheet content clear of the footer and device safe-area inset; reduced motion must not impair operation.
- Keep **Personal**, playbook XP and attribute XP tracks in the scoundrel sheet, along with all other sections. The tracker is assistance, not operation eligibility: no new mode gate, campaign-wide state or table-phase enforcement.
- Reuse the incumbent game-mode `mockup.css` imports, fonts, light/dark/high-contrast theme and 06d Resolution conventions. Retain the Nyelle Vale / Wren Lurk example, not a new visual identity.
- Real labels are `frontend/src/pages/character-sections/talents.ts:136-171`. Lurk trigger: **You addressed a challenge with stealth or evasion** (`data/games/blades-in-the-dark.json:389`). Session maximum **2** (`:1067`); XP maxima Playbook **8**, Attribute **6**, Crew **10** (`:1036-1040`). These numbers are source facts, not literals to embed in HTML/JS. Extract actual JSON into dedicated `xp-tracker-data.json`, record source path/JSON pointers and consume it dynamically.
- Other questions come from the [Advancement SRD](https://bladesinthedark.com/advancement): **You expressed your beliefs, drives, heritage, or background.** / **You struggled with issues from your vice or traumas.** Record this content provenance separately from game-settings values; these questions are not fields in the settings JSON.

## Resolution and timing

Keep the six-step Resolution stepper: **Scoundrel XP → Payoff → Heat → Entanglements → Crew XP → Crew Rep**. Preserve Back/Next, direct step selection, confirm-with-GM guidance, explicit crew editors and optional Crew XP/Crew Rep skips. Resolution remains within Score; leaving/resuming/backtracking does not award XP or clear counters.

During play a desperate action earns **1 XP immediately in the rolled action's attribute**, including desperate group actions. Expression counters instead record the session's three triggers, each 0–settings maximum: 1 if it happened, 2 if it happened a lot, no award for an absent trigger. They do not already grant XP.

At **Scoundrel XP**, review the recorded expressions and explicitly distribute that XP to playbook and/or attribute tracks. Example: **2 + 1 + 1 = 4 expression XP**, assigned to one selected track; this is illustrative, not a ban on splitting. Never add already-granted desperate XP again. The approved design clears the **three session expression counters on completing this step**, after conversion, and visibly explains the clear. It does not clear permanent playbook/attribute XP tracks. Merely opening, closing or navigating to the step is not completion. Remove the old sheet **End downtime clears expressions** UI/behavior in the later implementation, not this design task.

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

## Remaining human decisions

1. Is expression conversion plus clearing one atomic server completion operation, or explicit existing mutations coordinated by the client? Preserve cursor-only flow semantics either way.
2. When an allocated track is already full or the requested allocation exceeds capacity, how should advancement/remaining XP be handled? Existing XP-add clamps; silently clearing uncredited expression XP is not an approved decision.

## Deliverables and parent evidence

Proposal: [XP Tracker](/contract/xp-tracker-proposal).
Mockups: `/mockups/game-mode/xp-tracker-score.html`, `/mockups/game-mode/xp-tracker-expanded.html`, `/mockups/game-mode/xp-tracker-resolution.html`.

Captured screenshot naming: `xp-tracker-{score|expanded|resolution}-{1440|768|390}-{light|dark|high-contrast}.png` in the game-mode mockup directory: **27 real Chromium images**, exactly 1440×1000, 768×1024 or 390×844, with device scale factor 1. Score frames start at the document top; Resolution frames its Scoundrel XP card, with scroll positions recorded.
No horizontal overflow was found. Controlled internal vertical scrolling is intentional, not clipped inaccessible content. Native click/Enter/Space/Escape, focus containment/return and pointer-drag checks pass all six compact size/theme cases; touchscreen pull-up/dismiss checks pass at both compact widths. The local Resolution preview awards 4 XP then zeros the three session counters, retaining permanent XP.

Independent review initially found three material issues: compact modal focus containment, an oversized desktop rail, and full-page captures misrepresenting fixed footers. One correction batch and complete viewport-only recapture resolved all three. Final independent disposition: **SHIP**. The single static detector had no findings but ran degraded regex fallback; no computed-contrast result is claimed.

Evidence: `xp-tracker-browser-evidence.json`, `xp-tracker-interaction-evidence.json`, `xp-tracker-touch-evidence.json` and `xp-tracker-review.json` beside the mockups. Vocs build and mirror delivery are reported from actual command output.

Final record gates pass: Vocs **153 files generated**; metrics **176 files / 0 errors**;
traceability **231/231**, reconciliation **17/17**. Pending main was pushed first:
origin was already at `b78d77dd`; Radicle advanced `6a168425 → b78d77dd` and
synced with **3 seeds** before this design card's publication.
