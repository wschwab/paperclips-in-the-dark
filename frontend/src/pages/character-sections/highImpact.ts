/**
 * renderHighImpactSection (ARCH-02): highImpact section controller, extracted verbatim from the
 * character-detail page's render pass. DOM output is unchanged.
 */
import { el } from "../../lib/dom.js";
import type { SectionCtx } from "./context.js";

export function renderHighImpactSection(ctx: SectionCtx): HTMLElement {
  const { state, handlers, retired, anyLoading } = ctx;
  // -- CHAR-05 (DEC-03): high-impact zone ---------------------------------
  // Retire/Delete carry permanent consequences: they live in their own
  // danger-styled zone with consequence copy, clearly separated from the
  // ordinary End-score release above. Both handlers remain confirmation-
  // guarded ({confirm: true} on the wire).
return   (() => {
    const retireBtn = el("button", {
      type: "button",
      className: "btn-danger",
      disabled: anyLoading || retired,
      title: "Retire this character (confirmation required)",
    }, state.isRetireLoading ? "…" : "Retire");
    retireBtn.addEventListener("click", handlers.onRetire);

    const deleteBtn = el("button", {
      type: "button",
      className: "btn-danger",
      disabled: anyLoading,
      title: "Delete this character (confirmation required, not undoable)",
    }, state.isDeleteLoading ? "…" : "Delete");
    deleteBtn.addEventListener("click", handlers.onDeleteCharacter);

    return el("div", {
      className: "character-high-impact",
      "data-section": "high-impact",
      role: "group",
      "aria-label": "Permanent actions",
      style: "grid-column: 1 / -1; border: var(--border-medium) solid var(--accent-strong); border-radius: var(--radius); padding: 0.6em 0.75em; display: flex; gap: 0.5em; align-items: center; flex-wrap: wrap;",
    },
      el("p", { className: "lbl", style: "margin: 0; width: 100%; text-transform: uppercase; letter-spacing: 0.08em;" }, "Permanent actions"),
      el("p", { className: "serif", style: "margin: 0; width: 100%;" },
        "Retire ends this character's career — gameplay closes, harm/stress/armor clear, dossier and notes stay, and Undo can restore it. Delete erases the character and their history permanently — deletion cannot be undone."),
      retireBtn,
      deleteBtn,
    );
  })();

}
