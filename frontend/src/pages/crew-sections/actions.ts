/**
 * renderCrewActionsSection (ARCH-02): Actions (undo / delete crew) section controller, extracted verbatim from
 * the crew-detail page's render pass. DOM output is unchanged.
 */
import { el } from "../../lib/dom.js";
import type { RenderState } from "../crew-detail.js";

export function renderCrewActionsSection(state: RenderState): HTMLElement {
  const { handlers } = state;
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


return el(
      "div",
      { className: "crew-actions", "data-section": "actions" },
      el("h2", {}, "Actions"),
      undoButton,
      deleteCrewBtn,
      state.historyCount !== null
        ? el("p", { className: "lbl", style: "margin-top: 0.5em;" },
            `${state.historyCount} snapshotted change${state.historyCount === 1 ? "" : "s"} can be undone.`)
        : null,
    );
}
