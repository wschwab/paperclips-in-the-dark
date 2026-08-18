// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mountCrewHistoryPage } from "./crew-history.js";
import { renderShell } from "./shell.js";
import { loadStylesheets, assertFirstH1ClearsSeam } from "./seam.js";

const CREW_ID = "8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2";

const crewDTO = {
  kind: "crew",
  id: CREW_ID,
  gameStem: "blades-in-the-dark",
  gameName: "Blades in the Dark",
  language: "en",
  revision: 5,
  formatVersion: 1,
  createdAt: "2026-07-22T00:00:00.000Z",
  updatedAt: "2026-07-22T00:00:00.000Z",
  crewTypeName: "Assassins",
  name: "The Red Sashes",
  lair: "Northside safehouse",
  reputation: "ruthless",
  huntingGrounds: "The Docks",
  tier: 1,
  hold: "strong",
  heat: { current: 4, max: 9 },
  wanted: { current: 1, max: 4 },
  rep: { current: 3, max: 12 },
  experience: { points: 2, max: 8 },
  specialAbilities: [],
  upgrades: [],
  cohorts: [],
  coin: 0,
  stash: 2,
  notes: [],
  turf: 0,
  claimedClaimIds: [],
  claimOverrides: [],
  contacts: [],
  factions: [],
};

const ok = (data: unknown) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify(data),
});

describe("crew-history page (F2aa)", () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement("div");
    vi.clearAllMocks();
  });

  it("renders history entries whose snapshotIds are Ada UUIDs", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).endsWith(`/crews/${CREW_ID}/history`)) {
        return Promise.resolve(
          ok([
            {
              snapshotId: "3f9e0c51-9a2b-4d7e-8c1f-6a5b4c3d2e1f",
              takenAt: "2026-08-09T13:00:00.000Z",
              op: "heat.add",
            },
          ]),
        );
      }
      return Promise.resolve(ok(crewDTO));
    });

    mountCrewHistoryPage(root, CREW_ID);

    await vi.waitFor(() => {
      const entry = root.querySelector(".history-entry");
      expect(entry).not.toBeNull();
      expect(entry?.querySelector(".history-op")?.textContent).toBe("heat.add");
      expect(entry?.querySelector(".history-snapshotid")?.textContent).toContain(
        "3f9e0c51-9a2b-4d7e-8c1f-6a5b4c3d2e1f",
      );
    });
  });

  it("places the first h1 below the app bar's torn seam (FV-031)", async () => {
    loadStylesheets();
    global.fetch = vi.fn().mockImplementation((url: unknown) => {
      if (String(url).endsWith(`/crews/${CREW_ID}/history`)) {
        return Promise.resolve(ok([]));
      }
      return Promise.resolve(ok(crewDTO));
    });
    const { shell, outlet } = renderShell({
      currentPath: `/crew/${CREW_ID}/history`,
    });
    document.body.appendChild(shell);
    mountCrewHistoryPage(outlet, CREW_ID);
    expect(shell.querySelector(".app-bar.torn-foot")).not.toBeNull();
    await vi.waitFor(() => {
      expect(outlet.querySelector(".crew-history")).not.toBeNull();
    });
    assertFirstH1ClearsSeam(outlet);
  });

  it("renders an empty state when there is no history", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).endsWith(`/crews/${CREW_ID}/history`)) {
        return Promise.resolve(ok([]));
      }
      return Promise.resolve(ok(crewDTO));
    });

    mountCrewHistoryPage(root, CREW_ID);

    await vi.waitFor(() => {
      expect(root.querySelector(".no-history")?.textContent).toContain(
        "no history snapshots",
      );
    });
  });

  it("renders a recoverable error card with retry, back link, and collapsed detail", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "raw schema boom",
    });

    mountCrewHistoryPage(root, CREW_ID);

    await vi.waitFor(() => {
      const alert = root.querySelector(".error-card-head");
      expect(alert?.textContent).toContain("This history could not be loaded.");
      expect(root.querySelector("button")?.textContent).toBe("Retry");
      expect(root.querySelector('a[href="/crew/8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2"]')).not.toBeNull();
      const details = root.querySelector("details");
      expect(details?.open).toBe(false);
      expect(details?.textContent).toContain("raw schema boom");
      expect(alert?.textContent).not.toContain("raw schema boom");
    });
  });
});
