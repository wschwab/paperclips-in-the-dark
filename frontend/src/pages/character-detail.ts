import { Effect } from "effect";
import {
  ApiError,
  OpError,
  DecodeError,
  opErrorFriendlyText,
  transportErrorText,
  decodeErrorText,
  getCharacter,
  getGame,
  getPlaybook,
  getCharacterCapabilities,
  stressAdd,
  stressClear,
  traumaAdd,
  traumaRemove,
  dossierUpdate,
  undoCharacter,
  endScore,
  endDowntime,
  retireCharacter,
  deleteCharacter,
  StaleRevisionError,
  harmAdd,
  harmHeal,
  harmRemove,
  harmHealingClock,
  armorSet,
  actionSetRating,
  attributeXpAdd,
  attributeXpClear,
  attributeLevelup,
  sessionSet,
  playbookXpAdd,
  playbookXpClear,
  abilityTake,
  abilityRemove,
  gearAdd,
  gearRemove,
  gearCommit,
  gearUncommit,
  gearLock,
  gearUnlock,
  gearSetCommitment,
  gearClearCommitments,
  fundGain,
  fundSpend,
  fundLiquidate,
  listClocks,
  getClock,
  createClock,
  clockProgress,
  clockReset,
  deleteClock,
  noteAdd,
  noteRemove,
  notebookSet,
  listCrews,
  type SessionFields,
  type FundOpResult,
} from "../api/client.js";
import type { CharacterCapabilities } from "../api/client.js";
import { stressTrack } from "../components/stress-track.js";
import { actionDots } from "../components/action-dots.js";
import { clock } from "../components/clock.js";
import { harmTable } from "../components/harm-table.js";
import type { HarmLevel } from "../components/harm-table.js";
import { traumaStamps } from "../components/trauma-stamps.js";
import { el, setChildren } from "../lib/dom.js";
import { captureFocusTarget, applyFocusTarget, type FocusTarget } from "../lib/focus.js";
import { completionCues, type CompletionCue } from "../lib/completion-cues.js";
import { errorCard } from "../components/error-card.js";
import type { Character } from "../schema/character.js";
import type { CrewSummary } from "../schema/campaign.js";
import type { Clock, ClockSummary } from "../schema/clock.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DossierField = "name" | "alias" | "look" | "notes" |
  { kind: "named"; key: "background" | "heritage" | "vice"; field: "name" | "description" };

interface EditingState {
  field: DossierField;
  value: string;
}

/**
 * F2ab: editor state for the game-data dropdowns (heritage / background /
 * vice). `option` is the selected game-data option name, or "__custom__" for
 * the Custom… entry ("" when the current value matches nothing and the
 * editor opened on the custom branch). customName/description carry the
 * free-text values; purveyor fields apply to vice only.
 */
interface NamedEditorState {
  key: "heritage" | "background" | "vice";
  option: string;
  customName: string;
  customDesc: string;
  purveyorName: string;
  purveyorDesc: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getNamedValue(c: Character, key: "background" | "heritage" | "vice", field: "name" | "description"): string {
  return c.dossier[key][field];
}

function getDossierValue(c: Character, field: DossierField): string {
  if (typeof field === "string") {
    const v = c.dossier[field];
    // notes is string[] per C4 (legacy single string still decodes)
    if (typeof v === "string") return v;
    return v.join(", ");
  }
  return getNamedValue(c, field.key, field.field);
}

function buildDossierPayload(field: DossierField, value: string): Record<string, unknown> {
  if (typeof field === "string") return { [field]: value };
  // For named fields, send the full named object with the changed field
  return { [field.key]: { name: field.field === "name" ? value : "", description: field.field === "description" ? value : "" } };
}

/**
 * Playbook-specific Score XP text: the playbook's ExperienceCondition,
 * from the playbook endpoint response or (fallback) the game-data Playbooks
 * list. Returns null when neither source has it (graceful degradation).
 */
function extractExperienceCondition(
  playbookData: Record<string, unknown> | null,
  gameData: Record<string, unknown> | null,
  playbookName: string,
): string | null {
  if (playbookData && typeof playbookData.ExperienceCondition === "string") {
    return playbookData.ExperienceCondition;
  }
  if (Array.isArray(gameData?.Playbooks)) {
    const found = (gameData!.Playbooks as Array<Record<string, unknown>>).find(
      (p) => p && typeof p === "object" && p.Name === playbookName,
    );
    if (found && typeof found.ExperienceCondition === "string") {
      return found.ExperienceCondition;
    }
  }
  return null;
}

/**
 * Playbook SpecialAbilities for the character's playbook: from the playbook
 * endpoint response or (fallback) the game-data Playbooks list. Each entry
 * carries { Name, Description, TimesTakeable }. Returns [] when neither
 * source has it (graceful degradation).
 */
function extractSpecialAbilities(
  playbookData: Record<string, unknown> | null,
  gameData: Record<string, unknown> | null,
  playbookName: string,
): Array<Record<string, unknown>> {
  if (playbookData && Array.isArray(playbookData.SpecialAbilities)) {
    return playbookData.SpecialAbilities as Array<Record<string, unknown>>;
  }
  if (Array.isArray(gameData?.Playbooks)) {
    const found = (gameData!.Playbooks as Array<Record<string, unknown>>).find(
      (p) => p && typeof p === "object" && p.Name === playbookName,
    );
    if (found && Array.isArray(found.SpecialAbilities)) {
      return found.SpecialAbilities as Array<Record<string, unknown>>;
    }
  }
  return [];
}

/** Game-data option lists for the heritage / background / vice dropdowns. */
function gameDataOptions(
  gameData: Record<string, unknown> | null,
  key: "heritage" | "background" | "vice",
): Array<Record<string, unknown>> {
  if (!gameData) return [];
  const list = key === "heritage"
    ? gameData.Heritages
    : key === "background"
      ? gameData.Backgrounds
      : gameData.Vices;
  if (!Array.isArray(list)) return [];
  return list.filter((x) => x && typeof x === "object") as Array<Record<string, unknown>>;
}

/** Game-data description for a named option (heritage Description / background Example). */
function gameDataDescription(
  gameData: Record<string, unknown> | null,
  key: "heritage" | "background",
  name: string,
): string | null {
  const entry = gameDataOptions(gameData, key).find((o) => o.Name === name);
  if (!entry) return null;
  const desc = key === "heritage" ? entry.Description : entry.Example;
  return typeof desc === "string" ? desc : null;
}

/** Sources (purveyor strings) for a vice name, from game data Vices[].Sources. */
function viceSources(
  gameData: Record<string, unknown> | null,
  viceName: string,
): string[] {
  const entry = gameDataOptions(gameData, "vice").find((o) => o.Name === viceName);
  const sources = entry?.Sources;
  if (!Array.isArray(sources)) return [];
  return sources.filter((x): x is string => typeof x === "string");
}

/** Currently active harms flattened to { intensity, description } pairs (F2ab heal picker). */
function activeHarms(c: Character): Array<{ intensity: string; description: string }> {
  const out: Array<{ intensity: string; description: string }> = [];
  for (const level of ["lesser", "moderate", "severe", "fatal"] as const) {
    for (const desc of c.monitor.harm[level]) {
      if (desc) out.push({ intensity: level, description: desc });
    }
  }
  return out;
}

/**
 * Display description for a taken ability: prefer the DTO's stored
 * description, fall back to the game-data SpecialAbilities entry, and
 * degrade to "" when neither is available.
 */
function abilityDescription(
  ability: { name: string; description: string },
  specialAbilities: Array<Record<string, unknown>>,
): string {
  if (ability.description) return ability.description;
  const sa = specialAbilities.find((x) => String(x.Name) === ability.name);
  return sa && typeof sa.Description === "string" ? sa.Description : "";
}

/** Friendly text for heal op-level errors (CANNOT_HEAL / NOT_FOUND). */
function healOpErrorText(err: OpError): string {
  if (err.error.code === "CANNOT_HEAL") {
    return "Cannot heal — the healing clock isn't full yet";
  }
  if (err.error.code === "NOT_FOUND") {
    return "That harm is no longer there — the sheet refreshes with the server state";
  }
  return opErrorFriendlyText(err);
}

/** Friendly text for playbook op-level errors (ABILITY_MAXED / NOT_FOUND). */
function playbookOpErrorText(err: OpError): string {
  if (err.error.code === "ABILITY_MAXED") {
    return "That ability is already taken to its limit";
  }
  if (err.error.code === "NOT_FOUND") {
    return "Not on this sheet (removed elsewhere?)";
  }
  return opErrorFriendlyText(err);
}

/**
 * F4/FV-028: name the "restored state" after a successful undo by diffing the
 * character before vs after. Picks the most salient changed value so the
 * positive undo notice is concrete rather than a generic "undone". Falls back
 * to a neutral phrase when nothing tracked changed shape.
 */
function describeRestore(before: Character, after: Character): string {
  if (before.isRetired !== after.isRetired) {
    return after.isRetired ? "the retirement" : "the character (un-retired)";
  }
  if (before.dossier.name !== after.dossier.name) {
    return `the name "${after.dossier.name || "Unnamed"}"`;
  }
  if (before.monitor.stress.current !== after.monitor.stress.current) {
    return `stress to ${after.monitor.stress.current}/${after.monitor.stress.max}`;
  }
  const beforeHarm = before.monitor.harm.lesser.length + before.monitor.harm.moderate.length +
    before.monitor.harm.severe.length + before.monitor.harm.fatal.length;
  const afterHarm = after.monitor.harm.lesser.length + after.monitor.harm.moderate.length +
    after.monitor.harm.severe.length + after.monitor.harm.fatal.length;
  if (beforeHarm !== afterHarm) {
    return `${afterHarm} active harm${afterHarm === 1 ? "" : "s"}`;
  }
  if (before.monitor.trauma.traumas.length !== after.monitor.trauma.traumas.length) {
    return `${after.monitor.trauma.traumas.length} trauma history entr${after.monitor.trauma.traumas.length === 1 ? "y" : "ies"}`;
  }
  return "the previous state";
}

/** One entry of the gear add-menu (playbook Items + game SharedItems). */
interface GearMenuItem {
  name: string;
  bulk: number;
}

/**
 * Gear add-menu source: the playbook's Items plus the game's SharedItems,
 * deduped by name (playbook wins on duplicates). Both come from game data —
 * never a hardcoded list. Falls back to the game-data Playbooks entry when
 * the playbook endpoint fetch failed (graceful degradation, like F2o/F2p).
 */
function extractGearMenu(
  playbookData: Record<string, unknown> | null,
  gameData: Record<string, unknown> | null,
  playbookName: string,
): GearMenuItem[] {
  const byName = new Map<string, number>();
  const collect = (items: unknown) => {
    if (!Array.isArray(items)) return;
    for (const entry of items) {
      if (entry && typeof entry === "object" && typeof (entry as Record<string, unknown>).Name === "string") {
        const name = String((entry as Record<string, unknown>).Name);
        const bulk = typeof (entry as Record<string, unknown>).Bulk === "number"
          ? (entry as Record<string, unknown>).Bulk as number
          : 0;
        if (!byName.has(name)) byName.set(name, bulk);
      }
    }
  };
  let playbookItems: unknown = null;
  if (playbookData && Array.isArray(playbookData.Items)) {
    playbookItems = playbookData.Items;
  } else if (Array.isArray(gameData?.Playbooks)) {
    const found = (gameData!.Playbooks as Array<Record<string, unknown>>).find(
      (p) => p && typeof p === "object" && p.Name === playbookName,
    );
    if (found && Array.isArray(found.Items)) playbookItems = found.Items;
  }
  collect(playbookItems);
  collect(gameData?.SharedItems);
  return Array.from(byName, ([name, bulk]) => ({ name, bulk }));
}

/** Friendly text for gear op-level errors (COMMITMENT_LOCKED / OVER_BULK / …). */
function gearOpErrorText(err: OpError): string {
  if (err.error.code === "COMMITMENT_LOCKED") {
    return "The commitment is locked — unlock it before changing it";
  }
  if (err.error.code === "NO_COMMITMENT") {
    return "Set a load commitment before committing gear";
  }
  if (err.error.code === "OVER_BULK") {
    return "This item would exceed your load capacity";
  }
  if (err.error.code === "DUPLICATE") {
    return "That item is already in your loadout";
  }
  if (err.error.code === "NOT_FOUND") {
    return "Not on this sheet (removed elsewhere?)";
  }
  return opErrorFriendlyText(err);
}

/** Friendly text for fund/stash op-level errors (INSUFFICIENT_FUNDS / SATCHEL_FULL / …). */
function coinOpErrorText(err: OpError): string {
  if (err.error.code === "INSUFFICIENT_FUNDS") {
    return "Not enough coins to cover that (spend draws from the satchel first, then liquidates stash at 2:1)";
  }
  if (err.error.code === "SATCHEL_FULL") {
    return "The satchel can't hold that many coins — spend or stash some first";
  }
  return opErrorFriendlyText(err);
}

/** Friendly text for clock op-level errors (VALIDATION / NOT_FOUND). */
function clockOpErrorText(err: OpError): string {
  if (err.error.code === "NOT_FOUND") {
    return "Clock gone (deleted elsewhere?)";
  }
  return opErrorFriendlyText(err);
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

interface RenderState {
  c: Character;
  gameData: Record<string, unknown> | null;
  playbookData: Record<string, unknown> | null;
  /** Server-computed character capability projection (SC-F3); null until loaded or on fetch failure. */
  caps: CharacterCapabilities | null;
  // Loading flags
  isStressLoading: boolean;
  isStressClearLoading: boolean;
  isTraumaLoading: boolean;
  isDossierLoading: boolean;
  isUndoLoading: boolean;
  isHarmLoading: boolean;
  isArmorLoading: boolean;
  isHealLoading: boolean;
  isClockLoading: boolean;
  // F2o Talents state
  isTalentsLoading: boolean;
  isSessionLoading: boolean;
  clampNotice: string | null;
  experienceCondition: string | null;
  // F2p Playbook state
  isPlaybookLoading: boolean;
  abilityNotice: string | null;
  // F2r Gear state
  isGearLoading: boolean;
  isGearCommitmentLoading: boolean;
  isGearLockLoading: boolean;
  // F2s Coin + Projects state
  clocks: readonly ClockSummary[] | null;
  isCoinLoading: boolean;
  isClocksLoading: boolean;
  coinNotice: string | null;
  clocksNotice: string | null;
  // F2ab state
  crews: readonly CrewSummary[] | null;
  isCrewsLoading: boolean;
  crewNotice: string | null;
  isNotesLoading: boolean;
  notesNotice: string | null;
  isNotebookLoading: boolean;
  notebookNotice: string | null;
  isTraumaPickerLoading: boolean;
  healNotice: string | null;
  // F4 lifecycle state
  isEndScoreLoading: boolean;
  isDowntimeLoading: boolean;
  isRetireLoading: boolean;
  isDeleteLoading: boolean;
  /** Derived undo state from the last operation result (null = unknown before any op). */
  canUndo: boolean | null;
  historyCount: number | null;
  // Error / notice
  errorMsg: string | null;
  noticeMsg: string | null;
  undoNotice: string | null;
  harmSpillNotice: string | null;
  /** CONTRACT-01 stage 3: dismissed completion-cue section keys. */
  dismissedCues: ReadonlySet<string>;
  // Editing
  editing: EditingState | null;
  namedEditor: NamedEditorState | null;
  /** Re-render the page (used by nested editors after DOM-driven state changes). */
  rerender: () => void;
  // Handlers
  handlers: {
    onStressTrack: (next: number) => void;
    onStressDelta: (delta: number) => void;
    onStressClear: () => void;
    onTraumaAdd: () => void;
    onTraumaRemove: (name: string) => void;
    onDossierEdit: (field: DossierField) => void;
    onDossierSave: () => void;
    onDossierCancel: () => void;
    onNamedEdit: (key: "heritage" | "background" | "vice") => void;
    onNamedSave: () => void;
    onNamedCancel: () => void;
    onTraumaFromStress: () => void;
    onNoteAdd: () => void;
    onNoteRemove: (index: number) => void;
    onNotebookSave: () => void;
    onCrewJoin: () => void;
    onCrewLeave: () => void;
    /** Dismiss one completion-cue section (CONTRACT-01 stage 3). */
    onDismissCue: (key: string) => void;
    onUndo: () => void;
    onEndScore: () => void;
    onEndDowntime: () => void;
    onRetire: () => void;
    onDeleteCharacter: () => void;
    onHarmAdd: () => void;
    onHarmRemove: (description: string, intensity: string) => void;
    onHarmHeal: () => void;
    onHarmHealingClock: () => void;
    onArmorSet: (armor: string, used: boolean) => void;
    onActionSetRating: (attribute: string, action: string, next: number) => void;
    onAttributeXpDelta: (attribute: string, delta: number) => void;
    onAttributeXpClear: (attribute: string) => void;
    onAttributeLevelup: (attribute: string) => void;
    onSessionTrack: (field: keyof SessionFields, next: number) => void;
    onSessionDelta: (field: keyof SessionFields, delta: number) => void;
    onPlaybookXpDelta: (delta: number) => void;
    onPlaybookXpClear: () => void;
    onAbilityTake: () => void;
    onAbilityRemove: (name: string) => void;
    onGearAdd: () => void;
    onGearRemove: (name: string) => void;
    onGearCommit: () => void;
    onGearUncommit: () => void;
    onGearSetCommitment: () => void;

    onGearToggleLock: () => void;
    onGearClearCommitments: () => void;
    onFundDelta: (delta: number) => void;
    onFundLiquidate: () => void;
    onCreateClock: () => void;
    onClockProgress: (clockId: string, segments: number) => void;
    onClockReset: (clockId: string) => void;
    onClockDelete: (clockId: string) => void;
  };
}

/**
 * CONTRACT-01 stage 3 — completion-cue panel on the sheet: DTO-derived
 * prompts, visible and non-blocking, dismissible per section. Returns null
 * when nothing is outstanding or every cue was dismissed, so an incomplete
 * character is never blocked from play by this panel.
 */
function renderCompletionCues(
  cues: readonly CompletionCue[],
  dismissed: ReadonlySet<string>,
  onDismiss: (key: string) => void,
): HTMLElement | null {
  const active = cues.filter((cue) => !dismissed.has(cue.key));
  if (active.length === 0) return null;
  const rows = active.map((cue) => {
    const btn = el(
      "button",
      {
        type: "button",
        className: "completion-cue-dismiss",
        title: "Dismiss",
        "aria-label": `Dismiss: ${cue.label}`,
      },
      "×",
    );
    btn.addEventListener("click", () => onDismiss(cue.key));
    return el(
      "p",
      { className: "completion-cue", "data-cue": cue.key },
      el("span", { className: "completion-cue-label" }, cue.label),
      btn,
    );
  });
  return el(
    "div",
    { className: "completion-cues", role: "status", "aria-label": "Completion prompts" },
    el("h2", {}, "Complete your character"),
    ...rows,
  );
}

function renderDetail(state: RenderState): HTMLElement {
  const { c, gameData, playbookData, handlers, editing, namedEditor } = state;
  const status = c.isRetired ? " (retired)" : c.isDeadish ? " (deadish)" : "";
  const traumaList: string[] = Array.isArray(gameData?.Traumas) ? gameData.Traumas as string[] : [];
  const currentTraumas = new Set(c.monitor.trauma.traumas);
  const availableTraumas = traumaList.filter((t) => !currentTraumas.has(t));

  // F4 lifecycle flags (lifecycle-matrix §2): retired (deny-list gated),
  // pending trauma (gameplay/end-score blocked), out-of-action (stress ops
  // blocked). The page must explain each state rather than clear it.
  const retired = c.isRetired;
  const pendingTrauma = !!c.traumaPending;
  const outOfAction = !!c.isOutOfAction;

  const anyLoading = state.isStressLoading || state.isStressClearLoading ||
    state.isTraumaLoading || state.isDossierLoading || state.isUndoLoading ||
    state.isHarmLoading || state.isArmorLoading || state.isHealLoading || state.isClockLoading ||
    state.isTalentsLoading || state.isSessionLoading || state.isPlaybookLoading ||
    state.isGearLoading || state.isGearCommitmentLoading || state.isGearLockLoading ||
    state.isCoinLoading || state.isClocksLoading ||
    state.isCrewsLoading || state.isNotesLoading || state.isNotebookLoading ||
    state.isTraumaPickerLoading || state.isEndScoreLoading || state.isDowntimeLoading ||
    state.isRetireLoading || state.isDeleteLoading;

  // Retired: every gameplay mutation is on the deny-list (→ RETIRED); the
  // allow-list (dossier/notes/notebook/trauma.remove/undo/delete/reads) stays
  // enabled. stressDisabled layers the pending / out-of-action gates on top
  // (stress.add + Indulge Vice are the ops those flags block).
  const gameplayDisabled = anyLoading || retired;
  const stressDisabled = anyLoading || retired || pendingTrauma || outOfAction;
  // End-score is the only sanctioned release from out-of-action, so its title
  // explains the inherent stress clear + flag resets (lifecycle-matrix §4).
  const endScoreTitle = pendingTrauma
    ? "Resolve the pending trauma before ending the score"
    : "End the score — clears stress and takes the character out of action";

  // SC-F3: derived limits come from the server-computed capability projection
  // (effective action caps, harm capacities, load limits) — the client never
  // joins settings + cross-entity state to find an enforced cap. Gracefully
  // fall back to the raw DTO values when the projection is unavailable.
  const effCapByName = new Map(
    (state.caps?.effectiveActionCaps ?? []).map((cap) => [cap.action, cap]),
  );
  const harmCapByLevel = new Map(
    (state.caps?.harmCapacities ?? []).map((h) => [h.level, h]),
  );
  const loadLimitByCommitment = new Map(
    (state.caps?.loadLimits ?? []).map((l) => [l.commitment, l]),
  );

  // -- Stress track ---------------------------------------------------------

  const stressTrackEl = stressTrack({
    value: c.monitor.stress.current,
    max: c.monitor.stress.max,
    onChange: handlers.onStressTrack,
  });

  const stressMinusBtn = el("button", {
    type: "button",
    disabled: stressDisabled || c.monitor.stress.current <= 0,
    title: "Remove 1 stress",
  }, "−");
  stressMinusBtn.addEventListener("click", () => handlers.onStressDelta(-1));

  const stressPlusBtn = el("button", {
    type: "button",
    disabled: stressDisabled,
    title: "Add 1 stress",
  }, state.isStressLoading ? "…" : "+1");
  stressPlusBtn.addEventListener("click", () => handlers.onStressDelta(1));

  // -- Trauma list ----------------------------------------------------------
  // Routed through the shared component (Design Audit F-05) so the sheet and
  // styleguide render identically. Remove controls are clerical-error
  // corrections, not the healing path.
  const traumaListEl = traumaStamps({
    items: c.monitor.trauma.traumas,
    stamped: c.monitor.trauma.traumas,
    disabled: anyLoading,
    onRemove: (name) => handlers.onTraumaRemove(name),
  });

  const traumaSelect = el("select", { "aria-label": "Add trauma", disabled: gameplayDisabled || !pendingTrauma || availableTraumas.length === 0 },
    el("option", { value: "" }, "--"),
    ...availableTraumas.map((t) => el("option", { value: t }, t)),
  );

  const traumaAddBtn = el("button", {
    type: "button",
    disabled: gameplayDisabled || !pendingTrauma || availableTraumas.length === 0,
    title: "Resolve pending trauma",
  }, state.isTraumaLoading ? "…" : "+");
  traumaAddBtn.addEventListener("click", () => {
    const sel = traumaSelect as HTMLSelectElement;
    if (sel.value) {
      // Store the selected value; the handler will read it
      (traumaAddBtn as HTMLElement & { _selectedTrauma?: string })._selectedTrauma = sel.value;
      handlers.onTraumaAdd();
    }
  });

  // -- Vice section ---------------------------------------------------------

  const indulgeBtn = el("button", {
    type: "button",
    disabled: stressDisabled || c.monitor.stress.current === 0,
    title: "Clear all stress (Indulge Vice)",
  }, state.isStressClearLoading ? "…" : "Indulge Vice");
  indulgeBtn.addEventListener("click", handlers.onStressClear);

  // -- Undo button ----------------------------------------------------------
  // Lifecycle-recovery is on the retired allow-list; the button reflects the
  // server-derived canUndo state when an operation has reported it (untouched
  // on first load, where GET detail carries no projection).
  const undoBtn = el("button", {
    type: "button",
    disabled: anyLoading || state.canUndo === false,
    title: "Undo last change",
  }, state.isUndoLoading ? "…" : "Undo last change");
  undoBtn.addEventListener("click", handlers.onUndo);

  // -- Personal section -----------------------------------------------------

  function renderField(label: string, field: DossierField, displayValue: string) {
    const isEditing = editing !== null &&
      (typeof field === "string" ? editing.field === field : false);
    // For named fields, compare key
    const isNamedEditing = editing !== null && typeof field !== "string" &&
      typeof editing.field !== "string" &&
      editing.field.key === field.key;
    const isThisEditing = isEditing || isNamedEditing;

    const editBtn = el("button", {
      type: "button",
      disabled: anyLoading || editing !== null,
      title: `Edit ${label}`,
    }, "✎");

    if (isThisEditing) {
      const input = el("input", {
        type: "text",
        value: editing!.value,
        "aria-label": label,
      }) as HTMLInputElement;
      // F2aa: keep the typed text in the editing state, and let ENTER save /
      // ESC cancel without a form-submit reload. TAB flows naturally through
      // input → ✓ → ✕ in document order (no form wrapper to trap it).
      input.addEventListener("input", () => {
        editing!.value = input.value;
      });
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          handlers.onDossierSave();
        } else if (ev.key === "Escape") {
          ev.preventDefault();
          handlers.onDossierCancel();
        }
      });

      const saveBtn = el("button", { type: "button", title: "Save" }, "✓");
      saveBtn.addEventListener("click", handlers.onDossierSave);
      const cancelBtn = el("button", { type: "button", title: "Cancel" }, "✕");
      cancelBtn.addEventListener("click", handlers.onDossierCancel);

      return el("div", {
        className: "field-editing",
        "data-focus-key": `dossier-${typeof field === "string" ? field : field.key}`,
        style: "display: flex; gap: 0.5em; align-items: center;",
      },
        el("span", { className: "lbl" }, `${label}: `),
        input,
        saveBtn,
        cancelBtn,
      );
    }

