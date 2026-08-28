/**
 * renderStressSection (ARCH-02): stress section controller, extracted verbatim from the
 * character-detail page's render pass. DOM output is unchanged.
 */
import { el } from "../../lib/dom.js";
import { stressTrack } from "../../components/stress-track.js";
import { gameDataOptions } from "../character-domain.js";
import { viceSources } from "../character-domain.js";
import type { SectionCtx } from "./context.js";

export function renderStressSection(ctx: SectionCtx): HTMLElement {
  const { state, c, handlers, gameData, editing, namedEditor, availableTraumas, pendingTrauma, outOfAction, anyLoading, stressDisabled } = ctx;
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
  }, "−1");
  stressMinusBtn.addEventListener("click", () => handlers.onStressDelta(-1));

  const stressPlusBtn = el("button", {
    type: "button",
    disabled: stressDisabled,
    title: "Add 1 stress",
  }, state.isStressLoading ? "…" : "+1");
  stressPlusBtn.addEventListener("click", () => handlers.onStressDelta(1));

  // CONTRACT-03 (DEC-03 ruling, 2026-08-24): gated clerical-error
  // corrections. The toggle is session-local component state — never
  // persisted server-side. Fix controls exist only while edit mode is on,
  // and disable under the same conditions the server would reject.
  const correctionsToggleBtn = el("button", {
    type: "button",
    className: "corrections-toggle",
    "aria-pressed": String(state.correctionsMode),
    title: state.correctionsMode
      ? "Disable corrections — hide clerical-error fixes"
      : "Enable corrections — reveal gated clerical-error fixes",
  }, state.correctionsMode ? "Disable corrections" : "Enable corrections");
  correctionsToggleBtn.addEventListener("click", () => handlers.onCorrectionsToggle());

  const stressFixInput = el("input", {
    type: "number",
    min: "0",
    step: "1",
    "aria-label": "Corrected stress value",
    value: String(c.monitor.stress.current),
    disabled: stressDisabled,
    style: "width: 4.5em;",
  }) as HTMLInputElement;

  const stressFixBtn = el("button", {
    type: "button",
    disabled: stressDisabled,
    title: "Apply correction — sets stress directly (clerical-error fix, not play)",
  }, state.isStressFixLoading ? "…" : "Apply correction");
  stressFixBtn.addEventListener("click", () => handlers.onStressFix(stressFixInput));

  const stressFixControls = state.correctionsMode
    ? el("div", {
        className: "stress-fix-controls",
        "data-corrections": "enabled",
        style: "display: flex; gap: 0.5em; align-items: center; margin-top: 0.25em;",
      },
        el("span", { className: "lbl" }, "Correct stress to:"),
        stressFixInput,
        stressFixBtn,
      )
    : null;


  // -- Vice section ---------------------------------------------------------

  // CONTRACT-02 (DEC-02 ruling, 2026-08-24): indulgence is amount-based.
  // The input defaults to the currently marked stress — one click clears
  // everything, and raising the amount above the marked stress is exactly
  // how a caller expresses overindulgence. DEC-02: this control must NOT be
  // labeled "Indulge Vice" — stress.clear records no contracted vice relief,
  // so the label states what the op actually does.
  const clearAmountInput = el("input", {
    type: "number",
    min: "0",
    step: "1",
    "aria-label": "Stress to clear",
    value: String(c.monitor.stress.current),
    disabled: stressDisabled,
    style: "width: 4.5em;",
  }) as HTMLInputElement;

  const clearStressBtn = el("button", {
    type: "button",
    disabled: stressDisabled || c.monitor.stress.current === 0,
    title: "Clear Stress — clears the chosen amount of marked stress",
  }, state.isStressClearLoading ? "…" : "Clear Stress");
  clearStressBtn.addEventListener("click", () => handlers.onStressClear(clearAmountInput));


  /**
   * F4: the pending-trauma prompt (Q42, lifecycle-matrix §8). Shown while
   * traumaPending is set — when stress reached maximum. Resolving records
   * the trauma, clears stress to 0 (CONTRACT-02, DEC-02 ruling 2026-08-24),
   * and marks the character out-of-action for the remainder of the score
   * (end-score is the only sanctioned release).
   */
  function renderTraumaPicker() {
    const pickerSelect = el("select", {
      "aria-label": "Trauma when stressed",
      disabled: anyLoading || availableTraumas.length === 0,
    },
      el("option", { value: "" }, "Trauma"),
      ...availableTraumas.map((t) => el("option", { value: t }, t)),
    ) as HTMLSelectElement;
    const takeBtn = el("button", {
      type: "button",
      disabled: anyLoading || availableTraumas.length === 0,
      title: "Take trauma to resolve pending stress (clears stress)",
    }, state.isTraumaPickerLoading ? "…" : "Take trauma");
    takeBtn.addEventListener("click", handlers.onTraumaFromStress);

    return el("div", {
      className: "stress-trauma-picker",
      style: "margin-top: 0.5em; display: flex; gap: 0.5em; align-items: center; flex-wrap: wrap;",
    },
      el("p", { className: "notice", style: "margin: 0; width: 100%;" },
        "Stress is at its maximum — resolve the pending trauma to continue. Taking a trauma clears stress to 0, and the character is out of action for the rest of the score (ending the score releases them)."),
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
      const overindulgedDismiss = el("button", {
        type: "button",
        title: "Dismiss the overindulged notice",
        style: "margin-left: 0.5em;",
      }, "✕");
      overindulgedDismiss.addEventListener("click", handlers.onOverindulgedDismiss);
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
        state.overindulgedNotice
          ? el("p", { className: "notice", role: "status", style: "margin: 0; width: 100%;" },
              "OVERINDULGED — you took more vice than your remaining stress could absorb. ",
              "Resolve it at the table per SRD §Overindulgence: Attract Trouble / Brag (+2 heat) / Lost / Tapped.",
              overindulgedDismiss,
            )
          : null,
        el("div", { style: "display: flex; gap: 0.5em; align-items: center;" },
          editBtn,
          clearAmountInput,
          clearStressBtn,
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
      el("option", { value: "" }, "Purveyor"),
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


  // Stress (F2ab: the vice block lives under the stress track, per
  // bladesintheday.com — stress track with vice below it)
return   el(
    "div",
    { className: "character-stress", "data-section": "stress" },
    el("h2", {}, "Stress"),
    el("div", { style: "display: flex; gap: 1em; align-items: center; flex-wrap: wrap;" },
      stressTrackEl,
      el("span", {}, `${c.monitor.stress.current} / ${c.monitor.stress.max}`),
      stressMinusBtn,
      stressPlusBtn,
    ),
    // CONTRACT-03: gated corrections edit mode (session-local). Locked by
    // default; the toggle reveals the fix control, toggling off hides it.
    el("div", { style: "margin-top: 0.5em;" }, correctionsToggleBtn),
    stressFixControls,
    // F4: pending-trauma prompt (CONTRACT-02: resolution clears stress to 0
    // and marks out-of-action).
    pendingTrauma ? renderTraumaPicker() : null,
    // F4: out-of-action explanation — the client obligation is to explain
    // the state (Q42; end-score remains the release).
    outOfAction
      ? el("p", { className: "notice", style: "margin-top: 0.5em;" },
          "This character is out of action for the remainder of the score — stress can't change until the score ends.")
      : null,
    renderViceBlock(),
  );

}
