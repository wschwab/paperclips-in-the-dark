/**
 * renderTalentsSection (ARCH-02): talents section controller, extracted verbatim from the
 * character-detail page's render pass. DOM output is unchanged.
 */
import { el } from "../../lib/dom.js";
import { actionDots } from "../../components/action-dots.js";
import { xpBoxes } from "./shared.js";
import type { SectionCtx } from "./context.js";

export function renderTalentsSection(ctx: SectionCtx): HTMLElement {
  const { state, c, handlers, gameData, gameplayDisabled, effCapByName } = ctx;
  // -- Talents + XP. Score XP (session tracks, End downtime) moved to the XP Tracker (XP-TRACKER-04). --

return   (() => {
    const actionDescription = (attribute: string, action: string): string | null => {
      const attrs = Array.isArray(gameData?.Attributes)
        ? (gameData!.Attributes as Array<Record<string, unknown>>)
        : [];
      const attr = attrs.find((a) => a.Name === attribute);
      const actions = attr && Array.isArray(attr.Actions)
        ? (attr.Actions as Array<Record<string, unknown>>)
        : [];
      const act = actions.find((x) => x.Name === action);
      return act && typeof act.ShortDescription === "string"
        ? act.ShortDescription
        : null;
    };

    const attributeGroups = c.talent.attributes.map((attr) =>
      el("div", { className: "talent-attribute", "data-attribute": attr.name, style: "margin-bottom: 1em;" },
        el("h3", { className: "lbl" }, attr.name),

        // Action rows: dot rows (click dot N → set rating N; click filled
        // terminal → clear). The −/+ pair was redundant (F-30) — the dots
        // already cover every value and clearing, and removing them cuts
        // tab stops from the densest card on the sheet.
        ...attr.actions.map((action) => {
          const desc = actionDescription(attr.name, action.name);
          // SC-F3/P21: the enforced cap is the server-computed effective cap
          // (min of the raw max and the crew-Mastery-derived cap); the UI
          // never offers a dot the server would reject with RATING_MAXED.
          const effectiveMax = effCapByName.get(action.name)?.effectiveMax ?? action.maxRating;
          const dots = actionDots({
            name: action.name,
            value: action.rating,
            max: effectiveMax,
            title: desc ?? undefined,
            // Retired → dots become display-only (no onChange ⇒ non-interactive).
            onChange: gameplayDisabled
              ? undefined
              : (next) => handlers.onActionSetRating(attr.name, action.name, next),
          });

          return el("div", {
            className: "talent-action-row",
            "data-attribute": attr.name,
            "data-action": action.name,
            style: "display: flex; align-items: center; gap: 0.5em; flex-wrap: wrap; margin: 0.25em 0;",
          },
            // F2aa: one clean name per action — the underlined .action-name
            // inside the dots component carries the tooltip now.
            dots,
            el("span", {}, `${action.rating}/${effectiveMax}`),
          );
        }),

        // Attribute XP tracker: points/max with +/−, clear, and levelup
        (() => {
          const xp = attr.experience;
          const minusBtn = el("button", {
            type: "button",
            disabled: gameplayDisabled || xp.points <= 0,
            title: `Remove 1 XP (${attr.name})`,
          }, "−1");
          minusBtn.addEventListener("click", () => handlers.onAttributeXpDelta(attr.name, -1));
          const plusBtn = el("button", {
            type: "button",
            disabled: gameplayDisabled || xp.points >= xp.max,
            title: `Add 1 XP (${attr.name})`,
          }, "+1");
          plusBtn.addEventListener("click", () => handlers.onAttributeXpDelta(attr.name, 1));
          const clearBtn = el("button", {
            type: "button",
            disabled: gameplayDisabled || xp.points === 0,
            title: `Clear XP (${attr.name})`,
          }, "clear");
          clearBtn.addEventListener("click", () => handlers.onAttributeXpClear(attr.name));
          // CHAR-06: heavy-box XP furniture in the stress-track idiom.
          // Clicking box N sends the computed delta over attribute-xp.add.
          const xpTrackEl = xpBoxes({
            value: xp.points,
            max: xp.max,
            label: `${attr.name} XP`,
            disabled: gameplayDisabled,
            onChange: (next) => {
              const delta = next - xp.points;
              if (delta !== 0) handlers.onAttributeXpDelta(attr.name, delta);
            },
          });

          // Level up: pick an action below its effective cap, spend the full XP track
          const levelable = attr.actions.filter((a) => a.rating < (effCapByName.get(a.name)?.effectiveMax ?? a.maxRating));
          const levelSelect = el("select", {
            "aria-label": `Level up action (${attr.name})`,
            disabled: gameplayDisabled || levelable.length === 0,
          }, ...levelable.map((a) => el("option", { value: a.name }, a.name)));
          const levelBtn = el("button", {
            type: "button",
            disabled: gameplayDisabled || xp.points < xp.max || levelable.length === 0,
            title: `Level up ${attr.name} (spends XP)`,
            "data-levelup-attribute": attr.name,
          }, state.isTalentsLoading ? "…" : "Level up");
          levelBtn.addEventListener("click", () => handlers.onAttributeLevelup(attr.name));

          return el("div", {
            className: "talent-xp",
            "data-attribute": attr.name,
            style: "display: flex; align-items: center; gap: 0.5em; flex-wrap: wrap; margin-top: 0.5em;",
          },
            el("span", { className: "lbl" }, "XP:"),
            el("span", {}, `${xp.points} / ${xp.max}`),
            xpTrackEl,
            minusBtn,
            plusBtn,
            clearBtn,
            el("span", { className: "lbl", style: "margin-left: 0.75em;" }, "Level up:"),
            levelSelect,
            levelBtn,
          );
        })(),
      ),
    );

    return el("div", { className: "character-talents", "data-section": "talents" },
      el("h2", {}, "Talents"),
      ...attributeGroups,
      state.clampNotice
        ? el("p", { className: "notice", style: "margin-top: 0.5em;" }, state.clampNotice)
        : null,
    );
  })();

}