    editBtn.addEventListener("click", () => handlers.onDossierEdit(field));

    return el("div", {
      className: "field-read",
      "data-focus-key": `dossier-${typeof field === "string" ? field : field.key}`,
      style: "display: flex; gap: 0.5em; align-items: center;",
    },
      el("span", { className: "lbl" }, `${label}: `),
      el("span", {}, displayValue || "(not set)"),
      editBtn,
    );
  }

  /**
   * F2ab: heritage / background rendered as a game-data dropdown. Read mode
   * shows the name plus the game-data description (heritage Description,
   * background Example) when the name matches; edit mode offers the options
   * plus a "Custom…" branch with a free-text name.
   */
  function renderNamedField(label: string, key: "heritage" | "background") {
    const name = c.dossier[key].name;
    const dtoDesc = c.dossier[key].description;
    const gameDesc = gameDataDescription(gameData, key, name);
    const desc = gameDesc ?? dtoDesc;
    const isEditing = namedEditor?.key === key;

    if (isEditing) {
      const editor = namedEditor!;
      const optionNames = gameDataOptions(gameData, key).map((o) => String(o.Name));
      const isCustom = editor.option === "__custom__" || !optionNames.includes(editor.option);
      const select = el("select", {
        "aria-label": `${label} (choose)`,
        disabled: anyLoading,
      },
        ...optionNames.map((n) => el("option", { value: n }, n)),
        el("option", { value: "__custom__" }, "Custom…"),
      ) as HTMLSelectElement;
      select.value = isCustom ? "__custom__" : editor.option;
      select.addEventListener("change", () => {
        editor.option = select.value;
        state.rerender();
      });

      const customInput = el("input", {
        type: "text",
        "aria-label": `${label} custom name`,
        value: editor.customName,
      }) as HTMLInputElement;
      customInput.addEventListener("input", () => {
        editor.customName = customInput.value;
      });

      const saveBtn = el("button", { type: "button", title: "Save" }, "✓");
      saveBtn.addEventListener("click", handlers.onNamedSave);
      const cancelBtn = el("button", { type: "button", title: "Cancel" }, "✕");
      cancelBtn.addEventListener("click", handlers.onNamedCancel);

      const hint = isCustom
        ? el("span", { className: "serif", style: "font-size: 0.9em;" },
            "Custom — saved without a game description")
        : gameDesc
          ? el("span", { className: "serif", style: "font-size: 0.9em;" }, gameDesc)
          : null;

      return el("div", {
        className: "field-editing",
        "data-focus-key": `named-${key}`,
        style: "display: flex; gap: 0.5em; align-items: center; flex-wrap: wrap;",
      },
        el("span", { className: "lbl" }, `${label}: `),
        select,
        isCustom ? customInput : null,
        hint,
        saveBtn,
        cancelBtn,
      );
    }

    const editBtn = el("button", {
      type: "button",
      disabled: anyLoading || editing !== null || namedEditor !== null,
      title: `Edit ${label}`,
    }, "✎");
    editBtn.addEventListener("click", () => handlers.onNamedEdit(key));

    return el("div", {
      className: "field-read",
      "data-focus-key": `named-${key}`,
      style: "display: flex; gap: 0.5em; align-items: center; flex-wrap: wrap;",
    },
      el("span", { className: "lbl" }, `${label}: `),
      el("span", {}, name || "(not set)"),
      desc ? el("span", { className: "serif", style: "font-size: 0.9em;" }, desc) : null,
      editBtn,
    );
  }

  /**
   * F4: the pending-trauma prompt (Q42, lifecycle-matrix §8). Shown while
   * traumaPending is set — when stress reached maximum. Resolving records the
   * trauma, keeps stress FULL, and marks the character out-of-action for the
   * remainder of the score (end-score is the only sanctioned release).
   */
  function renderTraumaPicker() {
    const pickerSelect = el("select", {
      "aria-label": "Trauma when stressed",
      disabled: anyLoading || availableTraumas.length === 0,
    },
      el("option", { value: "" }, "--"),
      ...availableTraumas.map((t) => el("option", { value: t }, t)),
    ) as HTMLSelectElement;
    const takeBtn = el("button", {
      type: "button",
      disabled: anyLoading || availableTraumas.length === 0,
      title: "Take trauma to resolve pending stress (stress stays full)",
    }, state.isTraumaPickerLoading ? "…" : "Take trauma");
    takeBtn.addEventListener("click", handlers.onTraumaFromStress);

    return el("div", {
      className: "stress-trauma-picker",
      style: "margin-top: 0.5em; display: flex; gap: 0.5em; align-items: center; flex-wrap: wrap;",
    },
      el("p", { className: "notice", style: "margin: 0; width: 100%;" },
        "Stress is at its maximum — resolve the pending trauma to continue. Taking a trauma keeps stress full, and the character is out of action for the rest of the score (ending the score releases them)."),
      pickerSelect,
      takeBtn,
      availableTraumas.length === 0
        ? el("p", { className: "lbl", style: "margin: 0;" }, "(all traumas taken — cannot resolve pending trauma)")
        : null,
    );
  }

  /**
   * F2ab: the Vice block lives inside the Stress section. Read mode shows
   * name, description and purveyor; edit mode picks the vice type from game
   * data Vices (with a Custom… branch), the purveyor from Vices[].Sources,
   * and lets the purveyor name/description be edited.
   */
  function renderViceBlock() {
    const v = c.dossier.vice;
    const isEditing = namedEditor?.key === "vice";

    if (!isEditing) {
      const editBtn = el("button", {
        type: "button",
        disabled: anyLoading || editing !== null || namedEditor !== null,
        title: "Edit Vice",
      }, "✎");
      editBtn.addEventListener("click", () => handlers.onNamedEdit("vice"));
      return el("div", { className: "character-vice", "data-focus-key": "vice" },
        el("h3", { className: "lbl" }, "Vice"),
        el("p", {}, el("strong", {}, v.name || "(not set)")),
        v.description ? el("p", { className: "serif" }, v.description) : null,
        v.purveyor.name
          ? el("p", { className: "vice-purveyor" },
              el("span", { className: "lbl" }, "Purveyor: "),
              el("span", {}, v.purveyor.name),
              v.purveyor.description
                ? el("span", { className: "serif" }, ` — ${v.purveyor.description}`)
                : null,
            )
          : null,
        el("div", { style: "display: flex; gap: 0.5em; align-items: center;" },
          editBtn,
          indulgeBtn,
        ),
      );
    }

    const editor = namedEditor!;
    const optionNames = gameDataOptions(gameData, "vice").map((o) => String(o.Name));
    const isCustom = editor.option === "__custom__" || !optionNames.includes(editor.option);
    const sources = isCustom ? [] : viceSources(gameData, editor.option);

    const viceSelect = el("select", {
      "aria-label": "Vice (choose)",
      disabled: anyLoading,
    },
      ...optionNames.map((n) => el("option", { value: n }, n)),
      el("option", { value: "__custom__" }, "Custom…"),
    ) as HTMLSelectElement;
    viceSelect.value = isCustom ? "__custom__" : editor.option;
    viceSelect.addEventListener("change", () => {
      editor.option = viceSelect.value;
      if (viceSelect.value !== "__custom__") {
        const entry = gameDataOptions(gameData, "vice").find((o) => o.Name === viceSelect.value);
        if (entry && typeof entry.Description === "string") {
          editor.customDesc = entry.Description;
        }
      }
      state.rerender();
    });

    const nameInput = el("input", {
      type: "text",
      "aria-label": "Vice custom name",
      value: editor.customName,
      placeholder: "custom vice name",
    }) as HTMLInputElement;
    nameInput.addEventListener("input", () => {
      editor.customName = nameInput.value;
    });
    const descInput = el("input", {
      type: "text",
      "aria-label": "Vice custom description",
      value: editor.customDesc,
      placeholder: "vice description",
    }) as HTMLInputElement;
    descInput.addEventListener("input", () => {
      editor.customDesc = descInput.value;
    });

    const purveyorSelect = el("select", {
      "aria-label": "Vice purveyor (choose)",
      disabled: anyLoading || sources.length === 0,
    },
      el("option", { value: "" }, "--"),
      ...sources.map((src) => el("option", { value: src }, src)),
    ) as HTMLSelectElement;
    purveyorSelect.value = sources.includes(editor.purveyorName) ? editor.purveyorName : "";
    purveyorSelect.addEventListener("change", () => {
      if (purveyorSelect.value) {
        editor.purveyorName = purveyorSelect.value;
      }
      state.rerender();
    });
    const purveyorNameInput = el("input", {
      type: "text",
      "aria-label": "Vice purveyor name",
      value: editor.purveyorName,
      placeholder: "purveyor name",
    }) as HTMLInputElement;
    purveyorNameInput.addEventListener("input", () => {
      editor.purveyorName = purveyorNameInput.value;
    });
    const purveyorDescInput = el("input", {
      type: "text",
      "aria-label": "Vice purveyor description",
      value: editor.purveyorDesc,
      placeholder: "purveyor description",
    }) as HTMLInputElement;
    purveyorDescInput.addEventListener("input", () => {
      editor.purveyorDesc = purveyorDescInput.value;
    });

    const saveBtn = el("button", { type: "button", title: "Save" }, "✓");
    saveBtn.addEventListener("click", handlers.onNamedSave);
    const cancelBtn = el("button", { type: "button", title: "Cancel" }, "✕");
    cancelBtn.addEventListener("click", handlers.onNamedCancel);

    return el("div", { className: "character-vice", "data-focus-key": "vice" },
      el("h3", { className: "lbl" }, "Vice"),
      el("div", { className: "vice-editor", style: "display: flex; flex-direction: column; gap: 0.4em;" },
        el("div", { style: "display: flex; gap: 0.5em; align-items: center; flex-wrap: wrap;" },
          el("span", { className: "lbl" }, "Type:"),
          viceSelect,
          isCustom ? nameInput : null,
        ),
        el("div", { style: "display: flex; gap: 0.5em; align-items: center; flex-wrap: wrap;" },
          el("span", { className: "lbl" }, "Description:"),
          descInput,
        ),
        el("div", { style: "display: flex; gap: 0.5em; align-items: center; flex-wrap: wrap;" },
          el("span", { className: "lbl" }, "Purveyor:"),
          purveyorSelect,
          purveyorNameInput,
        ),
        el("div", { style: "display: flex; gap: 0.5em; align-items: center; flex-wrap: wrap;" },
          el("span", { className: "lbl" }, "Purveyor desc:"),
          purveyorDescInput,
        ),
        el("div", { style: "display: flex; gap: 0.5em;" }, saveBtn, cancelBtn),
      ),
    );
  }

  // -- Assemble -------------------------------------------------------------

  return el(
    "section",
    { className: "character-detail" },

    // Header — masthead carries name, alias, and the playbook/game kicker
    // (Design Audit F-23: identity metadata belongs with the name, not in
    // an orphaned eleventh card).
    el(
      "div",
      { className: "character-header torn-foot torn-foot-lg", "data-section": "header" },
      el("p", { className: "character-kicker" }, `${c.playbook.name} · ${c.gameName}`),
      el("h1", {}, `${c.dossier.name || `Unnamed ${c.playbook.name}`}${status}`),
      el("p", { className: "alias uneven" }, c.dossier.alias),
      el(
        "nav",
        { className: "character-nav" },
        el("a", { href: `/character/${c.id}/history` }, "History"),
      ),
    ),

    // F4: retired banner — RETIRED copy. Retirement clears stress, harm, and
    // armor but preserves dossier, playbook, trauma history, notes, gear, and
    // fund; only allow-list edits (dossier/notes, trauma.remove, undo, delete,
    // reads) remain. Undo is the recovery path to un-retire by mistake.
    retired
      ? el("div", { className: "character-lifecycle-banner", role: "status" },
          el("p", { className: "notice", style: "margin: 0; width: 100%;" },
            "This character has retired. Gameplay is no longer available, but you can keep editing the dossier and notes, and Undo can restore the character if retirement was a mistake."),
        )
      : null,
    // F4: pending-trauma banner — pending blocks gameplay and end-score until
    // the trauma is resolved (TRAUMA_REQUIRED).
    pendingTrauma && !retired
      ? el("div", { className: "character-lifecycle-banner", role: "status" },
          el("p", { className: "notice", style: "margin: 0; width: 100%;" },
            "A trauma is pending — resolve it before continuing. Gameplay and ending the score are blocked until then."),
        )
      : null,

    // CONTRACT-01 stage 3: completion cues — visible, dismissible per
    // section, non-blocking. Derived from the DTO, never a checklist file;
    // renders nothing when the character is complete or all dismissed.
    renderCompletionCues(completionCues(c), state.dismissedCues, state.handlers.onDismissCue),

    // Personal (Dossier) — inline editable
    el(
      "div",
      { className: "character-personal", "data-section": "personal" },
      el("h2", {}, "Personal"),
      renderField("Name", "name", c.dossier.name),
      renderField("Alias", "alias", c.dossier.alias),
      renderNamedField("Background", "background"),
      renderNamedField("Heritage", "heritage"),
      renderField("Look", "look", c.dossier.look),
      // Crew membership (F2ab): show the current crew, join/leave via
      // dossierUpdate {crewId}, and link to the crew creation page.
      (() => {
        const crewId = c.dossier.crewId;
        const crewsList = state.crews ?? [];
        const currentCrew = crewsList.find((cr) => cr.id === crewId) ?? null;
        const crewSelect = el("select", {
          "aria-label": "Join crew",
          disabled: anyLoading || state.crews === null || crewsList.length === 0,
        },
          el("option", { value: "" }, "--"),
          ...crewsList.map((cr) => el("option", { value: cr.id }, cr.name)),
        ) as HTMLSelectElement;
        const joinBtn = el("button", {
          type: "button",
          disabled: anyLoading || state.crews === null || crewsList.length === 0,
          title: "Join crew",
        }, state.isCrewsLoading ? "…" : "Join");
        joinBtn.addEventListener("click", handlers.onCrewJoin);
        const leaveBtn = crewId
          ? (() => {
              const b = el("button", {
                type: "button",
                disabled: anyLoading,
                title: "Leave crew",
              }, "Leave");
              b.addEventListener("click", handlers.onCrewLeave);
              return b;
            })()
          : null;
        return el("div", {
          className: "crew-membership",
          style: "display: flex; gap: 0.5em; align-items: center; flex-wrap: wrap; margin-top: 0.35em;",
        },
          el("span", { className: "lbl" }, "Crew:"),
          el("span", { className: "crew-name" },
            currentCrew ? currentCrew.name : crewId ? "(unknown crew)" : "(none)"),
          crewSelect,
          joinBtn,
          leaveBtn,
          el("a", { href: "/crew/create", className: "crew-create-link" }, "+ New crew"),
          state.crewNotice
            ? el("p", { className: "notice", style: "margin: 0; width: 100%;" }, state.crewNotice)
            : null,
        );
      })(),
    ),

    // Stress (F2ab: the vice block lives under the stress track, per
    // bladesintheday.com — stress track with vice below it)
    el(
      "div",
      { className: "character-stress", "data-section": "stress" },
      el("h2", {}, "Stress"),
      el("div", { style: "display: flex; gap: 1em; align-items: center; flex-wrap: wrap;" },
        stressTrackEl,
        el("span", {}, `${c.monitor.stress.current} / ${c.monitor.stress.max}`),
        stressMinusBtn,
        stressPlusBtn,
      ),
      // F4: pending-trauma prompt (resolve keeps stress full + out-of-action).
      pendingTrauma ? renderTraumaPicker() : null,
      // F4: out-of-action explanation — the client obligation is to explain
      // the state, not to clear stress (Q42; stress stays full until end-score).
      outOfAction
        ? el("p", { className: "notice", style: "margin-top: 0.5em;" },
            "This character is out of action for the remainder of the score — stress can't change until the score ends.")
        : null,
      renderViceBlock(),
    ),

    // Traumas
    el(
      "div",
      { className: "character-traumas", "data-section": "traumas" },
      el("h2", {}, "Traumas"),
      c.monitor.trauma.traumas.length === 0
        ? el("p", {}, "(none)")
        : traumaListEl,
      el("div", { style: "display: flex; gap: 0.5em; margin-top: 0.5em;" },
        traumaSelect,
        traumaAddBtn,
      ),
    ),

    // -- Health (F2n) -------------------------------------------------------

    el(
      "div",
      { className: "character-health", "data-section": "health" },
      el("h2", {}, "Health"),

      // Harm table — routed through the shared component (Design Audit
      // F-03 / F-05) so the sheet and styleguide render identically.
      (() => {
        const h = c.monitor.harm;
        // SC-F3: harm slot capacities come from the server-computed capability
        // projection (harmCapacities) — never hardcoded, never a local settings
        // join. Falls back to the shared component's canonical default.
        const harmLevels: HarmLevel[] = ["lesser", "moderate", "severe", "fatal"];
        return harmTable({
          caption: "Harm",
          disabled: gameplayDisabled,
          rows: harmLevels.map((level) => {
            const entries = h[level] as readonly string[];
            return {
              level,
              label: level[0]!.toUpperCase() + level.slice(1),
              slots: entries,
              capacity: harmCapByLevel.get(level)?.capacity,
              onRemove: (slotIndex, text) => {
                const desc = text || entries[slotIndex] || "";
                if (desc) handlers.onHarmRemove(desc, level);
              },
            };
          }),
        });
      })(),

      // Harm spillover notice
      state.harmSpillNotice
        ? el("p", { className: "notice", style: "margin-top: 0.5em;" }, state.harmSpillNotice)
        : null,

      // Add harm controls
      el("div", { className: "harm-add-row", style: "display: flex; gap: 0.5em; margin-top: 0.5em; align-items: center;" },
        el("select", { "aria-label": "Harm intensity", disabled: gameplayDisabled },
          el("option", { value: "" }, "--"),
          el("option", { value: "lesser" }, "Lesser"),
          el("option", { value: "moderate" }, "Moderate"),
          el("option", { value: "severe" }, "Severe"),
          el("option", { value: "fatal" }, "Fatal"),
        ),
        el("input", {
          type: "text",
          "aria-label": "Harm description",
          disabled: gameplayDisabled,
          placeholder: "injury description",
        }),
        (() => {
          const addBtn = el("button", {
            type: "button",
            disabled: gameplayDisabled,
            title: "Add harm",
          }, state.isHarmLoading ? "…" : "+");
          addBtn.addEventListener("click", handlers.onHarmAdd);
          return addBtn;
        })(),
      ),

      // Armor checkboxes
      (() => {
        const armorKinds = [
          { key: "standard" as const, label: "Standard", has: c.monitor.armor.hasStandard, used: c.monitor.armor.standardUsed },
          { key: "heavy" as const, label: "Heavy", has: c.monitor.armor.hasHeavy, used: c.monitor.armor.heavyUsed },
          { key: "special" as const, label: "Special", has: c.monitor.armor.hasSpecial, used: c.monitor.armor.specialUsed },
        ];
        const armorLabels = armorKinds.map((a) => {
          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.dataset.armorKind = a.key;
          cb.disabled = gameplayDisabled || !a.has;
          cb.checked = a.used;
          cb.addEventListener("change", () => {
            handlers.onArmorSet(a.key, cb.checked);
          });
          return el("label", { style: "display: flex; align-items: center; gap: 0.25em;" },
            cb,
            el("span", {}, `${a.label}${!a.has ? " (n/a)" : ""}`),
          );
        });
        return el("div", { style: "margin-top: 1em;" },
          el("h3", { className: "lbl" }, "Armor"),
          el("div", { style: "display: flex; gap: 1em; flex-wrap: wrap;" }, ...armorLabels),
        );
      })(),

      // Healing clock + heal picker (F2ab: harm.heal targets one specific harm)
      (() => {
        const hc = c.monitor.harm.healingClock;
        const clockFull = hc.segments >= hc.size;
        const harms = activeHarms(c);

        const clockEl = clock({
          segments: hc.size,
          value: hc.segments,
          label: "Healing",
          size: 100,
        });

        const addSegmentBtn = el("button", {
          type: "button",
          disabled: gameplayDisabled || state.isClockLoading,
          title: "Add healing segment",
        }, state.isClockLoading ? "…" : "+1 segment");
        addSegmentBtn.addEventListener("click", handlers.onHarmHealingClock);

        const healSelect = el("select", {
          "aria-label": "Harm to heal",
          disabled: gameplayDisabled || harms.length === 0,
        },
          el("option", { value: "" }, "--"),
          ...harms.map((h, idx) =>
            el("option", { value: String(idx) }, `${h.intensity}: ${h.description}`)),
        ) as HTMLSelectElement;

        const healBtn = el("button", {
          type: "button",
          disabled: gameplayDisabled || state.isHealLoading || !clockFull || harms.length === 0,
          title: "Heal harm (requires full clock)",
        }, state.isHealLoading ? "…" : "Heal");
        healBtn.addEventListener("click", handlers.onHarmHeal);

        return el("div", { style: "margin-top: 1em;" },
          el("h3", { className: "lbl" }, "Healing Clock"),
          clockEl,
          hc.rollover > 0
            ? el("p", { className: "lbl", style: "margin-top: 0.35em;" },
                `(overflow ${hc.rollover} — carries past the reset)`)
            : null,
          el("div", { style: "display: flex; gap: 0.5em; margin-top: 0.5em; align-items: center; flex-wrap: wrap;" },
            addSegmentBtn,
            healSelect,
            healBtn,
          ),
          clockFull && harms.length === 0
            ? el("p", { className: "lbl", style: "margin-top: 0.35em;" }, "(no harms to heal)")
            : null,
          state.healNotice
            ? el("p", { className: "notice", style: "margin-top: 0.35em;" }, state.healNotice)
            : null,
        );
      })(),
    ),

    // -- Talents + XP + Score XP (F2o) --------------------------------------

    (() => {
      const actionDescription = (attribute: string, action: string): string | null => {
        const attrs = Array.isArray(gameData?.Attributes)
          ? (gameData!.Attributes as Array<Record<string, unknown>>)
          : [];
        const attr = attrs.find((a) => a.Name === attribute);
        const actions = attr && Array.isArray(attr.Actions)
          ? (attr.Actions as Array<Record<string, unknown>>)
          : [];
        const act = actions.find((x) => x.Name === action);
        return act && typeof act.ShortDescription === "string"
          ? act.ShortDescription
          : null;
      };

      const attributeGroups = c.talent.attributes.map((attr) =>
        el("div", { className: "talent-attribute", "data-attribute": attr.name, style: "margin-bottom: 1em;" },
          el("h3", { className: "lbl" }, attr.name),

          // Action rows: dot rows (click dot N → set rating N; click filled
          // terminal → clear). The −/+ pair was redundant (F-30) — the dots
          // already cover every value and clearing, and removing them cuts
          // tab stops from the densest card on the sheet.
          ...attr.actions.map((action) => {
            const desc = actionDescription(attr.name, action.name);
            // SC-F3/P21: the enforced cap is the server-computed effective cap
            // (min of the raw max and the crew-Mastery-derived cap); the UI
            // never offers a dot the server would reject with RATING_MAXED.
            const effectiveMax = effCapByName.get(action.name)?.effectiveMax ?? action.maxRating;
            const dots = actionDots({
              name: action.name,
              value: action.rating,
              max: effectiveMax,
              title: desc ?? undefined,
              // Retired → dots become display-only (no onChange ⇒ non-interactive).
              onChange: gameplayDisabled
                ? undefined
                : (next) => handlers.onActionSetRating(attr.name, action.name, next),
            });

            return el("div", {
              className: "talent-action-row",
              "data-attribute": attr.name,
              "data-action": action.name,
              style: "display: flex; align-items: center; gap: 0.5em; flex-wrap: wrap; margin: 0.25em 0;",
            },
              // F2aa: one clean name per action — the underlined .action-name
              // inside the dots component carries the tooltip now.
              dots,
              el("span", {}, `${action.rating}/${effectiveMax}`),
            );
          }),

          // Attribute XP tracker: points/max with +/−, clear, and levelup
          (() => {
            const xp = attr.experience;
            const minusBtn = el("button", {
              type: "button",
              disabled: gameplayDisabled || xp.points <= 0,
              title: `Remove 1 XP (${attr.name})`,
            }, "−");
            minusBtn.addEventListener("click", () => handlers.onAttributeXpDelta(attr.name, -1));
            const plusBtn = el("button", {
              type: "button",
              disabled: gameplayDisabled || xp.points >= xp.max,
              title: `Add 1 XP (${attr.name})`,
            }, "+");
            plusBtn.addEventListener("click", () => handlers.onAttributeXpDelta(attr.name, 1));
            const clearBtn = el("button", {
              type: "button",
              disabled: gameplayDisabled || xp.points === 0,
              title: `Clear XP (${attr.name})`,
            }, "clear");
            clearBtn.addEventListener("click", () => handlers.onAttributeXpClear(attr.name));

            // Level up: pick an action below its effective cap, spend the full XP track
            const levelable = attr.actions.filter((a) => a.rating < (effCapByName.get(a.name)?.effectiveMax ?? a.maxRating));
            const levelSelect = el("select", {
              "aria-label": `Level up action (${attr.name})`,
              disabled: gameplayDisabled || levelable.length === 0,
            }, ...levelable.map((a) => el("option", { value: a.name }, a.name)));
            const levelBtn = el("button", {
              type: "button",
              disabled: gameplayDisabled || xp.points < xp.max || levelable.length === 0,
              title: `Level up ${attr.name} (spends XP)`,
              "data-levelup-attribute": attr.name,
            }, state.isTalentsLoading ? "…" : "Level up");
            levelBtn.addEventListener("click", () => handlers.onAttributeLevelup(attr.name));

            return el("div", {
              className: "talent-xp",
              "data-attribute": attr.name,
              style: "display: flex; align-items: center; gap: 0.5em; flex-wrap: wrap; margin-top: 0.5em;",
            },
              el("span", { className: "lbl" }, "XP:"),
              el("span", {}, `${xp.points} / ${xp.max}`),
              minusBtn,
              plusBtn,
              clearBtn,
              el("span", { className: "lbl", style: "margin-left: 0.75em;" }, "Level up:"),
              levelSelect,
              levelBtn,
            );
          })(),
        ),
      );

      // Score XP sub-section: three session expression tracks
      const sessionTracks: Array<{ key: keyof SessionFields; label: string; short: string }> = [
        { key: "playbookExpressions", label: "Playbook expressions", short: "playbook" },
        { key: "characterExpressions", label: "Character expressions", short: "character" },
        { key: "struggleExpressions", label: "Struggle expressions", short: "struggle" },
      ];
      const sessionEls = sessionTracks.map((t) => {
        const track = stressTrack({
          value: c.session[t.key],
          max: c.session.max,
          label: t.label,
          onChange: (next) => handlers.onSessionTrack(t.key, next),
        });
        track.setAttribute("data-session-track", t.short);
        const minusBtn = el("button", {
          type: "button",
          disabled: gameplayDisabled || c.session[t.key] <= 0,
          title: `Remove 1 ${t.label}`,
        }, "−");
        minusBtn.addEventListener("click", () => handlers.onSessionDelta(t.key, -1));
        const plusBtn = el("button", {
          type: "button",
          disabled: gameplayDisabled || c.session[t.key] >= c.session.max,
          title: `Add 1 ${t.label}`,
        }, "+");
        plusBtn.addEventListener("click", () => handlers.onSessionDelta(t.key, 1));
        return el("div", {
          className: "session-track",
          "data-session-track": t.short,
          style: "display: flex; align-items: center; gap: 0.5em; flex-wrap: wrap; margin: 0.35em 0;",
        },
          track,
          el("span", {}, `${c.session[t.key]} / ${c.session.max}`),
          minusBtn,
          plusBtn,
        );
      });

      return el("div", { className: "character-talents", "data-section": "talents" },
        el("h2", {}, "Talents"),
        ...attributeGroups,
        el("h3", { className: "lbl", style: "margin-top: 1em;" }, "Score XP"),
        el("p", { className: "serif", style: "font-size: 0.95em; margin: 0.25em 0;" },
          "Desperate action XP is marked on the attribute XP tracks above."),
        state.experienceCondition
          ? el("p", { className: "serif", style: "font-size: 0.95em; margin: 0.25em 0;" },
              el("strong", {}, `${c.playbook.name}: `),
              state.experienceCondition,
            )
          : null,
        ...sessionEls,
        // End of downtime: clears the session expression tracks (contract
        // end-downtime). The vice-relief stress amount stays GM-side.
        (() => {
          const endDowntimeBtn = el("button", {
            type: "button",
            disabled: gameplayDisabled,
            title: "End downtime — clears the session expression tracks",
          }, state.isDowntimeLoading ? "…" : "End downtime");
          endDowntimeBtn.addEventListener("click", handlers.onEndDowntime);
          return el("div", { className: "downtime-row", style: "display: flex; align-items: center; gap: 0.5em; flex-wrap: wrap; margin-top: 0.75em;" },
            endDowntimeBtn,
            el("span", { className: "lbl", style: "font-size: 0.9em;" }, "Clears playbook, character, and struggle expressions."),
          );
        })(),
        state.clampNotice
          ? el("p", { className: "notice", style: "margin-top: 0.5em;" }, state.clampNotice)
          : null,
      );
    })(),

    // -- Playbook (F2p) -----------------------------------------------------

    (() => {
      const xp = c.playbook.experience;
      const takenByName = new Map(
        c.playbook.abilities.map((a) => [a.name, a]),
      );
      const specialAbilities = extractSpecialAbilities(playbookData, gameData, c.playbook.name);

      // Eligible = a catalog ability with remaining takes; the server enforces
      // ABILITY_MAXED at 0. Comes from the capability projection (SC-F3), with
      // a graceful fallback to the game-data join when it's unavailable.
      const eligible = state.caps
        ? state.caps.availableAbilityTakes
            .filter((a) => a.remaining > 0)
            .map((a) => ({ Name: a.name }))
        : specialAbilities.filter((sa) => {
            const name = String(sa.Name);
            const timesTakeable = typeof sa.TimesTakeable === "number" ? sa.TimesTakeable : 1;
            const taken = takenByName.get(name);
            return !taken || taken.timesTaken < timesTakeable;
          });

      // Playbook XP tracker: points/max with +/− and clear
      const xpMinusBtn = el("button", {
        type: "button",
        disabled: gameplayDisabled || xp.points <= 0,
        title: "Remove 1 playbook XP",
      }, "−");
      xpMinusBtn.addEventListener("click", () => handlers.onPlaybookXpDelta(-1));
      const xpPlusBtn = el("button", {
        type: "button",
        disabled: gameplayDisabled || xp.points >= xp.max,
        title: "Add 1 playbook XP",
      }, "+");
      xpPlusBtn.addEventListener("click", () => handlers.onPlaybookXpDelta(1));
      const xpClearBtn = el("button", {
        type: "button",
        disabled: gameplayDisabled || xp.points === 0,
        title: "Clear playbook XP",
      }, "clear");
      xpClearBtn.addEventListener("click", handlers.onPlaybookXpClear);

      // Taken abilities from the DTO: name, timesTaken, description, remove
      const abilityEntries = c.playbook.abilities.map((a) =>
        el("div", {
          className: "ability-entry",
          "data-ability": a.name,
          style: "display: flex; align-items: flex-start; gap: 0.5em; margin: 0.35em 0;",
        },
          el("span", { className: "lbl", style: "min-width: 8em;" },
            a.name,
            a.timesTaken > 1 ? el("span", { className: "ability-times" }, ` ×${a.timesTaken}`) : null,
          ),
          // F2ab: taken abilities show their description — the DTO's stored
          // text, falling back to the game-data SpecialAbilities entry.
          el("p", { className: "serif", style: "flex: 1; margin: 0; font-size: 0.95em;" },
            abilityDescription(a, specialAbilities) || "No description available."),
          el("button", {
            type: "button",
            disabled: gameplayDisabled,
            title: `Remove ability: ${a.name}`,
          }, "✕"),
        ),
      );
      abilityEntries.forEach((entry, idx) => {
        const btn = entry.querySelector("button");
        if (btn) {
          btn.addEventListener("click", () => handlers.onAbilityRemove(c.playbook.abilities[idx]!.name));
        }
      });

      // Take menu: native select from game data + <details>/<summary> description
      const abilitySelect = el("select", {
        "aria-label": "Take ability",
        disabled: gameplayDisabled || eligible.length === 0,
      },
        el("option", { value: "" }, "--"),
        ...eligible.map((sa) => el("option", { value: String(sa.Name) }, String(sa.Name))),
      ) as HTMLSelectElement;

      const abilityDetails = el("details", { className: "ability-description" },
        el("summary", {}, ""),
        el("p", {}, ""),
      );
      const detailsSummary = abilityDetails.querySelector("summary") as HTMLElement;
      const detailsBody = abilityDetails.querySelector("p") as HTMLElement;
      const showAbilityDescription = (name: string) => {
        const sa = specialAbilities.find((x) => String(x.Name) === name);
        const desc = sa && typeof sa.Description === "string" ? sa.Description : "";
        detailsSummary.textContent = name || "—";
        detailsBody.textContent = desc || "No description available.";
        abilityDetails.hidden = name === "";
      };
      abilitySelect.addEventListener("change", () => showAbilityDescription(abilitySelect.value));
      if (eligible.length > 0) {
        abilitySelect.value = String(eligible[0]!.Name);
      }
      showAbilityDescription(abilitySelect.value);

      const takeBtn = el("button", {
        type: "button",
        disabled: gameplayDisabled || eligible.length === 0,
        title: "Take ability",
      }, state.isPlaybookLoading ? "…" : "+");
      takeBtn.addEventListener("click", handlers.onAbilityTake);

      return el("div", { className: "character-playbook", "data-section": "playbook" },
        el("h2", {}, "Playbook"),
        el("div", {
          className: "playbook-xp",
          style: "display: flex; align-items: center; gap: 0.5em; flex-wrap: wrap;",
        },
          el("span", { className: "lbl" }, "Playbook XP:"),
          el("span", {}, `${xp.points} / ${xp.max}`),
          xpMinusBtn,
          xpPlusBtn,
          xpClearBtn,
        ),
        el("h3", { className: "lbl", style: "margin-top: 1em;" }, "Special Abilities"),
        c.playbook.abilities.length === 0
          ? el("p", {}, "(none)")
          : el("div", { style: "display: flex; flex-direction: column;" }, ...abilityEntries),
        el("div", { style: "display: flex; gap: 0.5em; margin-top: 0.5em; align-items: center; flex-wrap: wrap;" },
          abilitySelect,
          takeBtn,
          abilityDetails,
        ),
        state.abilityNotice
          ? el("p", { className: "notice", style: "margin-top: 0.5em;" }, state.abilityNotice)
          : null,
      );
    })(),

    // -- Gear (F2r) ---------------------------------------------------------

    (() => {
      const gear = c.gear;
      const loadoutBulk = gear.loadout.reduce((sum, item) => sum + item.bulk, 0);
      // SC-F3: the load cap for the current commitment comes from the
      // server-computed capability projection (loadLimits; abilities such as
      // Mule raise it) — never a local formula. Falls back to the DTO value.
      const loadCap = loadLimitByCommitment.get(gear.commitment)?.maxBulk ?? gear.maxBulk;
      // Load headroom is derived, display-only: the cap minus the bulk sum of
      // committed items. Never hardcoded.
      const headroom = loadCap - loadoutBulk;

      // Loadout list: name + bulk per item, remove per item (gear.remove also
      // drops it from available gear, per the contract's sideEffect).
      const loadoutEntries = gear.loadout.map((item) =>
        el("div", {
          className: "gear-loadout-entry",
          "data-gear-item": item.name,
          style: "display: flex; align-items: center; gap: 0.5em; margin: 0.25em 0;",
        },
          el("span", { className: "lbl", style: "min-width: 8em;" }, item.name),
          el("span", { className: "gear-item-bulk" }, `${item.bulk} bulk`),
          el("button", {
            type: "button",
            disabled: gameplayDisabled,
            title: `Remove gear: ${item.name}`,
          }, "✕"),
        ),
      );
      loadoutEntries.forEach((entry, idx) => {
        const btn = entry.querySelector("button");
        if (btn) {
          btn.addEventListener("click", () => handlers.onGearRemove(gear.loadout[idx]!.name));
        }
      });

      // Add menu: native <select> from playbook Items + SharedItems (game data
      // only, deduped by name), bulk shown, add button → gearAdd(name, bulk).
      // Per the plan idiom the menu lives in a <details>/<summary>.
      const gearMenu = extractGearMenu(playbookData, gameData, c.playbook.name);
      const addSelect = el("select", {
        "aria-label": "Add gear item",
        disabled: gameplayDisabled || gearMenu.length === 0,
      },
        el("option", { value: "" }, "--"),
        ...gearMenu.map((m) => el("option", { value: m.name }, `${m.name} (bulk ${m.bulk})`)),
      );
      const addBtn = el("button", {
        type: "button",
        disabled: gameplayDisabled || gearMenu.length === 0,
        title: "Add gear item",
      }, state.isGearLoading ? "…" : "+");
      addBtn.addEventListener("click", handlers.onGearAdd);
      const addMenuDetails = el("details", { className: "gear-add-menu" },
        el("summary", {}, "Add item…"),
        el("div", { className: "gear-add-row", style: "display: flex; gap: 0.5em; align-items: center; margin-top: 0.35em;" },
          addSelect,
          addBtn,
        ),
      );

      // Commitment (load level) selector: contract commitment options. The
      // per-option maxima live server-side in game settings; the DTO carries
      // only the current commitment's maxBulk, so the summary above shows it.
      const commitmentOptions = ["light", "normal", "heavy", "encumbered"];
      const commitmentSelect = el("select", {
        "aria-label": "Set commitment",
        disabled: gameplayDisabled,
      },
        ...commitmentOptions.map((opt) => el("option", { value: opt }, opt)),
      ) as HTMLSelectElement;
      if (commitmentOptions.includes(gear.commitment)) {
        commitmentSelect.value = gear.commitment;
      }
      const commitmentBtn = el("button", {
        type: "button",
        disabled: gameplayDisabled,
        title: "Set commitment",
      }, state.isGearCommitmentLoading ? "…" : "set");
      commitmentBtn.addEventListener("click", handlers.onGearSetCommitment);

      // Lock toggle: gear.lock / gear.unlock. While locked the server rejects
      // set-commitment / commit / clear-commitments with COMMITMENT_LOCKED,
      // which surfaces through the op-error notice.
      const lockBtn = el("button", {
        type: "button",
        disabled: gameplayDisabled,
        title: gear.isCommitmentLocked ? "Unlock commitment" : "Lock commitment",
      }, state.isGearLockLoading ? "…" : gear.isCommitmentLocked ? "unlock" : "lock");
      lockBtn.addEventListener("click", handlers.onGearToggleLock);

      const clearBtn = el("button", {
        type: "button",
        disabled: gameplayDisabled || (gear.loadout.length === 0 && gear.commitment === "none"),
        title: "Clear commitments",
      }, state.isGearCommitmentLoading ? "…" : "clear");
      clearBtn.addEventListener("click", handlers.onGearClearCommitments);

      // Loadout selector: commit / uncommit buttons over available gear.
      // Committed items are marked "(in loadout)".
      const loadoutNames = new Set(gear.loadout.map((item) => item.name));
      const gearSelect = el("select", {
        "aria-label": "Select gear item",
        disabled: gameplayDisabled || gear.availableGear.length === 0,
      },
        el("option", { value: "" }, "--"),
        ...gear.availableGear.map((item) =>
          el("option", { value: item.name }, `${item.name} (bulk ${item.bulk})${loadoutNames.has(item.name) ? " — in loadout" : ""}`)),
      );
      const commitBtn = el("button", {
        type: "button",
        disabled: gameplayDisabled || gear.availableGear.length === 0,
        title: "Commit selected gear",
      }, state.isGearLoading ? "…" : "commit");
      commitBtn.addEventListener("click", handlers.onGearCommit);
      const uncommitBtn = el("button", {
        type: "button",
        disabled: gameplayDisabled || gear.availableGear.length === 0,
        title: "Uncommit selected gear",
      }, state.isGearLoading ? "…" : "uncommit");
      uncommitBtn.addEventListener("click", handlers.onGearUncommit);

      return el("div", { className: "character-gear", "data-section": "gear" },
        el("h2", {}, "Gear"),
        el("div", { className: "gear-summary", style: "display: flex; align-items: center; gap: 0.5em; flex-wrap: wrap; margin: 0.35em 0;" },
          el("span", { className: "lbl" }, "Load:"),
          el("span", { className: "gear-bulk-sum" }, `${loadoutBulk} / ${loadCap}`),
          el("span", { className: "gear-headroom" }, `headroom ${headroom}`),
        ),
        el("h3", { className: "lbl", style: "margin-top: 0.5em;" }, "Loadout"),
        gear.loadout.length === 0
          ? el("p", { className: "gear-empty" }, "(nothing committed)")
          : el("div", { style: "display: flex; flex-direction: column;" }, ...loadoutEntries),
        addMenuDetails,
        el("h3", { className: "lbl", style: "margin-top: 1em;" }, "Commitment"),
        el("div", { className: "gear-commitment-row", style: "display: flex; gap: 0.5em; align-items: center; flex-wrap: wrap; margin: 0.35em 0;" },
          commitmentSelect,
          commitmentBtn,
          lockBtn,
          clearBtn,
        ),
        el("div", { className: "gear-select-row", style: "display: flex; gap: 0.5em; align-items: center; flex-wrap: wrap; margin: 0.35em 0;" },
          gearSelect,
          commitBtn,
          uncommitBtn,
        ),
      );
    })(),

    // -- Coin (F2s) --------------------------------------------------------

    (() => {
      const satchel = c.fund.satchel;
      const stash = c.fund.stash;
      // Lifestyle is derived, display-only: stash ÷ 10 (sheet plan decision 4).
      const lifestyle = Math.floor(stash.coins / 10);

      const spendBtn = el("button", {
        type: "button",
        disabled: gameplayDisabled || state.isCoinLoading,
        title: "Spend 1 coin",
      }, state.isCoinLoading ? "…" : "−");
      spendBtn.addEventListener("click", () => handlers.onFundDelta(-1));

      const gainBtn = el("button", {
        type: "button",
        disabled: gameplayDisabled || state.isCoinLoading,
        title: "Gain 1 coin",
      }, state.isCoinLoading ? "…" : "+");
      gainBtn.addEventListener("click", () => handlers.onFundDelta(1));



      const liquidateInput = el("input", {
        type: "number",
        "aria-label": "Coins to liquidate",
        disabled: gameplayDisabled || state.isCoinLoading,
        value: "1",
        min: "1",
      }) as HTMLInputElement;
      const liquidateBtn = el("button", {
        type: "button",
        disabled: gameplayDisabled || state.isCoinLoading,
        title: "Liquidate stash to coins",
      }, state.isCoinLoading ? "…" : "liquidate");
      liquidateBtn.addEventListener("click", handlers.onFundLiquidate);

      return el("div", { className: "character-coin", "data-section": "coin" },
        el("h2", {}, "Coin"),
        el("div", { className: "coin-satchel", style: "display: flex; align-items: center; gap: 0.5em; flex-wrap: wrap; margin: 0.35em 0;" },
          el("span", { className: "lbl" }, "Satchel:"),
          el("span", { className: "coin-satchel-count" }, `${satchel.coins} / ${satchel.max}`),
          spendBtn,
          gainBtn,
        ),
        el("div", { className: "coin-stash", style: "display: flex; align-items: center; gap: 0.5em; flex-wrap: wrap; margin: 0.35em 0;" },
          el("span", { className: "lbl" }, "Stash:"),
          el("span", { className: "coin-stash-count" }, `${stash.coins} / ${stash.max}`),
          el("span", { className: "coin-lifestyle" }, `Lifestyle ${lifestyle}`),
        ),
        el("div", { className: "coin-liquidate", style: "display: flex; align-items: center; gap: 0.5em; flex-wrap: wrap; margin: 0.35em 0;" },
          el("span", { className: "lbl" }, "Liquidate:"),
          liquidateInput,
          liquidateBtn,
        ),
        state.coinNotice
          ? el("p", { className: "notice", style: "margin-top: 0.5em;" }, state.coinNotice)
          : null,
      );
    })(),

    // -- Projects (F2s) ----------------------------------------------------

    (() => {
      const clocks = state.clocks ?? [];
      // The create form exposes the current bounded/rollover contract behavior.
      const kindOptions: Array<{ value: "bounded" | "rollover"; label: string }> = [
        { value: "bounded", label: "project" },
        { value: "rollover", label: "rollover" },
      ];

      const clockEntries = clocks.map((clk) => {
        // Rendering size derived from the clock's own DTO size — the SVG clock
        // supports any segment count; no game maximum is hardcoded.
        const dialSize = Math.min(140, 60 + clk.size * 8);
        const behaviorLabel = clk.behavior === "bounded" ? "project" : "rollover";
        const dial = clock({
          segments: clk.size,
          value: clk.segments,
          label: clk.name,
          size: dialSize,
          // Clicking segment N sets progress to N (delta vs. current); the
          // server clamps progress at full / ignores negative deltas.
          onChange: (next) => handlers.onClockProgress(clk.id, next - clk.segments),
        });

        const minusBtn = el("button", {
          type: "button",
          disabled: gameplayDisabled || state.isClocksLoading || clk.segments <= 0,
          title: `Remove 1 segment: ${clk.name}`,
        }, "−");
        minusBtn.addEventListener("click", () => handlers.onClockProgress(clk.id, -1));

        const plusBtn = el("button", {
          type: "button",
          disabled: gameplayDisabled || state.isClocksLoading,
          title: `Add 1 segment: ${clk.name}`,
        }, state.isClocksLoading ? "…" : "+");
        plusBtn.addEventListener("click", () => handlers.onClockProgress(clk.id, 1));

        const resetBtn = el("button", {
          type: "button",
          // enabled for rollover clocks carrying overflow even at 0 segments
          disabled: gameplayDisabled || state.isClocksLoading || (clk.segments === 0 && clk.rollover === 0),
          title: `Reset clock: ${clk.name}`,
        }, state.isClocksLoading ? "…" : "reset");
        resetBtn.addEventListener("click", () => handlers.onClockReset(clk.id));

        const deleteBtn = el("button", {
          type: "button",
          disabled: gameplayDisabled || state.isClocksLoading,
          title: `Delete clock: ${clk.name}`,
        }, "✕");
        deleteBtn.addEventListener("click", () => handlers.onClockDelete(clk.id));

        return el("div", {
          className: "project-clock",
          "data-clock-id": clk.id,
          "data-clock-kind": behaviorLabel,
          style: "display: flex; align-items: center; gap: 0.75em; flex-wrap: wrap; margin: 0.5em 0;",
        },
          dial,
          el("div", { style: "display: flex; flex-direction: column; gap: 0.25em;" },
            el("span", { className: "project-clock-name" }, clk.name),
            el("span", { className: "project-clock-kind lbl" }, behaviorLabel),
            el("span", { className: "project-clock-progress" },
              `${clk.segments} / ${clk.size}${clk.rollover > 0 ? ` (rollover ${clk.rollover})` : ""}`),
            el("div", { style: "display: flex; gap: 0.5em;" },
              minusBtn,
              plusBtn,
              resetBtn,
              deleteBtn,
            ),
          ),
        );
      });

      const nameInput = el("input", {
        type: "text",
        "aria-label": "Clock name",
        disabled: gameplayDisabled || state.isClocksLoading,
        placeholder: "project name",
      }) as HTMLInputElement;
      const kindSelect = el("select", {
        "aria-label": "Clock kind",
        disabled: gameplayDisabled || state.isClocksLoading,
      },
        ...kindOptions.map((k) => el("option", { value: k.value }, k.label)),
      ) as HTMLSelectElement;
      const sizeInput = el("input", {
        type: "number",
        "aria-label": "Clock size",
        disabled: gameplayDisabled || state.isClocksLoading,
        min: "1",
        placeholder: "4",
      }) as HTMLInputElement;
      const createBtn = el("button", {
        type: "button",
        disabled: gameplayDisabled || state.isClocksLoading,
        title: "Create clock",
      }, state.isClocksLoading ? "…" : "+");
      createBtn.addEventListener("click", handlers.onCreateClock);

      return el("div", { className: "character-projects", "data-section": "projects" },
        el("h2", {}, "Projects"),
        clocks.length === 0
          ? el("p", { className: "project-empty" }, "(no clocks)")
          : el("div", { style: "display: flex; flex-direction: column;" }, ...clockEntries),
        el("h3", { className: "lbl", style: "margin-top: 0.75em;" }, "New clock"),
        el("div", { className: "clock-create-form", style: "display: flex; gap: 0.5em; align-items: center; flex-wrap: wrap; margin-top: 0.35em;" },
          nameInput,
          kindSelect,
          el("span", { className: "lbl" }, "size"),
          sizeInput,
          createBtn,
        ),
        state.clocksNotice
          ? el("p", { className: "notice", style: "margin-top: 0.5em;" }, state.clocksNotice)
          : null,
      );
    })(),

    // Info
    // Messages
    state.errorMsg
      ? el("p", { className: "error", style: "margin-top: 1em;", role: "alert" }, state.errorMsg)
      : null,
    state.noticeMsg
      ? el("p", { className: "notice", style: "margin-top: 1em;" }, state.noticeMsg)
      : null,
    state.undoNotice
      ? el("p", { className: "notice", style: "margin-top: 1em;" }, state.undoNotice)
      : null,

    // -- F4 lifecycle actions ---------------------------------------------
    // End-score: always clears stress + out-of-action flags (the sanctioned
    // release); blocked by pending trauma (TRAUMA_REQUIRED) and retired.
    // Retire: explicit, confirmation-guarded, independent of trauma.
    // Delete: confirm-guarded; retired characters remain deletable.
    (() => {
      const endScoreBtn = el("button", {
        type: "button",
        disabled: anyLoading || retired || pendingTrauma,
        title: endScoreTitle,
      }, state.isEndScoreLoading ? "…" : "End score");
      endScoreBtn.addEventListener("click", handlers.onEndScore);

      const retireBtn = el("button", {
        type: "button",
        disabled: anyLoading || retired,
        title: "Retire this character (confirmation required)",
      }, state.isRetireLoading ? "…" : "Retire");
      retireBtn.addEventListener("click", handlers.onRetire);

      const deleteBtn = el("button", {
        type: "button",
        disabled: anyLoading,
        title: "Delete this character (confirmation required, not undoable)",
      }, state.isDeleteLoading ? "…" : "Delete");
      deleteBtn.addEventListener("click", handlers.onDeleteCharacter);

      return el("div", { className: "character-lifecycle-actions", "data-section": "lifecycle", style: "display: flex; gap: 0.5em; align-items: center; flex-wrap: wrap; margin-top: 0.5em;" },
        endScoreBtn,
        retireBtn,
        deleteBtn,
        // RETIRED copy for the gameplay gate (stress already disabled above).
        retired
          ? el("p", { className: "lbl", style: "margin: 0; width: 100%;" },
              "Retired — gameplay actions are disabled; Undo can restore the character.")
          : null,
        pendingTrauma && !retired
          ? el("p", { className: "lbl", style: "margin: 0; width: 100%;" },
              "A trauma is pending — resolve it before ending the score.")
          : null,
        state.canUndo === false && state.historyCount === 0
          ? el("p", { className: "lbl", style: "margin: 0; width: 100%;" },
              "No history is available to undo.")
          : null,
      );
    })(),

    // Undo
    el(
      "div",
      { className: "character-actions", "data-section": "actions" },
      el("h2", {}, "Actions"),
      undoBtn,
      state.historyCount !== null
        ? el("p", { className: "lbl", style: "margin-top: 0.5em;" },
            `${state.historyCount} snapshotted change${state.historyCount === 1 ? "" : "s"} can be undone.`)
        : null,
    ),

    // Notes (F2ab: C4 array of entries with per-note add/remove; legacy
    // single string still decodes)
    (() => {
      const notes = c.dossier.notes;
      const entries = Array.isArray(notes) ? notes : notes ? [notes] : [];
      const noteEntries = entries.map((n, idx) =>
        el("li", {
          className: "note-entry",
          style: "display: flex; gap: 0.5em; align-items: center;",
        },
          el("span", { style: "flex: 1;" }, n),
          (() => {
            const rm = el("button", {
              type: "button",
              disabled: anyLoading,
              title: `Remove note ${idx + 1}`,
            }, "✕");
            rm.addEventListener("click", () => handlers.onNoteRemove(idx));
            return rm;
          })(),
        ),
      );
      const noteInput = el("input", {
        type: "text",
        "aria-label": "New note",
        disabled: anyLoading,
        placeholder: "add a note",
      }) as HTMLInputElement;
      noteInput.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          handlers.onNoteAdd();
        }
      });
      const addBtn = el("button", {
        type: "button",
        disabled: anyLoading,
        title: "Add note",
      }, state.isNotesLoading ? "…" : "+ Add");
      addBtn.addEventListener("click", handlers.onNoteAdd);

      return el(
        "div",
        { className: "character-notes", "data-section": "notes" },
        el("h2", {}, "Notes"),
        entries.length > 0
          ? el("ul", { className: "note-list" }, ...noteEntries)
          : el("p", {}, "(no notes)"),
        el("div", {
          className: "note-add-row",
          style: "display: flex; gap: 0.5em; margin-top: 0.5em; align-items: center;",
        },
          noteInput,
          addBtn,
        ),
        state.notesNotice
          ? el("p", { className: "notice", style: "margin-top: 0.5em;" }, state.notesNotice)
          : null,
      );
    })(),

    // Notebook (contract /ops/notebook.set): free-text sheet notes, saved on
    // demand. Stays on the retired allow-list (dossier/notes/notebook).
    (() => {
      const notebookEl = el("textarea", {
        className: "form-input character-notebook",
        rows: 6,
        "aria-label": "Notebook",
        disabled: anyLoading,
      }) as HTMLTextAreaElement;
      notebookEl.value = c.notebook;
      const saveBtn = el("button", {
        type: "button",
        className: "btn-secondary",
        disabled: anyLoading,
        title: "Save the notebook",
      }, state.isNotebookLoading ? "…" : "Save notebook");
      saveBtn.addEventListener("click", handlers.onNotebookSave);
      return el(
        "div",
        { className: "character-notebook-section", "data-section": "notebook" },
        el("h2", {}, "Notebook"),
        notebookEl,
        el("div", {
          className: "form-actions",
          style: "display: flex; gap: 0.5em; align-items: center; margin-top: 0.5em;",
        },
          saveBtn,
          state.notebookNotice
            ? el("span", { className: "notice", style: "font-size: 0.9em;" }, state.notebookNotice)
            : null,
        ),
      );
    })(),
  );
}

