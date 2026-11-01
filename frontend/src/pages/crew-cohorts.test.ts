// @vitest-environment happy-dom
// CREW-COHORTS-01: cohort editor against SRD rules (cohorts section of the crew SRD).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { mountCrewDetailPage as mountCrewDetailPageImpl } from "./crew-detail.js";
import { readCohortAddBody } from "./crew-sections/cohorts.js";

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

  it("edit form blocks Save while edges and flaws differ, says why, and unblocks once they match", async () => {
    const root = await openAddForm(crewDTO({ cohorts: [cohortDTO()] }));
    (root.querySelector('button[title="Edit cohort: Thugs"]') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(root.querySelector(".cohort-entry.editing")).not.toBeNull();
    });
    const editing = root.querySelector(".cohort-entry.editing") as HTMLElement;
    const saveBtn = editing.querySelector('button[title^="Save"]') as HTMLButtonElement;
    const warning = editing.querySelector(".cohort-count-mismatch") as HTMLElement;
    const pick = (aria: string, value: string, addTitle: string) => {
      const select = editing.querySelector(`select[aria-label="${aria}"]`) as HTMLSelectElement;
      select.value = value;
      select.dispatchEvent(new Event("change"));
      (editing.querySelector(`button[title="${addTitle}"]`) as HTMLButtonElement).click();
    };
    expect(saveBtn.disabled).toBe(false);

    pick("Edit edge", "Loyal", "Add edge");
    expect(saveBtn.disabled).toBe(true);
    expect(warning.hidden).toBe(false);
    expect(warning.textContent).toMatch(/equal number of edges and flaws/);

    pick("Edit flaw", "Savage", "Add flaw");
    expect(saveBtn.disabled).toBe(false);
    expect(warning.hidden).toBe(true);
  });

  it("initial gang render under the real stylesheet: expert type and custom fields are not displayed", async () => {
    const style = document.createElement("style");
    style.textContent = readFileSync("src/styles/components.css", "utf8");
    document.head.append(style);
    const root = await openAddForm(crewDTO());
    document.body.append(root); // computed style only cascades for attached nodes
    try {
      const displayed = (sel: string) =>
        getComputedStyle((root.querySelector(sel) as HTMLElement).closest(".cohort-field") as HTMLElement).display !== "none";
      expect(displayed('select[aria-label="Cohort gang type"]')).toBe(true);
      expect(displayed('select[aria-label="Cohort expert type"]')).toBe(false);
      expect(displayed('input[aria-label="Cohort expert custom type"]')).toBe(false);
    } finally {
      root.remove();
      style.remove();
    }
  });
});

// CREW-COHORTS-03: a cohort holds up to CohortMaxTypes types (SRD). The second
// type is extraTypes; the picker is shown only when the game allows two types.
const BLADES_CREW_GAME_DATA = {
  CohortGangTypes: ["Adepts", "Rooks", "Rovers", "Skulks", "Thugs"],
  CohortExpertTypes: ["Doctor", "Investigator", "Occultist", "Assassin", "Spy"],
  CohortMaxTypes: 2,
};

async function openAddFormWithGameData(crew: Record<string, unknown>, gameData: Record<string, unknown>): Promise<HTMLElement> {
  const root = document.createElement("div");
  global.fetch = vi.fn((input: RequestInfo | URL) => {
    if (String(input).endsWith("/crews")) return Promise.resolve(ok(gameData) as Response);
    return Promise.resolve(ok(crew) as Response);
  });
  mountCrewDetailPage(root, CREW_ID);
  await vi.waitFor(() => {
    expect(root.querySelector(".crew-cohorts")).not.toBeNull();
  });
  return root;
}

