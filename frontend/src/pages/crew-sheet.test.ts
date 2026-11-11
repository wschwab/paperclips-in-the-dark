// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { renderCrewProfileSection } from "./crew-sections/profile.js";
import { renderCrewContactsSection } from "./crew-sections/contacts.js";
import { renderCrewPlaybookSection } from "./crew-sections/playbook.js";
import { renderCrewTrackersSection } from "./crew-sections/trackers.js";
import type { RenderState } from "./crew-detail.js";
import { mountCrewDetailPage } from "./crew-detail.js";
import goldenCrew from "../../../conformance/fixtures/golden-crew.json";

function state(overrides: Record<string, unknown> = {}): RenderState {
  return {
    c: { crewTypeName: "Assassins", name: "Test crew", lair: "", huntingGrounds: "Canals", favoredOperation: "Accident", reputation: "", contacts: [], factions: [], upgrades: [], specialAbilities: [] },
    handlers: new Proxy({}, { get: () => vi.fn() }),
    anyLoading: false, editingProfile: null, reputationDraft: { value: null }, contactDraft: { name: "", profession: "" },
    factionDrafts: { add: { name: "", tier: "", status: "0" }, rows: new Map(), starting: null, error: null },
    crewTypeData: { Name: "Assassins", FavoredOperationLabel: "Favored operation", FavoredOperations: ["Accident", "Disappearance"], Upgrades: [{ Name: "Hidden", Description: "Conceal your lair.", Boxes: 1 }], StartingUpgrades: [{ Name: "Hidden", BoxesMarked: 1 }], Contacts: [] },
    crewTypesData: null, crewCaps: null, ...overrides,
  } as unknown as RenderState;
}

