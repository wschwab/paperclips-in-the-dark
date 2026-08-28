/**
 * renderCoinSection (ARCH-02): coin section controller, extracted verbatim from the
 * character-detail page's render pass. DOM output is unchanged.
 */
import { el } from "../../lib/dom.js";
import { stressTrack } from "../../components/stress-track.js";
import type { SectionCtx } from "./context.js";

export function renderCoinSection(ctx: SectionCtx): HTMLElement {
  const { state, c, handlers, gameplayDisabled } = ctx;
  // -- Coin (F2s) --------------------------------------------------------

return   (() => {
    const satchel = c.fund.satchel;
    const stash = c.fund.stash;
    // Lifestyle is derived, display-only: stash ÷ 10 (sheet plan decision 4).
    const lifestyle = Math.floor(stash.coins / 10);
    // CHAR-06: display-only heavy-box track for the stash (no onChange ⇒
    // spans, not buttons). Bounds from the DTO max — never hardcoded.
    const stashTrackEl = stressTrack({ value: stash.coins, max: stash.max, label: "Stash" });

    const spendBtn = el("button", {
      type: "button",
      disabled: gameplayDisabled || state.isCoinLoading,
      title: "Spend 1 coin",
    }, state.isCoinLoading ? "…" : "−1");
    spendBtn.addEventListener("click", () => handlers.onFundDelta(-1));

    const gainBtn = el("button", {
      type: "button",
      disabled: gameplayDisabled || state.isCoinLoading,
      title: "Gain 1 coin",
    }, state.isCoinLoading ? "…" : "+1");
    gainBtn.addEventListener("click", () => handlers.onFundDelta(1));



    const liquidateInput = el("input", {
      type: "number",
      "aria-label": "Coins to liquidate",
      disabled: gameplayDisabled || state.isCoinLoading,
      value: "1",
      min: "1",
    }) as HTMLInputElement;
    const liquidateBtn = el("button", {
      type: "button",
      disabled: gameplayDisabled || state.isCoinLoading,
      title: "Liquidate stash to coins",
    }, state.isCoinLoading ? "…" : "liquidate");
    liquidateBtn.addEventListener("click", handlers.onFundLiquidate);

    return el("div", { className: "character-coin", "data-section": "coin" },
      el("h2", {}, "Coin"),
      el("div", { className: "coin-satchel", style: "display: flex; align-items: center; gap: 0.5em; flex-wrap: wrap; margin: 0.35em 0;" },
        el("span", { className: "lbl" }, "Satchel:"),
        el("span", { className: "coin-satchel-count" }, `${satchel.coins} / ${satchel.max}`),
        spendBtn,
        gainBtn,
      ),
      // CHAR-06: the stash is the long-term ledger — tangible heavy-box
      // furniture bounded by the DTO max, inset as its own sub-block with
      // the derived Lifestyle figure beneath it (display-only; there is no
      // writable Lifestyle stat).
      el("div", { className: "coin-stash", style: "border-left: var(--border-thick) solid var(--fill-border); padding-left: 0.75em; margin: 0.6em 0;" },
        el("div", { style: "display: flex; align-items: center; gap: 0.5em; flex-wrap: wrap;" },
          el("span", { className: "lbl" }, "Stash:"),
          el("span", { className: "coin-stash-count" }, `${stash.coins} / ${stash.max}`),
        ),
        stashTrackEl,
        el("div", { className: "coin-lifestyle", style: "display: flex; align-items: baseline; gap: 0.5em; flex-wrap: wrap; margin-top: 0.35em;" },
          el("span", { className: "lbl" }, `Lifestyle ${lifestyle}`),
          el("span", { className: "serif", style: "font-size: 0.9em;" }, "derived from stash ÷ 10 — never written directly"),
        ),
      ),
      el("div", { className: "coin-liquidate", style: "display: flex; align-items: center; gap: 0.5em; flex-wrap: wrap; margin: 0.35em 0;" },
        el("span", { className: "lbl" }, "Liquidate:"),
        liquidateInput,
        liquidateBtn,
      ),
      state.coinNotice
        ? el("p", { className: "notice", style: "margin-top: 0.5em;" }, state.coinNotice)
        : null,
    );
  })();

}
