import { defineConfig } from 'vocs/config'

export default defineConfig({
  title: 'Paperclips in the Dark',
  description:
    'Design records and documentation for Paperclips in the Dark — an agent-first campaign sheet manager for Blades in the Dark.',
  rootDir: '.',
  srcDir: '.',
  outDir: 'dist',
  renderStrategy: 'full-static',
  codeHighlight: {
    // Track Z snippets are written in the Zero language, which Shiki doesn't ship; its syntax is Rust-like.
    langAlias: { zero: 'rust' },
  },
  sidebar: [
    {
      text: 'Overview',
      items: [
        { text: 'Introduction', link: '/' },
        { text: 'Roadmap', link: '/roadmap' },
      ],
    },
    {
      text: 'Proposals and open questions',
      items: [
        { text: 'Game mode proposal', link: '/contract/game-mode-proposal' },
        { text: 'Cohort bounds (open issue)', link: '/contract/open-issue-cohort-bounds' },
        { text: 'Repair reference policy', link: '/contract/repair-reference-policy' },
        { text: 'Spec change draft', link: '/contract/spec-change-draft' },
      ],
    },
    {
      text: 'Contract changes',
      items: [
        { text: 'C1 — PC creation', link: '/contract/contract-c1-pc-creation' },
        { text: 'C2 — Vice and stress', link: '/contract/contract-c2-vice-stress' },
        { text: 'C3 — Corrections', link: '/contract/contract-c3-corrections' },
        { text: 'C3 — Crew contacts and factions', link: '/contract/c3-crew-contacts-factions' },
        { text: 'C4 — Crew progression', link: '/contract/contract-c4-crew-progression' },
        { text: 'C4 — Playtest contract changes', link: '/contract/c4-playtest-contract' },
        { text: 'C5 — Character contacts', link: '/contract/contract-c5-character-contacts' },
      ],
    },
    {
      text: 'Contract reviews',
      items: [
        { text: 'Completeness and lifecycle review', link: '/contract/completeness-and-lifecycle-review' },
        { text: 'Operations audit (C0)', link: '/contract/ops-audit' },
        { text: 'Spec change work specification', link: '/contract/spec-change-work-spec' },
        { text: 'Stored-read performance', link: '/contract/stored-read-performance' },
        {
          text: 'Wave 0 audits',
          collapsed: true,
          items: [
            { text: 'Canonicalization matrix', link: '/contract/wave0/canonicalization-matrix' },
            { text: 'Clock taxonomy', link: '/contract/wave0/clock-taxonomy' },
            { text: 'Completeness audit', link: '/contract/wave0/completeness-audit' },
            { text: 'Finding traceability', link: '/contract/wave0/finding-traceability' },
            { text: 'Lifecycle matrix', link: '/contract/wave0/lifecycle-matrix' },
            { text: 'Limit inventory', link: '/contract/wave0/limit-inventory' },
            { text: 'Validator spike', link: '/contract/wave0/validator-spike' },
          ],
        },
      ],
    },
    {
      text: 'Gates and conformance',
      items: [
        { text: 'Gate evidence', link: '/contract/gate-evidence' },
        { text: 'Final verdict', link: '/contract/gate-evidence/final-verdict' },
        { text: 'Wave 7 craft verdict', link: '/contract/gate-evidence/wave7-craft-verdict' },
        { text: 'Conformance report JSON', link: '/conformance/report-json' },
      ],
    },
    {
      text: 'Frontend',
      items: [
        { text: 'F0 — Framework decision', link: '/frontend/f0-framework-decision' },
        { text: 'F1 — Style guide', link: '/frontend/f1-styleguide' },
        { text: 'F2 — Sheet plan', link: '/frontend/f2-sheet-plan' },
        { text: 'Operational behavior', link: '/frontend/operational-behavior' },
        { text: 'Roster recovery and import', link: '/frontend/recovery-import' },
        {
          text: 'Pages and flows',
          collapsed: true,
          items: [
            { text: 'F2a — Roster', link: '/frontend/f2a-roster' },
            { text: 'F2b — Character detail', link: '/frontend/f2b-character-detail' },
            { text: 'F2c — Crew detail', link: '/frontend/f2c-crew-detail' },
            { text: 'F2d — Character history', link: '/frontend/f2d-character-history' },
            { text: 'F2e — Character creation', link: '/frontend/f2e-character-creation' },
            { text: 'F2f — Crew creation', link: '/frontend/f2f-crew-creation' },
            { text: 'F2g — Stress add', link: '/frontend/f2g-stress-add' },
            { text: 'F2h — Stale revision recovery', link: '/frontend/f2h-stale-revision-recovery' },
            { text: 'F2i — Character undo', link: '/frontend/f2i-character-undo' },
            { text: 'F2j — Crew undo', link: '/frontend/f2j-crew-undo' },
            { text: 'F2k — Crew history', link: '/frontend/f2k-crew-history' },
            { text: 'F2l — DOM test environment', link: '/frontend/f2l-dom-test-env' },
          ],
        },
        {
          text: 'Character sheet',
          collapsed: true,
          items: [
            { text: 'F2m — Personal, stress, trauma', link: '/frontend/f2m-personal-stress-trauma' },
            { text: 'F2n — Health', link: '/frontend/f2n-health' },
            { text: 'F2o — Talents and XP', link: '/frontend/f2o-talents-xp' },
            { text: 'F2p — Playbook abilities', link: '/frontend/f2p-playbook-abilities' },
            { text: 'F2r — Gear and loadout', link: '/frontend/f2r-gear-loadout' },
            { text: 'F2s — Coin and projects', link: '/frontend/f2s-coin-projects' },
            { text: 'F2ab — Playtest features', link: '/frontend/f2ab-character-sheet-features' },
          ],
        },
        {
          text: 'Crew sheet',
          collapsed: true,
          items: [
            { text: 'F2u — Profile and trackers', link: '/frontend/f2u-crew-profile-trackers' },
            { text: 'F2v — Abilities and upgrades', link: '/frontend/f2v-crew-playbook-upgrades' },
            { text: 'F2w — Cohorts', link: '/frontend/f2w-cohorts' },
            { text: 'F2x — Crew XP', link: '/frontend/f2x-crew-xp' },
            { text: 'F2y — Contacts and factions', link: '/frontend/f2y-crew-contacts-factions' },
            { text: 'F2ac — Playtest features', link: '/frontend/f2ac-crew-sheet-features' },
          ],
        },
        { text: 'F2z — Layout', link: '/frontend/f2z-layout' },
        { text: 'F2aa — Playtest round 1 bugs', link: '/frontend/f2aa-frontend-bugs' },
      ],
    },
    {
      text: 'Backend (Ada)',
      items: [
        { text: 'A3 — Launch paths', link: '/ada/a3-launch-paths' },
        { text: 'Accepted-socket investigation', link: '/ada/socket-investigation' },
      ],
    },
    {
      text: 'Track Z (Zero)',
      collapsed: true,
      items: [
        { text: 'Z0 — Go / no-go', link: '/zero/z0-go-no-go' },
        { text: 'Z2 — Notes', link: '/zero/z2-notes' },
        { text: 'Z4 — Halted, expected red', link: '/zero/z4-halted-expected-red' },
      ],
    },
    {
      text: 'Backlog',
      items: [{ text: 'Playtest 2026-10 — Scoundrel', link: '/backlog/playtest-2026-10-scoundrel' }],
    },
    {
      text: 'Orchestration',
      items: [{ text: 'Context economy', link: '/orchestration/context-economy' }],
    },
  ],
})