describe("CREW-SHEET-02 crew setup references", () => {
  it("shows favored operation separately from hunting grounds", () => {
    const root = renderCrewProfileSection(state());
    expect(root.textContent).toContain("Favored operation");
    expect(root.textContent).toContain("Accident");
    expect(root.textContent).toContain("Canals");
  });
  it("edits favored operation using the crew type's options and keeps legacy custom values", () => {
    const root = renderCrewProfileSection(state({ editingProfile: { field: "favoredOperation", value: "Legacy choice" } }));
    const select = root.querySelector<HTMLSelectElement>('select[aria-label="Favored operation"]');
    expect(select).not.toBeNull();
    expect(Array.from(select!.options).map((option) => option.value)).toEqual(["", "Accident", "Disappearance", "Legacy choice"]);
    expect(select!.value).toBe("Legacy choice");
  });
  it("offers Smugglers a cargo free-text editor", () => {
    const s = state({ crewTypeData: { Name: "Smugglers", FavoredOperationLabel: "Cargo type", FavoredOperations: [] }, editingProfile: { field: "favoredOperation", value: "Rare books" } });
    const root = renderCrewProfileSection(s);
    const input = root.querySelector<HTMLInputElement>('input[aria-label="Cargo type"]');
    expect(input?.value).toBe("Rare books");
    input!.value = "Fine cloth";
    input!.dispatchEvent(new Event("input"));
    expect(s.editingProfile?.value).toBe("Fine cloth");
  });
  it("keeps cargo free text with the verified cargo types as suggestions", () => {
    const s = state({ crewTypeData: { Name: "Smugglers", FavoredOperationLabel: "Cargo type", FavoredOperations: ["Arcane/weird", "Arms", "Contraband", "Passengers"], FavoredOperationFreeText: true }, editingProfile: { field: "favoredOperation", value: "Fine cloth" } });
    const root = renderCrewProfileSection(s);
    expect(root.querySelector('select[aria-label="Cargo type"]')).toBeNull();
    const input = root.querySelector<HTMLInputElement>('input[aria-label="Cargo type"]')!;
    expect(input.value).toBe("Fine cloth");
    const list = root.querySelector<HTMLDataListElement>("#favored-operation-suggestions")!;
    expect(Array.from(list.options).map((option) => option.value)).toEqual(["Arcane/weird", "Arms", "Contraband", "Passengers"]);
    expect(input.getAttribute("list")).toBe("favored-operation-suggestions");
    input.value = "People, quietly";
    input.dispatchEvent(new Event("input"));
    expect(s.editingProfile?.value).toBe("People, quietly");
  });
  it("shows every upgrade description before ownership, without hover", () => {
    const root = renderCrewPlaybookSection(state());
    expect(root.querySelector('.chart-row[data-upgrade="Hidden"]')?.textContent).toContain("Conceal your lair.");
    expect(root.querySelector(".crew-starting-upgrades")?.textContent).toContain("Hidden");
  });
  it("keeps public contacts custom-only without named setting data", () => {
    const root = renderCrewContactsSection(state());
    expect(root.querySelector('input[aria-label="Contact name"]')).not.toBeNull();
    expect(root.querySelector('select[aria-label="Stock crew contact"]')).toBeNull();
  });
  it("offers restored private setting contacts alongside custom entry and fills both drafts", () => {
    const s = state({ crewTypeData: { Name: "Assassins", Contacts: [{ Name: "Test contact", Profession: "messenger" }] } });
    const root = renderCrewContactsSection(s);
    const select = root.querySelector<HTMLSelectElement>('select[aria-label="Stock crew contact"]');
    expect(select).not.toBeNull();
    select!.value = "Test contact";
    select!.dispatchEvent(new Event("change"));
    expect(s.contactDraft).toEqual({ name: "Test contact", profession: "messenger" });
    expect(root.querySelector<HTMLInputElement>('input[aria-label="Contact name"]')?.value).toBe("Test contact");
    expect(root.querySelector<HTMLInputElement>('input[aria-label="Contact profession"]')?.value).toBe("messenger");
  });
  it("saves through the dedicated revisioned operation and retains failed drafts", async () => {
    const crew = { ...goldenCrew, favoredOperation: "" };
    const type = { Name: crew.crewTypeName, FavoredOperations: ["Accident", "Disappearance"] };
    const response = (value: unknown, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(value) });
    const fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return response({ error: { code: "VALIDATION", message: "Try again" } }, 400);
      if (String(url) === `/api/crews/${crew.id}`) return response(crew);
      if (String(url).endsWith("/capabilities")) return response({}, 404);
      if (String(url).endsWith("/crews")) return response({ CrewTypes: [type] });
      return response(type);
    });
    vi.stubGlobal("fetch", fetch);
    const root = document.createElement("div");
    const dispose = mountCrewDetailPage(root, crew.id);
    try {
      await vi.waitFor(() => expect(root.querySelector(".crew-profile")).not.toBeNull());
      root.querySelector<HTMLButtonElement>('button[title="Edit Favored operation"]')!.click();
      const select = root.querySelector<HTMLSelectElement>('select[aria-label="Favored operation"]')!;
      select.value = "Disappearance";
      select.dispatchEvent(new Event("change"));
      root.querySelector<HTMLButtonElement>('.field-editing button[title="Save"]')!.click();
      await vi.waitFor(() => expect(fetch.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
      const [url, init] = fetch.mock.calls.find(([, init]) => init?.method === "POST")!;
      expect(url).toBe(`/api/crews/${crew.id}/ops/favored-operation.set`);
      expect(JSON.parse(init!.body as string)).toEqual({ value: "Disappearance" });
      expect((init!.headers as Record<string, string>)["If-Match"]).toBe(String(crew.revision));
      await vi.waitFor(() => expect(root.querySelector<HTMLSelectElement>('select[aria-label="Favored operation"]')?.disabled).toBe(false));
      expect(root.querySelector<HTMLSelectElement>('select[aria-label="Favored operation"]')?.value).toBe("Disappearance");
    } finally {
      dispose();
      vi.unstubAllGlobals();
    }
  });
});

// A crew created before the settings renamed its type (Cultists → Cult) keeps
// the old name on the wire: the server renames at write time, the client never
// does. Every menu lookup must still find the canonical entry.
const legacyTypes = [
  {
    Name: "Cult",
    LegacyNames: ["Cultists"],
    FavoredOperationLabel: "Favored operation",
    FavoredOperations: ["Consecration", "Sacrifice"],
    Reputations: ["Strange", "Weird"],
    SpecialAbilities: [{ Name: "Anointed", TimesTakeable: 1, Description: "Occult blessing." }],
    Upgrades: [{ Name: "Ritual Sanctum", TotalBoxes: 2, Description: "A place of power." }],
    StartingUpgrades: [{ Name: "Ritual Sanctum", BoxesMarked: 1 }],
  },
];

