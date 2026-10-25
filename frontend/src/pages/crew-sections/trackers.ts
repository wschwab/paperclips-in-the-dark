/** Crew trackers: Rep and Turf share one settings-sized track; other counters keep their standard controls. */
import { el } from "../../lib/dom.js";
import { renderTracker } from "./shared.js";
import { extractCrewClaims } from "../crew-domain.js";
import { Hold } from "../../schema/common.js";
import { formatTier } from "../crew-domain.js";
import type { RenderState } from "../crew-detail.js";
import type { CrewCapabilities } from "../../api/client.js";

/** A projection is only valid for the crew revision it was fetched for; a newer crew makes it stale (CREW-REVIEW-01). */
export function projectionFor(caps: CrewCapabilities | null, capsRevision: number | null, revision: number): CrewCapabilities | null {
  return caps && capsRevision === revision ? caps : null;
}

/** Prefer the server projection; the read-only fallback also honors sparse claim-effect overrides. */
export function crewRepTurf(state: Pick<RenderState, "c" | "crewCaps" | "crewTypeData" | "crewTypesData">): { effectiveTurf: number; repThreshold: number } {
  if (state.crewCaps) return { effectiveTurf: state.crewCaps.effectiveTurf, repThreshold: state.crewCaps.developThreshold };
  const { c } = state;
  const claims = extractCrewClaims(state.crewTypeData, state.crewTypesData, c.crewTypeName);
  const nodes = claims && Array.isArray(claims.Nodes) ? claims.Nodes as Array<Record<string, unknown>> : [];
  const owned = new Set(c.claimedClaimIds);
  let delta = 0;
  for (const node of nodes) {
    if (typeof node.Id !== "string" || !owned.has(node.Id)) continue;
    const override = c.claimOverrides.find((entry) => entry.claimId === node.Id);
    const effects = override?.effects ?? (Array.isArray(node.Effects) ? node.Effects as Array<Record<string, unknown>> : []);
    for (const effect of effects) {
      if (effect.Kind === "derivedDelta" && effect.Target === "crew.turf" && typeof effect.Delta === "number" && Number.isInteger(effect.Delta)) delta += effect.Delta;
    }
  }
  const effectiveTurf = c.turf + delta;
  return { effectiveTurf, repThreshold: Math.max(0, c.rep.max - effectiveTurf) };
}

export function renderCrewTrackersSection(state: RenderState): HTMLElement {
  const { c, handlers } = state;
  const { effectiveTurf, repThreshold } = crewRepTurf(state);
  const canDevelop = c.rep.current >= repThreshold;
  const repTracker = renderTracker(state, {
    className: "crew-rep",
    label: "Rep",
    current: c.rep.current,
    max: c.rep.max,
    turf: effectiveTurf,
    isLoading: state.isRepLoading,
    onDelta: handlers.onRepDelta,
    onTrack: handlers.onRepTrack,
  });
  const turfMax = state.manualTurfMax;
  const turfMinusBtn = el("button", {
    type: "button",
    disabled: state.anyLoading || c.turf <= 0,
    title: "Remove 1 turf",
  }, "−1");
  turfMinusBtn.addEventListener("click", () => handlers.onTurfDelta(-1));
  const turfPlusBtn = el("button", {
    type: "button",
    disabled: state.anyLoading || turfMax === null || c.turf >= turfMax,
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
        el("div", { style: "display: flex; gap: 0.75em; align-items: center; flex-wrap: wrap;" },
          el("span", { className: "turf-count" }, `Turf: ${effectiveTurf}`),
          el("span", { className: "manual-turf-count lbl" }, `Other turf: ${c.turf}`),
          turfMinusBtn,
          turfPlusBtn,
        ),
        el("p", { className: "rules-note", style: "margin-top: 0.35em;" },
          "Turf reserves Rep boxes from the right. Claim turf follows the map; use −/+ for turf gained elsewhere.",
        ),
      ),
      el("div", { className: "crew-develop", style: "display: flex; gap: 0.75em; align-items: center; margin: 0.6em 0;" },
        el("span", { className: "develop-threshold" }, `develop at ${repThreshold} rep (${c.rep.max} − ${effectiveTurf} turf)`),
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
