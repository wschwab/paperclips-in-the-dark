/**
 * renderTraumasSection (ARCH-02): traumas section controller, extracted verbatim from the
 * character-detail page's render pass. DOM output is unchanged.
 */
import { el } from "../../lib/dom.js";
import { traumaStamps } from "../../components/trauma-stamps.js";
import type { SectionCtx } from "./context.js";

export function renderTraumasSection(ctx: SectionCtx): HTMLElement {
  const { state, c, handlers, availableTraumas, pendingTrauma, anyLoading, gameplayDisabled } = ctx;
  // -- Trauma list ----------------------------------------------------------
  // Routed through the shared component (Design Audit F-05) so the sheet and
  // styleguide render identically. Remove controls are clerical-error
  // corrections, not the healing path — CHAR-05 (DEC-03): they surface only
  // behind the approved corrections edit mode, like stress.fix; locked ⇒ no
  // control renders at all.
  const traumaListEl = traumaStamps({
    items: c.monitor.trauma.traumas,
    stamped: c.monitor.trauma.traumas,
    disabled: anyLoading,
    onRemove: state.correctionsMode ? (name) => handlers.onTraumaRemove(name) : undefined,
  });

  const traumaSelect = el("select", { "aria-label": "Add trauma", disabled: gameplayDisabled || !pendingTrauma || availableTraumas.length === 0 },
    el("option", { value: "" }, "Trauma"),
    ...availableTraumas.map((t) => el("option", { value: t }, t)),
  );

  const traumaAddBtn = el("button", {
    type: "button",
    disabled: gameplayDisabled || !pendingTrauma || availableTraumas.length === 0,
    title: "Resolve pending trauma",
  }, state.isTraumaLoading ? "…" : "+");
  traumaAddBtn.addEventListener("click", () => {
    const sel = traumaSelect as HTMLSelectElement;
    if (sel.value) {
      // Store the selected value; the handler will read it
      (traumaAddBtn as HTMLElement & { _selectedTrauma?: string })._selectedTrauma = sel.value;
      handlers.onTraumaAdd();
    }
  });


  // Traumas
return   el(
    "div",
    { className: "character-traumas", "data-section": "traumas" },
    el("h2", {}, "Traumas"),
    c.monitor.trauma.traumas.length === 0
      ? el("p", {}, "(none)")
      : traumaListEl,
    // CHAR-05: explain the lock instead of leaving a dead-end list.
    !state.correctionsMode && c.monitor.trauma.traumas.length > 0
      ? el("p", { className: "lbl", style: "margin: 0.25em 0 0;" },
          "Trauma removal is a clerical correction — enable corrections (Stress section) to unlock it.")
      : null,
    el("div", { style: "display: flex; gap: 0.5em; margin-top: 0.5em;" },
      traumaSelect,
      traumaAddBtn,
    ),
  );

}