function legacyCrew(overrides: Record<string, unknown> = {}) {
  return {
    crewTypeName: "Cultists",
    name: "Old crew",
    lair: "",
    huntingGrounds: "Canals",
    favoredOperation: "",
    reputation: "",
    contacts: [],
    factions: [],
    upgrades: [],
    specialAbilities: [],
    ...overrides,
  };
}

describe("CREW-SHEET-02 legacy crew type names", () => {
  it("resolves a stored legacy type name to the canonical type's profile menus", () => {
    const s = state({
      crewTypeData: null,
      crewTypesData: legacyTypes,
      c: legacyCrew(),
      editingProfile: { field: "favoredOperation", value: "" },
    });
    const root = renderCrewProfileSection(s);
    const favored = root.querySelector<HTMLSelectElement>('select[aria-label="Favored operation"]');
    expect(favored).not.toBeNull();
    expect(Array.from(favored!.options).map((option) => option.value)).toEqual(["", "Consecration", "Sacrifice"]);
    const reputation = root.querySelector<HTMLSelectElement>('select[aria-label="Reputation"]');
    expect(Array.from(reputation!.options).map((option) => option.value)).toEqual(["Strange", "Weird"]);
  });

  it("resolves a stored legacy type name to the canonical type's playbook", () => {
    const s = state({ crewTypeData: null, crewTypesData: legacyTypes, c: legacyCrew() });
    const root = renderCrewPlaybookSection(s);
    const abilities = root.querySelector<HTMLSelectElement>('select[aria-label="Take ability"]');
    expect(Array.from(abilities!.options).map((option) => option.value)).toEqual(["", "Anointed"]);
    const mark = root.querySelector<HTMLSelectElement>('select[aria-label="Mark upgrade"]');
    expect(Array.from(mark!.options).map((option) => option.value)).toEqual(["", "Ritual Sanctum"]);
    expect(root.querySelector('.chart-row[data-upgrade="Ritual Sanctum"]')).not.toBeNull();
    expect(root.querySelector(".crew-starting-upgrades")?.textContent).toContain("Ritual Sanctum");
  });

  it("renders a stored ability and upgrade name the catalog no longer knows", () => {
    const s = state({
      crewTypeData: null,
      crewTypesData: legacyTypes,
      c: legacyCrew({
        specialAbilities: [{ name: "Old Rite", timesTaken: 1 }],
        upgrades: [{ name: "Old Sanctum", boxesMarked: 2 }],
      }),
    });
    const root = renderCrewPlaybookSection(s);
    const ability = root.querySelector('.ability-entry[data-ability="Old Rite"]');
    expect(ability).not.toBeNull();
    expect(ability!.textContent).toContain("Old Rite");
    expect(ability!.textContent).toContain("No description available.");
    const upgrade = root.querySelector('.upgrade-entry[data-upgrade="Old Sanctum"]');
    expect(upgrade).not.toBeNull();
    // Sane total: never fewer boxes than are already marked.
    expect(upgrade!.querySelector(".upgrade-count")?.textContent).toBe("2 / 2");
    expect(root.querySelector('.chart-row[data-upgrade="Old Sanctum"] .chart-count')?.textContent).toBe("2 / 2");
  });

  it("keeps a stored legacy name as the row label while reading the renamed catalog entry", () => {
    const renamed = [{
      ...legacyTypes[0]!,
      LegacyAbilityNames: { "Old Rite": "Anointed" },
      LegacyUpgradeNames: { "Old Sanctum": "Ritual Sanctum" },
    }];
    const s = state({
      crewTypeData: null,
      crewTypesData: renamed,
      c: legacyCrew({
        specialAbilities: [{ name: "Old Rite", timesTaken: 1 }],
        upgrades: [{ name: "Old Sanctum", boxesMarked: 1 }],
      }),
    });
    const root = renderCrewPlaybookSection(s);
    const ability = root.querySelector('.ability-entry[data-ability="Old Rite"]');
    expect(ability!.textContent).toContain("Occult blessing.");
    // The stored legacy name counts as a take of the renamed ability, so it
    // is not offered again.
    const takeAbility = root.querySelector<HTMLSelectElement>('select[aria-label="Take ability"]');
    expect(Array.from(takeAbility!.options).map((option) => option.value)).toEqual([""]);
    const upgrade = root.querySelector('.upgrade-entry[data-upgrade="Old Sanctum"]');
    expect(upgrade!.querySelector(".upgrade-count")?.textContent).toBe("1 / 2");
    expect(upgrade!.textContent).toContain("A place of power.");
    // The renamed entry is one upgrade, not two chart rows.
    const chartRows = root.querySelectorAll(
      '.chart-row[data-upgrade="Old Sanctum"], .chart-row[data-upgrade="Ritual Sanctum"]',
    );
    expect(Array.from(chartRows).map((row) => row.getAttribute("data-upgrade"))).toEqual(["Ritual Sanctum"]);
    expect(chartRows[0]!.querySelector(".chart-count")?.textContent).toBe("1 / 2");
  });

  it("sums alias ownership in fallback charts and eligibility without allowing hidden decrements", () => {
    const root = renderCrewPlaybookSection(state({
      crewTypeData: { Name: "Shadows", LegacyUpgradeNames: { Composed: "Steady" }, LegacyAbilityNames: { Old: "New" }, Upgrades: [{ Name: "Steady", TotalBoxes: 3 }], SpecialAbilities: [{ Name: "New", TimesTakeable: 2 }] },
      c: legacyCrew({ crewTypeName: "Shadows", upgrades: [{ name: "Composed", boxesMarked: 1 }, { name: "Steady", boxesMarked: 1 }], specialAbilities: [{ name: "Old", timesTaken: 1 }, { name: "New", timesTaken: 1 }] }),
    }));
    expect(root.querySelector(".chart-count")?.textContent).toBe("2 / 3");
    expect(root.querySelector<HTMLButtonElement>('button[aria-label="Steady box 2"]')?.disabled).toBe(true);
    expect(root.querySelector<HTMLButtonElement>('button[aria-label="Steady box 3"]')?.disabled).toBe(false);
    expect(Array.from(root.querySelector<HTMLSelectElement>('select[aria-label="Take ability"]')!.options).map((o) => o.value)).toEqual([""]);
  });

  it.each([false, true])("dispatches chart boxes using the stored alias identity (capabilities %s)", (withCaps) => {
    const onChartBox = vi.fn();
    const s = state({
      advancementEdit: true,
      crewTypeData: { Name: "Shadows", LegacyUpgradeNames: { Composed: "Steady" }, Upgrades: [{ Name: "Steady", TotalBoxes: 3 }] },
      c: legacyCrew({ crewTypeName: "Shadows", upgrades: [{ name: "Composed", boxesMarked: 1 }] }),
      crewCaps: withCaps ? { abilities: [], upgrades: [{ name: "Steady", totalBoxes: 3, marked: 1, remaining: 2 }] } : null,
      handlers: new Proxy({ onChartBox }, { get: (target, key) => key === "onChartBox" ? target.onChartBox : vi.fn() }),
    });
    const root = renderCrewPlaybookSection(s);
    root.querySelector<HTMLButtonElement>('button[aria-label="Steady box 1"]')!.click();
    expect(onChartBox).toHaveBeenLastCalledWith("Composed", 1);
    root.querySelector<HTMLButtonElement>('button[aria-label="Steady box 2"]')!.click();
    expect(onChartBox).toHaveBeenLastCalledWith("Composed", 2);
  });

  it.each([{ index: 1, both: false }, { index: 2, both: false }, { index: 2, both: true }, { index: 3, both: true }])("dispatches a mounted alias-owned chart box $index (both aliases $both) to the matching mutation", async ({ index, both }) => {
    const crew = { ...goldenCrew, crewTypeName: "Shadows", upgrades: [{ name: "Composed", boxesMarked: 1 }, ...(both ? [{ name: "Steady", boxesMarked: 1 }] : [])] };
    const type = { Name: "Shadows", LegacyUpgradeNames: { Composed: "Steady" }, Upgrades: [{ Name: "Steady", TotalBoxes: 3 }] };
    const response = (value: unknown, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(value) });
    const fetch = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u === `/api/crews/${crew.id}`) return response(crew);
      if (u === "/api/games/blades-in-the-dark/crews") return response({ CrewTypes: [type] });
      if (u === "/api/games/blades-in-the-dark/crews/Shadows") return response(type);
      return response({}, 404);
    });
    vi.stubGlobal("fetch", fetch);
    const root = document.createElement("div");
    const dispose = mountCrewDetailPage(root, crew.id);
    try {
      await vi.waitFor(() => expect(root.querySelector('button[aria-label="Steady box 1"]')).not.toBeNull());
      // Even synthetic activation must not bypass the advancement-edit guard.
      root.querySelector<HTMLButtonElement>('button[aria-label="Steady box 1"]')!.dispatchEvent(new Event("click"));
      await Promise.resolve();
      expect(fetch.mock.calls.some(([url]) => String(url).includes("/ops/upgrade."))).toBe(false);
      const removing = index <= (both ? 2 : 1);
      if (removing) root.querySelector<HTMLButtonElement>(".advancement-toggle")!.click();
      root.querySelector<HTMLButtonElement>(`button[aria-label="Steady box ${index}"]`)!.click();
      await vi.waitFor(() => {
        const call = fetch.mock.calls.find(([url]) => String(url).includes("/ops/upgrade."));
        expect(String(call?.[0])).toBe(`/api/crews/${crew.id}/ops/upgrade.${removing ? "unmark" : "mark"}`);
        expect(JSON.parse((call as unknown as [unknown, RequestInit])[1].body as string)).toEqual({ name: "Composed" });
      });
    } finally {
      dispose();
      vi.unstubAllGlobals();
    }
  });

  it("mounts a legacy-named crew with the canonical menus when the per-type endpoint 404s", async () => {
    const crew = { ...goldenCrew, crewTypeName: "Cultists", favoredOperation: "" };
    const response = (value: unknown, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(value) });
    const fetch = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u === `/api/crews/${crew.id}`) return response(crew);
      if (u.endsWith("/capabilities")) return response({}, 404);
      if (u === "/api/games/blades-in-the-dark/crews") return response({ CrewTypes: legacyTypes });
      // /api/games/blades-in-the-dark/crews/Cultists — the rename makes this a 404.
      return response({ error: { code: "NOT_FOUND", message: "Unknown crew type" } }, 404);
    });
    vi.stubGlobal("fetch", fetch);
    const root = document.createElement("div");
    const dispose = mountCrewDetailPage(root, crew.id);
    try {
      await vi.waitFor(() => expect(root.querySelector(".crew-profile")).not.toBeNull());
      root.querySelector<HTMLButtonElement>('button[title="Edit Favored operation"]')!.click();
      const favored = root.querySelector<HTMLSelectElement>('select[aria-label="Favored operation"]')!;
      expect(Array.from(favored.options).map((option) => option.value)).toEqual(["", "Consecration", "Sacrifice"]);
      const abilities = root.querySelector<HTMLSelectElement>('select[aria-label="Take ability"]')!;
      expect(Array.from(abilities.options).map((option) => option.value)).toEqual(["", "Anointed"]);
      expect(root.querySelector(".crew-type")?.textContent).toBe("Cultists");
    } finally {
      dispose();
      vi.unstubAllGlobals();
    }
  });
});

describe("CREW-SHEET-02 hold rendering", () => {
  function trackerState(hold: string): RenderState {
    return {
      c: { rep: { current: 4, max: 12 }, turf: 1, heat: { current: 0, max: 9 }, wanted: { current: 0, max: 4 }, tier: 0, hold, crewTypeName: "Assassins", claimedClaimIds: [] },
      crewCaps: null,
      crewGameData: {},
      manualTurfMax: null,
      handlers: new Proxy({}, { get: () => vi.fn() }),
    } as unknown as RenderState;
  }
  it("renders the stored weak hold with no client-side default", () => {
    const root = renderCrewTrackersSection(trackerState("weak"));
    expect(root.querySelector<HTMLButtonElement>('button[data-hold="weak"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(root.querySelector<HTMLButtonElement>('button[data-hold="strong"]')?.getAttribute("aria-pressed")).toBe("false");
  });
  it("renders the stored strong hold", () => {
    const root = renderCrewTrackersSection(trackerState("strong"));
    expect(root.querySelector<HTMLButtonElement>('button[data-hold="strong"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(root.querySelector<HTMLButtonElement>('button[data-hold="weak"]')?.getAttribute("aria-pressed")).toBe("false");
  });
});
