/**
 * Talent ratings, durable starting allocation, and ordinary attribute XP.
 * Creation constraints apply only while the server marks allocation pending.
 */
import { actionDescription } from "../character-domain.js";
import { el } from "../../lib/dom.js";
import { actionDots } from "../../components/action-dots.js";
import { xpBoxes } from "./shared.js";
import type { SectionCtx } from "./context.js";
import { pcBudgetFromSettings, playbookDefaultsFromSettings, pcAllocationReady, unspentDots } from "../../lib/chargen.js";

export function renderTalentsSection(ctx: SectionCtx): HTMLElement {
  const { state, c, handlers, gameData, gameplayDisabled, effCapByName } = ctx;
  const pending = c.talent.allocationPending === true;
  const budget = pcBudgetFromSettings(gameData);
  const defaults = playbookDefaultsFromSettings(gameData, c.playbook.name);
  const ratings = Object.fromEntries(c.talent.attributes.flatMap((attr) => attr.actions.map((a) => [a.name, a.rating])));
  const unspent = budget ? unspentDots(budget, ratings) : 0;
  const allocationBanner = pending ? (() => {
    const finish = el("button", {
      type: "button", className: "btn-primary", "data-talent-allocation-complete": "",
      disabled: gameplayDisabled || !budget || !pcAllocationReady(budget, c.playbook.name, ratings),
    }, state.isTalentsLoading ? "Finishing…" : "Finish Talent allocation");
    finish.addEventListener("click", () => handlers.onTalentAllocationComplete());
    return el("div", { className: "talent-allocation", "data-talent-allocation": "", "aria-label": "Talent allocation pending" },
      el("h3", {}, "Finish your Talent allocation"),
      el("p", { className: "notice" }, "Your draft is saved. Allocate the remaining dots, then finish to unlock ordinary gameplay ratings."),
      budget ? el("p", { role: "status" }, "Unspent Talent dots: ",
        el("strong", { "data-talent-unspent": "" }, String(unspent)),
        ` of ${budget.startingActionDots} · per-action max ${budget.startingActionDotMax}`,
      ) : el("p", { className: "notice" }, "Game settings must load before you can finish allocation."),
      el("ul", {},
        el("li", {}, "Playbook default actions stay fixed."),
        el("li", {}, "Spend every remaining Talent dot on the other actions."),
        el("li", {}, "Finish allocation explicitly when no dots remain."),
      ),
      finish,
    );
  })() : null;
  // -- Talents + XP. Score XP (session tracks, End downtime) moved to the XP Tracker (XP-TRACKER-04). --

return   (() => {

    const attributeGroups = c.talent.attributes.map((attr) =>
      el("div", { className: "talent-attribute", "data-attribute": attr.name, style: "margin-bottom: 1em;" },
        el("h3", { className: "talent-attribute-heading" }, attr.name, " ",
          el("span", { "data-attribute-rating": attr.name, "aria-label": `${attr.name} rating` },
            String(attr.rating))),

        // Action rows: dot rows (click dot N → set rating N; click filled
        // terminal → clear). The −/+ pair was redundant (F-30) — the dots
        // already cover every value and clearing, and removing them cuts
        // tab stops from the densest card on the sheet.
        ...attr.actions.map((action) => {
          const desc = actionDescription(gameData, attr.name, action.name);
          // SC-F3/P21: the enforced cap is the server-computed effective cap
          // (min of the raw max and the crew-Mastery-derived cap); the UI
          // never offers a dot the server would reject with RATING_MAXED.
          const effectiveMax = pending && budget
            ? Math.min(budget.startingActionDotMax, action.rating + Math.max(0, unspent))
            : (effCapByName.get(action.name)?.effectiveMax ?? action.maxRating);
          const dots = actionDots({
            name: action.name,
            value: action.rating,
            max: effectiveMax,
            title: pending && action.name in defaults ? "Fixed by the playbook's DefaultActionPoints" : desc ?? undefined,
            locked: pending && action.name in defaults,
            // Pending controls are usable only with their settings-derived budget.
            onChange: gameplayDisabled || (pending && !budget)
              ? undefined
              : (next) => handlers.onActionSetRating(attr.name, action.name, next),
          });

          return el("div", {
            className: "talent-action-row",
            "data-attribute": attr.name,
            "data-action": action.name,
            style: "display: flex; align-items: center; gap: 0.5em; flex-wrap: wrap; margin: 0.25em 0;",
          },
            // Keep the dot tooltip and expose the same help without requiring hover.
            dots,
            pending && action.name in defaults ? el("span", { className: "lbl" }, "Playbook default · fixed") : null,
            el("span", {}, `${action.rating}/${effectiveMax}`),
            desc ? el("p", {
              className: "chargen-hint",
              "data-action-help": action.name,
              style: "flex-basis: 100%; margin: 0;",
            }, desc) : null,
          );
        }),

        // Attribute XP tracker: points/max with +/−, clear, and levelup
        (() => {
          if (pending) return null;
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
      allocationBanner,
      ...attributeGroups,
      state.clampNotice
        ? el("p", { className: "notice", style: "margin-top: 0.5em;" }, state.clampNotice)
        : null,
    );
  })();

}
