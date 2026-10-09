// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mountCharacterDetailPage } from "./character-detail.js";
import { decodeCharacterEither } from "../schema/character.js";

// GAME-MODE-03 sheet behaviour: mode panel, Score popups and loadout, Resolution
// stepper and crew editors, entanglement filter, downtime tracker. Every
// assertion targets the rendered sheet; the page is mounted with fixtures and
// the API is routed by URL.

const CHARACTER_ID = "c46ba7cb-993b-4fc7-974d-fb95eacd5446";
const CREW_ID = "b1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const ORDER_OK = { ok: true, applied: { op: "x" }, sideEffects: [], error: null };

function characterDTO(overrides: Record<string, unknown> = {}) {
  return {
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
    mode: "free-play",
    modeFlow: { kind: "none", step: "" },
    downtime: { free: 2, paid: 0, spent: 0, activities: [] },
    dossier: {
      name: "Brenda Hilton",
      crewId: CREW_ID,
      alias: "Webweaver",
      look: "Keen",
      notes: [],
      background: { name: "Urchin", description: "" },
      heritage: { name: "Akorosi", description: "" },
      vice: { name: "Gambling", description: "", purveyor: { name: "", description: "" } },
    },
    monitor: {
      stress: { current: 3, max: 9 },
      trauma: { traumas: [], max: 4 },
      harm: { lesser: [], moderate: [], severe: [], fatal: [], healingClock: { segments: 0, size: 6, rollover: 0 } },
      armor: { standardUsed: false, heavyUsed: false, specialUsed: false, hasStandard: true, hasHeavy: false, hasSpecial: false },
    },
    talent: { attributes: [] },
    playbook: { name: "Spider", experience: { points: 4, max: 8 }, abilities: [] },
    gear: {
      loadout: [{ name: "Fine lockpicks", bulk: 0 }],
      availableGear: [{ name: "Climbing gear", bulk: 2 }],
      commitment: "normal",
      isCommitmentLocked: false,
      maxBulk: 5,
    },
    fund: { satchel: { coins: 3, max: 2 }, stash: { coins: 0, max: 8 } },
    contacts: [],
    session: { playbookExpressions: 0, characterExpressions: 0, struggleExpressions: 0, max: 3 },
    notebook: "",
    ...overrides,
  };
}

function crewDTO(overrides: Record<string, unknown> = {}) {
  return {
    kind: "crew",
    id: CREW_ID,
    gameStem: "blades-in-the-dark",
    gameName: "Blades in the Dark",
    language: "en",
    revision: 4,
    formatVersion: 1,
    createdAt: "2026-07-22T00:00:00.000Z",
    updatedAt: "2026-07-22T00:00:00.000Z",
    crewTypeName: "Assassins",
    name: "The Drowned Bells",
    lair: "",
    reputation: "ruthless",
    huntingGrounds: "",
    tier: 1,
    hold: "weak",
    heat: { current: 4, max: 9 },
    wanted: { current: 2, max: 4 },
    rep: { current: 5, max: 12 },
    experience: { points: 1, max: 8 },
    specialAbilities: [],
    upgrades: [],
    cohorts: [],
    contacts: [],
    factions: [],
    coin: 3,
    stash: 0,
    stashCapacity: 4,
    notes: [],
    turf: 0,
    claimedClaimIds: [],
    claimOverrides: [],
    ...overrides,
  };
}

const GAME_DATA = {
  Name: "Blades in the Dark",
  StressMax: 9,
  TraumaMax: 4,
  Attributes: [{ Name: "Insight", Actions: [] }, { Name: "Prowess", Actions: [] }, { Name: "Resolve", Actions: [] }],
  LoadMaxima: { MaxBulk: 9, CommitmentMaxBulk: { Light: 3, Normal: 5, Heavy: 6, Encumbered: 9 } },
  DowntimeSettings: { FreeActivities: 2 },
  Traumas: [],
  Vices: [],
  Heritages: [],
  Backgrounds: [],
  Playbooks: [],
};

const PLAYBOOK_DATA = { Name: "Spider", SpecialAbilities: [], Items: [], Rolodex: { Name: "Friends", Friends: [] }, DefaultActionPoints: [] };

/** Routes every API call by URL; ops answer with the (possibly updated) character. */
function mockApi(dto: Record<string, unknown>, crew: Record<string, unknown> | null = crewDTO()) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const request = init ?? {};
    calls.push({ url, init: request });
    const respond = (data: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify(data) });
    if (url === `/api/characters/${CHARACTER_ID}`) return respond(dto);
    if (url.endsWith("/capabilities")) return respond({});
    if (url.endsWith("/history")) return respond([]);
    if (url === "/api/clocks") return respond([]);
    if (url === "/api/crews") return respond(crew ? [{ kind: "crew", id: CREW_ID, name: "The Drowned Bells", tier: 1 }] : []);
    if (url === `/api/crews/${CREW_ID}`) return crew ? respond(crew) : { ok: false, status: 404, text: async () => "{}" };
    if (url === "/api/games/blades-in-the-dark") return respond(GAME_DATA);
    if (url.includes("/playbooks/")) return respond(PLAYBOOK_DATA);
    if (url.includes("/ops/") || url.endsWith("/ops/mode.set")) return respond({ ...ORDER_OK, character: dto });
    if (url.includes("/crews/") && url.includes("/ops/")) return respond({ ...ORDER_OK, crew });
    return respond({});
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return { fetchMock, calls };
}

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement("div");
  document.body.append(root);
});

