// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mountCharacterHistoryPage } from "./character-history.js";
import { renderShell } from "./shell.js";
import { loadStylesheets, assertFirstH1ClearsSeam } from "./seam.js";

const CHARACTER_ID = "c46ba7cb-993b-4fc7-974d-fb95eacd5446";

const characterDTO = {
  kind: "character",
  id: CHARACTER_ID,
  gameStem: "blades-in-the-dark",
  gameName: "Blades in the Dark",
  language: "en",
  revision: 12,
  formatVersion: 1,
  createdAt: "2026-07-22T00:00:00.000Z",
  updatedAt: "2026-07-22T00:00:00.000Z",
  isRetired: false,
  isDeadish: false,
  traumaPending: false,
  isOutOfAction: false,
  stressClearPending: false,
  dossier: {
    name: "Brenda Hilton",
    crewId: "8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2",
    alias: "Webweaver",
    look: "Keen and calculating",
    notes: [],
    background: { name: "Urchin", description: "" },
    heritage: { name: "Akorosi", description: "" },
    vice: { name: "Gambling", description: "", purveyor: { name: "Mother Narya", description: "House of the Weeping Lady, Six Towers" } },
  },
  monitor: {
    stress: { current: 3, max: 9 },
    trauma: { traumas: [], max: 4 },
    harm: {
      lesser: [],
      moderate: [],
      severe: [],
      fatal: [],
      healingClock: { segments: 0, size: 6, rollover: 0 },
    },
    armor: {
      standardUsed: false,
      heavyUsed: false,
      specialUsed: false,
      hasStandard: true,
      hasHeavy: false,
      hasSpecial: false,
    },
  },
  talent: { attributes: [] },
  playbook: { name: "Spider", experience: { points: 0, max: 8 }, abilities: [] },
  gear: {
    loadout: [],
    availableGear: [],
    commitment: "none",
    isCommitmentLocked: false,
    maxBulk: 8,
  },
  fund: { satchel: { coins: 0, max: 2 }, stash: { coins: 0, max: 8 } },
  rolodex: { friends: [] },
  session: {
    playbookExpressions: 0,
    characterExpressions: 0,
    struggleExpressions: 0,
    max: 3,
  },
  notebook: "",
};

const ok = (data: unknown) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify(data),
});

describe("character-history page (F2aa)", () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement("div");
    vi.clearAllMocks();
  });

  it("renders history entries whose snapshotIds are Ada 17-digit tick IDs", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).endsWith(`/characters/${CHARACTER_ID}/history`)) {
        return Promise.resolve(
          ok([
            {
              snapshotId: "63835568000000000-abc123def456",
              takenAt: "2026-08-09T12:00:00.000Z",
              op: "stress.add",
            },
          ]),
        );
      }
      return Promise.resolve(ok(characterDTO));
    });

    mountCharacterHistoryPage(root, CHARACTER_ID);

    await vi.waitFor(() => {
      const entry = root.querySelector(".history-entry");
      expect(entry).not.toBeNull();
      expect(entry?.querySelector(".history-op")?.textContent).toBe("stress.add");
      expect(entry?.querySelector(".history-snapshotid")?.textContent).toContain(
        "63835568000000000-abc123def456",
      );
    });
  });

  it("places the first h1 below the app bar's torn seam (FV-031)", async () => {
    loadStylesheets();
    global.fetch = vi.fn().mockImplementation((url: unknown) => {
      if (String(url).endsWith(`/characters/${CHARACTER_ID}/history`)) {
        return Promise.resolve(ok([]));
      }
      return Promise.resolve(ok(characterDTO));
    });
    const { shell, outlet } = renderShell({
      currentPath: `/character/${CHARACTER_ID}/history`,
    });
    document.body.appendChild(shell);
    mountCharacterHistoryPage(outlet, CHARACTER_ID);
    expect(shell.querySelector(".app-bar.torn-foot")).not.toBeNull();
    // Await the loaded (non-loading) section that owns the page h1.
    await vi.waitFor(() => {
      expect(outlet.querySelector(".character-history")).not.toBeNull();
    });
    assertFirstH1ClearsSeam(outlet);
  });

  it("renders an empty state with explanatory copy and a Back to sheet link (FV-032)", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).endsWith(`/characters/${CHARACTER_ID}/history`)) {
        return Promise.resolve(ok([]));
      }
      return Promise.resolve(ok(characterDTO));
    });

    mountCharacterHistoryPage(root, CHARACTER_ID);

    await vi.waitFor(() => {
      const empty = root.querySelector(".no-history");
      expect(empty?.textContent).toContain("No history snapshots yet");
      expect(empty?.textContent).not.toBe("(no history snapshots)");
      const back = root.querySelector('a[href="/character/c46ba7cb-993b-4fc7-974d-fb95eacd5446"]');
      expect(back).not.toBeNull();
      expect(back?.textContent).toBe("Back to sheet");
    });
  });

  it("offers a Back to sheet link in the normal (populated) state (FV-032)", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).endsWith(`/characters/${CHARACTER_ID}/history`)) {
        return Promise.resolve(
          ok([
            {
              snapshotId: "63835568000000000-abc123def456",
              takenAt: "2026-08-09T12:00:00.000Z",
              op: "stress.add",
            },
          ]),
        );
      }
      return Promise.resolve(ok(characterDTO));
    });

    mountCharacterHistoryPage(root, CHARACTER_ID);

    await vi.waitFor(() => {
      expect(root.querySelector(".history-entry")).not.toBeNull();
      const back = root.querySelector('a[href="/character/c46ba7cb-993b-4fc7-974d-fb95eacd5446"]');
      expect(back).not.toBeNull();
      expect(back?.textContent).toBe("Back to sheet");
    });
  });

  it("renders a recoverable error card with retry, back link, and collapsed detail", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "raw schema boom",
    });

    mountCharacterHistoryPage(root, CHARACTER_ID);

    await vi.waitFor(() => {
      const alert = root.querySelector(".error-card-head");
      expect(alert?.textContent).toContain("This history could not be loaded.");
      expect(root.querySelector("button")?.textContent).toBe("Retry");
      expect(root.querySelector('a[href="/character/c46ba7cb-993b-4fc7-974d-fb95eacd5446"]')).not.toBeNull();
      const details = root.querySelector("details");
      expect(details?.open).toBe(false);
      expect(details?.textContent).toContain("raw schema boom");
      expect(alert?.textContent).not.toContain("raw schema boom");
    });
  });
});
