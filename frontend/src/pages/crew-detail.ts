import { Effect } from "effect";
import {
  ApiError,
  DecodeError,
  getCrew,
  undoCrew,
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
  upgradeMark,
  upgradeUnmark,
  getCrewType,
  getCrewTypes,
  cohortAdd,
  cohortRemove,
  cohortUpdate,
  StaleRevisionError,
} from "../api/client.js";
import { el, setChildren } from "../lib/dom.js";
import type { Crew } from "../schema/crew.js";
import { CohortHarm, CohortType, Hold } from "../schema/common.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Editable free-text crew fields (contract fields.update). */
type CrewField = "name" | "lair" | "huntingGrounds" | "reputation" | "notes";

const CREW_FIELD_LABELS: Record<CrewField, string> = {
  name: "Name",
  lair: "Lair",
  huntingGrounds: "Hunting grounds",
  reputation: "Reputation",
  notes: "Notes",
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
  isUndoLoading: boolean;
  isAbilityLoading: boolean;
  isUpgradeLoading: boolean;
  isCohortLoading: boolean;
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
  editingProfile: ProfileEditingState | null;
  editingCohortId: string | null;
  errorMsg: string | null;
  noticeMsg: string | null;
  undoNotice: string | null;
  refreshNotice: string | null;
  handlers: {
    onUndo: () => void;
    onContactAdd: () => void;
    onContactRemove: (name: string) => void;
    onFactionSetStatus: (name: string, status: number) => void;
    onFactionRemove: (name: string) => void;
    onProfileEdit: (field: CrewField) => void;
    onProfileSave: () => void;
    onProfileCancel: () => void;
    onRepDelta: (delta: number) => void;
    onRepTrack: (next: number) => void;
    onHeatDelta: (delta: number) => void;
    onHeatTrack: (next: number) => void;
    onWantedDelta: (delta: number) => void;
    onWantedTrack: (next: number) => void;
    onTierDelta: (delta: number) => void;
    onHoldSet: () => void;
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
  };
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

/** Friendly text for op-level errors (DUPLICATE / NOT_FOUND / ABILITY_MAXED /
 * UPGRADE_MAXED / VALIDATION) carried in ApiError bodies. */
function opErrorText(err: ApiError): string {
  const body = err.body;
  if (body.startsWith("DUPLICATE")) {
    return "DUPLICATE: a contact with that name already exists";
  }
  if (body.startsWith("NOT_FOUND")) {
    return "NOT_FOUND: not on this sheet (removed elsewhere?)";
  }
  if (body.startsWith("ABILITY_MAXED")) {
    return "ABILITY_MAXED: that ability is already taken to its limit";
  }
  if (body.startsWith("UPGRADE_MAXED")) {
    return "UPGRADE_MAXED: all of that upgrade's boxes are already marked";
  }
  if (body.startsWith("VALIDATION")) {
    return body;
  }
  return `API error (${err.status}): ${body}`;
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
  }, "−");
  minusBtn.addEventListener("click", () => opts.onDelta(-1));

  const plusBtn = el("button", {
    type: "button",
    disabled: state.anyLoading,
    title: `Add 1 ${opts.label.toLowerCase()}`,
  }, opts.isLoading ? "…" : "+");
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
// Render
// ---------------------------------------------------------------------------

