/**
 * renderActionsSection (ARCH-02): actions section controller, extracted verbatim from the
 * character-detail page's render pass. DOM output is unchanged.
 */
import { el } from "../../lib/dom.js";
import type { SectionCtx } from "./context.js";

export function renderActionsSection(ctx: SectionCtx): HTMLElement {
  const { state, handlers, anyLoading } = ctx;
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


  // Undo
return   el(
    "div",
    { className: "character-actions", "data-section": "actions" },
    el("h2", {}, "Actions"),
    undoBtn,
    state.historyCount !== null
      ? el("p", { className: "lbl", style: "margin-top: 0.5em;" },
          `${state.historyCount} snapshotted change${state.historyCount === 1 ? "" : "s"} can be undone.`)
      : null,
  );

}
