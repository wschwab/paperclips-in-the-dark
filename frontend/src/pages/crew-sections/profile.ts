/**
 * renderCrewProfileSection (ARCH-02): Profile (fields + reputation) section controller, extracted verbatim from
 * the crew-detail page's render pass. DOM output is unchanged.
 */
import { el } from "../../lib/dom.js";
import { extractReputations } from "../crew-domain.js";
import { CREW_FIELD_LABELS } from "../crew-domain.js";
import type { RenderState } from "../crew-detail.js";

export function renderCrewProfileSection(state: RenderState): HTMLElement {
  const { c, handlers } = state;
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


return el(
      "div",
      { className: "crew-profile", "data-section": "profile" },
      el("h2", {}, "Profile"),
      ...profileFields,
      reputationRow,
    );
}
