// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { decodeCrew } from "../schema/crew.js";
import { factionSetStarting, factionSetStatus } from "../api/client.js";
import { mountCrewDetailPage } from "./crew-detail.js";

const fixturePath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../conformance/fixtures/golden-crew.json");
const fixture = () => JSON.parse(readFileSync(fixturePath, "utf8"));
const response = (data: unknown, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(data) });

describe("crew world records", () => {
  it("strictly decodes optional starting records and nonnegative unbounded tier", () => {
    const base = fixture();
    expect(decodeCrew(base).startingFactions).toBeUndefined();
    expect(decodeCrew({ ...base, startingFactions: { ally: "", rival: "" }, factions: [{ name: "Custom", status: 0, tier: 99 }] }).factions[0]?.tier).toBe(99);
    for (const startingFactions of [{ ally: "" }, { ally: "", rival: "", extra: true }, null]) {
      expect(() => decodeCrew({ ...base, startingFactions })).toThrow();
    }
    for (const tier of [-1, 0.5, null]) {
      expect(() => decodeCrew({ ...base, factions: [{ name: "Custom", status: 0, tier }] })).toThrow();
    }
  });

  it("sends one exact starting pair and preserves the legacy status helper signature", async () => {
    const crew = fixture();
    const fetch = vi.fn().mockResolvedValue(response({ ok: true, crew, applied: { op: "faction.set-starting" }, sideEffects: [], error: null }));
    vi.stubGlobal("fetch", fetch);
    try {
      await Effect.runPromise(factionSetStarting(crew.id, "", "", crew.revision));
      expect(fetch.mock.calls[0]?.[0]).toBe(`/api/crews/${crew.id}/ops/faction.set-starting`);
      expect(JSON.parse(fetch.mock.calls[0]?.[1].body)).toEqual({ ally: "", rival: "" });
      expect(fetch.mock.calls[0]?.[1].headers["If-Match"]).toBe(String(crew.revision));
      await Effect.runPromise(factionSetStatus(crew.id, "Custom", 1, crew.revision));
      expect(JSON.parse(fetch.mock.calls[1]?.[1].body)).toEqual({ name: "Custom", status: 1 });
      await Effect.runPromise(factionSetStatus(crew.id, "Custom", 1, crew.revision, null));
      expect(JSON.parse(fetch.mock.calls[2]?.[1].body)).toEqual({ name: "Custom", status: 1, tier: null });
    } finally { vi.unstubAllGlobals(); }
  });

  it("loads core bounds, offers only tracked names, and retains failed drafts", async () => {
    const crew = { ...fixture(), startingFactions: { ally: "Custom ally", rival: "" }, factions: [{ name: "Custom ally", status: -1, tier: 8 }] };
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return response({ ok: false, applied: { op: "faction.set-status" }, sideEffects: [], error: { code: "VALIDATION", status: 400, message: "Rejected draft", retryable: false, recovery: "Correct the draft", details: { issues: [{ pointer: "/tier", reason: "Rejected draft", expected: "nonnegative integer" }] } } }, 400);
      if (url === `/api/crews/${crew.id}`) return response(crew);
      if (url === `/api/games/${crew.gameStem}`) return response({ FactionStatus: { Min: -5, Max: 7 } });
      return response({});
    });
    vi.stubGlobal("fetch", fetch);
    const root = document.createElement("div");
    const dispose = mountCrewDetailPage(root, crew.id);
    try {
      await vi.waitFor(() => expect(root.querySelector('input[aria-label="Faction status"]')?.getAttribute("max")).toBe("7"));
      expect(root.querySelector(".starting-factions-current")?.textContent).toContain("Custom ally");
      expect(Array.from(root.querySelectorAll('select[aria-label="Starting ally"] option')).map((option) => option.textContent)).toEqual(["None", "Custom ally"]);
      const name = root.querySelector<HTMLInputElement>('input[aria-label="Faction name"]')!;
      name.value = "My new faction";
      name.dispatchEvent(new Event("input"));
      const tier = root.querySelector<HTMLInputElement>('input[aria-label="Faction tier"]')!;
      tier.value = "12";
      tier.dispatchEvent(new Event("input"));
      root.querySelector<HTMLButtonElement>('button[title="Add faction"]')!.click();
      await vi.waitFor(() => expect(root.querySelector(".error")?.textContent).toContain("Correct the draft"));
      expect(root.querySelector<HTMLInputElement>('input[aria-label="Faction name"]')?.value).toBe("My new faction");
      expect(root.querySelector<HTMLInputElement>('input[aria-label="Faction tier"]')?.value).toBe("12");
      expect(JSON.parse(fetch.mock.calls.find(([, init]) => init?.method === "POST")![1]!.body as string)).toEqual({ name: "My new faction", status: 0, tier: 12 });
    } finally { dispose(); vi.unstubAllGlobals(); }
  });

  it("keeps manual entry usable without bounds and rejects fractional tiers", async () => {
    const crew = { ...fixture(), factions: [] };
    const fetch = vi.fn(async (url: string) => response(url === `/api/crews/${crew.id}` ? crew : {}));
    vi.stubGlobal("fetch", fetch);
    const root = document.createElement("div");
    const dispose = mountCrewDetailPage(root, crew.id);
    try {
      await vi.waitFor(() => expect(root.textContent).toContain("Status bounds unavailable"));
      const status = root.querySelector<HTMLInputElement>('input[aria-label="Faction status"]')!;
      expect(status.hasAttribute("min")).toBe(false);
      expect(status.hasAttribute("max")).toBe(false);
      const name = root.querySelector<HTMLInputElement>('input[aria-label="Faction name"]')!;
      name.value = "Custom";
      name.dispatchEvent(new Event("input"));
      const tier = root.querySelector<HTMLInputElement>('input[aria-label="Faction tier"]')!;
      tier.value = "1.5";
      tier.dispatchEvent(new Event("input"));
      root.querySelector<HTMLButtonElement>('button[title="Add faction"]')!.click();
      expect(fetch.mock.calls.some((call) => String(call[0]).includes("/ops/"))).toBe(false);
      expect(root.querySelector(".faction-validation")?.textContent).toContain("nonnegative integer");
      expect(root.querySelector<HTMLInputElement>('input[aria-label="Faction tier"]')?.value).toBe("1.5");
    } finally { dispose(); vi.unstubAllGlobals(); }
  });

  it("saves both starting choices together without changing faction status", async () => {
    const crew = { ...fixture(), factions: [{ name: "Home ally", status: -2 }, { name: "Home rival", status: 2 }] };
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return response({ ok: true, crew: { ...crew, revision: crew.revision + 1, startingFactions: { ally: "Home ally", rival: "Home rival" } }, applied: { op: "faction.set-starting" }, sideEffects: [], error: null });
      }
      return response(url === `/api/crews/${crew.id}` ? crew : {});
    });
    vi.stubGlobal("fetch", fetch);
    const root = document.createElement("div");
    const dispose = mountCrewDetailPage(root, crew.id);
    try {
      await vi.waitFor(() => expect(root.querySelector('select[aria-label="Starting ally"]')).not.toBeNull());
      for (const [label, value] of [["Starting ally", "Home ally"], ["Starting rival", "Home rival"]]) {
        const select = root.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
        select.value = value!;
        select.dispatchEvent(new Event("change"));
      }
      root.querySelector<HTMLButtonElement>('button[title="Save starting factions"]')!.click();
      await vi.waitFor(() => expect(root.querySelector(".starting-factions-current")?.textContent).toContain("Home rival"));
      const posts = fetch.mock.calls.filter(([, init]) => init?.method === "POST");
      expect(posts).toHaveLength(1);
      expect(posts[0]![0]).toBe(`/api/crews/${crew.id}/ops/faction.set-starting`);
      expect(JSON.parse(posts[0]![1]!.body as string)).toEqual({ ally: "Home ally", rival: "Home rival" });
      expect(root.querySelector<HTMLInputElement>('input[aria-label="Set status for Home ally"]')?.value).toBe("-2");
    } finally { dispose(); vi.unstubAllGlobals(); }
  });

  it("preserves starting drafts through stale recovery and uses the refreshed revision", async () => {
    const crew = { ...fixture(), factions: [{ name: "Custom", status: 0 }] };
    let reads = 0;
    let posts = 0;
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts++;
        if (posts === 1) return response({
          ok: false, applied: { op: "faction.set-starting" }, sideEffects: [],
          error: { code: "STALE_REVISION", status: 409, message: "Changed elsewhere", retryable: true, recovery: "Refresh", details: { currentRevision: 6 } },
        }, 409);
        return response({ ok: true, crew: { ...crew, revision: 7, startingFactions: { ally: "Custom", rival: "" } }, applied: { op: "faction.set-starting" }, sideEffects: [], error: null });
      }
      if (url === `/api/crews/${crew.id}`) {
        reads++;
        return response({ ...crew, revision: reads === 1 ? 5 : 6 });
      }
      return response({});
    });
    vi.stubGlobal("fetch", fetch);
    const root = document.createElement("div");
    const dispose = mountCrewDetailPage(root, crew.id);
    try {
      await vi.waitFor(() => expect(root.querySelector('select[aria-label="Starting ally"]')).not.toBeNull());
      const ally = root.querySelector<HTMLSelectElement>('select[aria-label="Starting ally"]')!;
      ally.value = "Custom";
      ally.dispatchEvent(new Event("change"));
      root.querySelector<HTMLButtonElement>('button[title="Save starting factions"]')!.click();
      await vi.waitFor(() => expect(root.textContent).toContain("Sheet refreshed because it changed elsewhere"));
      expect(root.querySelector<HTMLSelectElement>('select[aria-label="Starting ally"]')?.value).toBe("Custom");
      root.querySelector<HTMLButtonElement>('button[title="Save starting factions"]')!.click();
      await vi.waitFor(() => expect(posts).toBe(2));
      const requests = fetch.mock.calls.filter(([, init]) => init?.method === "POST");
      expect((requests[1]![1]!.headers as Record<string, string>)["If-Match"]).toBe("6");
    } finally { dispose(); vi.unstubAllGlobals(); }
  });

  it("sends null to clear a tracked tier while retaining its status", async () => {
    const crew = { ...fixture(), factions: [{ name: "Custom", status: 2, tier: 9 }] };
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return response({ ok: true, crew: { ...crew, revision: 6, factions: [{ name: "Custom", status: 2 }] }, applied: { op: "faction.set-status", requested: 2, effective: 2 }, sideEffects: [], error: null });
      return response(url === `/api/crews/${crew.id}` ? crew : {});
    });
    vi.stubGlobal("fetch", fetch);
    const root = document.createElement("div");
    const dispose = mountCrewDetailPage(root, crew.id);
    try {
      await vi.waitFor(() => expect(root.querySelector('input[aria-label="Set tier for Custom"]')).not.toBeNull());
      const tier = root.querySelector<HTMLInputElement>('input[aria-label="Set tier for Custom"]')!;
      tier.value = "";
      tier.dispatchEvent(new Event("input"));
      root.querySelector<HTMLButtonElement>('button[title="Set status for Custom"]')!.click();
      await vi.waitFor(() => expect(fetch.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
      expect(JSON.parse(fetch.mock.calls.find(([, init]) => init?.method === "POST")![1]!.body as string)).toEqual({ name: "Custom", status: 2, tier: null });
    } finally { dispose(); vi.unstubAllGlobals(); }
  });
  it("preserves the exact stored faction name when updating an existing row", async () => {
    const name = " Custom faction ";
    const crew = { ...fixture(), factions: [{ name, status: 2, tier: 9 }] };
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return response({
        ok: true, crew, applied: { op: "faction.set-status", requested: 2, effective: 2 }, sideEffects: [], error: null,
      });
      return response(url === `/api/crews/${crew.id}` ? crew : {});
    });
    vi.stubGlobal("fetch", fetch);
    const root = document.createElement("div");
    const dispose = mountCrewDetailPage(root, crew.id);
    try {
      await vi.waitFor(() => expect(root.querySelector(".faction-entry button")).not.toBeNull());
      root.querySelector<HTMLButtonElement>(".faction-entry button")!.click();
      await vi.waitFor(() => expect(fetch.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
      expect(fetch.mock.calls.find(([, init]) => init?.method === "POST")![1]!.body)
        .toBe(JSON.stringify({ name, status: 2, tier: 9 }));
    } finally { dispose(); vi.unstubAllGlobals(); }
  });
});
