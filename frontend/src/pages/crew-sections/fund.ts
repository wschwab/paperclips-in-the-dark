/**
 * renderCrewFundSection (ARCH-02): Fund (coin + stash) section controller, extracted verbatim from
 * the crew-detail page's render pass. DOM output is unchanged.
 */
import { el } from "../../lib/dom.js";
import type { RenderState } from "../crew-detail.js";

export function renderCrewFundSection(state: RenderState): HTMLElement {
  const { c, handlers } = state;
  // -- Coin & Stash (F2u) ---------------------------------------------------

  const coinMinusBtn = el("button", {
    type: "button",
    disabled: state.anyLoading || c.coin <= 0,
    title: "Remove 1 coin",
  }, "−1");
  coinMinusBtn.addEventListener("click", () => handlers.onCoinDelta(-1));
  const coinPlusBtn = el("button", {
    type: "button",
    disabled: state.anyLoading,
    title: "Add 1 coin",
  }, state.isCoinLoading ? "…" : "+1");
  coinPlusBtn.addEventListener("click", () => handlers.onCoinDelta(1));

  const stashMinusBtn = el("button", {
    type: "button",
    disabled: state.anyLoading || c.stash <= 0,
    title: "Remove 1 stash",
  }, "−1");
  stashMinusBtn.addEventListener("click", () => handlers.onStashDelta(-1));
  const stashPlusBtn = el("button", {
    type: "button",
    // P29/FV-029: the bound control is disabled once the track is full — the
    // server would otherwise clamp the delta silently (CONTRACT-04 §3).
    disabled: state.anyLoading || c.stash >= c.stashCapacity,
    title: "Add 1 stash",
  }, state.isStashLoading ? "…" : "+1");
  stashPlusBtn.addEventListener("click", () => handlers.onStashDelta(1));


return el(
      "div",
      { className: "crew-fund", "data-section": "fund" },
      el("h2", {}, "Fund"),
      el("div", { className: "crew-coin", style: "display: flex; gap: 0.5em; align-items: center; margin: 0.35em 0;" },
        el("span", { className: "lbl" }, "Coin:"),
        el("span", {
          className: "crew-coin-count",
          title: "Coin beyond the lair's vault-derived capacity must be spent or distributed (SRD \u00a7Coin and Stash)",
        }, `${c.coin} / ${c.stashCapacity}`),
        coinMinusBtn,
        coinPlusBtn,
      ),
      el("div", { className: "crew-stash", style: "display: flex; gap: 0.5em; align-items: center; margin: 0.35em 0;" },
        el("span", { className: "lbl" }, "Stash:"),
        el("span", { className: "crew-stash-count" }, `${c.stash} / ${c.stashCapacity}`),
        stashMinusBtn,
        stashPlusBtn,
      ),
    );
}