function renderLoading(): HTMLElement {
  return el(
    "section",
    { className: "character-detail-loading" },
    el("h1", {}, "Character"),
    el("p", {}, "Loading…"),
  );
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

/**
 * Mount the character detail page into `root` for the given ID.
 * Returns a disposer.
 */
export function mountCharacterDetailPage(
  root: HTMLElement,
  characterId: string,
): () => void {
  let cancelled = false;
  let currentCharacter: Character | null = null;
  let gameData: Record<string, unknown> | null = null;

  // State
  let isStressLoading = false;
  let isStressClearLoading = false;
  let isTraumaLoading = false;
  let isDossierLoading = false;
  let isUndoLoading = false;
  let errorMsg: string | null = null;
  let noticeMsg: string | null = null;
  let undoNotice: string | null = null;
  let harmSpillNotice: string | null = null;
  let editing: EditingState | null = null;
  // CONTRACT-01 stage 3: per-section cue dismissal (session-scoped).
  const dismissedCues = new Set<string>();

  // F4 lifecycle state
  let isEndScoreLoading = false;
  let isDowntimeLoading = false;
  let isRetireLoading = false;
  let isDeleteLoading = false;
  let canUndoState: boolean | null = null;
  let historyCountState: number | null = null;

  // F2n Health state
  let isHarmLoading = false;
  let isArmorLoading = false;
  let isHealLoading = false;
  let isClockLoading = false;

  // F2o Talents state
  let isTalentsLoading = false;
  let isSessionLoading = false;
  let clampNotice: string | null = null;
  let experienceCondition: string | null = null;
  let playbookData: Record<string, unknown> | null = null;
  let caps: CharacterCapabilities | null = null;

  // F2p Playbook state
  let isPlaybookLoading = false;
  let abilityNotice: string | null = null;

  // F2r Gear state
  let isGearLoading = false;
  let isGearCommitmentLoading = false;
  let isGearLockLoading = false;

  // F2s Coin + Projects state
  let clocks: readonly ClockSummary[] | null = null;
  let isCoinLoading = false;
  let isClocksLoading = false;
  let coinNotice: string | null = null;
  let clocksNotice: string | null = null;

  // F2ab state
  let crews: readonly CrewSummary[] | null = null;
  let isCrewsLoading = false;
  let crewNotice: string | null = null;
  let isNotesLoading = false;
  let notesNotice: string | null = null;
  let isNotebookLoading = false;
  let notebookNotice: string | null = null;
  let namedEditor: NamedEditorState | null = null;
  let isTraumaPickerLoading = false;
  let healNotice: string | null = null;

  const clearNotices = () => {
    errorMsg = null;
    noticeMsg = null;
    undoNotice = null;
    harmSpillNotice = null;
    clampNotice = null;
    abilityNotice = null;
    coinNotice = null;
    clocksNotice = null;
    crewNotice = null;
    notesNotice = null;
    notebookNotice = null;
    healNotice = null;
  };

  /**
   * Friendly inline error copy per error class (FV-023/FV-024): typed
   * operation errors map known codes to user copy (per-op override first,
   * shared fallback otherwise); HTTP/network and decode failures get their
   * own distinct copy. Never renders raw body/parser text.
   */
  const opErrorText = (err: unknown, onOpError?: (err: OpError) => string): string => {
    if (err instanceof OpError) {
      return onOpError ? onOpError(err) : opErrorFriendlyText(err);
    }
    if (err instanceof ApiError) {
      return transportErrorText(err);
    }
    if (err instanceof DecodeError) {
      return decodeErrorText(err);
    }
    return String(err);
  };

  const refreshAndShowNotice = () => {
    if (!currentCharacter) return;
    const recoverProgram = getCharacter(characterId);
    void Effect.runPromise(
      Effect.match(recoverProgram, {
        onFailure: (recoverErr) => {
          if (cancelled) return;
          errorMsg = `Sheet refresh failed — ${opErrorText(recoverErr)}`;
          renderDetailWrapper();
        },
        onSuccess: (character) => {
          if (cancelled) return;
          currentCharacter = character;
          refreshCaps();
          noticeMsg = "Sheet refreshed because it changed elsewhere";
          renderDetailWrapper();
          setTimeout(() => {
            if (!cancelled) {
              noticeMsg = null;
              renderDetailWrapper();
            }
          }, 3000);
        },
      }),
    );
  };

  /** Shared F2o mutation runner: standard error paths + stale-revision recovery (F2h rule). */
  const runCharacterMutate = (
    program: Effect.Effect<Character, ApiError | DecodeError | StaleRevisionError>,
    onSuccess: (character: Character) => void,
    clearLoading: () => void,
    onApiError?: (err: OpError) => string,
  ) => {
    void Effect.runPromise(
      Effect.match(program, {
        onFailure: (err) => {
          if (cancelled) return;
          clearLoading();
          if (err instanceof StaleRevisionError) {
            renderDetailWrapper();
            refreshAndShowNotice();
          } else {
            errorMsg = opErrorText(err, onApiError);
            renderDetailWrapper();
          }
        },
        onSuccess: (character) => {
          if (cancelled) return;
          clearLoading();
          onSuccess(character);
        },
      }),
    );
  };

  /** Re-fetch the character capability projection after a mutation so the
   * capability-driven controls never keep stale limits (SC-F3). Advisory and
   * best-effort: keep the last good projection on failure. */
  const refreshCaps = () => {
    if (cancelled || !currentCharacter) return;
    void Effect.runPromise(
      Effect.match(getCharacterCapabilities(characterId), {
        onFailure: () => undefined,
        onSuccess: (projection) => {
          if (cancelled) return;
          caps = projection;
          renderDetailWrapper();
        },
      }),
    );
  };

  /**
   * Standard failure path for a character mutation: clears the loading flag,
   * recovers from stale revisions, and surfaces API/decode errors. Used by
   * the F2ab handlers (trauma-from-stress flow needs it twice in a chain).
   */
  const failMutate = (err: unknown, clearLoading: () => void) => {
    if (cancelled) return;
    clearLoading();
    if (err instanceof StaleRevisionError) {
      renderDetailWrapper();
      refreshAndShowNotice();
    } else {
      errorMsg = opErrorText(err);
      renderDetailWrapper();
    }
  };

  /** F2s fund/stash mutation runner: same standard error paths + stale-revision recovery, FundOpResult payload. */
  const runFundMutate = (
    program: Effect.Effect<FundOpResult, ApiError | DecodeError | StaleRevisionError>,
    onSuccess: (result: FundOpResult) => void,
    clearLoading: () => void,
    onApiError?: (err: OpError) => string,
  ) => {
    void Effect.runPromise(
      Effect.match(program, {
        onFailure: (err) => {
          if (cancelled) return;
          clearLoading();
          if (err instanceof StaleRevisionError) {
            renderDetailWrapper();
            refreshAndShowNotice();
          } else {
            errorMsg = opErrorText(err, onApiError);
            renderDetailWrapper();
          }
        },
        onSuccess: (result) => {
          if (cancelled) return;
          clearLoading();
          onSuccess(result);
        },
      }),
    );
  };

  /** F2s clock mutation runner: same standard error paths + stale-revision recovery (refetches the clock list). */
  const runClockMutate = (
    program: Effect.Effect<Clock, ApiError | DecodeError | StaleRevisionError>,
    onSuccess: (clock: Clock) => void,
    clearLoading: () => void,
    onApiError?: (err: OpError) => string,
  ) => {
    void Effect.runPromise(
      Effect.match(program, {
        onFailure: (err) => {
          if (cancelled) return;
          clearLoading();
          if (err instanceof StaleRevisionError) {
            renderDetailWrapper();
            refreshClocksAndNotice();
          } else {
            errorMsg = opErrorText(err, onApiError);
            renderDetailWrapper();
          }
        },
        onSuccess: (clock) => {
          if (cancelled) return;
          clearLoading();
          onSuccess(clock);
        },
      }),
    );
  };

  /** Refetch the campaign clock list (clock state lives server-side, not in the character DTO). */
  const refreshClocksAndNotice = () => {
    void Effect.runPromise(
      Effect.match(listClocks(), {
        onFailure: (err) => {
          if (cancelled) return;
          clocksNotice = `Clock refresh failed — ${opErrorText(err)}`;
          renderDetailWrapper();
        },
        onSuccess: (list) => {
          if (cancelled) return;
          clocks = list;
          clocksNotice = "Clocks refreshed because they changed elsewhere";
          renderDetailWrapper();
          setTimeout(() => {
            if (!cancelled) {
              clocksNotice = null;
              renderDetailWrapper();
            }
          }, 3000);
        },
      }),
    );
  };

  /** Insert or replace a clock in the local list by id. The op results carry
   *  the full Clock DTO; the list state keeps clockSummary rows, so the DTO
   *  is projected down to the row shape (readable by construction). */
  const upsertClock = (updated: Clock) => {
    const row: ClockSummary = {
      kind: "clock",
      id: updated.id,
      name: updated.name,
      ownerKind: updated.ownerKind,
      ownerId: updated.ownerId,
      purpose: updated.purpose,
      behavior: updated.behavior,
      segments: updated.segments,
      size: updated.size,
      rollover: updated.rollover,
      relatedClockIds: updated.relatedClockIds,
      isReadable: true,
      isRepairable: true,
      isComplete: true,
      deleteToken: "",
    };
    const list = clocks ?? [];
    const idx = list.findIndex((x) => x.id === row.id);
    clocks = idx >= 0
      ? list.map((x, i) => (i === idx ? row : x))
      : [...list, row];
  };

  const handlers = {
    onStressTrack: (next: number) => {
      if (!currentCharacter || isStressLoading) return;
      const delta = next - currentCharacter.monitor.stress.current;
      if (delta === 0) return;
      isStressLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = stressAdd(characterId, delta, currentCharacter.revision);
      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => {
            if (cancelled) return;
            isStressLoading = false;
            if (err instanceof StaleRevisionError) {
              renderDetailWrapper();
              refreshAndShowNotice();
            } else {
              errorMsg = opErrorText(err);
              renderDetailWrapper();
            }
          },
          onSuccess: (character) => {
            if (cancelled) return;
            isStressLoading = false;
            currentCharacter = character;
            renderDetailWrapper();
          },
        }),
      );
    },

    onStressDelta: (delta: number) => {
      if (!currentCharacter || isStressLoading) return;
      // Compute clamped delta
      const newVal = currentCharacter.monitor.stress.current + delta;
      if (newVal < 0 || newVal > currentCharacter.monitor.stress.max) return;
      isStressLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = stressAdd(characterId, delta, currentCharacter.revision);
      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => {
            if (cancelled) return;
            isStressLoading = false;
            if (err instanceof StaleRevisionError) {
              renderDetailWrapper();
              refreshAndShowNotice();
            } else {
              errorMsg = opErrorText(err);
              renderDetailWrapper();
            }
          },
          onSuccess: (character) => {
            if (cancelled) return;
            isStressLoading = false;
            currentCharacter = character;
            renderDetailWrapper();
          },
        }),
      );
    },

    onStressClear: () => {
      if (!currentCharacter || isStressClearLoading) return;
      if (currentCharacter.monitor.stress.current === 0) return;
      isStressClearLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = stressClear(characterId, currentCharacter.revision);
      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => {
            if (cancelled) return;
            isStressClearLoading = false;
            if (err instanceof StaleRevisionError) {
              renderDetailWrapper();
              refreshAndShowNotice();
            } else {
              errorMsg = opErrorText(err);
              renderDetailWrapper();
            }
          },
          onSuccess: (character) => {
            if (cancelled) return;
            isStressClearLoading = false;
            currentCharacter = character;
            renderDetailWrapper();
          },
        }),
      );
    },

    onTraumaAdd: () => {
      if (!currentCharacter || isTraumaLoading) return;
      // Read selected trauma from DOM at call time
      const sel = root.querySelector('select[aria-label="Add trauma"]') as HTMLSelectElement;
      const trauma = sel?.value || null;
      if (!trauma) return;
      isTraumaLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = traumaAdd(characterId, trauma, currentCharacter.revision);
      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => {
            if (cancelled) return;
            isTraumaLoading = false;
            if (err instanceof StaleRevisionError) {
              renderDetailWrapper();
              refreshAndShowNotice();
            } else {
              errorMsg = opErrorText(err);
              renderDetailWrapper();
            }
          },
          onSuccess: (character) => {
            if (cancelled) return;
            isTraumaLoading = false;
            currentCharacter = character;
            renderDetailWrapper();
          },
        }),
      );
    },

    onTraumaRemove: (name: string) => {
      if (!currentCharacter || isTraumaLoading) return;
      isTraumaLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = traumaRemove(characterId, name, currentCharacter.revision);
      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => {
            if (cancelled) return;
            isTraumaLoading = false;
            if (err instanceof StaleRevisionError) {
              renderDetailWrapper();
              refreshAndShowNotice();
            } else {
              errorMsg = opErrorText(err);
              renderDetailWrapper();
            }
          },
          onSuccess: (character) => {
            if (cancelled) return;
            isTraumaLoading = false;
            currentCharacter = character;
            renderDetailWrapper();
          },
        }),
      );
    },

    onDossierEdit: (field: DossierField) => {
      if (!currentCharacter || editing !== null) return;
      editing = { field, value: getDossierValue(currentCharacter, field) };
      renderDetailWrapper();
    },

    onDossierSave: () => {
      if (!currentCharacter || !editing || isDossierLoading) return;
      isDossierLoading = true;
      clearNotices();
      const field = editing.field;
      const value = editing.value;
      editing = null;
      renderDetailWrapper();

      const payload = buildDossierPayload(field, value);
      const program = dossierUpdate(characterId, payload, currentCharacter.revision);
      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => {
            if (cancelled) return;
            isDossierLoading = false;
            if (err instanceof StaleRevisionError) {
              renderDetailWrapper();
              refreshAndShowNotice();
            } else {
              errorMsg = opErrorText(err);
              renderDetailWrapper();
            }
          },
          onSuccess: (character) => {
            if (cancelled) return;
            isDossierLoading = false;
            currentCharacter = character;
            renderDetailWrapper();
          },
        }),
      );
    },

    onDossierCancel: () => {
      editing = null;
      renderDetailWrapper();
    },

    // -- F2ab: heritage/background/vice dropdowns --------------------------

    onNamedEdit: (key: "heritage" | "background" | "vice") => {
      if (!currentCharacter || editing !== null || namedEditor !== null) return;
      const name = getNamedValue(currentCharacter, key, "name");
      const optionNames = gameDataOptions(gameData, key).map((o) => String(o.Name));
      const entry = gameDataOptions(gameData, key).find((o) => o.Name === name);
      namedEditor = {
        key,
        option: optionNames.includes(name) ? name : "__custom__",
        customName: name,
        customDesc: key === "vice"
          ? (entry && typeof entry.Description === "string"
              ? entry.Description
              : currentCharacter.dossier.vice.description)
          : "",
        purveyorName: key === "vice" ? currentCharacter.dossier.vice.purveyor.name : "",
        purveyorDesc: key === "vice" ? currentCharacter.dossier.vice.purveyor.description : "",
      };
      renderDetailWrapper();
    },

    onNamedSave: () => {
      if (!currentCharacter || !namedEditor || isDossierLoading) return;
      const editor = namedEditor;
      const key = editor.key;
      // Read the current control values from the DOM so a direct select
      // change (without an intermediate re-render) is still saved correctly.
      const keyLabel = key === "heritage" ? "Heritage" : key === "background" ? "Background" : "Vice";
      const select = root.querySelector(`select[aria-label="${keyLabel} (choose)"]`) as HTMLSelectElement | null;
      const option = select?.value ?? editor.option;
      const customName = (root.querySelector(`input[aria-label="${keyLabel} custom name"]`) as HTMLInputElement | null)
        ?.value ?? editor.customName;
      let payload: Record<string, unknown>;
      if (key === "vice") {
        const optionNames = gameDataOptions(gameData, "vice").map((o) => String(o.Name));
        const isCustom = option === "__custom__" || !optionNames.includes(option);
        const name = isCustom ? customName.trim() : option;
        const entry = gameDataOptions(gameData, "vice").find((o) => o.Name === option);
        const customDesc = (root.querySelector('input[aria-label="Vice custom description"]') as HTMLInputElement | null)
          ?.value ?? editor.customDesc;
        const description = isCustom
          ? customDesc.trim()
          : (entry && typeof entry.Description === "string"
              ? entry.Description
              : customDesc.trim());
        const purveyorName = (root.querySelector('input[aria-label="Vice purveyor name"]') as HTMLInputElement | null)
          ?.value ?? editor.purveyorName;
        const purveyorDesc = (root.querySelector('input[aria-label="Vice purveyor description"]') as HTMLInputElement | null)
          ?.value ?? editor.purveyorDesc;
        payload = {
          vice: {
            name,
            description,
            purveyor: {
              name: purveyorName.trim(),
              description: purveyorDesc.trim(),
            },
          },
        };
      } else {
        const optionNames = gameDataOptions(gameData, key).map((o) => String(o.Name));
        const isCustom = option === "__custom__" || !optionNames.includes(option);
        const name = isCustom ? customName.trim() : option;
        const description = isCustom ? "" : (gameDataDescription(gameData, key, option) ?? "");
        payload = { [key]: { name, description } };
      }
      isDossierLoading = true;
      clearNotices();
      namedEditor = null;
      renderDetailWrapper();

      const program = dossierUpdate(characterId, payload, currentCharacter.revision);
      runCharacterMutate(
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isDossierLoading = false; },
      );
    },

    onNamedCancel: () => {
      namedEditor = null;
      renderDetailWrapper();
    },

    // -- F4: pending-trauma resolution (Q42, lifecycle-matrix §8) ----------
    // Resolving records the trauma, keeps stress FULL, and marks the
    // character out-of-action for the remainder of the score. The stress.clear
    // chain is gone — stress stays full until end-score (the only release).
    onTraumaFromStress: () => {
      if (!currentCharacter || isTraumaPickerLoading) return;
      const sel = root.querySelector('select[aria-label="Trauma when stressed"]') as HTMLSelectElement;
      const trauma = sel?.value || null;
      if (!trauma) return;
      isTraumaPickerLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = traumaAdd(characterId, trauma, currentCharacter.revision);
      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => {
            failMutate(err, () => { isTraumaPickerLoading = false; });
          },
          onSuccess: (withTrauma) => {
            if (cancelled) return;
            isTraumaPickerLoading = false;
            currentCharacter = withTrauma;
            noticeMsg = `${trauma} taken — stress stays full; out of action until the score ends`;
            setTimeout(() => {
              if (!cancelled) {
                noticeMsg = null;
                renderDetailWrapper();
              }
            }, 4000);
            renderDetailWrapper();
          },
        }),
      );
    },

    // -- F2ab: notes (C4 list) ---------------------------------------------

    onNoteAdd: () => {
      if (!currentCharacter || isNotesLoading) return;
      const input = root.querySelector('input[aria-label="New note"]') as HTMLInputElement;
      const text = input?.value?.trim() ?? "";
      if (!text) return;
      isNotesLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = noteAdd(characterId, text, currentCharacter.revision);
      runCharacterMutate(
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isNotesLoading = false; },
      );
    },

    onNoteRemove: (index: number) => {
      if (!currentCharacter || isNotesLoading) return;
      isNotesLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = noteRemove(characterId, index, currentCharacter.revision);
      runCharacterMutate(
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isNotesLoading = false; },
      );
    },

    onNotebookSave: () => {
      if (!currentCharacter || isNotebookLoading) return;
      const notebookEl = root.querySelector('textarea[aria-label="Notebook"]') as HTMLTextAreaElement;
      const text = notebookEl?.value ?? "";
      isNotebookLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = notebookSet(characterId, text, currentCharacter.revision);
      runCharacterMutate(
        program,
        (character) => {
          currentCharacter = character;
          notebookNotice = "Notebook saved.";
          renderDetailWrapper();
        },
        () => { isNotebookLoading = false; },
      );
    },

    // -- F2ab: crew membership ---------------------------------------------

    onCrewJoin: () => {
      if (!currentCharacter || isCrewsLoading) return;
      const sel = root.querySelector('select[aria-label="Join crew"]') as HTMLSelectElement;
      const crewId = sel?.value ?? "";
      if (!crewId) return;
      isCrewsLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = dossierUpdate(characterId, { crewId }, currentCharacter.revision);
      runCharacterMutate(
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isCrewsLoading = false; },
      );
    },

    onCrewLeave: () => {
      if (!currentCharacter || isCrewsLoading) return;
      if (!currentCharacter.dossier.crewId) return;
      isCrewsLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = dossierUpdate(characterId, { crewId: "" }, currentCharacter.revision);
      runCharacterMutate(
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isCrewsLoading = false; },
      );
    },

    onDismissCue: (key: string) => {
      if (!dismissedCues.has(key)) {
        dismissedCues.add(key);
        renderDetailWrapper();
      }
    },

    onUndo: () => {
      if (!currentCharacter || isUndoLoading) return;
      isUndoLoading = true;
      undoNotice = null;
      renderDetailWrapper();

      const program = undoCharacter(characterId, currentCharacter.revision);
      const before = currentCharacter;

      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => {
            if (cancelled) return;
            isUndoLoading = false;
            if (err instanceof StaleRevisionError) {
              renderDetailWrapper();
              refreshAndShowNotice();
            } else if (err instanceof OpError && err.error.code === "NO_HISTORY") {
              undoNotice = "Nothing to undo — no history available";
              renderDetailWrapper();
            } else {
              errorMsg = opErrorText(err);
              renderDetailWrapper();
            }
          },
          onSuccess: ({ character, canUndo, historyCount }) => {
            if (cancelled) return;
            isUndoLoading = false;
            errorMsg = null;
            noticeMsg = null;
            currentCharacter = character;
            canUndoState = canUndo;
            historyCountState = historyCount;
            // FV-028: positive feedback that names the restored state, distinct
            // from the NO_HISTORY error copy above.
            undoNotice = `Undone — restored ${describeRestore(before, character)}.`;
            renderDetailWrapper();
          },
        }),
      );
    },

    // -- F4: end-score / retire / delete -----------------------------------

    onEndScore: () => {
      if (!currentCharacter || isEndScoreLoading) return;
      const confirmed = window.confirm(
        "End the score? This clears stress, takes the character out of action, " +
        "and (optionally) resets armor and loadout — in one snapshotted change " +
        "you can undo.",
      );
      if (!confirmed) return;
      isEndScoreLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = endScore(characterId, currentCharacter.revision);
      runCharacterMutate(
        program,
        (character) => {
          currentCharacter = character;
          noticeMsg = "Score ended — stress cleared.";
          renderDetailWrapper();
        },
        () => { isEndScoreLoading = false; },
      );
    },

    onEndDowntime: () => {
      if (!currentCharacter || isDowntimeLoading) return;
      const confirmed = window.confirm(
        "End downtime? This clears the playbook, character, and struggle " +
        "expression tracks. Undo can restore them.",
      );
      if (!confirmed) return;
      isDowntimeLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = endDowntime(characterId, currentCharacter.revision, { clearSessionExpressions: true });
      runCharacterMutate(
        program,
        (character) => {
          currentCharacter = character;
          noticeMsg = "Downtime ended — session expressions cleared.";
          renderDetailWrapper();
        },
        () => { isDowntimeLoading = false; },
      );
    },

    onRetire: () => {
      if (!currentCharacter || isRetireLoading) return;
      const confirmed = window.confirm(
        "Retire this character? This is independent of trauma — it heals harm, " +
        "clears stress and armor, and keeps the dossier/notes, but disables " +
        "gameplay. If it's a mistake, Undo restores the character.",
      );
      if (!confirmed) return;
      isRetireLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = retireCharacter(characterId, currentCharacter.revision);
      runCharacterMutate(
        program,
        (character) => {
          currentCharacter = character;
          noticeMsg = `${character.dossier.name || "This character"} has retired. Undo can restore it.`;
          renderDetailWrapper();
        },
        () => { isRetireLoading = false; },
      );
    },

    onDeleteCharacter: () => {
      if (!currentCharacter || isDeleteLoading) return;
      const confirmed = window.confirm(
        "Delete this character permanently? This is not undoable and removes " +
        "their history. Retired characters can also be deleted.",
      );
      if (!confirmed) return;
      isDeleteLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = deleteCharacter(characterId, String(currentCharacter.revision));
      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => {
            if (cancelled) return;
            isDeleteLoading = false;
            if (err instanceof StaleRevisionError) {
              renderDetailWrapper();
              refreshAndShowNotice();
            } else {
              errorMsg = opErrorText(err);
              renderDetailWrapper();
            }
          },
          onSuccess: () => {
            if (cancelled) return;
            // The entity is gone — leave the page via history navigation.
            window.location.assign("/roster");
          },
        }),
      );
    },

    // -- F2n: Health handlers -----------------------------------------------

    onHarmAdd: () => {
      if (!currentCharacter || isHarmLoading) return;
      const intensitySelect = root.querySelector('select[aria-label="Harm intensity"]') as HTMLSelectElement;
      const descInput = root.querySelector('input[aria-label="Harm description"]') as HTMLInputElement;
      const intensity = intensitySelect?.value;
      const description = descInput?.value?.trim();
      if (!intensity || !description) return;
      isHarmLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = harmAdd(characterId, description, intensity, currentCharacter.revision);
      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => {
            if (cancelled) return;
            isHarmLoading = false;
            if (err instanceof StaleRevisionError) {
              renderDetailWrapper();
              refreshAndShowNotice();
            } else {
              errorMsg = opErrorText(err);
              renderDetailWrapper();
            }
          },
          onSuccess: (result) => {
            if (cancelled) return;
            isHarmLoading = false;
            currentCharacter = result.character;
            if (result.landedIntensity && result.landedIntensity !== intensity) {
              harmSpillNotice = `spilled to ${result.landedIntensity}`;
              setTimeout(() => {
                if (!cancelled) {
                  harmSpillNotice = null;
                  renderDetailWrapper();
                }
              }, 5000);
            }
            renderDetailWrapper();
          },
        }),
      );
    },

    onHarmRemove: (description: string, intensity: string) => {
      if (!currentCharacter || isHarmLoading) return;
      isHarmLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = harmRemove(characterId, description, intensity, currentCharacter.revision);
      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => {
            if (cancelled) return;
            isHarmLoading = false;
            if (err instanceof StaleRevisionError) {
              renderDetailWrapper();
              refreshAndShowNotice();
            } else {
              errorMsg = opErrorText(err);
              renderDetailWrapper();
            }
          },
          onSuccess: (character) => {
            if (cancelled) return;
            isHarmLoading = false;
            currentCharacter = character;
            renderDetailWrapper();
          },
        }),
      );
    },

    onHarmHeal: () => {
      if (!currentCharacter || isHealLoading) return;
      if (currentCharacter.monitor.harm.healingClock.segments < currentCharacter.monitor.harm.healingClock.size) return;
      // F2ab: the heal picker targets one specific currently-active harm.
      const sel = root.querySelector('select[aria-label="Harm to heal"]') as HTMLSelectElement;
      const harms = activeHarms(currentCharacter);
      const idx = sel ? Number(sel.value) : -1;
      const harm = idx >= 0 ? harms[idx] : undefined;
      if (!harm) return;
      isHealLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = harmHeal(characterId, harm.intensity, harm.description, currentCharacter.revision);
      runCharacterMutate(
        program,
        (character) => {
          currentCharacter = character;
          healNotice = `Healed ${harm.intensity} — ${harm.description}; clock reset`;
          setTimeout(() => {
            if (!cancelled) {
              healNotice = null;
              renderDetailWrapper();
            }
          }, 4000);
          renderDetailWrapper();
        },
        () => { isHealLoading = false; },
        healOpErrorText,
      );
    },

    onHarmHealingClock: () => {
      if (!currentCharacter || isClockLoading) return;
      // FV-007/P07: the healing clock is a rollover clock and the +1 control
      // sends a DELTA (the clock-progress family), never an absolute segment
      // count — so a clock at 5/6 sends {segments:1}. The server accepts
      // overflow into rollover and applies it on reset.
      const delta = 1;
      isClockLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = harmHealingClock(characterId, delta, currentCharacter.revision);
      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => {
            if (cancelled) return;
            isClockLoading = false;
            if (err instanceof StaleRevisionError) {
              renderDetailWrapper();
              refreshAndShowNotice();
            } else {
              errorMsg = opErrorText(err);
              renderDetailWrapper();
            }
          },
          onSuccess: (character) => {
            if (cancelled) return;
            isClockLoading = false;
            currentCharacter = character;
            renderDetailWrapper();
          },
        }),
      );
    },

    onArmorSet: (armor: string, used: boolean) => {
      if (!currentCharacter || isArmorLoading) return;
      isArmorLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = armorSet(characterId, armor, used, currentCharacter.revision);
      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => {
            if (cancelled) return;
            isArmorLoading = false;
            if (err instanceof StaleRevisionError) {
              renderDetailWrapper();
              refreshAndShowNotice();
            } else {
              errorMsg = opErrorText(err);
              renderDetailWrapper();
            }
          },
          onSuccess: (character) => {
            if (cancelled) return;
            isArmorLoading = false;
            currentCharacter = character;
            renderDetailWrapper();
          },
        }),
      );
    },

    // -- F2o: Talents + XP + Score XP handlers ------------------------------

    onActionSetRating: (attribute: string, action: string, next: number) => {
      if (!currentCharacter || isTalentsLoading) return;
      isTalentsLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = actionSetRating(characterId, action, next, currentCharacter.revision);
      runCharacterMutate(
        program,
        (character) => {
          currentCharacter = character;
          // Server clamps to the action's maxRating; surface a notice when it did.
          const attr = character.talent.attributes.find((a) => a.name === attribute);
          const act = attr?.actions.find((a) => a.name === action);
          if (act && act.rating < next) {
            clampNotice = `Server clamped ${action} rating to ${act.rating} (max ${act.maxRating})`;
            setTimeout(() => {
              if (!cancelled) {
                clampNotice = null;
                renderDetailWrapper();
              }
            }, 5000);
          }
          renderDetailWrapper();
        },
        () => { isTalentsLoading = false; },
      );
    },

    onAttributeXpDelta: (attribute: string, delta: number) => {
      if (!currentCharacter || isTalentsLoading) return;
      isTalentsLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = attributeXpAdd(characterId, attribute, delta, currentCharacter.revision);
      runCharacterMutate(
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isTalentsLoading = false; },
      );
    },

    onAttributeXpClear: (attribute: string) => {
      if (!currentCharacter || isTalentsLoading) return;
      isTalentsLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = attributeXpClear(characterId, attribute, currentCharacter.revision);
      runCharacterMutate(
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isTalentsLoading = false; },
      );
    },

    onAttributeLevelup: (attribute: string) => {
      if (!currentCharacter || isTalentsLoading) return;
      const sel = root.querySelector(
        `select[aria-label="Level up action (${attribute})"]`,
      ) as HTMLSelectElement;
      const action = sel?.value || null;
      if (!action) return;
      isTalentsLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = attributeLevelup(characterId, attribute, action, currentCharacter.revision);
      runCharacterMutate(
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isTalentsLoading = false; },
      );
    },

    onSessionTrack: (field: keyof SessionFields, next: number) => {
      if (!currentCharacter || isSessionLoading) return;
      if (next < 0 || next > currentCharacter.session.max) return;
      isSessionLoading = true;
      clearNotices();
      renderDetailWrapper();

      // Contract: partial update, send only the changed field
      const program = sessionSet(characterId, { [field]: next }, currentCharacter.revision);
      runCharacterMutate(
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isSessionLoading = false; },
      );
    },

    onSessionDelta: (field: keyof SessionFields, delta: number) => {
      if (!currentCharacter || isSessionLoading) return;
      const next = currentCharacter.session[field] + delta;
      if (next < 0 || next > currentCharacter.session.max) return;
      handlers.onSessionTrack(field, next);
    },

    // -- F2p: Playbook handlers --------------------------------------------

    onPlaybookXpDelta: (delta: number) => {
      if (!currentCharacter || isPlaybookLoading) return;
      const next = currentCharacter.playbook.experience.points + delta;
      if (next < 0 || next > currentCharacter.playbook.experience.max) return;
      isPlaybookLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = playbookXpAdd(characterId, delta, currentCharacter.revision);
      runCharacterMutate(
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isPlaybookLoading = false; },
      );
    },

    onPlaybookXpClear: () => {
      if (!currentCharacter || isPlaybookLoading) return;
      if (currentCharacter.playbook.experience.points === 0) return;
      isPlaybookLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = playbookXpClear(characterId, currentCharacter.revision);
      runCharacterMutate(
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isPlaybookLoading = false; },
      );
    },

    onAbilityTake: () => {
      if (!currentCharacter || isPlaybookLoading) return;
      const sel = root.querySelector('select[aria-label="Take ability"]') as HTMLSelectElement;
      const name = sel?.value || null;
      if (!name) return;
      isPlaybookLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = abilityTake(characterId, name, currentCharacter.revision);
      runCharacterMutate(
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isPlaybookLoading = false; },
        playbookOpErrorText,
      );
    },

    onAbilityRemove: (name: string) => {
      if (!currentCharacter || isPlaybookLoading) return;
      isPlaybookLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = abilityRemove(characterId, name, currentCharacter.revision);
      runCharacterMutate(
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isPlaybookLoading = false; },
        playbookOpErrorText,
      );
    },

    onGearAdd: () => {
      if (!currentCharacter || isGearLoading) return;
      const sel = root.querySelector('select[aria-label="Add gear item"]') as HTMLSelectElement;
      const name = sel?.value || null;
      if (!name) return;
      // Bulk comes from the game-data menu (never hardcoded); server validates.
      const menu = extractGearMenu(playbookData, gameData, currentCharacter.playbook.name);
      const item = menu.find((m) => m.name === name);
      if (!item) return;
      isGearLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = gearAdd(characterId, item.name, item.bulk, currentCharacter.revision);
      runCharacterMutate(
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isGearLoading = false; },
        gearOpErrorText,
      );
    },

    onGearRemove: (name: string) => {
      if (!currentCharacter || isGearLoading) return;
      isGearLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = gearRemove(characterId, name, currentCharacter.revision);
      runCharacterMutate(
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isGearLoading = false; },
        gearOpErrorText,
      );
    },

    onGearCommit: () => {
      if (!currentCharacter || isGearLoading) return;
      const sel = root.querySelector('select[aria-label="Select gear item"]') as HTMLSelectElement;
      const name = sel?.value || null;
      if (!name) return;
      isGearLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = gearCommit(characterId, name, currentCharacter.revision);
      runCharacterMutate(
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isGearLoading = false; },
        gearOpErrorText,
      );
    },

    onGearUncommit: () => {
      if (!currentCharacter || isGearLoading) return;
      const sel = root.querySelector('select[aria-label="Select gear item"]') as HTMLSelectElement;
      const name = sel?.value || null;
      if (!name) return;
      isGearLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = gearUncommit(characterId, name, currentCharacter.revision);
      runCharacterMutate(
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isGearLoading = false; },
        gearOpErrorText,
      );
    },

    onGearSetCommitment: () => {
      if (!currentCharacter || isGearCommitmentLoading) return;
      const sel = root.querySelector('select[aria-label="Set commitment"]') as HTMLSelectElement;
      const commitment = sel?.value || null;
      if (!commitment) return;
      isGearCommitmentLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = gearSetCommitment(characterId, commitment, currentCharacter.revision);
      runCharacterMutate(
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isGearCommitmentLoading = false; },
        gearOpErrorText,
      );
    },

    onGearToggleLock: () => {
      if (!currentCharacter || isGearLockLoading) return;
      isGearLockLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = currentCharacter.gear.isCommitmentLocked
        ? gearUnlock(characterId, currentCharacter.revision)
        : gearLock(characterId, currentCharacter.revision);
      runCharacterMutate(
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isGearLockLoading = false; },
        gearOpErrorText,
      );
    },

    onGearClearCommitments: () => {
      if (!currentCharacter || isGearCommitmentLoading) return;
      isGearCommitmentLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = gearClearCommitments(characterId, currentCharacter.revision);
      runCharacterMutate(
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isGearCommitmentLoading = false; },
        gearOpErrorText,
      );
    },

    // -- F2s: Coin handlers ------------------------------------------------

    onFundDelta: (delta: number) => {
      if (!currentCharacter || isCoinLoading || delta === 0) return;
      // Spend is always attempted: the server draws from the satchel first,
      // liquidates stash at 2:1 as needed, and rejects with INSUFFICIENT_FUNDS
      // when nothing can cover it (surfaced as an op-level notice).
      isCoinLoading = true;
      clearNotices();
      renderDetailWrapper();

      // − spends from the satchel (server liquidates stash at 2:1 when needed),
      // + gains into the satchel with overflow to stash.
      const program = delta > 0
        ? fundGain(characterId, delta, currentCharacter.revision)
        : fundSpend(characterId, -delta, currentCharacter.revision);
      runFundMutate(
        program,
        (result) => {
          currentCharacter = result.character;
          // gain overflow: server stores what fits and reports applied.effective
          if (delta > 0 && result.effective < result.requested) {
            coinNotice = `Stored ${result.effective} of ${result.requested} coins — satchel and stash are full`;
            setTimeout(() => {
              if (!cancelled) {
                coinNotice = null;
                renderDetailWrapper();
              }
            }, 5000);
          }
          renderDetailWrapper();
        },
        () => { isCoinLoading = false; },
        coinOpErrorText,
      );
    },



    onFundLiquidate: () => {
      if (!currentCharacter || isCoinLoading) return;
      const input = root.querySelector('input[aria-label="Coins to liquidate"]') as HTMLInputElement;
      const coins = input ? Number(input.value) : NaN;
      if (!Number.isFinite(coins) || coins < 1) return;
      isCoinLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = fundLiquidate(characterId, coins, currentCharacter.revision);
      runFundMutate(
        program,
        (result) => {
          currentCharacter = result.character;
          renderDetailWrapper();
        },
        () => { isCoinLoading = false; },
        coinOpErrorText,
      );
    },

    // -- F2s: Projects (clocks) handlers -----------------------------------

    onCreateClock: () => {
      if (isClocksLoading) return;
      const nameInput = root.querySelector('input[aria-label="Clock name"]') as HTMLInputElement;
      const kindSelect = root.querySelector('select[aria-label="Clock kind"]') as HTMLSelectElement;
      const sizeInput = root.querySelector('input[aria-label="Clock size"]') as HTMLInputElement;
      const name = nameInput?.value?.trim() || null;
      const behavior = kindSelect?.value as "bounded" | "rollover" | undefined;
      const size = sizeInput ? Number(sizeInput.value) : NaN;
      if (!name || !behavior || !Number.isInteger(size) || size < 1) return;
      isClocksLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = createClock(name, behavior, size);
      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => {
            if (cancelled) return;
            isClocksLoading = false;
            errorMsg = opErrorText(err, clockOpErrorText);
            renderDetailWrapper();
          },
          onSuccess: (created) => {
            if (cancelled) return;
            isClocksLoading = false;
            upsertClock(created);
            renderDetailWrapper();
          },
        }),
      );
    },

    onClockProgress: (clockId: string, segments: number) => {
      if (isClocksLoading) return;
      const clk = (clocks ?? []).find((x) => x.id === clockId);
      if (!clk) return;
      isClocksLoading = true;
      clearNotices();
      renderDetailWrapper();

      //  clockSummary rows carry the row's If-Match value in deleteToken
      //  ("" for readable rows → the header is omitted and the server skips
      //  the check; a degraded row's token would pass and the op then 422s
      //  at admission).
      const program = clockProgress(clockId, segments, clk.deleteToken);
      runClockMutate(
        program,
        (updated) => {
          upsertClock(updated);
          renderDetailWrapper();
        },
        () => { isClocksLoading = false; },
        clockOpErrorText,
      );
    },

    onClockReset: (clockId: string) => {
      if (isClocksLoading) return;
      const clk = (clocks ?? []).find((x) => x.id === clockId);
      if (!clk) return;
      isClocksLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = clockReset(clockId, clk.deleteToken);
      runClockMutate(
        program,
        (updated) => {
          upsertClock(updated);
          renderDetailWrapper();
        },
        () => { isClocksLoading = false; },
        clockOpErrorText,
      );
    },

    onClockDelete: (clockId: string) => {
      if (isClocksLoading) return;
      const clk = (clocks ?? []).find((x) => x.id === clockId);
      if (!clk) return;
      isClocksLoading = true;
      clearNotices();
      renderDetailWrapper();

      //  A degraded row deletes via its deleteToken (sha256 content token);
      //  a readable row's token is "" and the delete requires the current
      //  revision, so the full DTO is fetched for the revision first.
      const program = clk.deleteToken
        ? deleteClock(clockId, clk.deleteToken)
        : Effect.gen(function* () {
            const full = yield* getClock(clockId);
            return yield* deleteClock(clockId, String(full.revision));
          });
      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => {
            if (cancelled) return;
            isClocksLoading = false;
            if (err instanceof StaleRevisionError) {
              renderDetailWrapper();
              refreshClocksAndNotice();
            } else {
              errorMsg = opErrorText(err, clockOpErrorText);
              renderDetailWrapper();
            }
          },
          onSuccess: () => {
            if (cancelled) return;
            isClocksLoading = false;
            clocks = (clocks ?? []).filter((x) => x.id !== clockId);
            renderDetailWrapper();
          },
        }),
      );
    },
  };

  // FV-012: wholesale re-renders destroy the focused control; capture the
  // focused control's position before rendering and restore it after. The
  // request stays pending while the target is disabled (in-flight loading
  // render) so the post-mutation render fulfils it.
  let pendingFocus: FocusTarget | null = null;

  const renderDetailWrapper = () => {
    if (!currentCharacter) return;
    if (!pendingFocus) pendingFocus = captureFocusTarget(root);
    setChildren(root, renderDetail({
      c: currentCharacter,
      gameData,
      playbookData,
      caps,
      crews,
      isCrewsLoading,
      crewNotice,
      isNotesLoading,
      notesNotice,
      isNotebookLoading,
      notebookNotice,
      isTraumaPickerLoading,
      healNotice,
      isEndScoreLoading,
      isDowntimeLoading,
      isRetireLoading,
      isDeleteLoading,
      canUndo: canUndoState,
      historyCount: historyCountState,
      isStressLoading,
      isStressClearLoading,
      isTraumaLoading,
      isDossierLoading,
      isUndoLoading,
      isHarmLoading,
      isArmorLoading,
      isHealLoading,
      isClockLoading,
      isTalentsLoading,
      isSessionLoading,
      clampNotice,
      experienceCondition,
      isPlaybookLoading,
      abilityNotice,
      isGearLoading,
      isGearCommitmentLoading,
      isGearLockLoading,
      dismissedCues,
      clocks,
      isCoinLoading,
      isClocksLoading,
      coinNotice,
      clocksNotice,
      errorMsg,
      noticeMsg,
      undoNotice,
      harmSpillNotice,
      editing,
      namedEditor,
      rerender: renderDetailWrapper,
      handlers,
    }));
    if (pendingFocus && applyFocusTarget(root, pendingFocus)) pendingFocus = null;
  };

  root.setAttribute("aria-live", "polite");

  const startLoad = () => {
    root.setAttribute("aria-busy", "true");
    setChildren(root, renderLoading());

    // Fetch character + game data + playbook settings in parallel
    const loadProgram = Effect.gen(function* () {
      const character = yield* getCharacter(characterId);
      const game = yield* Effect.either(getGame(character.gameStem));
      // Playbook settings carry the ExperienceCondition for the Score XP track;
      // failures degrade gracefully (fall back to game-data Playbooks lookup).
      const playbook = yield* Effect.either(
        getPlaybook(character.gameStem, character.playbook.name),
      );
      // Campaign clocks for the Projects section; failures degrade gracefully
      // (the section renders "(no clocks)" until a successful fetch).
      const clockList = yield* Effect.either(listClocks());
      // Crew list for the membership selector; failures degrade gracefully
      // (the selector renders disabled until a successful fetch).
      const crewList = yield* Effect.either(listCrews());
      // SC-F3: server-computed capability projection (effective action caps,
      // harm capacities, load limits). Advisory — degrade gracefully.
      const capProjection = yield* Effect.either(getCharacterCapabilities(characterId));
      return { character, game, playbook, clockList, crewList, capProjection };
    });

    void Effect.runPromise(
      Effect.match(loadProgram, {
        onFailure: (err) => {
          if (cancelled) return;
          root.setAttribute("aria-busy", "false");
          const msg =
            err instanceof ApiError
              ? `Failed to reach /api/characters/${characterId} (${err.status}): ${err.body}`
              : err instanceof DecodeError
                ? `Invalid character response: ${err.message}`
                : String(err);
          setChildren(
            root,
            errorCard({
              headline: "This character sheet could not be loaded.",
              detail: msg,
              onRetry: startLoad,
            }),
          );
        },
        onSuccess: ({ character, game, playbook, clockList, crewList, capProjection }) => {
          if (cancelled) return;
          root.setAttribute("aria-busy", "false");
          currentCharacter = character;
          if (capProjection._tag === "Right") {
            caps = capProjection.right;
          }
          if (game._tag === "Right") {
            gameData = game.right;
          }
          if (playbook._tag === "Right") {
            playbookData = playbook.right;
          }
          if (clockList._tag === "Right") {
            clocks = clockList.right;
          }
          if (crewList._tag === "Right") {
            crews = crewList.right;
          }
          experienceCondition = extractExperienceCondition(playbookData, gameData, character.playbook.name);
          renderDetailWrapper();
        },
      }),
    );
  };

  startLoad();

  return () => {
    cancelled = true;
  };
}
