// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { renderCrewTrackersSection } from "./crew-sections/trackers.js";
import type { RenderState } from "./crew-detail.js";

function trackerState(): RenderState {
  return {
    c: { rep: { current: 4, max: 12 }, turf: 1, heat: { current: 0, max: 9 }, wanted: { current: 0, max: 4 }, tier: 0, hold: "weak", crewTypeName: "Assassins", claimedClaimIds: [] },
    crewCaps: { effectiveTurf: 2, developThreshold: 10, tierMax: 4, abilities: [], upgrades: [] },
    crewGameData: {},
    manualTurfMax: 6,
    handlers: { onRepDelta: vi.fn(), onRepTrack: vi.fn(), onTurfDelta: vi.fn(), onDevelop: vi.fn(), onHeatDelta: vi.fn(), onHeatTrack: vi.fn(), onWantedDelta: vi.fn(), onWantedTrack: vi.fn(), onTierDelta: vi.fn(), onHoldSet: vi.fn() },
  } as unknown as RenderState;
}

describe("CREW-REP-TURF-01", () => {
  it("uses one tracker, reserving its rightmost boxes for total claimed plus manual turf", () => {
    const root = renderCrewTrackersSection(trackerState());
    expect(root.querySelector(".crew-rep")?.textContent).toContain("Rep 4/10");
    expect(root.textContent).toContain("Turf: 2");
    expect(root.querySelector(".turf-track")).toBeNull();
    const boxes = [...root.querySelectorAll(".crew-rep .stress-box")];
    expect(boxes).toHaveLength(12);
    expect(boxes.slice(-2).map(box => box.getAttribute("data-turf"))).toEqual(["1", "1"]);
    expect(root.querySelectorAll('.crew-rep [data-stress="1"]')).toHaveLength(4);
    expect(root.querySelectorAll(".crew-rep button.stress-box")).toHaveLength(12);
    expect(root.querySelectorAll('.crew-rep button[data-turf="1"]:disabled')).toHaveLength(2);
  });

  it("derives box counts and manual turf bounds from supplied settings rather than six or twelve", () => {
    const state = trackerState();
    state.c = { ...state.c, rep: { current: 2, max: 9 }, turf: 3 };
    state.crewCaps = { ...state.crewCaps!, effectiveTurf: 3, developThreshold: 6 };
    state.manualTurfMax = 3;
    const root = renderCrewTrackersSection(state);
    expect(root.querySelectorAll(".crew-rep .stress-box")).toHaveLength(9);
    expect(root.querySelectorAll('.crew-rep [data-turf="1"]')).toHaveLength(3);
    expect(root.querySelector(".crew-rep")?.textContent).toContain("Rep 2/6");
    expect(root.querySelector<HTMLButtonElement>('button[title="Add 1 turf"]')?.disabled).toBe(true);
  });

  it("does not invent a manual turf ceiling when game settings are unavailable", () => {
    const state = trackerState();
    state.manualTurfMax = null;
    const root = renderCrewTrackersSection(state);
    expect(root.querySelector<HTMLButtonElement>('button[title="Add 1 turf"]')?.disabled).toBe(true);
    expect(root.querySelector<HTMLButtonElement>('button[title="Remove 1 turf"]')?.disabled).toBe(false);
  });

  it("keeps rep destinations clickable and manual turf adjustments separate from claimed turf", () => {
    const state = trackerState();
    const root = renderCrewTrackersSection(state);
    root.querySelector<HTMLButtonElement>('.crew-rep button[aria-label="Rep 5"]')!.click();
    root.querySelector<HTMLButtonElement>('button[title="Add 1 turf"]')!.click();
    root.querySelector<HTMLButtonElement>('button[title="Remove 1 turf"]')!.click();
    expect(state.handlers.onRepTrack).toHaveBeenCalledWith(5);
    expect(vi.mocked(state.handlers.onTurfDelta).mock.calls).toEqual([[1], [-1]]);
    root.querySelector<HTMLButtonElement>('.crew-rep [data-turf="1"]')!.click();
    expect(state.handlers.onRepTrack).toHaveBeenCalledTimes(1);
  });
});
