import { Effect } from "effect";
import {
  ApiError,
  DecodeError,
  getCharacter,
  getGame,
  stressAdd,
  stressClear,
  traumaAdd,
  traumaRemove,
  dossierUpdate,
  undoCharacter,
  StaleRevisionError,
  harmAdd,
  harmHeal,
  harmRemove,
  harmHealingClock,
  armorSet,
} from "../api/client.js";
import { stressTrack } from "../components/stress-track.js";
import { clock } from "../components/clock.js";
import { el, setChildren } from "../lib/dom.js";
import type { Character } from "../schema/character.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DossierField = "name" | "alias" | "look" | "notes" |
  { kind: "named"; key: "background" | "heritage" | "vice"; field: "name" | "description" };

interface EditingState {
  field: DossierField;
  value: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getNamedValue(c: Character, key: "background" | "heritage" | "vice", field: "name" | "description"): string {
  return c.dossier[key][field];
}

function getDossierValue(c: Character, field: DossierField): string {
  if (typeof field === "string") return c.dossier[field];
  return getNamedValue(c, field.key, field.field);
}

function buildDossierPayload(field: DossierField, value: string): Record<string, unknown> {
  if (typeof field === "string") return { [field]: value };
  // For named fields, send the full named object with the changed field
  return { [field.key]: { name: field.field === "name" ? value : "", description: field.field === "description" ? value : "" } };
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

interface RenderState {
  c: Character;
  gameData: Record<string, unknown> | null;
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
  // Error / notice
  errorMsg: string | null;
  noticeMsg: string | null;
  undoNotice: string | null;
  harmSpillNotice: string | null;
  // Editing
  editing: EditingState | null;
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
    onUndo: () => void;
    onHarmAdd: () => void;
    onHarmRemove: (description: string, intensity: string) => void;
    onHarmHeal: () => void;
    onHarmHealingClock: () => void;
    onArmorSet: (armor: string, used: boolean) => void;
  };
}

function renderDetail(state: RenderState): HTMLElement {
  const { c, gameData, handlers, editing } = state;
  const status = c.isRetired ? " (retired)" : c.isDeadish ? " (deadish)" : "";
  const traumaList: string[] = Array.isArray(gameData?.Traumas) ? gameData.Traumas as string[] : [];
  const currentTraumas = new Set(c.monitor.trauma.traumas);
  const availableTraumas = traumaList.filter((t) => !currentTraumas.has(t));

  const anyLoading = state.isStressLoading || state.isStressClearLoading ||
    state.isTraumaLoading || state.isDossierLoading || state.isUndoLoading ||
    state.isHarmLoading || state.isArmorLoading || state.isHealLoading || state.isClockLoading;

  // -- Stress track ---------------------------------------------------------

  const stressTrackEl = stressTrack({
    value: c.monitor.stress.current,
    max: c.monitor.stress.max,
    onChange: handlers.onStressTrack,
  });

  const stressMinusBtn = el("button", {
    type: "button",
    disabled: anyLoading || c.monitor.stress.current <= 0,
    title: "Remove 1 stress",
  }, "−");
  stressMinusBtn.addEventListener("click", () => handlers.onStressDelta(-1));

  const stressPlusBtn = el("button", {
    type: "button",
    disabled: anyLoading,
    title: "Add 1 stress",
  }, state.isStressLoading ? "…" : "+1");
  stressPlusBtn.addEventListener("click", () => handlers.onStressDelta(1));

  // -- Trauma list ----------------------------------------------------------

  const traumaEntries = c.monitor.trauma.traumas.map((t) =>
    el("div", { className: "trauma-entry", style: "display: flex; align-items: center; gap: 0.5em;" },
      el("span", { className: "trauma-stamp", "data-stamped": "1" }, t),
      el("button", {
        type: "button",
        disabled: anyLoading,
        title: `Remove trauma: ${t}`,
      }, "✕"),
    ),
  );
  // Wire up remove handlers after creating elements
  traumaEntries.forEach((entry, idx) => {
    const btn = entry.querySelector("button");
    if (btn) {
      btn.addEventListener("click", () => handlers.onTraumaRemove(c.monitor.trauma.traumas[idx]!));
    }
  });

  const traumaSelect = el("select", { "aria-label": "Add trauma", disabled: anyLoading || availableTraumas.length === 0 },
    el("option", { value: "" }, "--"),
    ...availableTraumas.map((t) => el("option", { value: t }, t)),
  );

  const traumaAddBtn = el("button", {
    type: "button",
    disabled: anyLoading || availableTraumas.length === 0,
    title: "Add trauma",
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
    disabled: anyLoading || c.monitor.stress.current === 0,
    title: "Clear all stress (Indulge Vice)",
  }, state.isStressClearLoading ? "…" : "Indulge Vice");
  indulgeBtn.addEventListener("click", handlers.onStressClear);

  // -- Undo button ----------------------------------------------------------

  const undoBtn = el("button", {
    type: "button",
    disabled: anyLoading,
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
      input.addEventListener("input", () => {
        // Update the editing state inline
        (input as HTMLElement & { _field?: DossierField })._field = field;
      });

      const saveBtn = el("button", { type: "button", title: "Save" }, "✓");
      saveBtn.addEventListener("click", handlers.onDossierSave);
      const cancelBtn = el("button", { type: "button", title: "Cancel" }, "✕");
      cancelBtn.addEventListener("click", handlers.onDossierCancel);

      return el("div", { className: "field-editing", style: "display: flex; gap: 0.5em; align-items: center;" },
        el("span", { className: "lbl" }, `${label}: `),
        input,
        saveBtn,
        cancelBtn,
      );
    }

    editBtn.addEventListener("click", () => handlers.onDossierEdit(field));

    return el("div", { className: "field-read", style: "display: flex; gap: 0.5em; align-items: center;" },
      el("span", { className: "lbl" }, `${label}: `),
      el("span", {}, displayValue || "(not set)"),
      editBtn,
    );
  }

  // -- Assemble -------------------------------------------------------------

  return el(
    "section",
    { className: "character-detail" },

    // Header
    el(
      "div",
      { className: "character-header" },
      el("h1", {}, `${c.dossier.name}${status}`),
      el("p", { className: "alias" }, c.dossier.alias),
      el(
        "nav",
        { className: "character-nav" },
        el("a", { href: `/character/${c.id}/history` }, "History"),
      ),
    ),

    // Personal (Dossier) — inline editable
    el(
      "div",
      { className: "character-personal" },
      el("h2", {}, "Personal"),
      renderField("Name", "name", c.dossier.name),
      renderField("Alias", "alias", c.dossier.alias),
      renderField("Background", { kind: "named", key: "background", field: "name" }, c.dossier.background.name),
      renderField("Heritage", { kind: "named", key: "heritage", field: "name" }, c.dossier.heritage.name),
      renderField("Look", "look", c.dossier.look),
    ),

    // Vice
    el(
      "div",
      { className: "character-vice" },
      el("h2", {}, "Vice"),
      el("p", {}, el("strong", {}, c.dossier.vice.name)),
      c.dossier.vice.description
        ? el("p", { className: "serif" }, c.dossier.vice.description)
        : null,
      indulgeBtn,
    ),

    // Stress
    el(
      "div",
      { className: "character-stress" },
      el("h2", {}, "Stress"),
      el("div", { style: "display: flex; gap: 1em; align-items: center; flex-wrap: wrap;" },
        stressTrackEl,
        el("span", {}, `${c.monitor.stress.current} / ${c.monitor.stress.max}`),
        stressMinusBtn,
        stressPlusBtn,
      ),
    ),

    // Traumas
    el(
      "div",
      { className: "character-traumas" },
      el("h2", {}, "Traumas"),
      c.monitor.trauma.traumas.length === 0
        ? el("p", {}, "(none)")
        : el("div", { style: "display: flex; flex-wrap: wrap; gap: 0.5em;" }, ...traumaEntries),
      el("div", { style: "display: flex; gap: 0.5em; margin-top: 0.5em;" },
        traumaSelect,
        traumaAddBtn,
      ),
    ),

    // -- Health (F2n) -------------------------------------------------------

    el(
      "div",
      { className: "character-health" },
      el("h2", {}, "Health"),

      // Harm table
      (() => {
        const h = c.monitor.harm;
        const harmLevels = [
          { key: "lesser" as const, label: "Lesser", capacity: 2 },
          { key: "moderate" as const, label: "Moderate", capacity: 2 },
          { key: "severe" as const, label: "Severe", capacity: 1 },
          { key: "fatal" as const, label: "Fatal", capacity: 1 },
        ];

        const rows = harmLevels.map((level) => {
          const entries = h[level.key] as readonly string[];
          const cells: HTMLElement[] = [];
          for (let i = 0; i < level.capacity; i++) {
            const text = entries[i] || "";
            cells.push(
              el("td", { className: "harm-cell" },
                el("span", {}, text),
                text
                  ? el("button", {
                    type: "button",
                    disabled: anyLoading,
                    title: `Remove harm: ${text}`,
                    className: "harm-remove-btn",
                  }, "✕")
                  : null,
              ),
            );
          }
          return el("tr", { "data-level": level.key },
            el("th", { scope: "row", className: "harm-level" }, level.label),
            ...cells,
          );
        });

        // Wire up remove handlers
        rows.forEach((row, idx) => {
          const level = harmLevels[idx]!;
          const entries = h[level.key] as readonly string[];
          const btns = row.querySelectorAll("button");
          btns.forEach((btn, entryIdx) => {
            const desc = entries[entryIdx];
            if (desc) {
              btn.addEventListener("click", () => handlers.onHarmRemove(desc, level.key));
            }
          });
        });

        return el("table", { className: "harm-table" },
          el("caption", { className: "lbl" }, "Harm"),
          el("thead", {},
            el("tr", {},
              el("th", { scope: "col" }, "Level"),
              el("th", { scope: "col" }, "Injury"),
              el("th", { scope: "col" }, "Injury"),
            ),
          ),
          el("tbody", {}, ...rows),
        );
      })(),

      // Harm spillover notice
      state.harmSpillNotice
        ? el("p", { className: "notice", style: "margin-top: 0.5em;" }, state.harmSpillNotice)
        : null,

      // Add harm controls
      el("div", { style: "display: flex; gap: 0.5em; margin-top: 0.5em; align-items: center;" },
        el("select", { "aria-label": "Harm intensity", disabled: anyLoading },
          el("option", { value: "" }, "--"),
          el("option", { value: "lesser" }, "Lesser"),
          el("option", { value: "moderate" }, "Moderate"),
          el("option", { value: "severe" }, "Severe"),
          el("option", { value: "fatal" }, "Fatal"),
        ),
        el("input", {
          type: "text",
          "aria-label": "Harm description",
          disabled: anyLoading,
          placeholder: "injury description",
        }),
        (() => {
          const addBtn = el("button", {
            type: "button",
            disabled: anyLoading,
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
          cb.disabled = anyLoading || !a.has;
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

      // Healing clock
      (() => {
        const hc = c.monitor.harm.healingClock;
        const clockFull = hc.segments >= hc.size;

        const clockEl = clock({
          segments: hc.size,
          value: hc.segments,
          label: "Healing",
          size: 100,
        });

        const addSegmentBtn = el("button", {
          type: "button",
          disabled: anyLoading || state.isClockLoading,
          title: "Add healing segment",
        }, state.isClockLoading ? "…" : "+1 segment");
        addSegmentBtn.addEventListener("click", handlers.onHarmHealingClock);

        const healBtn = el("button", {
          type: "button",
          disabled: anyLoading || state.isHealLoading || !clockFull,
          title: "Heal harm (requires full clock)",
        }, state.isHealLoading ? "…" : "Heal");
        healBtn.addEventListener("click", handlers.onHarmHeal);

        return el("div", { style: "margin-top: 1em;" },
          el("h3", { className: "lbl" }, "Healing Clock"),
          clockEl,
          el("div", { style: "display: flex; gap: 0.5em; margin-top: 0.5em;" },
            addSegmentBtn,
            healBtn,
          ),
        );
      })(),
    ),

    // Info
    el(
      "div",
      { className: "character-info" },
      el("p", {}, `Playbook: ${c.playbook.name}`),
      el("p", {}, `Game: ${c.gameName}`),
    ),

    // Messages
    state.errorMsg
      ? el("p", { className: "error", style: "margin-top: 1em;" }, state.errorMsg)
      : null,
    state.noticeMsg
      ? el("p", { className: "notice", style: "margin-top: 1em;" }, state.noticeMsg)
      : null,
    state.undoNotice
      ? el("p", { className: "notice", style: "margin-top: 1em;" }, state.undoNotice)
      : null,

    // Undo
    el(
      "div",
      { className: "character-actions" },
      el("h2", {}, "Actions"),
      undoBtn,
    ),

    // Notes
    el(
      "div",
      { className: "character-notes" },
      el("h2", {}, "Notes"),
      el("p", {}, c.dossier.notes || "(no notes)"),
    ),
  );
}

function renderError(message: string): HTMLElement {
  return el(
    "section",
    { className: "character-detail-error" },
    el("h1", {}, "Character"),
    el("p", { className: "error", role: "alert" }, message),
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

  // F2n Health state
  let isHarmLoading = false;
  let isArmorLoading = false;
  let isHealLoading = false;
  let isClockLoading = false;

  const clearNotices = () => {
    errorMsg = null;
    noticeMsg = null;
    undoNotice = null;
    harmSpillNotice = null;
  };

  const refreshAndShowNotice = () => {
    if (!currentCharacter) return;
    const recoverProgram = getCharacter(characterId);
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
          renderDetailWrapper();
        },
        onSuccess: (character) => {
          if (cancelled) return;
          currentCharacter = character;
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
            } else if (err instanceof ApiError) {
              errorMsg = `API error (${err.status}): ${err.body}`;
              renderDetailWrapper();
            } else if (err instanceof DecodeError) {
              errorMsg = `Invalid response: ${err.message}`;
              renderDetailWrapper();
            } else {
              errorMsg = String(err);
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
            } else if (err instanceof ApiError) {
              errorMsg = `API error (${err.status}): ${err.body}`;
              renderDetailWrapper();
            } else if (err instanceof DecodeError) {
              errorMsg = `Invalid response: ${err.message}`;
              renderDetailWrapper();
            } else {
              errorMsg = String(err);
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
            } else if (err instanceof ApiError) {
              errorMsg = `API error (${err.status}): ${err.body}`;
              renderDetailWrapper();
            } else if (err instanceof DecodeError) {
              errorMsg = `Invalid response: ${err.message}`;
              renderDetailWrapper();
            } else {
              errorMsg = String(err);
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
            } else if (err instanceof ApiError) {
              errorMsg = `API error (${err.status}): ${err.body}`;
              renderDetailWrapper();
            } else if (err instanceof DecodeError) {
              errorMsg = `Invalid response: ${err.message}`;
              renderDetailWrapper();
            } else {
              errorMsg = String(err);
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
            } else if (err instanceof ApiError) {
              errorMsg = `API error (${err.status}): ${err.body}`;
              renderDetailWrapper();
            } else if (err instanceof DecodeError) {
              errorMsg = `Invalid response: ${err.message}`;
              renderDetailWrapper();
            } else {
              errorMsg = String(err);
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
      const value = getDossierValue(currentCharacter, field);
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
            } else if (err instanceof ApiError) {
              errorMsg = `API error (${err.status}): ${err.body}`;
              renderDetailWrapper();
            } else if (err instanceof DecodeError) {
              errorMsg = `Invalid response: ${err.message}`;
              renderDetailWrapper();
            } else {
              errorMsg = String(err);
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

    onUndo: () => {
      if (!currentCharacter || isUndoLoading) return;
      isUndoLoading = true;
      undoNotice = null;
      renderDetailWrapper();

      const program = undoCharacter(characterId);

      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => {
            if (cancelled) return;
            isUndoLoading = false;
            if (err instanceof StaleRevisionError) {
              renderDetailWrapper();
              refreshAndShowNotice();
            } else if (err instanceof ApiError) {
              if (err.body.startsWith("NO_HISTORY")) {
                undoNotice = "Nothing to undo — no history available";
              } else {
                errorMsg = `API error (${err.status}): ${err.body}`;
              }
              renderDetailWrapper();
            } else if (err instanceof DecodeError) {
              errorMsg = `Invalid response: ${err.message}`;
              renderDetailWrapper();
            } else {
              errorMsg = String(err);
              renderDetailWrapper();
            }
          },
          onSuccess: (character) => {
            if (cancelled) return;
            isUndoLoading = false;
            errorMsg = null;
            noticeMsg = null;
            undoNotice = null;
            currentCharacter = character;
            renderDetailWrapper();
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
            } else if (err instanceof ApiError) {
              errorMsg = `API error (${err.status}): ${err.body}`;
              renderDetailWrapper();
            } else if (err instanceof DecodeError) {
              errorMsg = `Invalid response: ${err.message}`;
              renderDetailWrapper();
            } else {
              errorMsg = String(err);
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
            } else if (err instanceof ApiError) {
              errorMsg = `API error (${err.status}): ${err.body}`;
              renderDetailWrapper();
            } else if (err instanceof DecodeError) {
              errorMsg = `Invalid response: ${err.message}`;
              renderDetailWrapper();
            } else {
              errorMsg = String(err);
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
      isHealLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = harmHeal(characterId, currentCharacter.revision);
      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => {
            if (cancelled) return;
            isHealLoading = false;
            if (err instanceof StaleRevisionError) {
              renderDetailWrapper();
              refreshAndShowNotice();
            } else if (err instanceof ApiError) {
              errorMsg = `API error (${err.status}): ${err.body}`;
              renderDetailWrapper();
            } else if (err instanceof DecodeError) {
              errorMsg = `Invalid response: ${err.message}`;
              renderDetailWrapper();
            } else {
              errorMsg = String(err);
              renderDetailWrapper();
            }
          },
          onSuccess: (character) => {
            if (cancelled) return;
            isHealLoading = false;
            currentCharacter = character;
            noticeMsg = "Harm healed — clock reset";
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

    onHarmHealingClock: () => {
      if (!currentCharacter || isClockLoading) return;
      const hc = currentCharacter.monitor.harm.healingClock;
      const nextSegments = hc.segments + 1;
      isClockLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = harmHealingClock(characterId, nextSegments, currentCharacter.revision);
      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => {
            if (cancelled) return;
            isClockLoading = false;
            if (err instanceof StaleRevisionError) {
              renderDetailWrapper();
              refreshAndShowNotice();
            } else if (err instanceof ApiError) {
              errorMsg = `API error (${err.status}): ${err.body}`;
              renderDetailWrapper();
            } else if (err instanceof DecodeError) {
              errorMsg = `Invalid response: ${err.message}`;
              renderDetailWrapper();
            } else {
              errorMsg = String(err);
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
            } else if (err instanceof ApiError) {
              errorMsg = `API error (${err.status}): ${err.body}`;
              renderDetailWrapper();
            } else if (err instanceof DecodeError) {
              errorMsg = `Invalid response: ${err.message}`;
              renderDetailWrapper();
            } else {
              errorMsg = String(err);
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
  };

  const renderDetailWrapper = () => {
    if (!currentCharacter) return;
    setChildren(root, renderDetail({
      c: currentCharacter,
      gameData,
      isStressLoading,
      isStressClearLoading,
      isTraumaLoading,
      isDossierLoading,
      isUndoLoading,
      isHarmLoading,
      isArmorLoading,
      isHealLoading,
      isClockLoading,
      errorMsg,
      noticeMsg,
      undoNotice,
      harmSpillNotice,
      editing,
      handlers,
    }));
  };

  root.setAttribute("aria-live", "polite");
  root.setAttribute("aria-busy", "true");
  setChildren(root, renderLoading());

  // Fetch character + game data in parallel
  const loadProgram = Effect.gen(function* () {
    const character = yield* getCharacter(characterId);
    const game = yield* Effect.either(getGame(character.gameStem));
    return { character, game };
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
        setChildren(root, renderError(msg));
      },
      onSuccess: ({ character, game }) => {
        if (cancelled) return;
        root.setAttribute("aria-busy", "false");
        currentCharacter = character;
        if (game._tag === "Right") {
          gameData = game.right;
        }
        renderDetailWrapper();
      },
    }),
  );

  return () => {
    cancelled = true;
  };
}
