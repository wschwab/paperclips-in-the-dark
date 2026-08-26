import { Effect } from "effect";
import {
  ApiError,
  OpError,
  DecodeError,
  opErrorFriendlyText,
  transportErrorText,
  decodeErrorText,
  getCrew,
  undoCrew,
  deleteCrew,
  crewContactAdd,
  crewContactRemove,
  factionSetStatus,
  factionRemove,
  crewFieldsUpdate,
  crewRepAdd,
  crewHeatAdd,
  crewWantedAdd,
  crewTierAdd,
  crewHoldSet,
  crewCoinAdd,
  crewStashAdd,
  crewAbilityTake,
  crewAbilityRemove,
  crewClaimSet,
  crewClaimCustomize,
  crewClaimReset,
  upgradeMark,
  upgradeUnmark,
  getCrewType,
  getCrewGameData,
  cohortAdd,
  cohortRemove,
  cohortUpdate,
  crewXpAdd,
  crewXpClear,
  crewNoteAdd,
  crewNoteRemove,
  crewTurfAdd,
  getCrewCapabilities,
  StaleRevisionError,
} from "../api/client.js";
import type { CrewCapabilities, CrewTrackOpResult } from "../api/client.js";
import { el, setChildren } from "../lib/dom.js";
import { captureFocusTarget, applyFocusTarget, type FocusTarget } from "../lib/focus.js";
import { errorCard } from "../components/error-card.js";
import type { Crew } from "../schema/crew.js";
import { CohortHarm, CohortType, Hold } from "../schema/common.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Editable free-text crew fields (contract fields.update). Reputation is a
 * game-data dropdown (F2ac) and notes are a dedicated multi-note section
 * (C4/F2ac), so neither is a free-text profile field here. */
type CrewField = "name" | "lair" | "huntingGrounds";

const CREW_FIELD_LABELS: Record<CrewField, string> = {
  name: "Name",
  lair: "Lair",
  huntingGrounds: "Hunting grounds",
};

