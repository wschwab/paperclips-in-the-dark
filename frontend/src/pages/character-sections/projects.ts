/**
 * renderProjectsSection (ARCH-02): projects section controller, extracted verbatim from the
 * character-detail page's render pass. DOM output is unchanged.
 */
import { el } from "../../lib/dom.js";
import { clock } from "../../components/clock.js";
import type { SectionCtx } from "./context.js";

export function renderProjectsSection(ctx: SectionCtx): HTMLElement {
  const { state, handlers, gameplayDisabled } = ctx;
  // -- Projects (F2s) ----------------------------------------------------

return   (() => {
    const clocks = state.clocks ?? [];
    // The create form exposes the current bounded/rollover contract behavior.
    const kindOptions: Array<{ value: "bounded" | "rollover"; label: string }> = [
      { value: "bounded", label: "project" },
      { value: "rollover", label: "rollover" },
    ];

    const clockEntries = clocks.map((clk) => {
      // Rendering size derived from the clock's own DTO size — the SVG clock
      // supports any segment count; no game maximum is hardcoded.
      const dialSize = Math.min(140, 60 + clk.size * 8);
      const behaviorLabel = clk.behavior === "bounded" ? "project" : "rollover";
      const dial = clock({
        segments: clk.size,
        value: clk.segments,
        label: clk.name,
        size: dialSize,
        // Clicking segment N sets progress to N (delta vs. current); the
        // server clamps progress at full / ignores negative deltas.
        onChange: (next) => handlers.onClockProgress(clk.id, next - clk.segments),
      });

      const minusBtn = el("button", {
        type: "button",
        disabled: gameplayDisabled || state.isClocksLoading || clk.segments <= 0,
        title: `Remove 1 segment: ${clk.name}`,
      }, "−1");
      minusBtn.addEventListener("click", () => handlers.onClockProgress(clk.id, -1));

      const plusBtn = el("button", {
        type: "button",
        disabled: gameplayDisabled || state.isClocksLoading,
        title: `Add 1 segment: ${clk.name}`,
      }, state.isClocksLoading ? "…" : "+1");
      plusBtn.addEventListener("click", () => handlers.onClockProgress(clk.id, 1));

      const resetBtn = el("button", {
        type: "button",
        // enabled for rollover clocks carrying overflow even at 0 segments
        disabled: gameplayDisabled || state.isClocksLoading || (clk.segments === 0 && clk.rollover === 0),
        title: `Reset clock: ${clk.name}`,
      }, state.isClocksLoading ? "…" : "reset");
      resetBtn.addEventListener("click", () => handlers.onClockReset(clk.id));

      const deleteBtn = el("button", {
        type: "button",
        disabled: gameplayDisabled || state.isClocksLoading,
        title: `Delete clock: ${clk.name}`,
      }, "✕");
      deleteBtn.addEventListener("click", () => handlers.onClockDelete(clk.id));

      return el("div", {
        className: "project-clock",
        "data-clock-id": clk.id,
        "data-clock-kind": behaviorLabel,
        style: "display: flex; align-items: center; gap: 0.75em; flex-wrap: wrap; margin: 0.5em 0;",
      },
        dial,
        el("div", { style: "display: flex; flex-direction: column; gap: 0.25em;" },
          el("span", { className: "project-clock-name" }, clk.name),
          el("span", { className: "project-clock-kind lbl" }, behaviorLabel),
          el("span", { className: "project-clock-progress" },
            `${clk.segments} / ${clk.size}${clk.rollover > 0 ? ` (rollover ${clk.rollover})` : ""}`),
          el("div", { style: "display: flex; gap: 0.5em;" },
            minusBtn,
            plusBtn,
            resetBtn,
            deleteBtn,
          ),
        ),
      );
    });

    const nameInput = el("input", {
      type: "text",
      "aria-label": "Clock name",
      disabled: gameplayDisabled || state.isClocksLoading,
      placeholder: "project name",
    }) as HTMLInputElement;
    const kindSelect = el("select", {
      "aria-label": "Clock kind",
      disabled: gameplayDisabled || state.isClocksLoading,
    },
      ...kindOptions.map((k) => el("option", { value: k.value }, k.label)),
    ) as HTMLSelectElement;
    const sizeInput = el("input", {
      type: "number",
      "aria-label": "Clock size",
      disabled: gameplayDisabled || state.isClocksLoading,
      min: "1",
      placeholder: "4",
    }) as HTMLInputElement;
    const createBtn = el("button", {
      type: "button",
      disabled: gameplayDisabled || state.isClocksLoading,
      title: "Create clock",
    }, state.isClocksLoading ? "…" : "+");
    createBtn.addEventListener("click", handlers.onCreateClock);

    return el("div", { className: "character-projects", "data-section": "projects" },
      el("h2", {}, "Projects"),
      clocks.length === 0
        ? el("p", { className: "project-empty" }, "(no clocks)")
        : el("div", { style: "display: flex; flex-direction: column;" }, ...clockEntries),
      el("h3", { className: "lbl", style: "margin-top: 0.75em;" }, "New clock"),
      el("div", { className: "clock-create-form", style: "display: flex; gap: 0.5em; align-items: center; flex-wrap: wrap; margin-top: 0.35em;" },
        nameInput,
        kindSelect,
        el("span", { className: "lbl" }, "size"),
        sizeInput,
        createBtn,
      ),
      state.clocksNotice
        ? el("p", { className: "notice", style: "margin-top: 0.5em;" }, state.clocksNotice)
        : null,
    );
  })();

}