async function mountWith(dto: Record<string, unknown>, crew: Record<string, unknown> | null = crewDTO()) {
  const api = mockApi(dto, crew);
  mountCharacterDetailPage(root, CHARACTER_ID);
  await vi.waitFor(() => {
    expect(root.querySelector(".mode-panel")).not.toBeNull();
  });
  return api;
}

describe("GAME-MODE-03 sheet", () => {
  it("shows the mode switch with Free Play selected and Personal always visible", async () => {
    await mountWith(characterDTO());
    const pressed = Array.from(root.querySelectorAll(".mode-switch button")).map((b) => [b.textContent, b.getAttribute("aria-pressed")]);
    expect(pressed).toEqual([["Free Play", "true"], ["Score", "false"], ["Downtime", "false"]]);
    expect(root.querySelector('[data-section="personal"]')).not.toBeNull();
    expect(root.querySelector(".game-mode-popup")).toBeNull();
    expect(root.querySelector(".resolution-stepper")).toBeNull();
  });

  it("switching to Score posts mode.set with the chosen mode and If-Match", async () => {
    const { calls } = await mountWith(characterDTO());
    const score = Array.from(root.querySelectorAll(".mode-switch button")).find((b) => b.textContent === "Score") as HTMLButtonElement;
    score.click();
    await vi.waitFor(() => {
      const call = calls.find((c) => c.url.endsWith("/ops/mode.set"));
      expect(call).toBeTruthy();
      expect(call!.init.body).toBe(JSON.stringify({ mode: "score" }));
      expect((call!.init.headers as Record<string, string>)["If-Match"]).toBe("12");
    });
  });

  it("Score collapses Projects and Contacts and shows the committed loadout with a confirmed change", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "none", step: "" } }));
    expect(root.querySelector("details.score-collapsed")).not.toBeNull();
    const collapsed = Array.from(root.querySelectorAll("details.score-collapsed summary")).map((s) => s.textContent);
    expect(collapsed).toEqual(["Projects", "Contacts"]);
    expect(root.querySelector('[data-section="projects"]')).not.toBeNull();
    expect(root.querySelector('[data-section="committed-loadout"]')?.textContent).toContain("Fine lockpicks");
    expect(root.querySelector('button[title]')).not.toBeNull();
    const desperate = Array.from(root.querySelectorAll(".mode-panel button")).find((b) => b.textContent === "+ Desperate action XP");
    expect(desperate).toBeTruthy();
    const change = Array.from(root.querySelectorAll('[data-section="committed-loadout"] button')).find((b) => b.textContent === "Change loadout") as HTMLButtonElement;
    change.click();
    await vi.waitFor(() => {
      expect(root.querySelector(".game-mode-confirm")?.textContent).toContain("Back cancels; Confirm commits.");
    });
  });

  it("opens the Score Planning popup from the stored cursor and reads load limits from settings", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "score-start", step: "loadout" } }));
    expect(root.querySelector(".game-mode-popup")?.getAttribute("aria-label")).toBe("Score loadout");
    const limits = Array.from(root.querySelectorAll(".game-mode-popup button"))
      .map((b) => b.textContent)
      .filter((t) => t?.includes("·"));
    expect(limits).toEqual(["Light · 3", "Normal · 5", "Heavy · 6"]);
  });

  it("walks the Resolution stepper with stored steps and shows the one-player warning on crew editors", async () => {
    const { calls } = await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "resolution", step: "payoff" } }));
    const steps = Array.from(root.querySelectorAll(".resolution-stepper li")).map((li) => li.textContent);
    expect(steps).toHaveLength(6);
    expect(root.querySelector(".resolution-stepper [aria-current='step']")?.textContent).toContain("payoff");
    await vi.waitFor(() => {
      expect(root.querySelector('[data-crew-track="rep"]')).not.toBeNull();
    });
    expect(root.querySelector("[data-crew-track='rep']")?.textContent).toContain(
      "Only one player should update the crew — check nobody else already has.",
    );
    const next = Array.from(root.querySelectorAll(".game-mode-resolution button")).find((b) => b.textContent === "Next") as HTMLButtonElement;
    next.click();
    await vi.waitFor(() => {
      const call = calls.find((c) => c.url.endsWith("/ops/mode.flow.set"));
      expect(call).toBeTruthy();
      expect(call!.init.body).toBe(JSON.stringify({ kind: "resolution", step: "heat" }));
    });
  });

  it("crew writes send the observed crew revision as If-Match", async () => {
    const { calls } = await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "resolution", step: "heat" } }));
    await vi.waitFor(() => {
      expect(root.querySelector('[data-crew-track="heat"]')).not.toBeNull();
    });
    const editor = root.querySelector('[data-crew-track="heat"]')!;
    const amount = editor.querySelector("input") as HTMLInputElement;
    amount.value = "1";
    const apply = editor.querySelector("button") as HTMLButtonElement;
    apply.click();
    await vi.waitFor(() => {
      const call = calls.find((c) => c.url === `/api/crews/${CREW_ID}/ops/heat.add`);
      expect(call).toBeTruthy();
      expect((call!.init.headers as Record<string, string>)["If-Match"]).toBe("4");
      expect(call!.init.body).toBe(JSON.stringify({ delta: 1 }));
    });
  });

  it("Skip on an optional Resolution step asks for confirmation before advancing", async () => {
    const { calls } = await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "resolution", step: "crew-xp" } }));
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const skip = Array.from(root.querySelectorAll(".game-mode-resolution button")).find((b) => b.textContent === "Skip") as HTMLButtonElement;
    skip.click();
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(calls.some((c) => c.url.endsWith("/ops/mode.flow.set"))).toBe(false);
    confirmSpy.mockReturnValue(true);
    skip.click();
    await vi.waitFor(() => {
      const call = calls.find((c) => c.url.endsWith("/ops/mode.flow.set"));
      expect(call).toBeTruthy();
      expect(call!.init.body).toBe(JSON.stringify({ kind: "resolution", step: "crew-rep" }));
    });
    confirmSpy.mockRestore();
  });

  it("skipping the whole Resolution asks for confirmation and clears the workflow cursor", async () => {
    const { calls } = await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "resolution", step: "payoff" } }));
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const skipAll = Array.from(root.querySelectorAll(".game-mode-resolution button")).find((b) => b.textContent === "Skip Resolution") as HTMLButtonElement;
    skipAll.click();
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(calls.some((c) => c.url.endsWith("/ops/mode.flow.set"))).toBe(false);
    confirmSpy.mockReturnValue(true);
    skipAll.click();
    await vi.waitFor(() => {
      const call = calls.find((c) => c.url.endsWith("/ops/mode.flow.set"));
      expect(call).toBeTruthy();
      expect(call!.init.body).toBe(JSON.stringify({ kind: "none", step: "" }));
    });
    confirmSpy.mockRestore();
  });

  it("filters entanglements by crew heat and reveals the full table with Show all", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "resolution", step: "entanglements" } }), crewDTO({ heat: { current: 4, max: 9 } }));
    await vi.waitFor(() => {
      expect(root.querySelector("[data-heat-band]")).not.toBeNull();
    });
    expect(Array.from(root.querySelectorAll("[data-heat-band]")).map((p) => p.getAttribute("data-heat-band"))).toEqual(["4–5"]);
    const showAll = Array.from(root.querySelectorAll(".game-mode-resolution button")).find((b) => b.textContent === "Show all") as HTMLButtonElement;
    showAll.click();
    await vi.waitFor(() => {
      expect(Array.from(root.querySelectorAll("[data-heat-band]")).map((p) => p.getAttribute("data-heat-band"))).toEqual(["1–3", "4–5", "6"]);
    });
  });

  it("shows the downtime budget as remaining of free plus paid, and never blocks a spend when over", async () => {
    const { calls } = await mountWith(characterDTO({ mode: "downtime", downtime: { free: 2, paid: 0, spent: 3, activities: [] } }));
    const remaining = root.querySelector("[data-downtime-remaining]");
    expect(remaining?.getAttribute("data-downtime-remaining")).toBe("-1");
    expect(root.querySelector(".mode-panel .notice")?.textContent).toContain("Over the soft budget");
    const train = Array.from(root.querySelectorAll(".mode-panel button")).find((b) => b.textContent === "Train") as HTMLButtonElement;
    expect(train.disabled).toBe(false);
    train.click();
    await vi.waitFor(() => {
      const call = calls.find((c) => c.url.endsWith("/ops/downtime.spend"));
      expect(call).toBeTruthy();
      expect(call!.init.body).toBe(JSON.stringify({ activity: "train", description: "" }));
    });
  });

  it("requires the stored mode, flow and downtime fields in the Character decoder (contract required list)", () => {
    for (const field of ["mode", "modeFlow", "downtime"]) {
      const dto = characterDTO() as Record<string, unknown>;
      delete dto[field];
      expect(decodeCharacterEither(dto)._tag, `missing ${field} must not decode`).toBe("Left");
    }
    expect(decodeCharacterEither(characterDTO())._tag).toBe("Right");
  });

  it("explicit adjust posts coin/gift/correction to downtime.adjust without a mode change", async () => {
    const { calls } = await mountWith(characterDTO({ mode: "downtime" }));
    const gift = Array.from(root.querySelectorAll(".mode-panel button")).find((b) => b.textContent === "+1 (gift)") as HTMLButtonElement;
    gift.click();
    await vi.waitFor(() => {
      const call = calls.find((c) => c.url.endsWith("/ops/downtime.adjust"));
      expect(call).toBeTruthy();
      expect(call!.init.body).toBe(JSON.stringify({ delta: 1, reason: "gift" }));
    });
  });
});
