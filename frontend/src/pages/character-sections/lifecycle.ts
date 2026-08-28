/**
 * renderLifecycleSection (ARCH-02): lifecycle section controller, extracted verbatim from the
 * character-detail page's render pass. DOM output is unchanged.
 */
import { el } from "../../lib/dom.js";
import type { SectionCtx } from "./context.js";

export function renderLifecycleSection(ctx: SectionCtx): HTMLElement {
  const { state, handlers, retired, pendingTrauma, anyLoading, endScoreTitle } = ctx;
  // -- F4 lifecycle actions ---------------------------------------------
  // End-score always clears stress + out-of-action flags (the sanctioned
  // release); blocked by pending trauma (TRAUMA_REQUIRED) and retired.
  // CHAR-05 (DEC-03): it stays an ordinary control in its own row, visually
  // distinct from the permanent-consequence actions below.
return   (() => {
    const endScoreBtn = el("button", {
      type: "button",
      disabled: anyLoading || retired || pendingTrauma,
      title: endScoreTitle,
    }, state.isEndScoreLoading ? "…" : "End score");
    endScoreBtn.addEventListener("click", handlers.onEndScore);

    return el("div", { className: "character-lifecycle-actions", "data-section": "lifecycle", style: "grid-column: 1 / -1; display: flex; gap: 0.5em; align-items: center; flex-wrap: wrap; margin-top: 0.5em;" },
      endScoreBtn,
      // RETIRED copy for the gameplay gate (stress already disabled above).
      retired
        ? el("p", { className: "lbl", style: "margin: 0; width: 100%;" },
            "Retired — gameplay actions are disabled; Undo can restore the character.")
        : null,
      pendingTrauma && !retired
        ? el("p", { className: "lbl", style: "margin: 0; width: 100%;" },
            "A trauma is pending — resolve it before ending the score.")
        : null,
      state.canUndo === false && state.historyCount === 0
        ? el("p", { className: "lbl", style: "margin: 0; width: 100%;" },
            "No history is available to undo.")
        : null,
    );
  })();

}