describe("CREW-COHORTS-03 second type", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("offers a second-type picker with the same kind list plus Custom when CohortMaxTypes is 2", async () => {
    const root = await openAddFormWithGameData(crewDTO(), BLADES_CREW_GAME_DATA);
    const second = root.querySelector('select[aria-label="Cohort second type"]') as HTMLSelectElement;
    expect(second).not.toBeNull();
    expect([...second.options].map((o) => o.value).filter(Boolean)).toEqual([
      "Adepts", "Rooks", "Rovers", "Skulks", "Thugs", "Custom",
    ]);
  });

  it("sends the chosen second type as extraTypes in the add body", async () => {
    const root = await openAddFormWithGameData(crewDTO(), BLADES_CREW_GAME_DATA);
    const gang = root.querySelector('select[aria-label="Cohort gang type"]') as HTMLSelectElement;
    gang.value = "Thugs";
    gang.dispatchEvent(new Event("change"));
    const second = root.querySelector('select[aria-label="Cohort second type"]') as HTMLSelectElement;
    second.value = "Rooks";
    second.dispatchEvent(new Event("change"));
    const body = readCohortAddBody(root, 2);
    expect(body?.gangType).toBe("Thugs");
    expect(body?.extraTypes).toEqual(["Rooks"]);
  });

  it("Custom second type sends its typed text", async () => {
    const root = await openAddFormWithGameData(crewDTO(), BLADES_CREW_GAME_DATA);
    const gang = root.querySelector('select[aria-label="Cohort gang type"]') as HTMLSelectElement;
    gang.value = "Thugs";
    gang.dispatchEvent(new Event("change"));
    const second = root.querySelector('select[aria-label="Cohort second type"]') as HTMLSelectElement;
    second.value = "Custom";
    second.dispatchEvent(new Event("change"));
    const custom = root.querySelector('input[aria-label="Cohort second custom type"]') as HTMLInputElement;
    custom.value = "Smugglers";
    custom.dispatchEvent(new Event("input"));
    expect(readCohortAddBody(root, 2)?.extraTypes).toEqual(["Smugglers"]);
  });

  it("hides the second-type picker when the game allows only one type", async () => {
    const root = await openAddFormWithGameData(crewDTO(), { ...BLADES_CREW_GAME_DATA, CohortMaxTypes: 1 });
    const second = root.querySelector('select[aria-label="Cohort second type"]');
    expect(second?.closest("label")?.hidden).toBe(true);
    const gang = root.querySelector('select[aria-label="Cohort gang type"]') as HTMLSelectElement;
    gang.value = "Thugs";
    gang.dispatchEvent(new Event("change"));
    expect(readCohortAddBody(root, 2)?.extraTypes).toBeUndefined();
  });
});

describe("CREW-COHORTS-03 second type in the edit form", () => {
  it("edit form shows the saved second type, and Save sends the changed extraTypes", async () => {
    const root = document.createElement("div");
    const calls: Array<{ url: string; body: unknown }> = [];
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/crews")) return Promise.resolve(ok(BLADES_CREW_GAME_DATA) as Response);
      if (init?.method === "POST") {
        calls.push({ url, body: JSON.parse(String(init.body ?? "{}")) });
        return Promise.resolve(ok(crewDTO({ cohorts: [cohortDTO({ extraTypes: ["Smugglers"] })] })) as Response);
      }
      return Promise.resolve(ok(crewDTO({ cohorts: [cohortDTO({ extraTypes: ["Rooks"] })] })) as Response);
    });
    mountCrewDetailPage(root, CREW_ID);
    await vi.waitFor(() => {
      expect(root.querySelector('button[title="Edit cohort: Thugs"]')).not.toBeNull();
    });
    (root.querySelector('button[title="Edit cohort: Thugs"]') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(root.querySelector('select[aria-label="Edit second type"]')).not.toBeNull();
    });
    const second = root.querySelector('select[aria-label="Edit second type"]') as HTMLSelectElement;
    expect(second.value).toBe("Rooks");
    second.value = "Custom";
    second.dispatchEvent(new Event("change"));
    const custom = root.querySelector('input[aria-label="Edit second custom type"]') as HTMLInputElement;
    custom.value = "Smugglers";
    custom.dispatchEvent(new Event("input"));
    (root.querySelector('button[title="Save cohort: Thugs"]') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(calls.some((c) => c.url.includes("cohort.update"))).toBe(true);
    });
    const update = calls.find((c) => c.url.includes("cohort.update"));
    expect(update?.body).toMatchObject({ extraTypes: ["Smugglers"] });
  });
});

describe("CREW-COHORTS-03 hidden second type keeps the saved value", () => {
  it("when the game data does not give CohortMaxTypes, a name-only edit does not send extraTypes", async () => {
    const root = document.createElement("div");
    const calls: Array<{ url: string; body: unknown }> = [];
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/crews")) return Promise.resolve(ok({}) as Response);
      if (init?.method === "POST") {
        calls.push({ url, body: JSON.parse(String(init.body ?? "{}")) });
        return Promise.resolve(ok(crewDTO({ cohorts: [cohortDTO({ extraTypes: ["Rooks"] })] })) as Response);
      }
      return Promise.resolve(ok(crewDTO({ cohorts: [cohortDTO({ extraTypes: ["Rooks"] })] })) as Response);
    });
    mountCrewDetailPage(root, CREW_ID);
    await vi.waitFor(() => {
      expect(root.querySelector('button[title="Edit cohort: Thugs"]')).not.toBeNull();
    });
    (root.querySelector('button[title="Edit cohort: Thugs"]') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(root.querySelector('input[aria-label="Edit name"]')).not.toBeNull();
    });
    const name = root.querySelector('input[aria-label="Edit name"]') as HTMLInputElement;
    name.value = "Renamed";
    (root.querySelector('button[title="Save cohort: Thugs"]') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(calls.some((c) => c.url.includes("cohort.update"))).toBe(true);
    });
    const update = calls.find((c) => c.url.includes("cohort.update"));
    expect(update?.body).toMatchObject({ name: "Renamed" });
    expect(update?.body).not.toHaveProperty("extraTypes");
  });
});
