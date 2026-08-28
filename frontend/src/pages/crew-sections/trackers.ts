/**
 * renderCrewTrackersSection (ARCH-02): Trackers (rep/turf, heat, wanted, tier, hold) section controller, extracted verbatim from
 * the crew-detail page's render pass. DOM output is unchanged.
 */
import { el } from "../../lib/dom.js";
import { renderTracker } from "./shared.js";
import { extractCrewClaims } from "../crew-domain.js";
import { claimsGraph } from "../crew-domain.js";
import { Hold } from "../../schema/common.js";
import { formatTier } from "../crew-domain.js";
import type { RenderState } from "../crew-detail.js";

export function renderCrewTrackersSection(state: RenderState): HTMLElement {
  const { c, handlers } = state;
  // -- Trackers (F2u / F2ac) -------------------------------------------------

  // Rep & Turf (F2ac): rep fills 12 boxes left→right; turf is measured on
  // the right of the same tracker (max 6 slots, grayed from the right) and
  // each turf lowers the develop threshold by one (threshold = rep.max −
  // turf, i.e. 12 − turf in the SRD). Turf slots are NOT clickable — turf
  // changes only through crewTurfAdd (+/−). Develop applies the SRD flow:
  // rep >= threshold → weak hold: hold.set strong + rep reset; strong hold:
  // pay (tier+1)×8 coin, tier.add +1, rep reset, hold.set weak.
  const repThreshold = state.crewCaps?.developThreshold ?? Math.max(0, c.rep.max - c.turf);
  const canDevelop = c.rep.current >= repThreshold;

  const repTracker = renderTracker(state, {
    className: "crew-rep",
    label: "Rep",
    current: c.rep.current,
    max: c.rep.max,
    isLoading: state.isRepLoading,
    onDelta: handlers.onRepDelta,
    onTrack: handlers.onRepTrack,
  });

  // Effective turf is a server-computed projection (SC-F3): base turf + the
  // claimed turf-delta effects from the claims map. The client never joins
  // claims/settings to derive it; the local claims derivation is a graceful
  // fallback only when the capability projection is unavailable.
  let effectiveTurf: number;
  if (state.crewCaps) {
    effectiveTurf = state.crewCaps.effectiveTurf;
  } else {
    const claimsForEffects = extractCrewClaims(state.crewTypeData, state.crewTypesData, c.crewTypeName);
    let delta = 0;
    if (claimsForEffects) {
      const g = claimsGraph(claimsForEffects);
      const ownedSet = new Set(c.claimedClaimIds);
      for (const n of g.nodes) {
        if (!ownedSet.has(n.id)) continue;
        // effects live on the PascalCase game data node
        const raw = Array.isArray((claimsForEffects as Record<string, unknown>).Nodes)
          ? ((claimsForEffects as Record<string, unknown>).Nodes as Array<Record<string, unknown>>).find((x) => x.Id === n.id)
          : undefined;
        const effects = raw && Array.isArray(raw.Effects) ? (raw.Effects as Array<Record<string, unknown>>) : [];
        for (const fx of effects) {
          if (fx.Kind === "derivedDelta" && fx.Target === "crew.turf" && typeof fx.Delta === "number") {
            delta += fx.Delta;
          }
        }
      }
    }
    effectiveTurf = c.turf + delta;
  }

  // Turf row: 6 slots, filled from the left per turf count, grayed from the
  // right — a rendering, not a button track.
  const turfRow = el(
    "div",
    {
      className: "turf-track",
      role: "group",
      "aria-label": `Turf: ${c.turf} of 6`,
      style: "display: inline-flex; gap: 6px; padding: 6px;",
    },
    ...Array.from({ length: 6 }, (_, i) => {
      const filled = i + 1 <= c.turf;
      return el("span", {
        className: "turf-slot",
        "data-stress": filled ? "1" : "0",
        "data-index": String(i + 1),
        "aria-label": `Turf slot ${i + 1}`,
        title: filled ? "Turf held" : "No turf",
      });
    }),
  );
  const turfMinusBtn = el("button", {
    type: "button",
    disabled: state.anyLoading || c.turf <= 0,
    title: "Remove 1 turf",
  }, "−1");
  turfMinusBtn.addEventListener("click", () => handlers.onTurfDelta(-1));
  const turfPlusBtn = el("button", {
    type: "button",
    disabled: state.anyLoading || c.turf >= 6,
    title: "Add 1 turf",
  }, state.isTurfLoading ? "…" : "+1");
  turfPlusBtn.addEventListener("click", () => handlers.onTurfDelta(1));

  const developBtn = el("button", {
    type: "button",
    disabled: state.anyLoading || !canDevelop,
    title: canDevelop
      ? `Develop (rep ${c.rep.current} >= threshold ${repThreshold})`
      : `Develop (needs ${repThreshold} rep)`,
  }, state.isDevelopLoading ? "…" : "Develop");
  developBtn.addEventListener("click", handlers.onDevelop);

  const heatTracker = renderTracker(state, {
    className: "crew-heat",
    label: "Heat",
    current: c.heat.current,
    max: c.heat.max,
    isLoading: state.isHeatLoading,
    onDelta: handlers.onHeatDelta,
    onTrack: handlers.onHeatTrack,
  });

  const wantedTracker = renderTracker(state, {
    className: "crew-wanted",
    label: "Wanted",
    current: c.wanted.current,
    max: c.wanted.max,
    isLoading: state.isWantedLoading,
    onDelta: handlers.onWantedDelta,
    onTrack: handlers.onWantedTrack,
  });

  // Tier: value + -/+ only. The server clamps at the settings-derived
  // CrewTierMax (CONTRACT-04) and reports the applied delta; display is
  // Roman via formatTier.
  const tierMinusBtn = el("button", {
    type: "button",
    disabled: state.anyLoading || c.tier <= 0,
    title: "Remove 1 tier",
  }, "−1");
  tierMinusBtn.addEventListener("click", () => handlers.onTierDelta(-1));
  const tierPlusBtn = el("button", {
    type: "button",
    disabled: state.anyLoading,
    title: "Add 1 tier",
  }, state.isTierLoading ? "…" : "+1");
  tierPlusBtn.addEventListener("click", () => handlers.onTierDelta(1));

  // Hold: two-state segmented control (WEAK / STRONG) committing on click
  // (Design Audit F-11) — replaces the lowercase native <select> + Set
  // button with the same one-click pattern every neighbouring tracker uses.
  // Presentation order is weak→strong (the sheet's progression); wire values
  // stay the lowercase contract enum.
  const holdOptions = [...Hold.literals].reverse().map((value) => {
    const label = value[0]!.toUpperCase() + value.slice(1);
    const btn = el("button", {
      type: "button",
      className: "hold-option",
      "data-hold": value,
      "aria-pressed": c.hold === value ? "true" : "false",
      disabled: state.anyLoading,
      title: `Set hold: ${label}`,
    }, label);
    btn.addEventListener("click", () => handlers.onHoldSet(value));
    return btn;
  });
  const holdControl = el(
    "div",
    { className: "hold-control", role: "group", "aria-label": "Hold" },
    ...holdOptions,
  );


return el(
      "div",
      { className: "crew-trackers", "data-section": "trackers" },
      el("h2", {}, "Trackers"),
      el("h3", { className: "lbl" }, "Rep & Turf"),
      repTracker,
      el("div", { className: "crew-turf", style: "margin: 0.6em 0;" },
        el("div", { style: "display: flex; gap: 1em; align-items: center; flex-wrap: wrap;" },
          turfRow,
          el("span", { className: "turf-count" }, `${c.turf} / 6`),
          effectiveTurf > c.turf
            ? el("span", { className: "lbl", style: "font-size: 0.85em;" },
                `effective ${effectiveTurf} / 6 (claims add ${effectiveTurf - c.turf})`,
              )
            : null,
          turfMinusBtn,
          turfPlusBtn,
        ),
        el("p", { className: "rules-note", style: "margin-top: 0.35em;" },
          "Turf is measured from the right: each turf lowers the rep develop threshold by one.",
        ),
      ),
      el("div", { className: "crew-develop", style: "display: flex; gap: 0.75em; align-items: center; margin: 0.6em 0;" },
        el("span", { className: "develop-threshold" }, `develop at ${repThreshold} rep (${c.rep.max} − ${c.turf} turf)`),
        developBtn,
      ),
      el("h3", { className: "lbl", style: "margin-top: 0.75em;" }, "Heat"),
      heatTracker,
      el("h3", { className: "lbl", style: "margin-top: 0.75em;" }, "Wanted"),
      wantedTracker,
      el("h3", { className: "lbl", style: "margin-top: 0.75em;" }, "Tier"),
      el("div", { className: "crew-tier", style: "display: flex; gap: 0.5em; align-items: center; margin: 0.6em 0;" },
        el("span", { className: "crew-tier-value" }, formatTier(c.tier, state.crewCaps?.tierMax)),
        tierMinusBtn,
        tierPlusBtn,
      ),
      el("h3", { className: "lbl", style: "margin-top: 0.75em;" }, "Hold"),
      el("div", { className: "crew-hold", style: "display: flex; gap: 0.5em; align-items: center; margin: 0.6em 0;" },
        holdControl,
      ),
    );
}
