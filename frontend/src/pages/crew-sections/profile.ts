/**
 * renderCrewProfileSection (ARCH-02): Profile (fields + reputation) section controller, extracted verbatim from
 * the crew-detail page's render pass. DOM output is unchanged.
 */
import { el } from "../../lib/dom.js";
import { crewTypeSetting, extractReputations } from "../crew-domain.js";
import { CREW_FIELD_LABELS } from "../crew-domain.js";
import type { RenderState } from "../crew-detail.js";

export function renderCrewProfileSection(state: RenderState): HTMLElement {
  const { c, handlers } = state;
  // -- Profile (F2u) --------------------------------------------------------

  const type = crewTypeSetting(state.crewTypeData, state.crewTypesData, c.crewTypeName);
  const favoredOptions = Array.isArray(type?.FavoredOperations)
    ? type.FavoredOperations.filter((value): value is string => typeof value === "string") : [];
  const favoredLabel = typeof type?.FavoredOperationLabel === "string" ? type.FavoredOperationLabel : CREW_FIELD_LABELS.favoredOperation;
  const favoredFreeText = type?.FavoredOperationFreeText === true;
  const profileFields = (["name", "lair", "huntingGrounds", "favoredOperation"] as const)
    .map((field) => {
      const label = field === "favoredOperation" ? favoredLabel : CREW_FIELD_LABELS[field];
      // Keep the operation/cargo choice separate from the hunting location.
      const displayValue = c[field] || "(not set)";
      const isEditing = state.editingProfile?.field === field;
      if (isEditing) {
        const value = state.editingProfile!.value;
        // A type with options uses a fixed menu; a free-text type keeps typed
        // input and offers the settings' options as suggestions only.
        const useOptions = field === "favoredOperation" && favoredOptions.length > 0 && !favoredFreeText;
        const input = useOptions
          ? el("select", { "aria-label": label, disabled: state.anyLoading },
              el("option", { value: "" }, "Not set"),
              ...favoredOptions.map((option) => el("option", { value: option }, option)),
              value && !favoredOptions.includes(value) ? el("option", { value }, value) : null,
            ) as HTMLSelectElement
          : el("input", {
              type: "text",
              "aria-label": label,
              disabled: state.anyLoading,
              ...(field === "favoredOperation" && favoredOptions.length > 0
                ? { list: "favored-operation-suggestions" }
                : {}),
            }) as HTMLInputElement;
        const suggestionList = !useOptions && field === "favoredOperation" && favoredOptions.length > 0
          ? el("datalist", { id: "favored-operation-suggestions" },
              ...favoredOptions.map((option) => el("option", { value: option })),
            )
          : null;
        input.value = value;
        input.addEventListener(useOptions ? "change" : "input", () => {
          if (state.editingProfile) state.editingProfile.value = input.value;
        });
        // F2aa: ENTER saves (same as the checkmark), ESC cancels, TAB moves
        // through input → ✓ → ✕ in natural document order.
        input.addEventListener("keydown", (ev) => {
          if (!(ev instanceof KeyboardEvent)) return;
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
          suggestionList,
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
  const shownReputation = state.reputationDraft.value ?? c.reputation;
  if (reputationOptions.includes(shownReputation)) {
    reputationSelect.value = shownReputation;
  }
  reputationSelect.addEventListener("change", () => { state.reputationDraft.value = reputationSelect.value; });
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
