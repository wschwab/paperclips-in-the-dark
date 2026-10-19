// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { mountCrewDetailPage } from "./crew-detail.js";

const here = dirname(fileURLToPath(import.meta.url));
const worldPath = resolve(here, "../../../data/world/doskvol.json");
const fixturePath = resolve(here, "../../../conformance/fixtures/golden-crew.json");
const fixture = () => JSON.parse(readFileSync(fixturePath, "utf8"));
const world = () => JSON.parse(readFileSync(worldPath, "utf8")) as {
  source: Record<string, string>;
  summaryAuthor: string;
  holds: Record<string, string>;
  groups: string[];
  factions: { name: string; group: string; tier: number; hold: string }[];
  districts: { name: string; tier: number; hold: string; summary: string; summaryAuthor: string; locations: unknown[] }[];
};
const response = (data: unknown, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(data) });

describe("Doskvol world data (CREW-WORLD-02)", () => {
  it("ships the 49 faction rows and 11 district rows from the campaign sheet, with holds and tiers", () => {
    const data = world();
    expect(data.factions).toHaveLength(49);
    expect(data.districts).toHaveLength(11);
    expect(new Set(data.factions.map((f) => f.name)).size).toBe(49);
    expect(new Set(data.districts.map((d) => d.name)).size).toBe(11);
    for (const f of data.factions) {
      expect(data.groups).toContain(f.group);
      expect(Number.isInteger(f.tier) && f.tier >= 1 && f.tier <= 6).toBe(true);
      expect(Object.keys(data.holds)).toContain(f.hold);
    }
    for (const d of data.districts) {
      expect(Number.isInteger(d.tier) && d.tier >= 1 && d.tier <= 4).toBe(true);
      expect(Object.keys(data.holds)).toContain(d.hold);
    }
  });

  it("marks every district summary as app-written, short, and free of copied sentences", () => {
    const data = world();
    expect(data.summaryAuthor).toBe("app");
    for (const d of data.districts) {
      expect(d.summaryAuthor).toBe("app");
      expect(d.summary.length).toBeGreaterThan(0);
      expect(d.summary.length).toBeLessThanOrEqual(160);
      expect(d.locations).toEqual([]);
    }
  });

  it("records the provenance and licence context in the data file", () => {
    const { source } = world();
    expect(source.factions).toContain("Factions of Doskvol");
    expect(source.licence).toContain("John Harper");
    expect(source.licence).toContain("One Seven Design");
    expect(source.licence).toContain("Duskwall");
  });
});

describe("Doskvol stock faction picker (crew sheet)", () => {
  it("fills the name and tier from a stock row and keeps the typed status", async () => {
    const crew = { ...fixture(), factions: [] };
    const data = world();
    const pick = data.factions[0]!;
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return response({ ok: true, crew: { ...crew, factions: [{ name: pick.name, status: 1, tier: pick.tier }] }, applied: { op: "faction.set-status" }, sideEffects: [], error: null });
      if (url === `/api/games/${crew.gameStem}`) return response({ FactionStatus: { Min: -5, Max: 7 } });
      return response(url === `/api/crews/${crew.id}` ? crew : {});
    });
    vi.stubGlobal("fetch", fetch);
    const root = document.createElement("div");
    document.body.append(root);
    const dispose = mountCrewDetailPage(root, crew.id);
    try {
      await vi.waitFor(() => expect(root.querySelector('input[aria-label="Faction status"]')?.getAttribute("max")).toBe("7"));
      const picker = root.querySelector<HTMLSelectElement>('select[aria-label="Stock faction"]');
      expect(picker).not.toBeNull();
      expect(picker!.options).toHaveLength(data.factions.length + 1);
      picker!.value = pick.name;
      picker!.dispatchEvent(new Event("change"));
      expect(root.querySelector<HTMLInputElement>('input[aria-label="Faction name"]')?.value).toBe(pick.name);
      expect(root.querySelector<HTMLInputElement>('input[aria-label="Faction tier"]')?.value).toBe(String(pick.tier));
      const status = root.querySelector<HTMLInputElement>('input[aria-label="Faction status"]')!;
      status.value = "1";
      status.dispatchEvent(new Event("input"));
      root.querySelector<HTMLButtonElement>('button[title="Add faction"]')!.click();
      await vi.waitFor(() => expect(fetch.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
      expect(JSON.parse(fetch.mock.calls.find(([, init]) => init?.method === "POST")![1]!.body as string)).toEqual({ name: pick.name, status: 1, tier: pick.tier });
    } finally { dispose(); vi.unstubAllGlobals(); root.remove(); }
  });

  it("keeps the custom name entry working alongside the picker", async () => {
    const crew = { ...fixture(), factions: [] };
    const fetch = vi.fn(async (url: string) => response(url === `/api/crews/${crew.id}` ? crew : {}));
    vi.stubGlobal("fetch", fetch);
    const root = document.createElement("div");
    const dispose = mountCrewDetailPage(root, crew.id);
    try {
      await vi.waitFor(() => expect(root.querySelector('select[aria-label="Stock faction"]')).not.toBeNull());
      const name = root.querySelector<HTMLInputElement>('input[aria-label="Faction name"]')!;
      name.value = "My own faction";
      name.dispatchEvent(new Event("input"));
      expect(root.querySelector<HTMLSelectElement>('select[aria-label="Stock faction"]')?.value).toBe("");
      expect(name.value).toBe("My own faction");
    } finally { dispose(); vi.unstubAllGlobals(); }
  });
});

describe("Doskvol districts disclosure (crew sheet)", () => {
  it("lists each district with its summary and an empty locations note", async () => {
    const crew = { ...fixture(), factions: [] };
    const data = world();
    const fetch = vi.fn(async (url: string) => response(url === `/api/crews/${crew.id}` ? crew : {}));
    vi.stubGlobal("fetch", fetch);
    const root = document.createElement("div");
    const dispose = mountCrewDetailPage(root, crew.id);
    try {
      await vi.waitFor(() => expect(root.querySelector("details.doskvol-districts")).not.toBeNull());
      const disclosure = root.querySelector("details.doskvol-districts")!;
      expect(disclosure.querySelector("summary")?.textContent).toContain(`Doskvol districts (${data.districts.length})`);
      const items = disclosure.querySelectorAll(".doskvol-district");
      expect(items).toHaveLength(data.districts.length);
      items.forEach((item, idx) => {
        expect(item.querySelector("h4")?.textContent).toBe(data.districts[idx]!.name);
        expect(item.querySelector(".doskvol-summary")?.textContent).toBe(data.districts[idx]!.summary);
        expect(item.querySelector(".doskvol-locations")?.textContent).toContain("No noteworthy locations recorded");
      });
      expect(disclosure.textContent).toContain("Summaries are written for this app");
    } finally { dispose(); vi.unstubAllGlobals(); }
  });
});
