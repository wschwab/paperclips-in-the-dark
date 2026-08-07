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
  StaleRevisionError,
} from "../api/client.js";
import { el, setChildren } from "../lib/dom.js";
import type { Crew } from "../schema/crew.js";
import { Hold } from "../schema/common.js";

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
  isUndoLoading: boolean;
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
  };
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

/** Friendly text for op-level errors (DUPLICATE / NOT_FOUND / VALIDATION) carried in ApiError bodies. */
function opErrorText(err: ApiError): string {
  const body = err.body;
  if (body.startsWith("DUPLICATE")) {
    return "DUPLICATE: a contact with that name already exists";
  }
  if (body.startsWith("NOT_FOUND")) {
    return "NOT_FOUND: not on this sheet (removed elsewhere?)";
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
  let editingProfile: ProfileEditingState | null = null;
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
        isStashLoading,
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
      editingProfile,
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
  };

  root.setAttribute("aria-live", "polite");
  root.setAttribute("aria-busy", "true");
  setChildren(root, renderLoading());

  const program = Effect.gen(function* () {
    const crew = yield* getCrew(crewId);
    return crew;
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
      onSuccess: (crew) => {
        if (cancelled) return;
        root.setAttribute("aria-busy", "false");
        currentCrew = crew;
        renderDetail();
      },
    }),
  );

  return () => {
    cancelled = true;
  };
}
