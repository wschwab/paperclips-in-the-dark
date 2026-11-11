 # CREW-SHEET-02 — Crew setup and upgrade reference
 
 ## Authorized scope
 
 Surface favored operations separately from hunting-ground location; support Smugglers' free-text cargo; apply type-specific starting upgrades to newly created crews; verify vehicles against official rules; keep stock crew contacts out of public game data while supporting private restoration; expose every upgrade description without hover. Note editing is intentionally unchanged.
 
 Extended by the user's 2026-11-11 report (`~/Documents/otto/fable-bitd/reports/paperclips-bugs-2026-11-11.md`, items 2, 3 and 4): the crew game data itself did not match the official v8.2 crew sheets, and the creation defaults were literals in the server instead of game settings. Items 1 (test-tooling port), 5, 6 and 7 of that report belong to other cards.
 
 ## Contract before / after
 
 - Before: `huntingGrounds` is the only related profile value. No independent favored-operation field or mutation.
 - After: optional `favoredOperation: string`; dedicated snapshot-worthy `favored-operation.set` with `{value:string}` and normal revision checking. Blank clears the choice. Legacy documents remain readable without the field; write normalization supplies its empty default, and no existing crew is automatically awarded starting upgrades.
 - Before: per-type starting-upgrade data is not applied when a crew is created; the crew's starting hold (`weak`) and coin (`0`) and the scoundrel's starting satchel (`2`) are Ada literals in `pitd_ops.adb`.
 - After: optional `StartingUpgrades: {Name, BoxesMarked}[]` in type settings drives initial owned upgrade marks. Numeric box counts derive from game data. Favored-operation labels/options/free-text flag and optional stock `Contacts` are also settings data. `CrewStartingHold` (`"strong"`), `CrewStartingCoin` (`2`) and `StartingSatchelCoins` (`0`) come from `data/games/blades-in-the-dark.json`; a game that omits them falls back to the structural defaults hold `strong`, coin `0`, satchel `0`.
 - Before: the six crew types carried wrong abilities (Smugglers' list held lair and crew upgrades), no per-type crew upgrades, no Veteran, generic favored-operation options, and the type name `Cultists`.
 - After: each type's abilities are the sheet's seven plus `Veteran`; each type carries its five crew-specific upgrades; hunting-ground options and the Smugglers cargo types match the sheets; the type is named `Cult` with `LegacyNames: ["Cultists"]`.
 - Contact storage and add/remove operations are unchanged. Public `Contacts` settings stay empty; private restoration fills the same optional settings field. The custom name/profession inputs always remain available.
 - Legacy migration: `LegacyNames`, `LegacyAbilityNames`, `LegacyUpgradeNames` and `LegacyFavoredOperations` per type. A stored legacy crew-type name resolves on read (per-type settings endpoint, capability catalog, frontend menus) and is rewritten to the canonical name on the next write; stored ability/upgrade/operation names are retained verbatim and resolve to their canonical catalog entry for box totals, take limits, descriptions and capability counts. Names with no catalog counterpart keep their own row and stay operable. Legacy catalog entries (`Training`, `Boat House`, `Carriage House`, `Vice Den`, the `Quality:` rows) are retained and labelled as legacy.
 
 ## Implementation
 
 The profile keeps hunting-ground location and favored operation/cargo separate. Existing profile save/cancel/error draft behavior is reused: a fixed native select for types whose options are a menu, and a text input with a datalist of suggestions for `FavoredOperationFreeText` types (Smugglers). A legacy saved choice outside the menu remains visible and editable rather than disappearing.
 
 Starting-upgrade reference text identifies the creation defaults without retroactively changing existing crews. Every lair-chart upgrade row includes its description in normal reading order, including unowned upgrades. A restored setting-contact picker fills both custom-entry drafts; it does not silently create contacts.
 
 ## Rules and private content
 
 See [Crew sheet](/frontend/crew-sheet) for the per-type verified lists, official-kit/sheet citations, the premarked-box readings, the starting-value settings and the vehicle findings, and [Setting content register](/contract/setting-content-register) for the exact private contact restoration list.
 
 Vehicle finding: the user is right that a vehicle belongs on the Smugglers sheet. The official Smugglers sheet has **two independent two-box Vehicle rows**, the first box of the first row premarked, and its five crew upgrades are Smuggler's rigging, Camouflage, Elite Rovers, Barge and Steady — not Boat House or Carriage House, which are the general facility upgrades (SRD "Crew upgrade Examples"). Boat House and Carriage House remain available as general upgrades and as legacy names. Vehicle-cohort conversion is the `Like Part of the Family` ability; an ordinary vehicle mark does not create a cohort.
 
 Reference implementation (read-only `blades-in-the-sheets/Models/`): `Crew`'s constructor sets `Hold = CrewHold.Strong` and has no `Coin` initializer (so 0), and `FundSatchel` starts at 0 coins. The reference therefore already starts a crew at strong hold and a scoundrel with an empty satchel; the old Paperclips literals (weak hold, 2 satchel coin) matched neither, and the reference does not implement the SRD's 2 starting crew coin either.
 
 ## Red-first evidence
 
 - Focused `frontend/src/pages/crew-sheet.test.ts` initial run: 6 tests, 5 expected failures and 1 public-custom-only pass (missing favored operation, missing type-choice editor, missing cargo text entry, hidden unowned-upgrade descriptions, absent private contact suggestions). Raw output: session artifact `artifact://14218`.
 - Backend `suites/semantics/crew-sheet.test.ts` against the pre-change executable: 4 failures / 1 pass (default, favored-operation mutation, starting marks, legacy import). The final suite has 12 cases, extended by the settings and legacy-migration cases whose red run was 5 failures / 7 passes.
 - Native settings tests: 9/9 failing against the old data and schema; after the sheet-verified rewrite, 26/26 green.
 - The verified-data rewrite's own red run failed on exactly the missing `FavoredOperationFreeText` flag and the schema rejecting it.
 - Cargo free-text test added before the frontend flag logic: red (1 failed / 14 passed), then green.
 - The settings-driven defaults made 8 pre-existing conformance assertions fail (they encoded weak/0/2); all eight were rewritten to derive from the created entity. One further case (`SEMANTICS-FUND-002`) still assumed a funded satchel and was made self-funding.
 
 ## Acceptance evidence
 
 Recorded in `tasks/metrics/frontend/CREW-SHEET-02.json` and independent verdict `tasks/metrics/frontend/CREW-SHEET-02-sol-verdict.txt`. Repeatable Chromium matrix: `conformance/scripts/crew-sheet-evidence.mjs`, run exclusively through the managed browser launcher; screenshots/numeric evidence under `docs/public/evidence/crew-sheet-02/`.
+
+## Review gate status
+
+Round 1 independent review (`openai-codex/gpt-6.1-sol`, xhigh) at `4ee19f6b` returned **FAIL** with seven findings: P1 legacy-alias identity corruption in the mark/take paths, and P2 findings for the Veteran one-take limit, the Ironhook Contacts wording, out-of-range settings numbers returning 500, the unsourced Vehicle second-box rule, the numeric evidence record missing editing-state measurements, and a stock contact name left in fixture files.
+
+All seven were fixed red-first (each with its own failing case first) and every requested gate was rerun green at `f0d8a18d`: frontend 1068/1068 with tsc and build; managed Ada two-cycle 699 passed / 1 skipped per cycle; managed browser suite 6/6 journeys; Chromium matrix 18/18 with both reading-state and editing-state numeric records; native data tests 27/27; docs build; the three audit validators; mutation campaign 28/28 (P0 19/19, P1 9/9).
+
+The required repeat review by the same model, provider and effort could not run: `openai-codex` returned `usage_limit_reached` (HTTP 429, retry-after ≈ 9.6 days) on the round-2 attempt. `tasks/metrics/frontend/CREW-SHEET-02-sol-verdict.txt` therefore still holds the round-1 FAIL, and the card is **not complete** until a same-model PASS verdict replaces it after the provider's reset.
