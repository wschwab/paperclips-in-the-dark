---
id: F2n
title: "Character sheet: Health section (harm, armor, healing clock)"
deps: [F2m]
track: frontend
outputs:
  - client methods + red-green tests for harmAdd, harmHeal, harmRemove, harmHealingClock, armorSet
  - character-detail.ts Health section per f2-sheet-plan.mdx (harm table listing current harms by intensity with descriptions, add-harm control with intensity + custom description, armor checkboxes, healing project clock with add-segment button, heal button)
  - page tests (happy-dom)
  - docs/pages/frontend/f2n-health.mdx
acceptance:
  - "client tests red-first then green per method; verified by grep"
  - "harm table + clock reuse styleguide idioms; clock size from DTO (RecoveryClockSize-derived), no hardcoded maxima"
  - "npm test -- --run and npm run build green"
  - "live Ada probe (orchestrator): harm add incl. spillover ladder visible, heal via clock fill, armor toggle, revision advance throughout"
  - "docs page present and accurate"
---

Per docs/pages/frontend/f2-sheet-plan.mdx. Contract semantics worth care:
harm spillover (a lesser harm can land higher when slots are full —
`landedIntensity` in applied), healing clock fill heals per §5.1 semantics.
Check each op's request body in the frozen openapi.yaml.

## Log
- 2026-07-29: dispatched to DeepSeek v4 Pro (pi, opencode-go). Prompt:
  tasks/dispatch/F2n-prompt.md.
- 2026-08-07: prior session (Fable 5) died at spend limit mid-slice; recovery in
  prime-agent session. deepseek-v4-flash-0731 child fixed the TS6133 build break
  and wrote docs/pages/frontend/f2n-health.mdx; orchestrator verified 123/123
  tests + build green by rerun. Live Ada probe: harm.add incl. spillover ladder
  (lesser→moderate observed, landedIntensity correct), harm.remove, armor
  ARMOR_NOT_AVAILABLE, revision advance — all good. BUT harm.heal +
  harm.healing-clock are unimplemented server-side, and a failed op wedges the
  entity via a Revision_Gate leak → filed tasks/A5-ada-harm-heal-revision-gate.md.
  Frontend slice accepted; heal-path live acceptance deferred to A5.
