/**
 * renderCrewXpSection (ARCH-02): Crew XP section controller, extracted verbatim from
 * the crew-detail page's render pass. DOM output is unchanged.
 */
import { el } from "../../lib/dom.js";
import { boxTrack } from "./shared.js";
import { extractExperienceTrigger } from "../crew-domain.js";
import type { RenderState } from "../crew-detail.js";

export function renderCrewXpSection(state: RenderState): HTMLElement {
  const { c, handlers } = state;
  // -- Crew XP (F2x) ----------------------------------------------------------
  // Points/max come from the DTO (experience { points, max }) — the max is
  // never hardcoded. +/− go through crewXpAdd (server clamps to max); clear
  // through crewXpClear (no body). The criteria text is the crew type's
  // ExperienceTrigger from crew game data (find-by-name; omitted when the
  // crew-type lookup fails — graceful degradation).
  const xp = c.experience;
  const criteriaText = extractExperienceTrigger(
    state.crewTypeData,
    state.crewTypesData,
    c.crewTypeName,
  );
  const xpMinusBtn = el("button", {
    type: "button",
    disabled: state.anyLoading || xp.points <= 0,
    title: "Remove 1 crew XP",
  }, "−1");
  xpMinusBtn.addEventListener("click", () => handlers.onXpDelta(-1));
  const xpPlusBtn = el("button", {
    type: "button",
    disabled: state.anyLoading || xp.points >= xp.max,
    title: "Add 1 crew XP",
  }, state.isXpLoading ? "…" : "+1");
  xpPlusBtn.addEventListener("click", () => handlers.onXpDelta(1));
  const xpClearBtn = el("button", {
    type: "button",
    disabled: state.anyLoading || xp.points === 0,
    title: "Clear crew XP",
  }, "clear");
  xpClearBtn.addEventListener("click", handlers.onXpClear);

  const xpSection = el(
    "div",
    { className: "crew-xp", "data-section": "xp" },
    el("h2", {}, "Crew XP"),
    el("div", {
      className: "crew-xp-tracker",
      style: "display: flex; gap: 1em; align-items: center; flex-wrap: wrap; margin: 0.6em 0;",
    },
      boxTrack({
        value: xp.points,
        max: xp.max,
        label: "Crew XP",
        disabled: state.anyLoading,
        onChange: handlers.onXpTrack,
      }),
      el("span", { className: "crew-xp-count" }, `${xp.points} / ${xp.max}`),
      xpMinusBtn,
      xpPlusBtn,
      xpClearBtn,
    ),
    criteriaText
      ? el("p", { className: "serif", style: "font-size: 0.95em; margin: 0.25em 0;" },
          el("strong", {}, "Criteria: "),
          criteriaText,
        )
      : null,
  );


  return xpSection;
}
