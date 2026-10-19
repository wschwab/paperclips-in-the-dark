// @vitest-environment happy-dom
// CREW-COHORTS-01: cohort editor against SRD rules (cohorts section of the crew SRD).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mountCrewDetailPage as mountCrewDetailPageImpl } from "./crew-detail.js";

const CREW_ID = "8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2";

function crewDTO(overrides: Record<string, unknown> = {}) {
  return {
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
    tier: 2,
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
    stashCapacity: 4,
    contacts: [],
    factions: [],
    notes: [],
    turf: 0,
    claimedClaimIds: [],
    claimOverrides: [],
    ...overrides,
  };
}

const ok = (data: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify(data) });

function mountCrewDetailPage(root: HTMLElement, crewId: string): () => void {
  const queuedFetch = global.fetch;
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === "/api/games/blades-in-the-dark") {
      return Promise.resolve(ok({}) as Response);
    }
    return queuedFetch(input, init);
  });
  return mountCrewDetailPageImpl(root, crewId);
}

function cohortDTO(overrides: Record<string, unknown> = {}) {
  return {
    id: "b1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
    cohortKind: "gang",
    gangType: "Thugs",
    expertType: "",
    quality: 2,
    scale: 2,
    hasArmor: false,
    edges: [],
    flaws: [],
    harm: "healthy",
    description: "",
    ...overrides,
  };
}

async function openAddForm(crew: Record<string, unknown>): Promise<HTMLElement> {
  const root = document.createElement("div");
  global.fetch = vi.fn().mockResolvedValue(ok(crew));
  mountCrewDetailPage(root, CREW_ID);
  await vi.waitFor(() => {
    expect(root.querySelector(".crew-cohorts")).not.toBeNull();
  });
  return root;
}

describe("CREW-COHORTS-01 cohort editor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("offers the SRD gang types, spelled Skulks (not Skulls)", async () => {
    const root = await openAddForm(crewDTO());
    const gangSelect = root.querySelector('select[aria-label="Cohort gang type"]') as HTMLSelectElement;
    const values = [...gangSelect.options].map((o) => o.value).filter(Boolean);
    expect(values).toEqual(["Adepts", "Rooks", "Rovers", "Skulks", "Thugs"]);
  });

  it("gang add form shows Armor and Scale; expert add form hides them", async () => {
    const root = await openAddForm(crewDTO());
    const kind = root.querySelector('select[aria-label="Cohort kind"]') as HTMLSelectElement;
    const armor = () => root.querySelector('input[aria-label="Cohort armor"]')?.closest("label")?.hidden;
    const scale = () => root.querySelector(".cohort-add .cohort-scale-derived")?.closest("label")?.hidden;
    expect(armor()).toBe(false);
    expect(scale()).toBe(false);
    kind.value = "expert";
    kind.dispatchEvent(new Event("change"));
    expect(armor()).toBe(true);
    expect(scale()).toBe(true);
  });

  it("quality and scale are derived from crew Tier and shown read-only (gang = Tier; expert = Tier+1, scale 0)", async () => {
    const root = await openAddForm(crewDTO({ tier: 2 }));
    expect(root.querySelector('input[aria-label="Cohort quality"]')).toBeNull();
    expect(root.querySelector(".cohort-add .cohort-quality-derived")?.textContent).toContain("2");
    expect(root.querySelector(".cohort-add .cohort-scale-derived")?.textContent).toContain("2");
    const kind = root.querySelector('select[aria-label="Cohort kind"]') as HTMLSelectElement;
    kind.value = "expert";
    kind.dispatchEvent(new Event("change"));
    expect(root.querySelector(".cohort-add .cohort-quality-derived")?.textContent).toContain("3");
  });

  it("description is a multi-line textarea in the add form and the edit form", async () => {
    const root = await openAddForm(crewDTO({ cohorts: [cohortDTO()] }));
    const addDesc = root.querySelector('[aria-label="Cohort description"]');
    expect(addDesc?.tagName).toBe("TEXTAREA");
    (root.querySelector('button[title="Edit cohort: Thugs"]') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(root.querySelector('[aria-label="Edit description"]')?.tagName).toBe("TEXTAREA");
    });
  });

  it("edges and flaws are pickers over the SRD lists with a Custom entry and text box", async () => {
    const root = await openAddForm(crewDTO());
    const edge = root.querySelector('select[aria-label="Cohort edge"]') as HTMLSelectElement;
    const flaw = root.querySelector('select[aria-label="Cohort flaw"]') as HTMLSelectElement;
    expect([...edge.options].map((o) => o.value).filter(Boolean)).toEqual([
      "Fearsome", "Independent", "Loyal", "Tenacious", "Custom",
    ]);
    expect([...flaw.options].map((o) => o.value).filter(Boolean)).toEqual([
      "Principled", "Savage", "Unreliable", "Wild", "Custom",
    ]);
    const customEdge = root.querySelector('input[aria-label="Cohort custom edge"]') as HTMLInputElement;
    expect(customEdge.hidden).toBe(true);
    edge.value = "Custom";
    edge.dispatchEvent(new Event("change"));
    expect(customEdge.hidden).toBe(false);
  });

  it("blocks Add while edges and flaws differ, says why, and unblocks once they match", async () => {
    const root = await openAddForm(crewDTO());
    const addBtn = root.querySelector('button[title="Add cohort"]') as HTMLButtonElement;
    const pick = (aria: string, value: string, addTitle: string) => {
      const select = root.querySelector(`select[aria-label="${aria}"]`) as HTMLSelectElement;
      select.value = value;
      select.dispatchEvent(new Event("change"));
      (root.querySelector(`button[title="${addTitle}"]`) as HTMLButtonElement).click();
    };
    expect(addBtn.disabled).toBe(false);

    pick("Cohort edge", "Loyal", "Add edge");
    expect(addBtn.disabled).toBe(true);
    const warning = root.querySelector(".cohort-count-mismatch") as HTMLElement;
    expect(warning.hidden).toBe(false);
    expect(warning.textContent).toMatch(/equal number of edges and flaws/);

    pick("Cohort flaw", "Savage", "Add flaw");
    expect(addBtn.disabled).toBe(false);
    expect(warning.hidden).toBe(true);
  });
});
