// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mountRosterPage } from "./roster.js";

const ok = (data: unknown) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify(data),
});

const rosterDTO = {
  characters: [
    {
      id: "c46ba7cb-993b-4fc7-974d-fb95eacd5446",
      name: "Brenda Hilton",
      alias: "Webweaver",
      playbook: "Spider",
      gameStem: "blades-in-the-dark",
      crewId: "8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2",
      stress: 3,
      traumas: ["Haunted"],
      isRetired: false,
      isDeadish: false,
      revision: 12,
    },
  ],
  crews: [
    {
      id: "8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2",
      name: "The Red Sashes",
      crewType: "Assassins",
      gameStem: "blades-in-the-dark",
      tier: 1,
      heat: 4,
      wanted: 1,
      rep: 3,
      hold: "strong",
      memberCount: 2,
      revision: 5,
    },
  ],
};

describe("roster page (F2aa)", () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement("div");
    vi.clearAllMocks();
  });

  it("renders characters and crews after initial load", async () => {
    global.fetch = vi.fn().mockResolvedValue(ok(rosterDTO));

    mountRosterPage(root);

    await vi.waitFor(() => {
      expect(root.querySelector('[data-character-id]')?.textContent).toContain("Brenda Hilton");
      expect(root.querySelector('[data-crew-id]')?.textContent).toContain("The Red Sashes");
    });
  });

  it("falls back to an Unnamed {playbook} placeholder when a character has no name", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      ok({
        characters: [{ ...rosterDTO.characters[0], name: "", alias: "" }],
        crews: rosterDTO.crews,
      }),
    );

    mountRosterPage(root);

    await vi.waitFor(() => {
      expect(root.querySelector("[data-character-id] .unnamed")?.textContent).toBe("Unnamed Spider");
    });
  });

  it("renders a recoverable error card with retry, back link, and collapsed detail", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "raw schema boom",
    });

    mountRosterPage(root);

    await vi.waitFor(() => {
      const alert = root.querySelector(".error-card-head");
      expect(alert?.textContent).toContain("This roster could not be loaded.");
      expect(root.querySelector("button")?.textContent).toBe("Retry");
      expect(root.querySelector('a[href="/roster"]')).not.toBeNull();
      const details = root.querySelector("details");
      expect(details?.open).toBe(false);
      expect(details?.textContent).toContain("raw schema boom");
      expect(alert?.textContent).not.toContain("raw schema boom");
    });
  });

  it("recovers via Retry: a successful re-fetch replaces the error card", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "boom",
      })
      .mockResolvedValueOnce(ok(rosterDTO));

    mountRosterPage(root);

    // First failure → error card
    await vi.waitFor(() => {
      expect(root.querySelector(".error-card")).not.toBeNull();
    });

    // Click Retry (guards the manual addEventListener wiring in errorCard)
    const retry = root.querySelector(".error-card button");
    expect(retry).not.toBeNull();
    (retry as HTMLButtonElement).click();

    // Second fetch succeeds → the roster replaces the error card
    await vi.waitFor(() => {
      expect(root.querySelector(".error-card")).toBeNull();
      expect(root.querySelector(".roster")).not.toBeNull();
      expect(root.querySelector('[data-character-id]')?.textContent).toContain("Brenda Hilton");
    });
  });
});
