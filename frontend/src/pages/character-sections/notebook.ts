/**
 * renderNotebookSection (ARCH-02): notebook section controller, extracted verbatim from the
 * character-detail page's render pass. DOM output is unchanged.
 */
import { el } from "../../lib/dom.js";
import type { SectionCtx } from "./context.js";

export function renderNotebookSection(ctx: SectionCtx): HTMLElement {
  const { state, c, handlers, anyLoading } = ctx;
  // Notebook (contract /ops/notebook.set): free-text sheet notes, saved on
  // demand. Stays on the retired allow-list (dossier/notes/notebook).
return   (() => {
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
  })();
}
