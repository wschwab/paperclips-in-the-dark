import { describe, expect, it } from "vitest";
import type { CrewCapabilities } from "../../api/client.js";
import { projectionFor } from "./trackers.js";

const caps = { crewId: "crew-1", effectiveTurf: 2, developThreshold: 10 } as unknown as CrewCapabilities;

describe("projectionFor (CREW-REVIEW-01: no stale Develop guard)", () => {
  it("uses the projection only while it was fetched for the current crew revision", () => {
    expect(projectionFor(caps, 7, 7)).toBe(caps);
  });
  it("drops a projection fetched for an older revision so Develop cannot consume it", () => {
    expect(projectionFor(caps, 6, 7)).toBeNull();
  });
  it("returns null when no projection has been loaded", () => {
    expect(projectionFor(null, null, 7)).toBeNull();
  });
});