// CONTRACT-04 (2026-08-25): Tier renders in Roman numerals like the printed
// crew sheet — 0 stays "0"; a legacy value above the printed scale falls
// back to decimal digits. Pure display: the wire format is the DTO integer.
// CONTRACT-04 review fix: numeral rendering derives from the loaded
// capabilities tierMax (settings-derived server-side). Requires a positive
// finite tierMax before Roman formatting; without one, renders decimal.
const ROMAN_PAIRS: ReadonlyArray<[number, string]> = [
  [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];
function toRoman(n: number): string {
  let result = "";
  for (const [value, numeral] of ROMAN_PAIRS) {
    while (n >= value) { result += numeral; n -= value; }
  }
  return result;
}
const formatTier = (tier: number, tierMax?: number | null): string => {
  // Render decimal only when an explicit cap is provided AND exceeded.
  // Otherwise, always render Roman — the UI fallback when capabilities
  // haven't loaded yet. Tier 0 renders as decimal "0".
  if (tier < 1) return String(tier);
  if (typeof tierMax === "number" && tier > tierMax) return String(tier);
  return toRoman(tier);
};
interface ProfileEditingState {
  field: CrewField;
  value: string;
}

interface RenderState {
  c: Crew;
  anyLoading: boolean;
  crewTypeData: Record<string, unknown> | null;
  crewTypesData: readonly Record<string, unknown>[] | null;
  crewGameData: Record<string, unknown> | null;
  /** Server-computed crew capability projection (SC-F3); null until loaded or on fetch failure. */
  crewCaps: CrewCapabilities | null;
  isUndoLoading: boolean;
  isDeleteLoading: boolean;
  isAbilityLoading: boolean;
  isUpgradeLoading: boolean;
  isCohortLoading: boolean;
  isXpLoading: boolean;
  isContactLoading: boolean;
  isFactionLoading: boolean;
  isProfileLoading: boolean;
  isRepLoading: boolean;
  isHeatLoading: boolean;
  isWantedLoading: boolean;
  isTierLoading: boolean;
  isHoldLoading: boolean;
  isCoinLoading: boolean;
  isStashLoading: boolean;
  isTurfLoading: boolean;
  isNoteLoading: boolean;
  isDevelopLoading: boolean;
  /** CREW-04: session-local advancement-edit mode — ability-remove /
   * upgrade-unmark controls only exist while it's on. Component state only,
   * never persisted server-side. */
  advancementEdit: boolean;
  editingProfile: ProfileEditingState | null;
  editingCohortId: string | null;
  /** CREW-02: removal (relinquish) lives behind this explicit session-local
   *  toggle; acquisition stays available in normal mode. */
  claimsEditMode: boolean;
  errorMsg: string | null;
  noticeMsg: string | null;
  undoNotice: string | null;
  refreshNotice: string | null;
  /** Derived undo state from the last operation result (null = unknown before any op). */
  canUndo: boolean | null;
  historyCount: number | null;
  handlers: {
    onUndo: () => void;
    onDeleteCrew: () => void;
    onContactAdd: () => void;
    onContactRemove: (name: string) => void;
    onFactionSetStatus: (name: string, status: number) => void;
    onFactionRemove: (name: string) => void;
    onProfileEdit: (field: CrewField) => void;
    onProfileSave: () => void;
    onProfileCancel: () => void;
    onRepDelta: (delta: number) => void;
    onRepTrack: (next: number) => void;
    onReputationSet: () => void;
    onTurfDelta: (delta: number) => void;
    onDevelop: () => void;
    onNoteAdd: () => void;
    onNoteRemove: (index: number) => void;
    onHeatDelta: (delta: number) => void;
    onHeatTrack: (next: number) => void;
    onWantedDelta: (delta: number) => void;
    onWantedTrack: (next: number) => void;
    onTierDelta: (delta: number) => void;
    onHoldSet: (hold: string) => void;
    onCoinDelta: (delta: number) => void;
    onStashDelta: (delta: number) => void;
    onAbilityTake: () => void;
    onAbilityRemove: (name: string) => void;
    onUpgradeMark: (name: string) => void;
    onUpgradeMarkMenu: () => void;
    onUpgradeUnmark: (name: string) => void;
    onChartBox: (name: string, index: number) => void;
    onCohortAdd: () => void;
    onCohortEdit: (cohortId: string) => void;
    onCohortUpdate: (cohortId: string, fields: Record<string, unknown>) => void;
    onCohortRemove: (cohortId: string) => void;
    onCohortCancel: () => void;
    onXpDelta: (delta: number) => void;
    onXpTrack: (next: number) => void;
    onXpClear: () => void;
    onClaimsEditToggle: () => void;
    onAdvancementEditToggle: () => void;
    onClaimToggle: (claimId: string, claimed: boolean) => void;
    onClaimCustomize: (claimId: string) => void;
    onClaimReset: (claimId: string) => void;
  };
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

/** Friendly copy per error class (FV-023/FV-024): typed op errors map known
 * codes to user copy, transport/decode failures get their own distinct copy;
 * never raw body/DTO/parser text. */
function opErrorText(err: unknown): string {
  if (err instanceof OpError) {
    if (err.error.code === "DUPLICATE") {
      return "A contact with that name already exists";
    }
    if (err.error.code === "NOT_FOUND") {
      return "Not on this sheet (removed elsewhere?)";
    }
    if (err.error.code === "ABILITY_MAXED") {
      return "That ability is already taken to its limit";
    }
    if (err.error.code === "UPGRADE_MAXED") {
      return "All of that upgrade's boxes are already marked";
    }
    return opErrorFriendlyText(err);
  }
  if (err instanceof ApiError) {
    return transportErrorText(err);
  }
  if (err instanceof DecodeError) {
    return decodeErrorText(err);
  }
  return String(err);
}

/**
 * A row of clickable heavy boxes in the F1 styleguide idiom (same visual
 * language as the character stress track). Clicking box N asks to set the
 * value to N; the +/- buttons are the precise write path over the same ops.
 */
function boxTrack(opts: {
  value: number;
  max: number;
  label: string;
  disabled: boolean;
  onChange: (next: number) => void;
}): HTMLElement {
  const { value, max, label, disabled, onChange } = opts;
  const row = el(
    "div",
    {
      className: "stress-track",
      role: "group",
      "aria-label": `${label}: ${Math.min(value, max)} of ${max}`,
    },
  );
  for (let i = 1; i <= max; i++) {
    const filled = i <= value;
    const btn = el("button", {
      type: "button",
      className: "stress-box",
      "data-stress": filled ? "1" : "0",
      "data-index": String(i),
      "aria-label": `${label} ${i}`,
      "aria-pressed": filled ? "true" : "false",
      disabled,
    });
    btn.addEventListener("click", () => onChange(i));
    row.append(btn);
  }
  return row;
}

/**
 * The crew type's Reputations (game data) — the F2ac reputation dropdown
 * source. Same preferred/fallback shape as extractCrewAbilities:
 * per-crew-type endpoint first, CrewTypes list (find-by-name) otherwise.
 * Returns [] when neither source has it (the dropdown degrades to a
 * read-only value row).
 */
function extractReputations(
  crewTypeData: Record<string, unknown> | null,
  crewTypesData: readonly Record<string, unknown>[] | null,
  crewTypeName: string,
): string[] {
  if (crewTypeData && Array.isArray(crewTypeData.Reputations)) {
    return (crewTypeData.Reputations as unknown[]).filter(
      (r): r is string => typeof r === "string",
    );
  }
  if (Array.isArray(crewTypesData)) {
    const found = crewTypesData.find(
      (ct) => ct && typeof ct === "object" && ct.Name === crewTypeName,
    );
    if (found && Array.isArray(found.Reputations)) {
      return (found.Reputations as unknown[]).filter(
        (r): r is string => typeof r === "string",
      );
    }
  }
  return [];
}

/**
 * Canonical BitD cohort type lists. The Ada backend serves the raw
 * {stem}-crews.json game-data file, which carries the per-crew-type
 * Reputations but not the top-level cohort lists, so these task-specified
 * values are the fallback when the game-data keys are absent (the UI must
 * stay usable live). When a game provides CohortGangTypes / CohortExpertTypes
 * the game-data arrays win.
 */
const COHORT_GANG_TYPES = ["Adepts", "Rooks", "Rovers", "Skulls", "Thugs"];
const COHORT_EXPERT_TYPES = [
  "Doctor",
  "Investigator",
  "Occultist",
  "Assassin",
  "Spy",
  "Custom",
];

/** Cohort gang-type options: game-data CohortGangTypes, else the canonical
 * list (never empty — the add/edit forms need a working menu). */
function extractCohortGangTypes(
  crewGameData: Record<string, unknown> | null,
): string[] {
  if (crewGameData && Array.isArray(crewGameData.CohortGangTypes)) {
    const values = (crewGameData.CohortGangTypes as unknown[]).filter(
      (v): v is string => typeof v === "string",
    );
    if (values.length > 0) return values;
  }
  return [...COHORT_GANG_TYPES];
}

/** Cohort expert-type options: game-data CohortExpertTypes, else the
 * canonical list. */
function extractCohortExpertTypes(
  crewGameData: Record<string, unknown> | null,
): string[] {
  if (crewGameData && Array.isArray(crewGameData.CohortExpertTypes)) {
    const values = (crewGameData.CohortExpertTypes as unknown[]).filter(
      (v): v is string => typeof v === "string",
    );
    if (values.length > 0) return values;
  }
  return [...COHORT_EXPERT_TYPES];
}

/** One bounded tracker: box row + current/max + -/+ buttons. */
function renderTracker(
  state: RenderState,
  opts: {
    className: string;
    label: string;
    current: number;
    max: number;
    isLoading: boolean;
    onDelta: (delta: number) => void;
    onTrack: (next: number) => void;
    note?: string | null;
  },
): HTMLElement {
  const minusBtn = el("button", {
    type: "button",
    disabled: state.anyLoading || opts.current <= 0,
    title: `Remove 1 ${opts.label.toLowerCase()}`,
  }, "−1");
  minusBtn.addEventListener("click", () => opts.onDelta(-1));

  const plusBtn = el("button", {
    type: "button",
    // P29/FV-029: the bound control is disabled once the track is full — the
    // server would otherwise clamp the delta silently.
    disabled: state.anyLoading || opts.current >= opts.max,
    title: `Add 1 ${opts.label.toLowerCase()}`,
  }, opts.isLoading ? "…" : "+1");
  plusBtn.addEventListener("click", () => opts.onDelta(1));

  return el(
    "div",
    { className: opts.className, style: "margin: 0.6em 0;" },
    el(
      "div",
      { style: "display: flex; gap: 1em; align-items: center; flex-wrap: wrap;" },
      boxTrack({
        value: opts.current,
        max: opts.max,
        label: opts.label,
        disabled: state.anyLoading,
        onChange: opts.onTrack,
      }),
      el("span", {}, `${opts.current} / ${opts.max}`),
      minusBtn,
      plusBtn,
    ),
    opts.note
      ? el("div", { className: "lbl", style: "margin-top: 0.35em;" }, opts.note)
      : null,
  );
}

/** Split a comma-separated input into trimmed non-empty items (edges/flaws). */
function splitList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Order-sensitive array equality for the cohort edges/flaws diff. */
function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// ---------------------------------------------------------------------------
// F2v: crew-type game data extraction
// ---------------------------------------------------------------------------

/**
 * The crew type's SpecialAbilities (game data): from the per-crew-type
 * endpoint response or (fallback) the CrewTypes list from
 * /api/games/{stem}/crews. Each entry carries { Name, TimesTakeable,
 * Description }. Returns [] when neither source has it (graceful
 * degradation). The current Ada backend answers 404 for the per-crew-type
 * GET (its conformance case accepts [200, 404]), so the fallback is the
 * path the live probe exercises.
 */
function extractCrewAbilities(
  crewTypeData: Record<string, unknown> | null,
  crewTypesData: readonly Record<string, unknown>[] | null,
  crewTypeName: string,
): Array<Record<string, unknown>> {
  if (crewTypeData && Array.isArray(crewTypeData.SpecialAbilities)) {
    return crewTypeData.SpecialAbilities as Array<Record<string, unknown>>;
  }
  if (Array.isArray(crewTypesData)) {
    const found = crewTypesData.find(
      (ct) => ct && typeof ct === "object" && ct.Name === crewTypeName,
    );
    if (found && Array.isArray(found.SpecialAbilities)) {
      return found.SpecialAbilities as Array<Record<string, unknown>>;
    }
  }
  return [];
}

/**
 * The crew type's Upgrades (game data) — same source shape and fallback
 * logic as extractCrewAbilities. Each entry carries { Name, TotalBoxes,
 * Description }.
 */
function extractCrewUpgrades(
  crewTypeData: Record<string, unknown> | null,
  crewTypesData: readonly Record<string, unknown>[] | null,
  crewTypeName: string,
): Array<Record<string, unknown>> {
  if (crewTypeData && Array.isArray(crewTypeData.Upgrades)) {
    return crewTypeData.Upgrades as Array<Record<string, unknown>>;
  }
  if (Array.isArray(crewTypesData)) {
    const found = crewTypesData.find(
      (ct) => ct && typeof ct === "object" && ct.Name === crewTypeName,
    );
    if (found && Array.isArray(found.Upgrades)) {
      return found.Upgrades as Array<Record<string, unknown>>;
    }
  }
  return [];
}

/** TotalBoxes from game data (never hardcoded); defaults to 1 when absent. */
function upgradeTotalBoxes(upgrade: Record<string, unknown> | undefined): number {
  return upgrade && typeof upgrade.TotalBoxes === "number" ? upgrade.TotalBoxes : 1;
}

/** Description from game data, with a fallback for unknown upgrades. */
function upgradeDescription(upgrade: Record<string, unknown> | undefined, name: string): string {
  return upgrade && typeof upgrade.Description === "string" && upgrade.Description.length > 0
    ? upgrade.Description
    : `No description available for ${name}.`;
}

// ---------------------------------------------------------------------------
// Crew Claims (2026-08-10): the canonical 5x3 claim map from game data.
// ---------------------------------------------------------------------------

/** Canonical Claims graph for the crew type: {Columns, Rows, Nodes, Edges}. */
function extractCrewClaims(
  crewTypeData: Record<string, unknown> | null,
  crewTypesData: readonly Record<string, unknown>[] | null,
  crewTypeName: string,
): Record<string, unknown> | null {
  if (crewTypeData && typeof crewTypeData.Claims === "object" && crewTypeData.Claims !== null) {
    return crewTypeData.Claims as Record<string, unknown>;
  }
  if (Array.isArray(crewTypesData)) {
    const found = crewTypesData.find(
      (ct) => ct && typeof ct === "object" && ct.Name === crewTypeName,
    );
    if (found && typeof (found as Record<string, unknown>).Claims === "object") {
      return (found as Record<string, unknown>).Claims as Record<string, unknown>;
    }
  }
  return null;
}

interface ClaimNode {
  id: string;
  name: string;
  description: string;
  kind: "claim" | "turf" | "lair";
  column: number;
  row: number;
}

/** Normalize the PascalCase game-data Claims graph into frontend shapes. */
function claimsGraph(claims: Record<string, unknown>): { nodes: ClaimNode[]; edges: Array<{ from: string; to: string }>; columns: number; rows: number } {
  const nodes = Array.isArray(claims.Nodes) ? (claims.Nodes as Array<Record<string, unknown>>) : [];
  const edges = Array.isArray(claims.Edges) ? (claims.Edges as Array<Record<string, unknown>>) : [];
  return {
    columns: typeof claims.Columns === "number" ? claims.Columns : 5,
    rows: typeof claims.Rows === "number" ? claims.Rows : 3,
    nodes: nodes.map((n) => ({
      id: typeof n.Id === "string" ? n.Id : "",
      name: typeof n.Name === "string" ? n.Name : "",
      description: typeof n.Description === "string" ? n.Description : "",
      kind: (n.Kind === "turf" || n.Kind === "lair" ? n.Kind : "claim") as ClaimNode["kind"],
      column: typeof n.Column === "number" ? n.Column : 1,
      row: typeof n.Row === "number" ? n.Row : 1,
    })),
    edges: edges
      .filter((e) => typeof e.From === "string" && typeof e.To === "string")
      .map((e) => ({ from: e.From as string, to: e.To as string })),
  };
}

/** Effective claim display fields (canonical defaults merged with overrides). */
function effectiveClaim(
  node: ClaimNode,
  overrides: ReadonlyArray<{ claimId: string; name?: string; description?: string; effects?: ReadonlyArray<Readonly<Record<string, unknown>>> }>,
): { node: ClaimNode; name: string; description: string; customized: boolean } {
  const ov = overrides.find((o) => o.claimId === node.id);
  return {
    node,
    name: ov?.name ?? node.name,
    description: ov?.description ?? node.description,
    customized: !!ov,
  };
}

/**
 * The crew type's ExperienceTrigger (game data) — the criteria text shown
 * beneath the XP tracker. Same source shape and find-by-name fallback as
 * extractCrewAbilities: per-crew-type endpoint preferred, CrewTypes list
 * otherwise. Returns null when neither source has it (graceful
 * degradation — the criteria line is simply omitted).
 */
function extractExperienceTrigger(
  crewTypeData: Record<string, unknown> | null,
  crewTypesData: readonly Record<string, unknown>[] | null,
  crewTypeName: string,
): string | null {
  if (crewTypeData && typeof crewTypeData.ExperienceTrigger === "string") {
    return crewTypeData.ExperienceTrigger;
  }
  if (Array.isArray(crewTypesData)) {
    const found = crewTypesData.find(
      (ct) => ct && typeof ct === "object" && ct.Name === crewTypeName,
    );
    if (found && typeof found.ExperienceTrigger === "string") {
      return found.ExperienceTrigger;
    }
  }
  return null;
}

/**
 * F4/FV-028: name the "restored state" after a successful crew undo by
 * diffing before vs after. Picks the most salient changed tracker so the
 * positive undo notice is concrete; falls back to a neutral phrase.
 */
function describeCrewRestore(before: Crew, after: Crew): string {
  if (before.name !== after.name) {
    return `the name "${after.name || "Unnamed"}"`;
  }
  if (before.heat.current !== after.heat.current) {
    return `heat to ${after.heat.current}/${after.heat.max}`;
  }
  if (before.rep.current !== after.rep.current) {
    return `rep to ${after.rep.current}/${after.rep.max}`;
  }
  if (before.coin !== after.coin) {
    return `coin to ${after.coin}`;
  }
  if (before.stash !== after.stash) {
    return `stash to ${after.stash}`;
  }
  if (before.turf !== after.turf) {
    return `turf to ${after.turf}`;
  }
  if (before.experience.points !== after.experience.points) {
    return `XP to ${after.experience.points}/${after.experience.max}`;
  }
  return "the previous state";
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function renderCrewDetail(state: RenderState): HTMLElement {
  const { c, handlers } = state;

  // -- Undo button ----------------------------------------------------------

  const undoButton = el(
    "button",
    {
      disabled: state.isUndoLoading || state.canUndo === false,
      title: "Undo last change",
    },
    state.isUndoLoading ? "…" : "Undo last change",
  );
  undoButton.addEventListener("click", handlers.onUndo);

  // -- Delete crew button ---------------------------------------------------

  const deleteCrewBtn = el("button", {
    type: "button",
    disabled: state.isDeleteLoading,
    title: "Delete this crew permanently (confirmation required, not undoable)",
  }, state.isDeleteLoading ? "…" : "Delete crew");
  deleteCrewBtn.addEventListener("click", handlers.onDeleteCrew);

  // -- Profile (F2u) --------------------------------------------------------

  const profileFields = (["name", "lair", "huntingGrounds"] as const)
    .map((field) => {
      const label = CREW_FIELD_LABELS[field];
      // Reputation is a game-data dropdown (F2ac) and notes are a dedicated
      // multi-note section, so the free-text fields are name/lair/hunting
      // grounds only.
      const displayValue = c[field] || "(not set)";
      const isEditing = state.editingProfile?.field === field;
      if (isEditing) {
        const input = el("input", {
          type: "text",
          value: state.editingProfile!.value,
          "aria-label": label,
          disabled: state.anyLoading,
        }) as HTMLInputElement;
        input.addEventListener("input", () => {
          if (state.editingProfile) state.editingProfile.value = input.value;
        });
        // F2aa: ENTER saves (same as the checkmark), ESC cancels, TAB moves
        // through input → ✓ → ✕ in natural document order.
        input.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") {
            ev.preventDefault();
            handlers.onProfileSave();
          } else if (ev.key === "Escape") {
            ev.preventDefault();
            handlers.onProfileCancel();
          }
        });
        const saveBtn = el("button", {
          type: "button",
          disabled: state.anyLoading,
          title: "Save",
        }, state.isProfileLoading ? "…" : "✓");
        saveBtn.addEventListener("click", handlers.onProfileSave);
        const cancelBtn = el("button", {
          type: "button",
          disabled: state.anyLoading,
          title: "Cancel",
        }, "✕");
        cancelBtn.addEventListener("click", handlers.onProfileCancel);
        return el(
          "div",
          { className: "field-editing", "data-focus-key": `profile-${field}`, style: "display: flex; gap: 0.5em; align-items: center; margin: 0.25em 0;" },
          el("span", { className: "lbl" }, `${label}: `),
          input,
          saveBtn,
          cancelBtn,
        );
      }
      const editBtn = el("button", {
        type: "button",
        disabled: state.anyLoading || state.editingProfile !== null,
        title: `Edit ${label}`,
      }, "✎");
      editBtn.addEventListener("click", () => handlers.onProfileEdit(field));
      return el(
        "div",
        { className: "field-read", "data-focus-key": `profile-${field}`, style: "display: flex; gap: 0.5em; align-items: center; margin: 0.25em 0;" },
        el("span", { className: "lbl" }, `${label}: `),
        el("span", { className: "field-value" }, displayValue),
        editBtn,
      );
    });

  // -- Reputation dropdown (F2ac) ---------------------------------------------
  //
  // Reputation is one of the crew type's 8 Reputations from crew game data
  // (per-crew-type endpoint preferred, CrewTypes find-by-name fallback).
  // Save goes through fields.update { reputation } — the same op the old
  // free-text field used. Without game data the menu degrades to a
  // read-only value row (the current reputation still displays).
  const reputationOptions = extractReputations(
    state.crewTypeData,
    state.crewTypesData,
    c.crewTypeName,
  );
  const reputationSelect = el("select", {
    "aria-label": "Reputation",
    disabled: state.anyLoading || reputationOptions.length === 0,
  }) as HTMLSelectElement;
  for (const value of reputationOptions) {
    reputationSelect.append(el("option", { value }, value) as HTMLOptionElement);
  }
  if (reputationOptions.includes(c.reputation)) {
    reputationSelect.value = c.reputation;
  }
  const reputationSetBtn = el("button", {
    type: "button",
    disabled: state.anyLoading || reputationOptions.length === 0,
    title: "Set reputation",
  }, state.isProfileLoading ? "…" : "Set");
  reputationSetBtn.addEventListener("click", handlers.onReputationSet);
  const reputationRow = el(
    "div",
    { className: "field-read crew-reputation", style: "display: flex; gap: 0.5em; align-items: center; margin: 0.25em 0;" },
    el("span", { className: "lbl" }, "Reputation: "),
    el("span", { className: "field-value" }, c.reputation || "(not set)"),
    reputationSelect,
    reputationSetBtn,
  );

  // -- Notes (C4 / F2ac) -------------------------------------------------------
  //
  // Notes are a string[] in the DTO (legacy single string still decodes).
  // Multi-line textarea + per-entry remove; add/remove go through
  // note.add / note.remove (index-based removal, 0-based to match the op).
  const notesEntries = Array.isArray(c.notes)
    ? c.notes
    : c.notes
      ? [c.notes]
      : [];
  const noteList = notesEntries.length > 0
    ? el(
        "ul",
        { className: "note-list", style: "list-style: none; padding: 0; margin: 0 0 0.5em 0;" },
        ...notesEntries.map((note, idx) => {
          const removeBtn = el("button", {
            type: "button",
            disabled: state.anyLoading,
            "aria-label": `Remove note ${idx}`,
            title: `Remove note ${idx}`,
          }, "✕");
          removeBtn.addEventListener("click", () => handlers.onNoteRemove(idx));
          return el(
            "li",
            { className: "note-entry", style: "display: flex; gap: 0.5em; align-items: flex-start; margin: 0.25em 0;" },
            el("span", { className: "note-text", style: "flex: 1;" }, note),
            removeBtn,
          );
        }),
      )
    : el("p", {}, "(no notes)");
  const newNoteInput = el("textarea", {
    "aria-label": "New note",
    rows: 3,
    disabled: state.anyLoading,
    placeholder: "Write a new note…",
  }) as HTMLTextAreaElement;
  const addNoteBtn = el("button", {
    type: "button",
    disabled: state.anyLoading,
    title: "Add note",
  }, state.isNoteLoading ? "…" : "Add note");
  addNoteBtn.addEventListener("click", handlers.onNoteAdd);

  const notesSection = el(
    "div",
    { className: "crew-notes" },
    el("h2", {}, "Notes"),
    noteList,
    el("div", { style: "display: flex; gap: 0.5em; align-items: flex-start;" },
      newNoteInput,
      addNoteBtn,
    ),
  );

  // -- Trackers (F2u / F2ac) -------------------------------------------------

  // Rep & Turf (F2ac): rep fills 12 boxes left→right; turf is measured on
  // the right of the same tracker (max 6 slots, grayed from the right) and
  // each turf lowers the develop threshold by one (threshold = rep.max −
  // turf, i.e. 12 − turf in the SRD). Turf slots are NOT clickable — turf
  // changes only through crewTurfAdd (+/−). Develop applies the SRD flow:
  // rep >= threshold → weak hold: hold.set strong + rep reset; strong hold:
  // pay (tier+1)×8 coin, tier.add +1, rep reset, hold.set weak.
  const repThreshold = state.crewCaps?.developThreshold ?? Math.max(0, c.rep.max - c.turf);
  const canDevelop = c.rep.current >= repThreshold;

  const repTracker = renderTracker(state, {
    className: "crew-rep",
    label: "Rep",
    current: c.rep.current,
    max: c.rep.max,
    isLoading: state.isRepLoading,
    onDelta: handlers.onRepDelta,
    onTrack: handlers.onRepTrack,
  });

  // Effective turf is a server-computed projection (SC-F3): base turf + the
  // claimed turf-delta effects from the claims map. The client never joins
  // claims/settings to derive it; the local claims derivation is a graceful
  // fallback only when the capability projection is unavailable.
  let effectiveTurf: number;
  if (state.crewCaps) {
    effectiveTurf = state.crewCaps.effectiveTurf;
  } else {
    const claimsForEffects = extractCrewClaims(state.crewTypeData, state.crewTypesData, c.crewTypeName);
    let delta = 0;
    if (claimsForEffects) {
      const g = claimsGraph(claimsForEffects);
      const ownedSet = new Set(c.claimedClaimIds);
      for (const n of g.nodes) {
        if (!ownedSet.has(n.id)) continue;
        // effects live on the PascalCase game data node
        const raw = Array.isArray((claimsForEffects as Record<string, unknown>).Nodes)
          ? ((claimsForEffects as Record<string, unknown>).Nodes as Array<Record<string, unknown>>).find((x) => x.Id === n.id)
          : undefined;
        const effects = raw && Array.isArray(raw.Effects) ? (raw.Effects as Array<Record<string, unknown>>) : [];
        for (const fx of effects) {
          if (fx.Kind === "derivedDelta" && fx.Target === "crew.turf" && typeof fx.Delta === "number") {
            delta += fx.Delta;
          }
        }
      }
    }
    effectiveTurf = c.turf + delta;
  }

  // Turf row: 6 slots, filled from the left per turf count, grayed from the
  // right — a rendering, not a button track.
  const turfRow = el(
    "div",
    {
      className: "turf-track",
      role: "group",
      "aria-label": `Turf: ${c.turf} of 6`,
      style: "display: inline-flex; gap: 6px; padding: 6px;",
    },
    ...Array.from({ length: 6 }, (_, i) => {
      const filled = i + 1 <= c.turf;
      return el("span", {
        className: "turf-slot",
        "data-stress": filled ? "1" : "0",
        "data-index": String(i + 1),
        "aria-label": `Turf slot ${i + 1}`,
        title: filled ? "Turf held" : "No turf",
      });
    }),
  );
  const turfMinusBtn = el("button", {
    type: "button",
    disabled: state.anyLoading || c.turf <= 0,
    title: "Remove 1 turf",
  }, "−1");
  turfMinusBtn.addEventListener("click", () => handlers.onTurfDelta(-1));
  const turfPlusBtn = el("button", {
    type: "button",
    disabled: state.anyLoading || c.turf >= 6,
    title: "Add 1 turf",
  }, state.isTurfLoading ? "…" : "+1");
  turfPlusBtn.addEventListener("click", () => handlers.onTurfDelta(1));

  const developBtn = el("button", {
    type: "button",
    disabled: state.anyLoading || !canDevelop,
    title: canDevelop
      ? `Develop (rep ${c.rep.current} >= threshold ${repThreshold})`
      : `Develop (needs ${repThreshold} rep)`,
  }, state.isDevelopLoading ? "…" : "Develop");
  developBtn.addEventListener("click", handlers.onDevelop);

  const heatTracker = renderTracker(state, {
    className: "crew-heat",
    label: "Heat",
    current: c.heat.current,
    max: c.heat.max,
    isLoading: state.isHeatLoading,
    onDelta: handlers.onHeatDelta,
    onTrack: handlers.onHeatTrack,
  });

  const wantedTracker = renderTracker(state, {
    className: "crew-wanted",
    label: "Wanted",
    current: c.wanted.current,
    max: c.wanted.max,
    isLoading: state.isWantedLoading,
    onDelta: handlers.onWantedDelta,
    onTrack: handlers.onWantedTrack,
  });

  // Tier: value + -/+ only. The server clamps at the settings-derived
  // CrewTierMax (CONTRACT-04) and reports the applied delta; display is
  // Roman via formatTier.
  const tierMinusBtn = el("button", {
    type: "button",
    disabled: state.anyLoading || c.tier <= 0,
    title: "Remove 1 tier",
  }, "−1");
  tierMinusBtn.addEventListener("click", () => handlers.onTierDelta(-1));
  const tierPlusBtn = el("button", {
    type: "button",
    disabled: state.anyLoading,
    title: "Add 1 tier",
  }, state.isTierLoading ? "…" : "+1");
  tierPlusBtn.addEventListener("click", () => handlers.onTierDelta(1));

  // Hold: two-state segmented control (WEAK / STRONG) committing on click
  // (Design Audit F-11) — replaces the lowercase native <select> + Set
  // button with the same one-click pattern every neighbouring tracker uses.
  // Presentation order is weak→strong (the sheet's progression); wire values
  // stay the lowercase contract enum.
  const holdOptions = [...Hold.literals].reverse().map((value) => {
    const label = value[0]!.toUpperCase() + value.slice(1);
    const btn = el("button", {
      type: "button",
      className: "hold-option",
      "data-hold": value,
      "aria-pressed": c.hold === value ? "true" : "false",
      disabled: state.anyLoading,
      title: `Set hold: ${label}`,
    }, label);
    btn.addEventListener("click", () => handlers.onHoldSet(value));
    return btn;
  });
  const holdControl = el(
    "div",
    { className: "hold-control", role: "group", "aria-label": "Hold" },
    ...holdOptions,
  );

  // -- Coin & Stash (F2u) ---------------------------------------------------

  const coinMinusBtn = el("button", {
    type: "button",
    disabled: state.anyLoading || c.coin <= 0,
    title: "Remove 1 coin",
  }, "−1");
  coinMinusBtn.addEventListener("click", () => handlers.onCoinDelta(-1));
  const coinPlusBtn = el("button", {
    type: "button",
    disabled: state.anyLoading,
    title: "Add 1 coin",
  }, state.isCoinLoading ? "…" : "+1");
  coinPlusBtn.addEventListener("click", () => handlers.onCoinDelta(1));

  const stashMinusBtn = el("button", {
    type: "button",
    disabled: state.anyLoading || c.stash <= 0,
    title: "Remove 1 stash",
  }, "−1");
  stashMinusBtn.addEventListener("click", () => handlers.onStashDelta(-1));
  const stashPlusBtn = el("button", {
    type: "button",
    disabled: state.anyLoading,
    title: "Add 1 stash",
  }, state.isStashLoading ? "…" : "+1");
  stashPlusBtn.addEventListener("click", () => handlers.onStashDelta(1));

  // -- Contacts & Factions (F2y) ---------------------------------------------

  const contacts = c.contacts ?? [];
  const factions = c.factions ?? [];

  const contactEntries = contacts.map((contact) =>
    el(
      "div",
      { className: "contact-entry", style: "display: flex; align-items: center; gap: 0.5em;" },
      el("span", { className: "contact-name" }, contact.name),
      el("span", { className: "contact-profession" }, contact.profession || ""),
      el("button", {
        type: "button",
        disabled: state.anyLoading,
        title: `Remove contact: ${contact.name}`,
      }, "✕"),
    ),
  );
  contactEntries.forEach((entry, idx) => {
    const btn = entry.querySelector("button");
    if (btn) {
      btn.addEventListener("click", () => handlers.onContactRemove(contacts[idx]!.name));
    }
  });

  const contactNameInput = el("input", {
    type: "text",
    "aria-label": "Contact name",
    disabled: state.anyLoading,
    placeholder: "name",
  });
  const contactProfessionInput = el("input", {
    type: "text",
    "aria-label": "Contact profession",
    disabled: state.anyLoading,
    placeholder: "profession",
  });
  const addContactBtn = el("button", {
    type: "button",
    disabled: state.anyLoading,
    title: "Add contact",
  }, state.isContactLoading ? "…" : "+");
  addContactBtn.addEventListener("click", handlers.onContactAdd);

  const factionEntries = factions.map((faction) => {
    const statusInput = el("input", {
      type: "number",
      "aria-label": `Set status for ${faction.name}`,
      disabled: state.anyLoading,
      value: String(faction.status),
    }) as HTMLInputElement;
    const setBtn = el("button", {
      type: "button",
      disabled: state.anyLoading,
      title: `Set status for ${faction.name}`,
    }, state.isFactionLoading ? "…" : "Set");
    setBtn.addEventListener("click", () => {
      const parsed = Number.parseInt(statusInput.value, 10);
      if (Number.isNaN(parsed)) return;
      handlers.onFactionSetStatus(faction.name, parsed);
    });
    const removeBtn = el("button", {
      type: "button",
      disabled: state.anyLoading,
      title: `Remove faction: ${faction.name}`,
    }, "✕");
    removeBtn.addEventListener("click", () => handlers.onFactionRemove(faction.name));
    return el(
      "div",
      { className: "faction-entry", style: "display: flex; align-items: center; gap: 0.5em;" },
      el("span", { className: "faction-name" }, faction.name),
      el("span", { className: "faction-status" }, String(faction.status)),
      statusInput,
      setBtn,
      removeBtn,
    );
  });

  // -- Playbook (F2v) --------------------------------------------------------

  const playbookSection = (() => {
    const { anyLoading } = state;

    // CREW-02/CREW-04 shared pattern (CONTRACT-03): session-local edit-mode
    // toggle that reveals removal/decrement controls only while it is on.
    const advancementToggleBtn = el("button", {
      className: "advancement-toggle",
      "aria-pressed": state.advancementEdit ? "true" : "false",
      disabled: anyLoading,
    }, state.advancementEdit ? "Done editing" : "Edit advancements");
    advancementToggleBtn.addEventListener("click", () => handlers.onAdvancementEditToggle());

    // Game-data sources: per-crew-type endpoint preferred, CrewTypes list
    // fallback (both fetched in parallel on load; see mountCrewDetailPage).
    const specialAbilities = extractCrewAbilities(
      state.crewTypeData,
      state.crewTypesData,
      c.crewTypeName,
    );
    const upgradesData = extractCrewUpgrades(
      state.crewTypeData,
      state.crewTypesData,
      c.crewTypeName,
    );

    // SC-F3: take/box limits come from the server-computed capability catalog
    // (the client never joins settings + DTO state to find an enforced cap).
    // Game data remains a display-only lookup for descriptions.
    const upgradeCapByName = new Map(
      (state.crewCaps?.upgrades ?? []).map((u) => [u.name, u]),
    );

    // -- Special abilities --------------------------------------------------

    const takenByName = new Map(c.specialAbilities.map((a) => [a.name, a]));
    const abilityTimesTakeable = (sa: Record<string, unknown>) =>
      typeof sa.TimesTakeable === "number" ? sa.TimesTakeable : 1;
    const abilityDescription = (name: string) => {
      const sa = specialAbilities.find((x) => String(x.Name) === name);
      return sa && typeof sa.Description === "string" && sa.Description.length > 0
        ? sa.Description
        : "No description available.";
    };

    // Eligible = a catalog ability with remaining takes; the server enforces
    // ABILITY_MAXED at 0. Falls back to the game-data join when the
    // capability projection is unavailable.
    const eligible = state.crewCaps
      ? state.crewCaps.abilities
          .filter((a) => a.remaining > 0)
          .map((a) => ({ Name: a.name }))
      : specialAbilities.filter((sa) => {
          const name = String(sa.Name);
          const taken = takenByName.get(name);
          return !taken || taken.timesTaken < abilityTimesTakeable(sa);
        });

    const abilityEntries = c.specialAbilities.map((a) =>
      el("div", {
        className: "ability-entry",
        "data-ability": a.name,
        style: "display: flex; align-items: flex-start; gap: 0.5em; margin: 0.35em 0;",
      },
        el("span", { className: "lbl", style: "min-width: 8em;" },
          a.name,
          a.timesTaken > 1
            ? el("span", { className: "ability-times" }, ` ×${a.timesTaken}`)
            : null,
        ),
        el("p", { className: "serif", style: "flex: 1; margin: 0; font-size: 0.95em;" },
          abilityDescription(a.name),
        ),
        // CREW-04: removal only exists in advancement-edit mode.
        state.advancementEdit
          ? el("button", {
              type: "button",
              disabled: anyLoading,
              title: `Remove ability: ${a.name}`,
            }, "✕")
          : null,
      ),
    );
    abilityEntries.forEach((entry, idx) => {
      const btn = entry.querySelector("button");
      if (btn) {
        btn.addEventListener("click", () =>
          handlers.onAbilityRemove(c.specialAbilities[idx]!.name),
        );
      }
    });

    const abilitySelect = el("select", {
      "aria-label": "Take ability",
      disabled: anyLoading || eligible.length === 0,
    },
      el("option", { value: "" }, "Ability"),
      ...eligible.map((sa) => el("option", { value: String(sa.Name) }, String(sa.Name))),
    ) as HTMLSelectElement;
    // CREW-04 (UX-010): native <select> picker; its description block lives
    // BELOW this row (see abilityDetails below).
    // CREW-04 (UX-010): the selected ability's description renders as a
    // full-width block BELOW the picker row — not inside the picker flex row,
    // and without repeating the name the select already shows.
    const abilityDetails = el("p", {
      className: "ability-description",
      style: "width: 100%; margin: 0.25em 0 0; font-size: 0.95em;",
    });
    const showAbilityDescription = (name: string) => {
      abilityDetails.textContent = abilityDescription(name);
      abilityDetails.hidden = name === "";
    };
    abilitySelect.addEventListener("change", () => showAbilityDescription(abilitySelect.value));
    if (eligible.length > 0) {
      abilitySelect.value = String(eligible[0]!.Name);
    }
    showAbilityDescription(abilitySelect.value);

    const takeBtn = el("button", {
      type: "button",
      disabled: anyLoading || eligible.length === 0,
      title: "Take ability",
    }, state.isAbilityLoading ? "…" : "+");
    takeBtn.addEventListener("click", handlers.onAbilityTake);

    // -- Upgrades ------------------------------------------------------------

    const markedByName = new Map(c.upgrades.map((u) => [u.name, u.boxesMarked]));
    const findUpgrade = (name: string) =>
      upgradesData.find((u) => String(u.Name) === name);

    // Total boxes per upgrade come from the capability catalog (SC-F3),
    // falling back to crew-type game data when the projection is unavailable.
    const totalFor = (name: string): number =>
      upgradeCapByName.get(name)?.totalBoxes ?? upgradeTotalBoxes(findUpgrade(name));

    // List rows come from the DTO (name + boxesMarked); total and description
    // come from the capability catalog / game data — never hardcoded.
    const upgradeEntries = c.upgrades.map((u) => {
      const game = findUpgrade(u.name);
      const total = totalFor(u.name);
      const atMax = u.boxesMarked >= total;
      // CREW-04: unmarking a box only exists in advancement-edit mode.
      const unmarkBtn = state.advancementEdit
        ? el("button", {
            type: "button",
            disabled: anyLoading || u.boxesMarked <= 0,
            title: `Unmark upgrade: ${u.name}`,
          }, "−")
        : null;
      if (unmarkBtn) {
        unmarkBtn.addEventListener("click", () => handlers.onUpgradeUnmark(u.name));
      }
      const markBtn = el("button", {
        type: "button",
        disabled: anyLoading || atMax,
        title: `Mark upgrade: ${u.name}`,
      }, state.isUpgradeLoading ? "…" : "+");
      markBtn.addEventListener("click", () => handlers.onUpgradeMark(u.name));
      return el("div", {
        className: "upgrade-entry",
        "data-upgrade": u.name,
        style: "display: flex; align-items: flex-start; gap: 0.5em; margin: 0.35em 0;",
      },
        el("span", { className: "lbl", style: "min-width: 8em;" }, u.name),
        el("span", { className: "upgrade-count" }, `${u.boxesMarked} / ${total}`),
        el("p", { className: "serif", style: "flex: 1; margin: 0; font-size: 0.95em;" },
          upgradeDescription(game, u.name),
        ),
        unmarkBtn,
        markBtn,
      );
    });

    // Mark menu: native <select> of catalog upgrades not yet full — the way
    // to start a new upgrade (the DTO list only shows already-marked ones).
    const markable = state.crewCaps
      ? state.crewCaps.upgrades
          .filter((u) => u.remaining > 0)
          .map((u) => ({ Name: u.name }))
      : upgradesData.filter(
          (u) => (markedByName.get(String(u.Name)) ?? 0) < upgradeTotalBoxes(u),
        );
    const markSelect = el("select", {
      "aria-label": "Mark upgrade",
      disabled: anyLoading || markable.length === 0,
    },
      el("option", { value: "" }, "Upgrade"),
      ...markable.map((u) => el("option", { value: String(u.Name) }, String(u.Name))),
    ) as HTMLSelectElement;
    const markBtn = el("button", {
      type: "button",
      disabled: anyLoading || markable.length === 0,
      title: "Mark selected upgrade",
    }, state.isUpgradeLoading ? "…" : "+");
    markBtn.addEventListener("click", handlers.onUpgradeMarkMenu);

    // -- Lair chart ----------------------------------------------------------
    //
    // Per f2-sheet-plan.mdx the lair advancement chart is a RENDERING of the
    // same playbook-specific Upgrades data — no separate domain concept, no
    // hardcoded upgrade names. Rows: every game-data upgrade (in data order)
    // plus any DTO-only upgrades (older snapshots) appended. Clicking a box
    // marks/unmarks one box (upgrade.mark/upgrade.unmark are +1/−1 ops; there
    // is no set-to-N op).
    const chartRows = state.crewCaps
      ? state.crewCaps.upgrades.map((u) => ({
          name: u.name,
          total: u.totalBoxes,
          marked: u.marked,
        }))
      : [
          ...upgradesData.map((u) => ({
            name: String(u.Name),
            total: upgradeTotalBoxes(u),
            marked: markedByName.get(String(u.Name)) ?? 0,
          })),
          ...c.upgrades
            .filter((u) => !upgradesData.some((g) => String(g.Name) === u.name))
            .map((u) => ({
              name: u.name,
              total: Math.max(u.boxesMarked, 1),
              marked: u.boxesMarked,
            })),
        ];
    const chartRowsEl = chartRows.map((row) => {
      const boxes = [];
      for (let i = 1; i <= row.total; i++) {
        const filled = i <= row.marked;
        // CREW-04: a filled chart box is an unmark in disguise — inert until
        // advancement-edit mode is on.
        const box = el("button", {
          type: "button",
          className: "chart-box",
          "data-stress": filled ? "1" : "0",
          "data-index": String(i),
          "aria-label": `${row.name} box ${i}`,
          "aria-pressed": filled ? "true" : "false",
          disabled: anyLoading || (filled && !state.advancementEdit),
          title: filled
            ? (state.advancementEdit ? `Unmark ${row.name}` : `${row.name} box ${i}`)
            : `Mark ${row.name}`,
        });
        box.addEventListener("click", () => handlers.onChartBox(row.name, i));
        boxes.push(box);
      }
      return el("div", {
        className: "chart-row",
        "data-upgrade": row.name,
        style: "display: flex; align-items: center; gap: 0.6em; margin: 0.25em 0;",
      },
        el("span", { className: "lbl", style: "min-width: 8em;" }, row.name),
        el("span", { className: "chart-boxes", style: "display: inline-flex; gap: 4px;" }, ...boxes),
        el("span", { className: "chart-count" }, `${row.marked} / ${row.total}`),
      );
    });

    return el("div", { className: "crew-playbook", "data-section": "playbook" },
      el("div", { style: "display: flex; gap: 0.75em; align-items: baseline; flex-wrap: wrap;" },
        el("h2", {}, "Playbook"),
        // CREW-02/CREW-04 pattern (CONTRACT-03): session-local edit-mode
        // toggle; removal/decrement controls exist only while it's on.
        advancementToggleBtn,
      ),
      el("h3", { className: "lbl", style: "margin-top: 0.5em;" }, "Special Abilities"),
      c.specialAbilities.length === 0
        ? el("p", {}, "(none)")
        : el("div", { style: "display: flex; flex-direction: column;" }, ...abilityEntries),
      el("div", { className: "ability-picker-row", style: "display: flex; gap: 0.5em; margin-top: 0.5em; align-items: center; flex-wrap: wrap;" },
        abilitySelect,
        takeBtn,
      ),
      abilityDetails,
      el("div", { className: "crew-upgrades" },
        el("h3", { className: "lbl", style: "margin-top: 1em;" }, "Upgrades"),
        c.upgrades.length === 0
          ? el("p", {}, "(none)")
          : el("div", { style: "display: flex; flex-direction: column;" }, ...upgradeEntries),
        el("div", { style: "display: flex; gap: 0.5em; margin-top: 0.5em; align-items: center; flex-wrap: wrap;" },
          markSelect,
          markBtn,
        ),
      ),
      el("h3", { className: "lbl", style: "margin-top: 1em;" }, "Lair Chart"),
      el("p", { className: "rules-note", style: "margin-top: 0.35em;" },
        "The lair chart is a rendering of the crew type's Upgrades data (mark/unmark one box per click).",
      ),
      el("div", { className: "lair-chart", style: "display: flex; flex-direction: column;" },
        ...chartRowsEl,
      ),
    );
  })();

  // -- Cohorts (F2w) ---------------------------------------------------------
  // Vehicles are cohorts (sheet plan decision 3): a vehicle is a cohort whose
  // description carries the edges/flaws text. Kind (gang|expert) and harm
  // values come from the contract enums (schema literals CohortType /
  // CohortHarm mirror contract/schemas/common.json $defs — never hardcoded).

  const cohortEntries = c.cohorts.map((cohort) => {
    const isEditing = state.editingCohortId === cohort.id;
    const kindLabel = cohort.cohortKind === "gang" ? "Gang" : "Expert";
    const typeField = cohort.cohortKind === "gang" ? "gangType" : "expertType";
    const typeValue = cohort[typeField] || "(no type)";
    const title = `cohort: ${typeValue}`;
    const shown = (values: readonly string[]) =>
      values.length === 0 ? "(none)" : values.join(", ");

    if (isEditing) {
      // F2ac: kind-specific type dropdown from game data (canonical
      // fallback). The current type is preserved even when it is not in the
      // data lists (older snapshots / homebrew): gangs get the extra value
      // appended as an option; experts map onto the Custom path (Custom
      // reveals a free-text input).
      const gangTypes = extractCohortGangTypes(state.crewGameData);
      const expertTypes = extractCohortExpertTypes(state.crewGameData);
      let typeControl: HTMLElement;
      let readType: () => string;
      if (cohort.cohortKind === "gang") {
        const options = gangTypes.includes(cohort.gangType)
          ? gangTypes
          : [...gangTypes, cohort.gangType];
        const gangSelect = el("select", {
          "aria-label": "Edit gang type",
          disabled: state.anyLoading,
        }) as HTMLSelectElement;
        for (const value of options) {
          gangSelect.append(el("option", { value }, value) as HTMLOptionElement);
        }
        // Set via the select value after append: happy-dom does not honour
        // option.selected set before the option is attached.
        gangSelect.value = cohort.gangType;
        typeControl = gangSelect;
        readType = () => gangSelect.value;
      } else {
        const isCustom =
          cohort.expertType === "Custom" || !expertTypes.includes(cohort.expertType);
        const expertSelect = el("select", {
          "aria-label": "Edit expert type",
          disabled: state.anyLoading,
        }) as HTMLSelectElement;
        for (const value of expertTypes) {
          expertSelect.append(el("option", { value }, value) as HTMLOptionElement);
        }
        expertSelect.value = isCustom ? "Custom" : cohort.expertType;
        const customInput = el("input", {
          type: "text",
          "aria-label": "Edit expert custom type",
          disabled: state.anyLoading,
          placeholder: "custom type",
        });
        customInput.value =
          isCustom && cohort.expertType !== "Custom" ? cohort.expertType : "";
        const toggleCustom = () => {
          customInput.hidden = expertSelect.value !== "Custom";
        };
        expertSelect.addEventListener("change", toggleCustom);
        toggleCustom();
        typeControl = el(
          "span",
          { style: "display: inline-flex; gap: 0.5em; align-items: center;" },
          expertSelect,
          customInput,
        );
        readType = () =>
          expertSelect.value === "Custom"
            ? customInput.value.trim() || "Custom"
            : expertSelect.value;
      }
      const qualityInput = el("input", {
        type: "number",
        value: String(cohort.quality),
        "aria-label": "Edit quality",
        disabled: state.anyLoading,
      });
      const scaleInput = el("input", {
        type: "number",
        value: String(cohort.scale),
        "aria-label": "Edit scale",
        disabled: state.anyLoading,
      });
      const armorInput = el("input", {
        type: "checkbox",
        "aria-label": "Edit armor",
        checked: cohort.hasArmor,
        disabled: state.anyLoading,
      });
      const edgesInput = el("input", {
        type: "text",
        value: cohort.edges.join(", "),
        "aria-label": "Edit edges",
        disabled: state.anyLoading,
      });
      const flawsInput = el("input", {
        type: "text",
        value: cohort.flaws.join(", "),
        "aria-label": "Edit flaws",
        disabled: state.anyLoading,
      });
      const harmSelect = el("select", {
        "aria-label": "Edit harm",
        disabled: state.anyLoading,
      }) as HTMLSelectElement;
      for (const value of CohortHarm.literals) {
        const option = el("option", { value }, value) as HTMLOptionElement;
        if (value === cohort.harm) option.selected = true;
        harmSelect.append(option);
      }
      const descInput = el("input", {
        type: "text",
        value: cohort.description,
        "aria-label": "Edit description",
        disabled: state.anyLoading,
      });

      const saveBtn = el("button", {
        type: "button",
        disabled: state.anyLoading,
        title: `Save ${title}`,
      }, state.isCohortLoading ? "…" : "✓");
      // cohort.update sends only the fields that actually changed.
      saveBtn.addEventListener("click", () => {
        const fields: Record<string, unknown> = {};
        const typeValue = readType();
        if (typeValue !== cohort[typeField]) fields[typeField] = typeValue;
        const quality = Number.parseInt(qualityInput.value, 10);
        if (!Number.isNaN(quality) && quality !== cohort.quality) fields.quality = quality;
        const scale = Number.parseInt(scaleInput.value, 10);
        if (!Number.isNaN(scale) && scale !== cohort.scale) fields.scale = scale;
        if (armorInput.checked !== cohort.hasArmor) fields.hasArmor = armorInput.checked;
        const edges = splitList(edgesInput.value);
        if (!arraysEqual(edges, cohort.edges)) fields.edges = edges;
        const flaws = splitList(flawsInput.value);
        if (!arraysEqual(flaws, cohort.flaws)) fields.flaws = flaws;
        if (harmSelect.value !== cohort.harm) fields.harm = harmSelect.value;
        if (descInput.value !== cohort.description) fields.description = descInput.value;
        if (Object.keys(fields).length > 0) {
          handlers.onCohortUpdate(cohort.id, fields);
        } else {
          handlers.onCohortCancel();
        }
      });
      const cancelBtn = el("button", {
        type: "button",
        disabled: state.anyLoading,
        title: "Cancel",
      }, "✕");
      cancelBtn.addEventListener("click", handlers.onCohortCancel);

      return el(
        "div",
        { className: "cohort-entry editing", "data-cohort-id": cohort.id, "data-cohort-kind": cohort.cohortKind, "data-focus-key": `cohort-${cohort.id}` },
        el("span", { className: "cohort-kind-badge" }, kindLabel),
        el("div", { className: "cohort-edit-fields", style: "display: flex; flex-wrap: wrap; gap: 0.5em; align-items: center;" },
          el("label", { className: "lbl" }, `${kindLabel} type:`, typeControl),
          el("label", { className: "lbl" }, "Quality:", qualityInput),
          el("label", { className: "lbl" }, "Scale:", scaleInput),
          el("label", { className: "lbl" }, "Armor:", armorInput),
          el("label", { className: "lbl" }, "Edges:", edgesInput),
          el("label", { className: "lbl" }, "Flaws:", flawsInput),
          el("label", { className: "lbl" }, "Harm:", harmSelect),
          el("label", { className: "lbl" }, "Description:", descInput),
        ),
        el("div", { style: "display: flex; gap: 0.5em;" }, saveBtn, cancelBtn),
      );
    }

    const editBtn = el("button", {
      type: "button",
      disabled: state.anyLoading || state.editingCohortId !== null,
      title: `Edit ${title}`,
    }, "✎");
    editBtn.addEventListener("click", () => handlers.onCohortEdit(cohort.id));
    const removeBtn = el("button", {
      type: "button",
      disabled: state.anyLoading,
      title: `Remove ${title}`,
    }, "✕");
    removeBtn.addEventListener("click", () => handlers.onCohortRemove(cohort.id));

    return el(
      "div",
      { className: "cohort-entry", "data-cohort-id": cohort.id, "data-cohort-kind": cohort.cohortKind, "data-focus-key": `cohort-${cohort.id}` },
      el("span", { className: "cohort-kind-badge" }, kindLabel),
      el("span", { className: "cohort-type" }, typeValue),
      el("span", { className: "cohort-quality" }, `Quality ${cohort.quality}`),
      el("span", { className: "cohort-scale" }, `Scale ${cohort.scale}`),
      el("span", { className: "cohort-armor" }, cohort.hasArmor ? "Armored" : "No armor"),
      el("span", { className: "cohort-edges" }, `Edges: ${shown(cohort.edges)}`),
      el("span", { className: "cohort-flaws" }, `Flaws: ${shown(cohort.flaws)}`),
      el("span", { className: "cohort-harm" }, `Harm: ${cohort.harm}`),
      el("span", { className: "cohort-description" }, cohort.description || "(no description)"),
      editBtn,
      removeBtn,
    );
  });

  // Add form: cohort kind from the contract enum (CohortType literal mirrors
  // cohortType $defs). Optional fields are sent only when filled.
  const cohortKindSelect = el("select", {
    "aria-label": "Cohort kind",
    // CREW-05: cohortKind is the only field openapi requires on cohort.add;
    // mark it, and gate Add only on contract requirements (never on invented
    // ones — the backend is authoritative).
    "aria-required": "true",
    disabled: state.anyLoading,
  }) as HTMLSelectElement;
  for (const value of CohortType.literals) {
    const option = el("option", { value }, value) as HTMLOptionElement;
    if (value === "gang") option.selected = true;
    cohortKindSelect.append(option);
  }
  // F2ac: kind-conditional type dropdowns from game data (canonical
  // fallback). The gang select shows only when cohortKind=gang, the expert
  // select only when cohortKind=expert — toggled locally so the rest of the
  // form keeps its typed values. "Custom" (expert) reveals a free-text input.
  const gangTypeSelect = el("select", {
    "aria-label": "Cohort gang type",
    disabled: state.anyLoading,
  }, el("option", { value: "" }, "Gang type")) as HTMLSelectElement;
  for (const value of extractCohortGangTypes(state.crewGameData)) {
    gangTypeSelect.append(el("option", { value }, value) as HTMLOptionElement);
  }
  gangTypeSelect.value = "";
  const expertTypeSelect = el("select", {
    "aria-label": "Cohort expert type",
    disabled: state.anyLoading,
  }, el("option", { value: "" }, "Expert type")) as HTMLSelectElement;
  for (const value of extractCohortExpertTypes(state.crewGameData)) {
    expertTypeSelect.append(el("option", { value }, value) as HTMLOptionElement);
  }
  expertTypeSelect.value = "";
  const expertCustomInput = el("input", {
    type: "text",
    "aria-label": "Cohort expert custom type",
    disabled: state.anyLoading,
  });
  const qualityInput = el("input", {
    type: "number",
    "aria-label": "Cohort quality",
    disabled: state.anyLoading,
  });
  const scaleInput = el("input", {
    type: "number",
    "aria-label": "Cohort scale",
    disabled: state.anyLoading,
  });
  const armorInput = el("input", {
    type: "checkbox",
    "aria-label": "Cohort armor",
    disabled: state.anyLoading,
  });
  const edgesInput = el("input", {
    type: "text",
    "aria-label": "Cohort edges",
    disabled: state.anyLoading,
    placeholder: "e.g. Fearsome, Independent",
  });
  const flawsInput = el("input", {
    type: "text",
    "aria-label": "Cohort flaws",
    disabled: state.anyLoading,
    placeholder: "e.g. Wild, Overconfident",
  });
  const descInput = el("input", {
    type: "text",
    "aria-label": "Cohort description",
    disabled: state.anyLoading,
  });
  // F-10: persistent labels over ruled blanks; placeholders kept only as
  // genuine format examples. A label + control pair reads as sheet furniture.
  const cohortField = (label: string, control: HTMLElement) =>
    el(
      "label",
      { className: "cohort-field" },
      el("span", { className: "lbl" }, label),
      control,
    );
  // Kind-conditional fields: wrap each control with its label so the
  // toggle hides label+control together (not a stray empty label).
  const gangTypeField = cohortField("Type", gangTypeSelect);
  const expertTypeField = cohortField("Type", expertTypeSelect);
  const expertCustomField = cohortField("Custom type", expertCustomInput);
  const toggleCohortKindFields = () => {
    const kind = cohortKindSelect.value;
    gangTypeField.hidden = kind !== "gang";
    expertTypeField.hidden = kind !== "expert";
    expertCustomField.hidden =
      kind !== "expert" || expertTypeSelect.value !== "Custom";
  };
  cohortKindSelect.addEventListener("change", toggleCohortKindFields);
  expertTypeSelect.addEventListener("change", () => {
    if (cohortKindSelect.value === "expert") {
      expertCustomField.hidden = expertTypeSelect.value !== "Custom";
    }
  });
  const addCohortBtn = el("button", {
    type: "button",
    disabled: state.anyLoading,
    title: "Add cohort",
  }, state.isCohortLoading ? "…" : "+");
  addCohortBtn.addEventListener("click", handlers.onCohortAdd);

  const cohortsSection = el(
    "div",
    { className: "crew-cohorts", "data-section": "cohorts" },
    el("h2", {}, "Cohorts"),
    c.cohorts.length === 0
      ? el("p", {}, "(no cohorts)")
      : el("div", { className: "cohort-list" }, ...cohortEntries),
    el("h3", { className: "lbl", style: "margin-top: 1em;" }, "Add Cohort"),
    el("div", { className: "cohort-add", style: "display: flex; flex-wrap: wrap; gap: 0.75em; align-items: flex-end;" },
      el(
        "label",
        { className: "cohort-field" },
        el(
          "span",
          { className: "lbl" },
          "Kind",
          el("span", {
            className: "required-marker",
            title: "Required by the contract (cohort.add)",
            "aria-hidden": "true",
          }, "*"),
        ),
        cohortKindSelect,
      ),
      gangTypeField,
      expertTypeField,
      expertCustomField,
      cohortField("Quality", qualityInput),
      cohortField("Scale", scaleInput),
      cohortField("Armor", armorInput),
      cohortField("Edges", edgesInput),
      cohortField("Flaws", flawsInput),
      cohortField("Description", descInput),
      addCohortBtn,
    ),
  );
  // Initial field visibility: run after the form is assembled so every
  // label+control pair hides together.
  toggleCohortKindFields();

  // -- Crew XP (F2x) ----------------------------------------------------------
  // Points/max come from the DTO (experience { points, max }) — the max is
  // never hardcoded. +/− go through crewXpAdd (server clamps to max); clear
  // through crewXpClear (no body). The criteria text is the crew type's
  // ExperienceTrigger from crew game data (find-by-name; omitted when the
  // crew-type lookup fails — graceful degradation).
  const xp = c.experience;
  const criteriaText = extractExperienceTrigger(
    state.crewTypeData,
    state.crewTypesData,
    c.crewTypeName,
  );
  const xpMinusBtn = el("button", {
    type: "button",
    disabled: state.anyLoading || xp.points <= 0,
    title: "Remove 1 crew XP",
  }, "−1");
  xpMinusBtn.addEventListener("click", () => handlers.onXpDelta(-1));
  const xpPlusBtn = el("button", {
    type: "button",
    disabled: state.anyLoading || xp.points >= xp.max,
    title: "Add 1 crew XP",
  }, state.isXpLoading ? "…" : "+1");
  xpPlusBtn.addEventListener("click", () => handlers.onXpDelta(1));
  const xpClearBtn = el("button", {
    type: "button",
    disabled: state.anyLoading || xp.points === 0,
    title: "Clear crew XP",
  }, "clear");
  xpClearBtn.addEventListener("click", handlers.onXpClear);

  const xpSection = el(
    "div",
    { className: "crew-xp", "data-section": "xp" },
    el("h2", {}, "Crew XP"),
    el("div", {
      className: "crew-xp-tracker",
      style: "display: flex; gap: 1em; align-items: center; flex-wrap: wrap; margin: 0.6em 0;",
    },
      boxTrack({
        value: xp.points,
        max: xp.max,
        label: "Crew XP",
        disabled: state.anyLoading,
        onChange: handlers.onXpTrack,
      }),
      el("span", { className: "crew-xp-count" }, `${xp.points} / ${xp.max}`),
      xpMinusBtn,
      xpPlusBtn,
      xpClearBtn,
    ),
    criteriaText
      ? el("p", { className: "serif", style: "font-size: 0.95em; margin: 0.25em 0;" },
          el("strong", {}, "Criteria: "),
          criteriaText,
        )
      : null,
  );

  // -- Crew Claims (2026-08-10) ----------------------------------------------
  // Renders the canonical 5x3 claim map from game data with acquire/
  // relinquish toggles and per-claim customization (override merge + reset).
  const claimsSection = (() => {
    const claims = extractCrewClaims(state.crewTypeData, state.crewTypesData, c.crewTypeName);
    if (!claims) {
      return el(
        "section",
        { className: "crew-claims", "data-section": "claims" },
        el("h2", {}, "Claims"),
        el("p", { className: "lbl" }, "No claims map available for this crew type."),
      );
    }
    const graph = claimsGraph(claims);
    const controlled = new Set(c.claimedClaimIds);
    const overrides = c.claimOverrides;
    const effective = graph.nodes.map((n) => effectiveClaim(n, overrides));
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));

    // adjacency: every node's neighbors (undirected, no degree cap)
    const neighbors = new Map<string, Set<string>>();
    for (const e of graph.edges) {
      if (!neighbors.has(e.from)) neighbors.set(e.from, new Set());
      if (!neighbors.has(e.to)) neighbors.set(e.to, new Set());
      neighbors.get(e.from)!.add(e.to);
      neighbors.get(e.to)!.add(e.from);
    }
    const anchored = new Set(["lair", ...controlled]);
    const connected = new Set<string>();
    for (const id of anchored) {
      for (const n of neighbors.get(id) ?? []) connected.add(n);
    }

    // CREW-02 (UX-008): every acquisition asks first — a clearly worded
    // dialog is the primary interaction for connecting a claim node;
    // disconnecting one (relinquish) additionally requires the explicit
    // claim-edit mode. Out-of-sequence acquisition remains permitted via its
    // dedicated warning (contract allows acquiring past missing links).
    const acquireMessage = (name: string, benefit: string, isConnected: boolean): string =>
      isConnected
        ? `Acquire the claim "${name}"${benefit ? ` — ${benefit}` : ""}?`
        : `WARNING — out-of-sequence acquisition. "${name}" is NOT connected to your controlled network ` +
          `(the Lair or any acquired claim), and crews usually expand claim by claim.\n\n` +
          `Acquire "${name}" anyway?`;

    const relinquishMessage = (name: string): string =>
      `Relinquish "${name}"? This removes the claim from your crew and its benefit stops applying. ` +
      `If it was linking further territory, that ground may become unreachable. You can re-acquire it later.`;
    const onCustomize = (claimId: string) => {
      if (state.anyLoading) return;
      handlers.onClaimCustomize(claimId);
    };
    const onReset = (claimId: string) => {
      if (state.anyLoading) return;
      handlers.onClaimReset(claimId);
    };

    const cellStyle = (n: ClaimNode) =>
      `grid-column: ${n.column}; grid-row: ${n.row};`;

    const cells = effective.map(({ node, name, description, customized }) => {
      const isClaimed = controlled.has(node.id);
      const isLair = node.kind === "lair";
      const isConnected = !isClaimed && !isLair && connected.has(node.id);
      const classes = ["claim-cell", "claim-node"];
      if (isLair) classes.push("claim-lair");
      if (isClaimed) classes.push("claim-owned");
      if (isConnected) classes.push("claim-connected");
      if (customized) classes.push("claim-customized");
      if (isLair) {
        return el("div", { className: classes.join(" "), style: cellStyle(node) },
          el("strong", {}, "Lair"),
          el("span", {}, "Always controlled"),
        );
      }
      // Normal mode keeps acquisition front and center; an owned cell is
      // inert until claim-edit mode reveals removal.
      const removalLocked = isClaimed && !state.claimsEditMode;
      const btn = el("button", {
        className: classes.join(" "),
        style: cellStyle(node),
        "aria-pressed": isClaimed ? "true" : "false",
        disabled: state.anyLoading || removalLocked,
        title: removalLocked
          ? 'Enable "Edit claims" to relinquish'
          : isClaimed
            ? "Relinquish claim"
            : isConnected
              ? "Acquire claim"
              : "Acquire claim — not connected to your network",
      },
        el("strong", {}, name),
        description ? el("span", {}, description) : null,
        // CREW-02 #2: the disconnection warning is visible before clicking,
        // not only in the confirmation dialog.
        !isConnected ? el("span", { className: "claim-not-connected lbl" }, "not connected") : null,
        customized ? el("em", { className: "claim-custom-badge" }, "custom") : null,
      );
      btn.addEventListener("click", () => {
        if (state.anyLoading) return;
        if (isClaimed) {
          if (!state.claimsEditMode) return;
          if (window.confirm(relinquishMessage(name))) handlers.onClaimToggle(node.id, false);
        } else {
          if (window.confirm(acquireMessage(name, description, isConnected))) handlers.onClaimToggle(node.id, true);
        }
      });
      return btn;
    });

    // SVG edge layer (one line per edge, no degree cap). Rendered INSIDE the
    // grid spanning all tracks so its box matches the uniform 1fr cells;
    // viewBox is the grid's (cols×rows) so a node at (col,row) centers at
    // (col-0.5, row-0.5) in viewBox units.
    const edgeSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    edgeSvg.setAttribute("class", "claim-edges");
    edgeSvg.setAttribute("viewBox", `0 0 ${graph.columns} ${graph.rows}`);
    edgeSvg.setAttribute("preserveAspectRatio", "none");
    edgeSvg.setAttribute("aria-hidden", "true");
    for (const e of graph.edges) {
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      if (!a || !b) continue;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", String(a.column - 0.5));
      line.setAttribute("y1", String(a.row - 0.5));
      line.setAttribute("x2", String(b.column - 0.5));
      line.setAttribute("y2", String(b.row - 0.5));
      edgeSvg.appendChild(line);
    }

    const activeList = effective.filter((e) => controlled.has(e.node.id) && e.node.kind !== "lair");

    // CREW-02: session-local claim-edit mode; removal exists only while on.
    const editToggleBtn = el("button", {
      className: "claims-edit-toggle",
      "aria-pressed": state.claimsEditMode ? "true" : "false",
      disabled: state.anyLoading,
      title: state.claimsEditMode
        ? "Leave claim-edit mode"
        : "Enter claim-edit mode to relinquish acquired claims",
    }, state.claimsEditMode ? "Done editing" : "Edit claims");
    editToggleBtn.addEventListener("click", () => handlers.onClaimsEditToggle());

    return el(
      "section",
      { className: "crew-claims", "data-section": "claims" },
      el("h2", {}, "Claims"),
      editToggleBtn,
      el("p", { className: "rules-note", style: "margin-top: 0.35em;" },
        "Click a claim to acquire it — every acquisition asks first, and a claim not connected to your network warns before joining. Relinquishing an acquired claim lives inside Edit claims.",
      ),
      el("div", { className: "claims-map", style: "position: relative;" },
        el("div", {
          className: "claims-grid",
          style: `display: grid; grid-template-columns: repeat(${graph.columns}, 1fr); grid-template-rows: repeat(${graph.rows}, 1fr); gap: 18px;`,
        }, edgeSvg, ...cells),
      ),
      el("div", { className: "active-claims" },
        el("h3", { className: "lbl", style: "margin-top: 0.75em;" }, "Active claim benefits"),
        activeList.length === 0
          ? el("p", {}, "(no claims acquired)")
          : el("ul", { className: "active-claim-list" }, ...activeList.map((e) => {
              const li = el("li", { key: e.node.id },
                el("strong", {}, e.name),
                e.description ? el("span", {}, ` — ${e.description}`) : null,
              );
              const customizeBtn = el("button", { disabled: state.anyLoading }, "Customize");
              customizeBtn.addEventListener("click", () => onCustomize(e.node.id));
              li.appendChild(customizeBtn);
              if (overrides.some((o) => o.claimId === e.node.id)) {
                const resetBtn = el("button", { disabled: state.anyLoading }, "Reset to default");
                resetBtn.addEventListener("click", () => onReset(e.node.id));
                li.appendChild(resetBtn);
              }
              // CREW-02: removal only inside claim-edit mode, with its own
              // strong confirmation.
              if (state.claimsEditMode) {
                const relBtn = el("button", { disabled: state.anyLoading }, "Relinquish");
                relBtn.addEventListener("click", () => {
                  if (window.confirm(relinquishMessage(e.name))) handlers.onClaimToggle(e.node.id, false);
                });
                li.appendChild(relBtn);
              }
              return li;
            })),
      ),
    );
  })();

  return el(
    "section",
    { className: "crew-detail" },
    el(
      "div",
      { className: "crew-header torn-foot torn-foot-lg", "data-section": "header" },
      el("p", { className: "crew-kicker" }, c.gameName),
      el("h1", {}, c.name || `Unnamed ${c.crewTypeName}`),
      el("p", { className: "crew-type uneven" }, c.crewTypeName),
      el("p", { className: "crew-tier-badge", title: "Tier" }, `Tier ${formatTier(c.tier, state.crewCaps?.tierMax)}`),
      el(
        "nav",
        { className: "crew-nav" },
        el("a", { href: `/crew/${c.id}/history` }, "History"),
      ),
    ),
    el(
      "div",
      { className: "crew-profile", "data-section": "profile" },
      el("h2", {}, "Profile"),
      ...profileFields,
      reputationRow,
    ),
    notesSection,
    el(
      "div",
      { className: "crew-trackers", "data-section": "trackers" },
      el("h2", {}, "Trackers"),
      el("h3", { className: "lbl" }, "Rep & Turf"),
      repTracker,
      el("div", { className: "crew-turf", style: "margin: 0.6em 0;" },
        el("div", { style: "display: flex; gap: 1em; align-items: center; flex-wrap: wrap;" },
          turfRow,
          el("span", { className: "turf-count" }, `${c.turf} / 6`),
          effectiveTurf > c.turf
            ? el("span", { className: "lbl", style: "font-size: 0.85em;" },
                `effective ${effectiveTurf} / 6 (claims add ${effectiveTurf - c.turf})`,
              )
            : null,
          turfMinusBtn,
          turfPlusBtn,
        ),
        el("p", { className: "rules-note", style: "margin-top: 0.35em;" },
          "Turf is measured from the right: each turf lowers the rep develop threshold by one.",
        ),
      ),
      el("div", { className: "crew-develop", style: "display: flex; gap: 0.75em; align-items: center; margin: 0.6em 0;" },
        el("span", { className: "develop-threshold" }, `develop at ${repThreshold} rep (${c.rep.max} − ${c.turf} turf)`),
        developBtn,
      ),
      el("h3", { className: "lbl", style: "margin-top: 0.75em;" }, "Heat"),
      heatTracker,
      el("h3", { className: "lbl", style: "margin-top: 0.75em;" }, "Wanted"),
      wantedTracker,
      el("h3", { className: "lbl", style: "margin-top: 0.75em;" }, "Tier"),
      el("div", { className: "crew-tier", style: "display: flex; gap: 0.5em; align-items: center; margin: 0.6em 0;" },
        el("span", { className: "crew-tier-value" }, formatTier(c.tier, state.crewCaps?.tierMax)),
        tierMinusBtn,
        tierPlusBtn,
      ),
      el("h3", { className: "lbl", style: "margin-top: 0.75em;" }, "Hold"),
      el("div", { className: "crew-hold", style: "display: flex; gap: 0.5em; align-items: center; margin: 0.6em 0;" },
        holdControl,
      ),
    ),
    el(
      "div",
      { className: "crew-fund", "data-section": "fund" },
      el("h2", {}, "Fund"),
      el("div", { className: "crew-coin", style: "display: flex; gap: 0.5em; align-items: center; margin: 0.35em 0;" },
        el("span", { className: "lbl" }, "Coin:"),
        el("span", {
          className: "crew-coin-count",
          title: "Coin beyond the lair's vault-derived capacity must be spent or distributed (SRD \u00a7Coin and Stash)",
        }, `${c.coin} / ${c.stashCapacity}`),
        coinMinusBtn,
        coinPlusBtn,
      ),
      el("div", { className: "crew-stash", style: "display: flex; gap: 0.5em; align-items: center; margin: 0.35em 0;" },
        el("span", { className: "lbl" }, "Stash:"),
        el("span", { className: "crew-stash-count" }, `${c.stash} / ${c.stashCapacity}`),
        stashMinusBtn,
        stashPlusBtn,
      ),
    ),
    claimsSection,
    playbookSection,
    cohortsSection,
    xpSection,
    el(
      "div",
      { className: "crew-contacts-factions", "data-section": "contacts" },
      el("h2", {}, "Contacts & Factions"),
      el("h3", { className: "lbl" }, "Contacts"),
      contacts.length === 0
        ? el("p", {}, "(no contacts)")
        : el("div", { className: "contact-list" }, ...contactEntries),
      el("div", { className: "contact-add-row", style: "display: flex; gap: 0.5em; margin-top: 0.5em; align-items: center;" },
        contactNameInput,
        contactProfessionInput,
        addContactBtn,
      ),
      el("h3", { className: "lbl", style: "margin-top: 1em;" }, "Factions"),
      factions.length === 0
        ? el("p", {}, "(no factions)")
        : el("div", { className: "faction-list" }, ...factionEntries),
    ),
    el(
      "div",
      { className: "crew-actions", "data-section": "actions" },
      el("h2", {}, "Actions"),
      undoButton,
      deleteCrewBtn,
      state.historyCount !== null
        ? el("p", { className: "lbl", style: "margin-top: 0.5em;" },
            `${state.historyCount} snapshotted change${state.historyCount === 1 ? "" : "s"} can be undone.`)
        : null,
    ),
    el(
      "div",
      { className: "crew-notices", "data-section": "notices", style: "margin-top: 1em;" },
      state.refreshNotice
        ? el("p", { className: "notice", style: "margin-top: 1em;" }, state.refreshNotice)
        : null,
      state.undoNotice
        ? el("p", { className: "notice", style: "margin-top: 1em;" }, state.undoNotice)
        : null,
      state.errorMsg
        ? el("p", { className: "error", style: "margin-top: 1em;", role: "alert" }, state.errorMsg)
        : null,
      state.noticeMsg
        ? el("p", { className: "notice", style: "margin-top: 1em;" }, state.noticeMsg)
        : null,
    ),
  );
}