function renderCrewDetail(state: RenderState): HTMLElement {
  const { c, handlers } = state;

  // -- Undo button ----------------------------------------------------------

  const undoButton = el(
    "button",
    {
      disabled: state.isUndoLoading,
      title: "Undo last change",
    },
    state.isUndoLoading ? "…" : "Undo last change",
  );
  undoButton.addEventListener("click", handlers.onUndo);

  // -- Profile (F2u) --------------------------------------------------------

  const profileFields = (["name", "lair", "huntingGrounds", "reputation", "notes"] as const)
    .map((field) => {
      const label = CREW_FIELD_LABELS[field];
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
          { className: "field-editing", style: "display: flex; gap: 0.5em; align-items: center; margin: 0.25em 0;" },
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
        { className: "field-read", style: "display: flex; gap: 0.5em; align-items: center; margin: 0.25em 0;" },
        el("span", { className: "lbl" }, `${label}: `),
        el("span", { className: "field-value" }, displayValue),
        editBtn,
      );
    });

  // -- Trackers (F2u) -------------------------------------------------------

  // Turf is display-only (sheet plan decision 5): no stored turf track, no
  // turf op — turf is represented by these very rep boxes, so the rep tracker
  // doubles as the turf rendering.
  const repTracker = renderTracker(state, {
    className: "crew-rep",
    label: "Rep",
    current: c.rep.current,
    max: c.rep.max,
    isLoading: state.isRepLoading,
    onDelta: handlers.onRepDelta,
    onTrack: handlers.onRepTrack,
    note: "Turf fills rep boxes (display-only — no separate turf track)",
  });

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

  // Tier: unbounded integer (no max) — value + -/+ only.
  const tierMinusBtn = el("button", {
    type: "button",
    disabled: state.anyLoading || c.tier <= 0,
    title: "Remove 1 tier",
  }, "−");
  tierMinusBtn.addEventListener("click", () => handlers.onTierDelta(-1));
  const tierPlusBtn = el("button", {
    type: "button",
    disabled: state.anyLoading,
    title: "Add 1 tier",
  }, state.isTierLoading ? "…" : "+");
  tierPlusBtn.addEventListener("click", () => handlers.onTierDelta(1));

  // Hold: native <select> populated from the contract hold enum (schema
  // literal mirrors contract/schemas/common.json $defs hold — never
  // hardcoded here) + explicit Set button.
  const holdSelect = el("select", {
    "aria-label": "Hold",
    disabled: state.anyLoading,
  }) as HTMLSelectElement;
  for (const value of Hold.literals) {
    const option = el("option", { value }, value) as HTMLOptionElement;
    if (value === c.hold) option.selected = true;
    holdSelect.append(option);
  }
  const holdSetBtn = el("button", {
    type: "button",
    disabled: state.anyLoading,
    title: "Set hold",
  }, state.isHoldLoading ? "…" : "Set");
  holdSetBtn.addEventListener("click", handlers.onHoldSet);

  // -- Coin & Stash (F2u) ---------------------------------------------------

  const coinMinusBtn = el("button", {
    type: "button",
    disabled: state.anyLoading || c.coin <= 0,
    title: "Remove 1 coin",
  }, "−");
  coinMinusBtn.addEventListener("click", () => handlers.onCoinDelta(-1));
  const coinPlusBtn = el("button", {
    type: "button",
    disabled: state.anyLoading,
    title: "Add 1 coin",
  }, state.isCoinLoading ? "…" : "+");
  coinPlusBtn.addEventListener("click", () => handlers.onCoinDelta(1));

  const stashMinusBtn = el("button", {
    type: "button",
    disabled: state.anyLoading || c.stash <= 0,
    title: "Remove 1 stash",
  }, "−");
  stashMinusBtn.addEventListener("click", () => handlers.onStashDelta(-1));
  const stashPlusBtn = el("button", {
    type: "button",
    disabled: state.anyLoading,
    title: "Add 1 stash",
  }, state.isStashLoading ? "…" : "+");
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

    // Eligible = in the game-data SpecialAbilities and either not taken yet
    // or taken fewer than TimesTakeable (the server enforces the limit).
    const eligible = specialAbilities.filter((sa) => {
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
        el("button", {
          type: "button",
          disabled: anyLoading,
          title: `Remove ability: ${a.name}`,
        }, "✕"),
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

    // Take menu: native <select> from game data + <details>/<summary>
    // description (mirrors F2p's character section).
    const abilitySelect = el("select", {
      "aria-label": "Take ability",
      disabled: anyLoading || eligible.length === 0,
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
      detailsSummary.textContent = name || "—";
      detailsBody.textContent = abilityDescription(name) || "No description available.";
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

    // List rows come from the DTO (name + boxesMarked); total and description
    // come from the crew-type game data — never hardcoded.
    const upgradeEntries = c.upgrades.map((u) => {
      const game = findUpgrade(u.name);
      const total = upgradeTotalBoxes(game);
      const atMax = u.boxesMarked >= total;
      const unmarkBtn = el("button", {
        type: "button",
        disabled: anyLoading || u.boxesMarked <= 0,
        title: `Unmark upgrade: ${u.name}`,
      }, "−");
      unmarkBtn.addEventListener("click", () => handlers.onUpgradeUnmark(u.name));
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

    // Mark menu: native <select> of game-data Upgrades not yet full — the way
    // to start a new upgrade (the DTO list only shows already-marked ones).
    const markable = upgradesData.filter(
      (u) => (markedByName.get(String(u.Name)) ?? 0) < upgradeTotalBoxes(u),
    );
    const markSelect = el("select", {
      "aria-label": "Mark upgrade",
      disabled: anyLoading || markable.length === 0,
    },
      el("option", { value: "" }, "--"),
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
    const chartRows = [
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
        const box = el("button", {
          type: "button",
          className: "chart-box",
          "data-stress": filled ? "1" : "0",
          "data-index": String(i),
          "aria-label": `${row.name} box ${i}`,
          "aria-pressed": filled ? "true" : "false",
          disabled: anyLoading,
          title: filled ? `Unmark ${row.name}` : `Mark ${row.name}`,
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

    return el("div", { className: "crew-playbook" },
      el("h2", {}, "Playbook"),
      el("h3", { className: "lbl", style: "margin-top: 0.5em;" }, "Special Abilities"),
      c.specialAbilities.length === 0
        ? el("p", {}, "(none)")
        : el("div", { style: "display: flex; flex-direction: column;" }, ...abilityEntries),
      el("div", { style: "display: flex; gap: 0.5em; margin-top: 0.5em; align-items: center; flex-wrap: wrap;" },
        abilitySelect,
        takeBtn,
        abilityDetails,
      ),
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
      el("p", { className: "lbl", style: "font-size: 0.85em;" },
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
      const typeInput = el("input", {
        type: "text",
        value: cohort[typeField],
        "aria-label": `Edit ${typeField}`,
        disabled: state.anyLoading,
      });
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
        if (typeInput.value !== cohort[typeField]) fields[typeField] = typeInput.value;
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
        { className: "cohort-entry editing", "data-cohort-id": cohort.id, "data-cohort-kind": cohort.cohortKind },
        el("span", { className: "cohort-kind-badge" }, kindLabel),
        el("div", { className: "cohort-edit-fields", style: "display: flex; flex-wrap: wrap; gap: 0.5em; align-items: center;" },
          el("label", { className: "lbl" }, `${kindLabel} type:`, typeInput),
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
      { className: "cohort-entry", "data-cohort-id": cohort.id, "data-cohort-kind": cohort.cohortKind },
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
    disabled: state.anyLoading,
  }) as HTMLSelectElement;
  for (const value of CohortType.literals) {
    const option = el("option", { value }, value) as HTMLOptionElement;
    if (value === "gang") option.selected = true;
    cohortKindSelect.append(option);
  }
  const gangTypeInput = el("input", {
    type: "text",
    "aria-label": "Cohort gang type",
    disabled: state.anyLoading,
    placeholder: "gang type",
  });
  const expertTypeInput = el("input", {
    type: "text",
    "aria-label": "Cohort expert type",
    disabled: state.anyLoading,
    placeholder: "expert type",
  });
  const qualityInput = el("input", {
    type: "number",
    "aria-label": "Cohort quality",
    disabled: state.anyLoading,
    placeholder: "quality",
  });
  const scaleInput = el("input", {
    type: "number",
    "aria-label": "Cohort scale",
    disabled: state.anyLoading,
    placeholder: "scale",
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
    placeholder: "edges (comma-separated)",
  });
  const flawsInput = el("input", {
    type: "text",
    "aria-label": "Cohort flaws",
    disabled: state.anyLoading,
    placeholder: "flaws (comma-separated)",
  });
  const descInput = el("input", {
    type: "text",
    "aria-label": "Cohort description",
    disabled: state.anyLoading,
    placeholder: "description",
  });
  const addCohortBtn = el("button", {
    type: "button",
    disabled: state.anyLoading,
    title: "Add cohort",
  }, state.isCohortLoading ? "…" : "+");
  addCohortBtn.addEventListener("click", handlers.onCohortAdd);

  const cohortsSection = el(
    "div",
    { className: "crew-cohorts" },
    el("h2", {}, "Cohorts"),
    c.cohorts.length === 0
      ? el("p", {}, "(no cohorts)")
      : el("div", { className: "cohort-list" }, ...cohortEntries),
    el("h3", { className: "lbl", style: "margin-top: 1em;" }, "Add Cohort"),
    el("div", { className: "cohort-add", style: "display: flex; flex-wrap: wrap; gap: 0.5em; align-items: center;" },
      el("label", { className: "lbl" }, "Kind:", cohortKindSelect),
      gangTypeInput,
      expertTypeInput,
      qualityInput,
      scaleInput,
      el("label", { className: "lbl" }, "Armor:", armorInput),
      edgesInput,
      flawsInput,
      descInput,
      addCohortBtn,
    ),
  );

  return el(
    "section",
    { className: "crew-detail" },
    el(
      "div",
      { className: "crew-header" },
      el("h1", {}, c.name),
      el("p", { className: "crew-type" }, c.crewTypeName),
    ),
    el(
      "div",
      { className: "crew-profile" },
      el("h2", {}, "Profile"),
      ...profileFields,
      el("p", { style: "margin-top: 0.5em;" },
        el("a", { href: `/crew/${c.id}/history` }, "History"),
      ),
    ),
    el(
      "div",
      { className: "crew-trackers" },
      el("h2", {}, "Trackers"),
      el("h3", { className: "lbl" }, "Rep & Turf"),
      repTracker,
      el("h3", { className: "lbl", style: "margin-top: 0.75em;" }, "Heat"),
      heatTracker,
      el("h3", { className: "lbl", style: "margin-top: 0.75em;" }, "Wanted"),
      wantedTracker,
      el("h3", { className: "lbl", style: "margin-top: 0.75em;" }, "Tier"),
      el("div", { className: "crew-tier", style: "display: flex; gap: 0.5em; align-items: center; margin: 0.6em 0;" },
        el("span", { className: "crew-tier-value" }, String(c.tier)),
        tierMinusBtn,
        tierPlusBtn,
      ),
      el("h3", { className: "lbl", style: "margin-top: 0.75em;" }, "Hold"),
      el("div", { className: "crew-hold", style: "display: flex; gap: 0.5em; align-items: center; margin: 0.6em 0;" },
        holdSelect,
        holdSetBtn,
      ),
    ),
    el(
      "div",
      { className: "crew-fund" },
      el("h2", {}, "Fund"),
      el("div", { className: "crew-coin", style: "display: flex; gap: 0.5em; align-items: center; margin: 0.35em 0;" },
        el("span", { className: "lbl" }, "Coin:"),
        el("span", { className: "crew-coin-count" }, String(c.coin)),
        coinMinusBtn,
        coinPlusBtn,
      ),
      el("div", { className: "crew-stash", style: "display: flex; gap: 0.5em; align-items: center; margin: 0.35em 0;" },
        el("span", { className: "lbl" }, "Stash:"),
        el("span", { className: "crew-stash-count" }, String(c.stash)),
        stashMinusBtn,
        stashPlusBtn,
      ),
    ),
    playbookSection,
    cohortsSection,
    el(
      "div",
      { className: "crew-contacts-factions" },
      el("h2", {}, "Contacts & Factions"),
      el("h3", { className: "lbl" }, "Contacts"),
      contacts.length === 0
        ? el("p", {}, "(no contacts)")
        : el("div", { className: "contact-list" }, ...contactEntries),
      el("div", { style: "display: flex; gap: 0.5em; margin-top: 0.5em; align-items: center;" },
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
      { className: "crew-actions" },
      el("h2", {}, "Actions"),
      undoButton,
    ),
    el(
      "div",
      { className: "crew-notices", style: "margin-top: 1em;" },
      state.refreshNotice
        ? el("p", { className: "notice", style: "margin-top: 1em;" }, state.refreshNotice)
        : null,
      state.undoNotice
        ? el("p", { className: "notice", style: "margin-top: 1em;" }, state.undoNotice)
        : null,
      state.errorMsg
        ? el("p", { className: "error", style: "margin-top: 1em;" }, state.errorMsg)
        : null,
      state.noticeMsg
        ? el("p", { className: "notice", style: "margin-top: 1em;" }, state.noticeMsg)
        : null,
    ),
  );
}

function renderError(message: string): HTMLElement {
  return el(
    "section",
    { className: "crew-detail-error" },
    el("h1", {}, "Crew"),
    el("p", { className: "error", role: "alert" }, message),
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
  let crewTypeData: Record<string, unknown> | null = null;
  let crewTypesData: readonly Record<string, unknown>[] | null = null;
  let editingProfile: ProfileEditingState | null = null;
  let editingCohortId: string | null = null;
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

  const refreshAndShowNotice = () => {
    if (!currentCrew) return;
    const recoverProgram = getCrew(crewId);
    void Effect.runPromise(
      Effect.match(recoverProgram, {
        onFailure: (recoverErr) => {
          if (cancelled) return;
          if (recoverErr instanceof ApiError) {
            errorMsg = `Sheet refresh failed (${recoverErr.status}): ${recoverErr.body}`;
          } else if (recoverErr instanceof DecodeError) {
            errorMsg = `Sheet refresh failed (invalid response): ${recoverErr.message}`;
          } else {
            errorMsg = `Sheet refresh failed: ${String(recoverErr)}`;
          }
          renderDetail();
        },
        onSuccess: (crew) => {
          if (cancelled) return;
          currentCrew = crew;
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
    } else if (err instanceof ApiError) {
      errorMsg = opErrorText(err);
      renderDetail();
    } else if (err instanceof DecodeError) {
      errorMsg = `Invalid response: ${err.message}`;
      renderDetail();
    } else {
      errorMsg = String(err);
      renderDetail();
    }
  };

  /**
   * Shared runner for the F2u mutation ops: set the per-op loading flag,
   * clear notices, re-render, run the program, and on success adopt the
   * updated crew. Failure goes through onOpFailure (STALE_REVISION refetch,
   * op-level error notices).
   */
  const runCrewOp = (
    setLoading: (v: boolean) => void,
    program: Effect.Effect<Crew, ApiError | DecodeError | StaleRevisionError>,
  ) => {
    setLoading(true);
    clearNotices();
    renderDetail();
    void Effect.runPromise(
      Effect.match(program, {
        onFailure: (err) => onOpFailure(err, () => setLoading(false)),
        onSuccess: (crew) => {
          if (cancelled) return;
          setLoading(false);
          currentCrew = crew;
          renderDetail();
        },
      }),
    );
  };

  const renderDetail = () => {
    if (!currentCrew) return;
    setChildren(root, renderCrewDetail({
      c: currentCrew,
      anyLoading:
        isUndoLoading ||
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
        isCohortLoading,
      isUndoLoading,
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
      crewTypeData,
      crewTypesData,
      editingProfile,
      editingCohortId,
      errorMsg,
      noticeMsg,
      undoNotice,
      refreshNotice,
      handlers,
    }));
  };

  const handlers = {
    onUndo: () => {
      if (!currentCrew || isUndoLoading) return;
      isUndoLoading = true;
      undoNotice = null;
      renderDetail();

      const program = undoCrew(crewId);

      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => {
            if (cancelled) return;
            isUndoLoading = false;
            if (err instanceof StaleRevisionError) {
              refreshNotice = null;
              renderDetail();
              refreshAndShowNotice();
            } else if (err instanceof ApiError) {
              if (err.body.startsWith("NO_HISTORY")) {
                undoNotice = "Nothing to undo — no history available";
              } else {
                errorMsg = `API error (${err.status}): ${err.body}`;
              }
              renderDetail();
            } else if (err instanceof DecodeError) {
              errorMsg = `Invalid response: ${err.message}`;
              renderDetail();
            } else {
              errorMsg = String(err);
              renderDetail();
            }
          },
          onSuccess: (crew) => {
            if (cancelled) return;
            isUndoLoading = false;
            errorMsg = null;
            noticeMsg = null;
            undoNotice = null;
            refreshNotice = null;
            currentCrew = crew;
            renderDetail();
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
      editingProfile = { field, value: currentCrew[field] };
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

    // -- F2u: Trackers ------------------------------------------------------

    onRepDelta: (delta: number) => {
      if (!currentCrew || isRepLoading) return;
      runCrewOp((v) => { isRepLoading = v; }, crewRepAdd(crewId, delta, currentCrew.revision));
    },

    onRepTrack: (next: number) => {
      if (!currentCrew || isRepLoading) return;
      const delta = next - currentCrew.rep.current;
      if (delta === 0) return;
      runCrewOp((v) => { isRepLoading = v; }, crewRepAdd(crewId, delta, currentCrew.revision));
    },

    onHeatDelta: (delta: number) => {
      if (!currentCrew || isHeatLoading) return;
      runCrewOp((v) => { isHeatLoading = v; }, crewHeatAdd(crewId, delta, currentCrew.revision));
    },

    onHeatTrack: (next: number) => {
      if (!currentCrew || isHeatLoading) return;
      const delta = next - currentCrew.heat.current;
      if (delta === 0) return;
      runCrewOp((v) => { isHeatLoading = v; }, crewHeatAdd(crewId, delta, currentCrew.revision));
    },

    onWantedDelta: (delta: number) => {
      if (!currentCrew || isWantedLoading) return;
      runCrewOp((v) => { isWantedLoading = v; }, crewWantedAdd(crewId, delta, currentCrew.revision));
    },

    onWantedTrack: (next: number) => {
      if (!currentCrew || isWantedLoading) return;
      const delta = next - currentCrew.wanted.current;
      if (delta === 0) return;
      runCrewOp((v) => { isWantedLoading = v; }, crewWantedAdd(crewId, delta, currentCrew.revision));
    },

    onTierDelta: (delta: number) => {
      if (!currentCrew || isTierLoading) return;
      runCrewOp((v) => { isTierLoading = v; }, crewTierAdd(crewId, delta, currentCrew.revision));
    },

    onHoldSet: () => {
      if (!currentCrew || isHoldLoading) return;
      const select = root.querySelector('select[aria-label="Hold"]') as HTMLSelectElement | null;
      const hold = select?.value;
      if (!hold) return;
      runCrewOp((v) => { isHoldLoading = v; }, crewHoldSet(crewId, hold, currentCrew.revision));
    },

    onCoinDelta: (delta: number) => {
      if (!currentCrew || isCoinLoading) return;
      runCrewOp((v) => { isCoinLoading = v; }, crewCoinAdd(crewId, delta, currentCrew.revision));
    },

    onStashDelta: (delta: number) => {
      if (!currentCrew || isStashLoading) return;
      runCrewOp((v) => { isStashLoading = v; }, crewStashAdd(crewId, delta, currentCrew.revision));
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
      const gangInput = root.querySelector('input[aria-label="Cohort gang type"]') as HTMLInputElement | null;
      const expertInput = root.querySelector('input[aria-label="Cohort expert type"]') as HTMLInputElement | null;
      const qualityInput = root.querySelector('input[aria-label="Cohort quality"]') as HTMLInputElement | null;
      const scaleInput = root.querySelector('input[aria-label="Cohort scale"]') as HTMLInputElement | null;
      const armorInput = root.querySelector('input[aria-label="Cohort armor"]') as HTMLInputElement | null;
      const edgesInput = root.querySelector('input[aria-label="Cohort edges"]') as HTMLInputElement | null;
      const flawsInput = root.querySelector('input[aria-label="Cohort flaws"]') as HTMLInputElement | null;
      const descInput = root.querySelector('input[aria-label="Cohort description"]') as HTMLInputElement | null;

      const body: Parameters<typeof cohortAdd>[1] = { cohortKind };
      const gangType = gangInput?.value?.trim() ?? "";
      const expertType = expertInput?.value?.trim() ?? "";
      if (cohortKind === "gang" && gangType) body.gangType = gangType;
      if (cohortKind === "expert" && expertType) body.expertType = expertType;
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
  };

  root.setAttribute("aria-live", "polite");
  root.setAttribute("aria-busy", "true");
  setChildren(root, renderLoading());

  const program = Effect.gen(function* () {
    const crew = yield* getCrew(crewId);
    // Crew-type game data drives the Playbook menus + descriptions. The
    // per-crew-type endpoint is preferred; failures degrade gracefully to
    // the CrewTypes list (find-by-name), mirroring the character sheet's
    // getPlaybook + game-data fallback. No hardcoded lists either way.
    const crewType = yield* Effect.either(
      getCrewType(crew.gameStem, crew.crewTypeName),
    );
    const crewTypes = yield* Effect.either(getCrewTypes(crew.gameStem));
    return { crew, crewType, crewTypes };
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
        setChildren(root, renderError(msg));
      },
      onSuccess: ({ crew, crewType, crewTypes }) => {
        if (cancelled) return;
        root.setAttribute("aria-busy", "false");
        currentCrew = crew;
        if (crewType._tag === "Right") {
          crewTypeData = crewType.right;
        }
        if (crewTypes._tag === "Right") {
          crewTypesData = crewTypes.right;
        }
        renderDetail();
      },
    }),
  );

  return () => {
    cancelled = true;
  };
}