function renderLoading(): HTMLElement {
  return el(
    "section",
    { className: "crew-detail-loading" },
    el("h1", {}, "Crew"),
    el("p", {}, "Loading…"),
  );
}

/**
 * Mount the crew detail page into `root` for the given ID.
 * Returns a disposer.
 */
export function mountCrewDetailPage(
  root: HTMLElement,
  crewId: string,
): () => void {
  let cancelled = false;
  let currentCrew: Crew | null = null;
  let isUndoLoading = false;
  let isDeleteLoading = false;
  let canUndoState: boolean | null = null;
  let historyCountState: number | null = null;
  let isContactLoading = false;
  let isFactionLoading = false;
  let isProfileLoading = false;
  let isRepLoading = false;
  let isHeatLoading = false;
  let isWantedLoading = false;
  let isTierLoading = false;
  let isHoldLoading = false;
  let isCoinLoading = false;
  let isStashLoading = false;
  let isAbilityLoading = false;
  let isUpgradeLoading = false;
  let isCohortLoading = false;
  let isXpLoading = false;
  let isTurfLoading = false;
  let isNoteLoading = false;
  let isDevelopLoading = false;
  let crewTypeData: Record<string, unknown> | null = null;
  let crewTypesData: readonly Record<string, unknown>[] | null = null;
  let crewGameData: Record<string, unknown> | null = null;
  let crewCaps: CrewCapabilities | null = null;
  let editingProfile: ProfileEditingState | null = null;
  let editingCohortId: string | null = null;
  // CREW-04: advancement-edit mode gates ability removal / upgrade unmarking;
  // session-local like claimsEditMode, starts off on every fresh mount.
  let advancementEditMode = false;
  // CREW-02: claim-edit mode gates relinquish; session-local, resets on reload
  // (a fresh mount intentionally starts in the safe normal mode).
  let claimsEditMode = false;
  let errorMsg: string | null = null;
  let noticeMsg: string | null = null;
  let undoNotice: string | null = null;
  let refreshNotice: string | null = null;

  const clearNotices = () => {
    errorMsg = null;
    noticeMsg = null;
    undoNotice = null;
    refreshNotice = null;
  };
  /** CREW-04 fix (surfaced by the browser journey): rapid mutations each
   * trigger a capability refresh; a slow in-flight GET must never overwrite a
   * newer projection — the last ISSUED refresh wins, not the last delivered. */
  let capsRefreshSeq = 0;
  const refreshCaps = () => {
    if (cancelled || !currentCrew) return;
    const seq = ++capsRefreshSeq;
    void Effect.runPromise(
      Effect.match(getCrewCapabilities(crewId), {
        onFailure: () => undefined,
        onSuccess: (caps) => {
          if (cancelled || seq !== capsRefreshSeq) return;
          crewCaps = caps;
          renderDetail();
        },
      }),
    );
  };

  const refreshAndShowNotice = () => {
    if (!currentCrew) return;
    const recoverProgram = getCrew(crewId);
    void Effect.runPromise(
      Effect.match(recoverProgram, {
        onFailure: (recoverErr) => {
          if (cancelled) return;
          errorMsg = `Sheet refresh failed — ${opErrorText(recoverErr)}`;
          renderDetail();
        },
        onSuccess: (crew) => {
          if (cancelled) return;
          currentCrew = crew;
          refreshCaps();
          refreshNotice = "Sheet refreshed because it changed elsewhere";
          renderDetail();
          setTimeout(() => {
            if (!cancelled) {
              refreshNotice = null;
              renderDetail();
            }
          }, 3000);
        },
      }),
    );
  };

  /** Shared failure path for the mutation ops (mirrors character-detail). */
  const onOpFailure = (err: unknown, setLoadingFalse: () => void) => {
    if (cancelled) return;
    setLoadingFalse();
    if (err instanceof StaleRevisionError) {
      renderDetail();
      refreshAndShowNotice();
    } else {
      errorMsg = opErrorText(err);
      renderDetail();
    }
  };

  /** Type guard: a tracker op result (updated crew + requested/effective) vs a bare crew. */
  const isCrewTrackResult = (r: Crew | CrewTrackOpResult): r is CrewTrackOpResult =>
    typeof r === "object" && r !== null && "crew" in r;

  /**
   * Shared runner for the F2u mutation ops: set the per-op loading flag,
   * clear notices, re-render, run the program, and on success adopt the
   * updated crew. Failure goes through onOpFailure (STALE_REVISION refetch,
   * op-level error notices). Tracker ops report requested/effective clamps
   * (P29/FV-029) when they applied less than requested.
   */
  const runCrewOp = (
    setLoading: (v: boolean) => void,
    program: Effect.Effect<Crew | CrewTrackOpResult, ApiError | DecodeError | StaleRevisionError>,
    successNotice?: string,
    clampLabel?: string,
  ) => {
    setLoading(true);
    clearNotices();
    renderDetail();
    void Effect.runPromise(
      Effect.match(program, {
        onFailure: (err) => onOpFailure(err, () => setLoading(false)),
        onSuccess: (result) => {
          if (cancelled) return;
          setLoading(false);
          const crew = isCrewTrackResult(result) ? result.crew : result;
          currentCrew = crew;
          if (isCrewTrackResult(result) && result.effective !== result.requested) {
            noticeMsg = `${clampLabel ?? "Value"} clamped to ${result.effective} (requested ${result.requested})`;
            setTimeout(() => {
              if (!cancelled) {
                noticeMsg = null;
                renderDetail();
              }
            }, 5000);
          }
          if (successNotice) noticeMsg = successNotice;
          refreshCaps();
          renderDetail();
        },
      }),
    );
  };

  // FV-012: wholesale re-renders destroy the focused control; capture the
  // focused control's position before rendering and restore it after. The
  // request stays pending while the target is disabled (in-flight loading
  // render) so the post-mutation render fulfils it.
  let pendingFocus: FocusTarget | null = null;

  const renderDetail = () => {
    if (!currentCrew) return;
    if (!pendingFocus) pendingFocus = captureFocusTarget(root);
    setChildren(root, renderCrewDetail({
      c: currentCrew,
      anyLoading:
        isUndoLoading ||
        isDeleteLoading ||
        isContactLoading ||
        isFactionLoading ||
        isProfileLoading ||
        isRepLoading ||
        isHeatLoading ||
        isWantedLoading ||
        isTierLoading ||
        isHoldLoading ||
        isCoinLoading ||
        isStashLoading ||
        isAbilityLoading ||
        isUpgradeLoading ||
        isCohortLoading ||
        isXpLoading ||
        isTurfLoading ||
        isNoteLoading ||
        isDevelopLoading,
      isUndoLoading,
      isDeleteLoading,
      isContactLoading,
      isFactionLoading,
      isProfileLoading,
      isRepLoading,
      isHeatLoading,
      isWantedLoading,
      isTierLoading,
      isHoldLoading,
      isCoinLoading,
      isStashLoading,
      isAbilityLoading,
      isUpgradeLoading,
      isCohortLoading,
      isXpLoading,
      isTurfLoading,
      isNoteLoading,
      isDevelopLoading,
      crewTypeData,
      crewTypesData,
      crewGameData,
      crewCaps,
      editingProfile,
      claimsEditMode,
      advancementEdit: advancementEditMode,
      editingCohortId,
      errorMsg,
      noticeMsg,
      undoNotice,
      refreshNotice,
      canUndo: canUndoState,
      historyCount: historyCountState,
      handlers,
    }));
    if (pendingFocus && applyFocusTarget(root, pendingFocus)) pendingFocus = null;
  };

  const handlers = {
    onUndo: () => {
      if (!currentCrew || isUndoLoading) return;
      isUndoLoading = true;
      undoNotice = null;
      renderDetail();

      const program = undoCrew(crewId, currentCrew.revision);
      const before = currentCrew;

      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => {
            if (cancelled) return;
            isUndoLoading = false;
            if (err instanceof StaleRevisionError) {
              refreshNotice = null;
              renderDetail();
              refreshAndShowNotice();
            } else if (err instanceof OpError && err.error.code === "NO_HISTORY") {
              undoNotice = "Nothing to undo — no history available";
              renderDetail();
            } else {
              errorMsg = opErrorText(err);
              renderDetail();
            }
          },
          onSuccess: ({ crew, canUndo, historyCount }) => {
            if (cancelled) return;
            isUndoLoading = false;
            errorMsg = null;
            noticeMsg = null;
            undoNotice = null;
            refreshNotice = null;
            currentCrew = crew;
            canUndoState = canUndo;
            historyCountState = historyCount;
            // FV-028: positive feedback naming the restored state, distinct
            // from the NO_HISTORY error copy above.
            undoNotice = `Undone — restored ${describeCrewRestore(before, crew)}.`;
            renderDetail();
          },
        }),
      );
    },

    onDeleteCrew: () => {
      if (!currentCrew || isDeleteLoading) return;
      const confirmed = window.confirm(
        "Delete this crew permanently? This is not undoable and removes " +
        "their history. Member characters are unlinked and standalone " +
        "crew-owned clocks move to the campaign.",
      );
      if (!confirmed) return;
      isDeleteLoading = true;
      clearNotices();
      renderDetail();

      const program = deleteCrew(crewId, String(currentCrew.revision));
      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => onOpFailure(err, () => { isDeleteLoading = false; }),
          onSuccess: () => {
            if (cancelled) return;
            // The entity is gone — leave the page via history navigation.
            window.location.assign("/roster");
          },
        }),
      );
    },

    // -- F2y: Contacts & Factions -------------------------------------------

    onContactAdd: () => {
      if (!currentCrew || isContactLoading) return;
      const nameInput = root.querySelector('input[aria-label="Contact name"]') as HTMLInputElement;
      const profInput = root.querySelector('input[aria-label="Contact profession"]') as HTMLInputElement;
      const name = nameInput?.value?.trim() ?? "";
      const profession = profInput?.value?.trim() ?? "";
      if (!name) return;
      isContactLoading = true;
      clearNotices();
      renderDetail();

      const program = crewContactAdd(crewId, name, profession, currentCrew.revision);
      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => onOpFailure(err, () => { isContactLoading = false; }),
          onSuccess: (crew) => {
            if (cancelled) return;
            isContactLoading = false;
            currentCrew = crew;
            renderDetail();
          },
        }),
      );
    },

    onContactRemove: (name: string) => {
      if (!currentCrew || isContactLoading) return;
      isContactLoading = true;
      clearNotices();
      renderDetail();

      const program = crewContactRemove(crewId, name, currentCrew.revision);
      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => onOpFailure(err, () => { isContactLoading = false; }),
          onSuccess: (crew) => {
            if (cancelled) return;
            isContactLoading = false;
            currentCrew = crew;
            renderDetail();
          },
        }),
      );
    },

    onFactionSetStatus: (name: string, status: number) => {
      if (!currentCrew || isFactionLoading) return;
      isFactionLoading = true;
      clearNotices();
      renderDetail();

      const program = factionSetStatus(crewId, name, status, currentCrew.revision);
      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => onOpFailure(err, () => { isFactionLoading = false; }),
          onSuccess: (result) => {
            if (cancelled) return;
            isFactionLoading = false;
            currentCrew = result.crew;
            if (result.effective !== result.requested) {
              noticeMsg = `Faction status clamped to ${result.effective} (requested ${result.requested})`;
              setTimeout(() => {
                if (!cancelled) {
                  noticeMsg = null;
                  renderDetail();
                }
              }, 5000);
            }
            renderDetail();
          },
        }),
      );
    },

    onFactionRemove: (name: string) => {
      if (!currentCrew || isFactionLoading) return;
      isFactionLoading = true;
      clearNotices();
      renderDetail();

      const program = factionRemove(crewId, name, currentCrew.revision);
      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => onOpFailure(err, () => { isFactionLoading = false; }),
          onSuccess: (crew) => {
            if (cancelled) return;
            isFactionLoading = false;
            currentCrew = crew;
            renderDetail();
          },
        }),
      );
    },

    // -- F2u: Profile -------------------------------------------------------

    onProfileEdit: (field: CrewField) => {
      if (!currentCrew || editingProfile !== null) return;
      editingProfile = {
        field,
        value: currentCrew[field],
      };
      renderDetail();
    },

    onProfileSave: () => {
      if (!currentCrew || !editingProfile || isProfileLoading) return;
      const field = editingProfile.field;
      const value = editingProfile.value;
      isProfileLoading = true;
      editingProfile = null;
      clearNotices();
      renderDetail();

      // fields.update takes partial fields — send only the changed one.
      const program = crewFieldsUpdate(crewId, { [field]: value }, currentCrew.revision);
      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => onOpFailure(err, () => { isProfileLoading = false; }),
          onSuccess: (crew) => {
            if (cancelled) return;
            isProfileLoading = false;
            currentCrew = crew;
            renderDetail();
          },
        }),
      );
    },

    onProfileCancel: () => {
      editingProfile = null;
      renderDetail();
    },

    onReputationSet: () => {
      if (!currentCrew || isProfileLoading) return;
      const select = root.querySelector('select[aria-label="Reputation"]') as HTMLSelectElement | null;
      const value = select?.value;
      if (!value || value === currentCrew.reputation) return;
      runCrewOp(
        (v) => { isProfileLoading = v; },
        crewFieldsUpdate(crewId, { reputation: value }, currentCrew.revision),
      );
    },

    // -- F2ac: Notes ---------------------------------------------------------

    onNoteAdd: () => {
      if (!currentCrew || isNoteLoading) return;
      const textarea = root.querySelector('textarea[aria-label="New note"]') as HTMLTextAreaElement | null;
      const text = textarea?.value?.trim() ?? "";
      if (!text) return;
      runCrewOp(
        (v) => { isNoteLoading = v; },
        crewNoteAdd(crewId, text, currentCrew.revision),
      );
    },

    onNoteRemove: (index: number) => {
      if (!currentCrew || isNoteLoading) return;
      runCrewOp(
        (v) => { isNoteLoading = v; },
        crewNoteRemove(crewId, index, currentCrew.revision),
      );
    },

    // -- F2ac: Rep & Turf tracker + Develop -----------------------------------

    onTurfDelta: (delta: number) => {
      if (!currentCrew || isTurfLoading) return;
      runCrewOp(
        (v) => { isTurfLoading = v; },
        crewTurfAdd(crewId, delta, currentCrew.revision),
        undefined,
        "Turf",
      );
    },

    // SRD develop flow: rep >= threshold (rep.max − turf) unlocks Develop.
    // Weak hold → hold.set strong + rep reset. Strong hold → pay
    // (tier+1)×8 coin, tier.add +1, rep reset, hold.set weak; when the coin
    // is unaffordable the flow stops with an INSUFFICIENT_FUNDS notice
    // before any op is sent.
    onDevelop: () => {
      if (!currentCrew || isDevelopLoading) return;
      const crew = currentCrew;
      const threshold = crew.rep.max - crew.turf;
      if (crew.rep.current < threshold) return;

      if (crew.hold === "weak") {
        const program = Effect.gen(function* () {
          const strong = yield* crewHoldSet(crewId, "strong", crew.revision);
          const reset = yield* crewRepAdd(
            crewId,
            -strong.rep.current,
            strong.revision,
          );
          return reset;
        });
        runCrewOp(
          (v) => { isDevelopLoading = v; },
          program,
          "Hold strengthened — rep reset to 0",
        );
        return;
      }

      const cost = (crew.tier + 1) * 8;
      if (crew.coin < cost) {
        clearNotices();
        noticeMsg = `INSUFFICIENT_FUNDS: developing to Tier ${formatTier(crew.tier + 1, crewCaps?.tierMax ?? null)} costs ${cost} coin (have ${crew.coin})`;
        renderDetail();
        return;
      }
      const program = Effect.gen(function* () {
        const paid = yield* crewCoinAdd(crewId, -cost, crew.revision);
        const raised = yield* crewTierAdd(crewId, 1, paid.crew.revision);
        const reset = yield* crewRepAdd(
          crewId,
          -raised.crew.rep.current,
          raised.crew.revision,
        );
        const weakened = yield* crewHoldSet(crewId, "weak", reset.crew.revision);
        return weakened;
      });
      runCrewOp(
        (v) => { isDevelopLoading = v; },
        program,
        `Tier advanced to ${formatTier(crew.tier + 1, crewCaps?.tierMax ?? null)} — hold weakened, rep reset`,
      );
    },

    // -- F2u: Trackers ------------------------------------------------------

    onRepDelta: (delta: number) => {
      if (!currentCrew || isRepLoading) return;
      runCrewOp((v) => { isRepLoading = v; }, crewRepAdd(crewId, delta, currentCrew.revision), undefined, "Rep");
    },

    onRepTrack: (next: number) => {
      if (!currentCrew || isRepLoading) return;
      const delta = next - currentCrew.rep.current;
      if (delta === 0) return;
      runCrewOp((v) => { isRepLoading = v; }, crewRepAdd(crewId, delta, currentCrew.revision), undefined, "Rep");
    },

    onHeatDelta: (delta: number) => {
      if (!currentCrew || isHeatLoading) return;
      runCrewOp((v) => { isHeatLoading = v; }, crewHeatAdd(crewId, delta, currentCrew.revision), undefined, "Heat");
    },

    onHeatTrack: (next: number) => {
      if (!currentCrew || isHeatLoading) return;
      const delta = next - currentCrew.heat.current;
      if (delta === 0) return;
      runCrewOp((v) => { isHeatLoading = v; }, crewHeatAdd(crewId, delta, currentCrew.revision), undefined, "Heat");
    },

    onWantedDelta: (delta: number) => {
      if (!currentCrew || isWantedLoading) return;
      runCrewOp((v) => { isWantedLoading = v; }, crewWantedAdd(crewId, delta, currentCrew.revision), undefined, "Wanted");
    },

    onWantedTrack: (next: number) => {
      if (!currentCrew || isWantedLoading) return;
      const delta = next - currentCrew.wanted.current;
      if (delta === 0) return;
      runCrewOp((v) => { isWantedLoading = v; }, crewWantedAdd(crewId, delta, currentCrew.revision), undefined, "Wanted");
    },

    onTierDelta: (delta: number) => {
      if (!currentCrew || isTierLoading) return;
      runCrewOp((v) => { isTierLoading = v; }, crewTierAdd(crewId, delta, currentCrew.revision), undefined, "Tier");
    },

    onHoldSet: (hold: string) => {
      if (!currentCrew || isHoldLoading) return;
      if (!hold) return;
      runCrewOp((v) => { isHoldLoading = v; }, crewHoldSet(crewId, hold, currentCrew.revision));
    },

    onCoinDelta: (delta: number) => {
      if (!currentCrew || isCoinLoading) return;
      runCrewOp((v) => { isCoinLoading = v; }, crewCoinAdd(crewId, delta, currentCrew.revision), undefined, "Coin");
    },

    onStashDelta: (delta: number) => {
      if (!currentCrew || isStashLoading) return;
      runCrewOp((v) => { isStashLoading = v; }, crewStashAdd(crewId, delta, currentCrew.revision), undefined, "Stash");
    },

    // -- F2v: Playbook (abilities + upgrades + lair chart) -------------------

    onAbilityTake: () => {
      if (!currentCrew || isAbilityLoading) return;
      const sel = root.querySelector('select[aria-label="Take ability"]') as HTMLSelectElement | null;
      const name = sel?.value || null;
      if (!name) return;
      runCrewOp((v) => { isAbilityLoading = v; }, crewAbilityTake(crewId, name, currentCrew.revision));
    },

    onAbilityRemove: (name: string) => {
      if (!currentCrew || isAbilityLoading) return;
      runCrewOp((v) => { isAbilityLoading = v; }, crewAbilityRemove(crewId, name, currentCrew.revision));
    },

    onUpgradeMark: (name: string) => {
      if (!currentCrew || isUpgradeLoading) return;
      runCrewOp((v) => { isUpgradeLoading = v; }, upgradeMark(crewId, name, currentCrew.revision));
    },

    onUpgradeMarkMenu: () => {
      if (!currentCrew || isUpgradeLoading) return;
      const sel = root.querySelector('select[aria-label="Mark upgrade"]') as HTMLSelectElement | null;
      const name = sel?.value || null;
      if (!name) return;
      runCrewOp((v) => { isUpgradeLoading = v; }, upgradeMark(crewId, name, currentCrew.revision));
    },

    onUpgradeUnmark: (name: string) => {
      if (!currentCrew || isUpgradeLoading) return;
      runCrewOp((v) => { isUpgradeLoading = v; }, upgradeUnmark(crewId, name, currentCrew.revision));
    },

    // Crew Claims: acquire/relinquish, customize, reset.
    onClaimToggle: (claimId: string, claimed: boolean) => {
      if (!currentCrew || isUpgradeLoading) return;
      runCrewOp((v) => { isUpgradeLoading = v; }, crewClaimSet(crewId, claimId, claimed, currentCrew.revision));
    },
    onClaimCustomize: (claimId: string) => {
      if (!currentCrew || isUpgradeLoading) return;
      const overrides = currentCrew.claimOverrides;
      const existing = overrides.find((o) => o.claimId === claimId);
      const name = window.prompt("Claim name (blank keeps the default):", existing?.name ?? "");
      if (name === null) return;
      const desc = window.prompt("Benefit text (blank keeps the default):", existing?.description ?? "");
      if (desc === null) return;
      const fields: { name?: string; description?: string } = {};
      if (name.trim() !== "") fields.name = name.trim();
      if (desc.trim() !== "") fields.description = desc.trim();
      if (Object.keys(fields).length === 0) return;
      runCrewOp((v) => { isUpgradeLoading = v; }, crewClaimCustomize(crewId, claimId, fields, currentCrew.revision));
    },
    onClaimReset: (claimId: string) => {
      if (!currentCrew || isUpgradeLoading) return;
      runCrewOp((v) => { isUpgradeLoading = v; }, crewClaimReset(crewId, claimId, currentCrew.revision));
    },

    onClaimsEditToggle: () => {
      claimsEditMode = !claimsEditMode;
      renderDetail();
    },

    onAdvancementEditToggle: () => {
      advancementEditMode = !advancementEditMode;
      renderDetail();
    },
    // Chart boxes are sugar over the same +1/−1 ops (no set-to-N op exists):
    // clicking an empty box marks one box, clicking a filled box unmarks one.
    onChartBox: (name: string, index: number) => {
      if (!currentCrew || isUpgradeLoading) return;
      const marked = currentCrew.upgrades.find((u) => u.name === name)?.boxesMarked ?? 0;
      if (index > marked) {
        runCrewOp((v) => { isUpgradeLoading = v; }, upgradeMark(crewId, name, currentCrew.revision));
      } else {
        runCrewOp((v) => { isUpgradeLoading = v; }, upgradeUnmark(crewId, name, currentCrew.revision));
      }
    },

    // -- F2w: Cohorts --------------------------------------------------------

    onCohortAdd: () => {
      if (!currentCrew || isCohortLoading) return;
      const kindSelect = root.querySelector('select[aria-label="Cohort kind"]') as HTMLSelectElement | null;
      const cohortKind = kindSelect?.value ?? "";
      if (cohortKind !== "gang" && cohortKind !== "expert") return;
      // F2ac: kind-conditional selects (game data + canonical fallback).
      const gangSelect = root.querySelector('select[aria-label="Cohort gang type"]') as HTMLSelectElement | null;
      const expertSelect = root.querySelector('select[aria-label="Cohort expert type"]') as HTMLSelectElement | null;
      const expertCustom = root.querySelector('input[aria-label="Cohort expert custom type"]') as HTMLInputElement | null;
      const qualityInput = root.querySelector('input[aria-label="Cohort quality"]') as HTMLInputElement | null;
      const scaleInput = root.querySelector('input[aria-label="Cohort scale"]') as HTMLInputElement | null;
      const armorInput = root.querySelector('input[aria-label="Cohort armor"]') as HTMLInputElement | null;
      const edgesInput = root.querySelector('input[aria-label="Cohort edges"]') as HTMLInputElement | null;
      const flawsInput = root.querySelector('input[aria-label="Cohort flaws"]') as HTMLInputElement | null;
      const descInput = root.querySelector('input[aria-label="Cohort description"]') as HTMLInputElement | null;

      const body: Parameters<typeof cohortAdd>[1] = { cohortKind };
      if (cohortKind === "gang") {
        const gangType = gangSelect?.value?.trim() ?? "";
        if (gangType) body.gangType = gangType;
      } else {
        const expertType = expertSelect?.value ?? "";
        if (expertType) {
          body.expertType =
            expertType === "Custom"
              ? expertCustom?.value?.trim() || "Custom"
              : expertType;
        }
      }
      const quality = qualityInput ? Number.parseInt(qualityInput.value, 10) : Number.NaN;
      if (!Number.isNaN(quality)) body.quality = quality;
      const scale = scaleInput ? Number.parseInt(scaleInput.value, 10) : Number.NaN;
      if (!Number.isNaN(scale)) body.scale = scale;
      body.hasArmor = armorInput?.checked ?? false;
      const edges = splitList(edgesInput?.value ?? "");
      if (edges.length > 0) body.edges = edges;
      const flaws = splitList(flawsInput?.value ?? "");
      if (flaws.length > 0) body.flaws = flaws;
      const description = descInput?.value?.trim() ?? "";
      if (description) body.description = description;

      isCohortLoading = true;
      clearNotices();
      renderDetail();

      const program = cohortAdd(crewId, body, currentCrew.revision);
      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => onOpFailure(err, () => { isCohortLoading = false; }),
          onSuccess: (crew) => {
            if (cancelled) return;
            isCohortLoading = false;
            currentCrew = crew;
            renderDetail();
          },
        }),
      );
    },

    onCohortEdit: (cohortId: string) => {
      if (!currentCrew || editingCohortId !== null) return;
      editingCohortId = cohortId;
      renderDetail();
    },

    onCohortUpdate: (cohortId: string, fields: Record<string, unknown>) => {
      if (!currentCrew || isCohortLoading) return;
      isCohortLoading = true;
      editingCohortId = null;
      clearNotices();
      renderDetail();

      const program = cohortUpdate(crewId, { cohortId, ...fields }, currentCrew.revision);
      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => onOpFailure(err, () => { isCohortLoading = false; }),
          onSuccess: (crew) => {
            if (cancelled) return;
            isCohortLoading = false;
            currentCrew = crew;
            renderDetail();
          },
        }),
      );
    },

    onCohortRemove: (cohortId: string) => {
      if (!currentCrew || isCohortLoading) return;
      isCohortLoading = true;
      clearNotices();
      renderDetail();

      const program = cohortRemove(crewId, cohortId, currentCrew.revision);
      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => onOpFailure(err, () => { isCohortLoading = false; }),
          onSuccess: (crew) => {
            if (cancelled) return;
            isCohortLoading = false;
            currentCrew = crew;
            renderDetail();
          },
        }),
      );
    },

    onCohortCancel: () => {
      editingCohortId = null;
      renderDetail();
    },

    // -- F2x: Crew XP --------------------------------------------------------

    onXpDelta: (delta: number) => {
      if (!currentCrew || isXpLoading) return;
      runCrewOp((v) => { isXpLoading = v; }, crewXpAdd(crewId, delta, currentCrew.revision), undefined, "XP");
    },

    onXpTrack: (next: number) => {
      if (!currentCrew || isXpLoading) return;
      const delta = next - currentCrew.experience.points;
      if (delta === 0) return;
      runCrewOp((v) => { isXpLoading = v; }, crewXpAdd(crewId, delta, currentCrew.revision), undefined, "XP");
    },

    onXpClear: () => {
      if (!currentCrew || isXpLoading) return;
      runCrewOp((v) => { isXpLoading = v; }, crewXpClear(crewId, currentCrew.revision));
    },
  };

  root.setAttribute("aria-live", "polite");

  const startLoad = () => {
    root.setAttribute("aria-busy", "true");
    setChildren(root, renderLoading());

    const program = Effect.gen(function* () {
      const crew = yield* getCrew(crewId);
      // Crew-type game data drives the Playbook menus, the reputation
      // dropdown, and the cohort type lists. The per-crew-type endpoint is
      // preferred; failures degrade gracefully to the whole game-data object
      // (CrewTypes find-by-name), mirroring the character sheet's getPlaybook
      // + game-data fallback. F2ac: getCrewGameData (the raw {stem}-crews.json
      // object) replaces getCrewTypes so the top-level CohortGangTypes /
      // CohortExpertTypes keys are available for the cohort dropdowns.
      const crewType = yield* Effect.either(
        getCrewType(crew.gameStem, crew.crewTypeName),
      );
      const gameData = yield* Effect.either(getCrewGameData(crew.gameStem));
      // SC-F3: the server-computed capability projection (upgrade/ability
      // catalogs, effective turf, develop threshold). Advisory — degrade
      // gracefully when it's unavailable.
      const caps = yield* Effect.either(getCrewCapabilities(crewId));
      return { crew, crewType, gameData, caps };
    });

    void Effect.runPromise(
      Effect.match(program, {
        onFailure: (err) => {
          if (cancelled) return;
          root.setAttribute("aria-busy", "false");
          const msg =
            err instanceof ApiError
              ? `Failed to reach /api/crews/${crewId} (${err.status}): ${err.body}`
              : err instanceof DecodeError
                ? `Invalid crew response: ${err.message}`
                : String(err);
          setChildren(
            root,
            errorCard({
              headline: "This crew sheet could not be loaded.",
              detail: msg,
              onRetry: startLoad,
            }),
          );
        },
        onSuccess: ({ crew, crewType, gameData, caps }) => {
          if (cancelled) return;
          root.setAttribute("aria-busy", "false");
          currentCrew = crew;
          if (caps._tag === "Right") {
            crewCaps = caps.right;
          }
          if (crewType._tag === "Right") {
            crewTypeData = crewType.right;
          }
          if (gameData._tag === "Right") {
            crewGameData = gameData.right;
            const crewTypes = gameData.right.CrewTypes;
            if (Array.isArray(crewTypes)) {
              crewTypesData = crewTypes.filter(
                (ct): ct is Record<string, unknown> =>
                  typeof ct === "object" && ct !== null,
              );
            }
          }
          renderDetail();
        },
      }),
    );
  };

  startLoad();

  return () => {
    cancelled = true;
  };
}
