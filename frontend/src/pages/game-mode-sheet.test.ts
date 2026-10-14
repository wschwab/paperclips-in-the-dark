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
  Playbooks: [{ Name: "Cutter", ExperienceCondition: "You addressed a challenge with violence or coercion" }],
};

const PLAYBOOK_DATA = { Name: "Spider", SpecialAbilities: [], Items: [], Rolodex: { Name: "Friends", Friends: [] }, DefaultActionPoints: [] };

/** Crew game data: the Assassins crew type carries its own ExperienceTrigger (CREW-XP-INFO-01). */
const CREW_GAME_DATA = {
  Name: "Blades in the Dark",
  CrewTypes: [{ Name: "Assassins", ExperienceTrigger: "Execute a successful murder, ransom, or assassination operation." }],
};

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
    if (url === "/api/games/blades-in-the-dark/crews") return respond(CREW_GAME_DATA);
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
      expect(root.querySelector(".game-mode-confirm")?.textContent).toContain("Your scoundrel is already on a score.");
    expect(Array.from(root.querySelectorAll(".game-mode-confirm button")).map((b) => b.textContent)).toContain("Confirm change");
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

  it("Score Loadout popup shows the load choices with the gear checklist and the approved footer", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "score-start", step: "loadout" } }));
    const popup = root.querySelector(".game-mode-popup")!;
    expect(popup, "popup present").not.toBeNull();
    const labels = Array.from(popup.querySelectorAll("label.gear")).map((l) => l.textContent?.replace(/\s+/g, " ").trim());
    expect(labels).toEqual(expect.arrayContaining(["Fine lockpicks 0 load", "Climbing gear 2 load"]));
    expect(popup.querySelectorAll("label.gear input[type='checkbox']").length).toBeGreaterThanOrEqual(2);
    const footer = Array.from(popup.querySelectorAll("button")).map((b) => b.textContent);
    expect(footer).toEqual(expect.arrayContaining(["Back", "Leave flow", "Next: Engagement"]));
    expect(popup.textContent).toContain("Choose items now or declare more during the score");
    expect(popup.textContent).toContain("never blocks play");
  });

  it("Resolution Payoff shows the approved coin table, the tithe rule and the Leave flow footer", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "resolution", step: "payoff" } }));
    const body = root.querySelector(".game-mode-resolution")!;
    expect(body.textContent).toContain("A minor job; several full purses");
    expect(body.textContent).toContain("A major score; impressive loot");
    expect(body.textContent).toContain("crew Tier + 1 coin");
    const footer = Array.from(body.querySelectorAll("button")).map((b) => b.textContent);
    expect(footer).toEqual(expect.arrayContaining(["Back", "Leave flow", "Next"]));
  });

  it("walks the Resolution stepper with stored steps and shows the one-player warning on crew editors", async () => {
    const { calls } = await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "resolution", step: "payoff" } }));
    const steps = Array.from(root.querySelectorAll(".resolution-stepper li")).map((li) => li.textContent);
    expect(steps).toHaveLength(6);
    expect(root.querySelector(".resolution-stepper [aria-current='step']")?.textContent).toContain("Payoff");
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

  it("shows the downtime budget as remaining of free plus paid, and never blocks a spend when over", async () => {
    const { calls } = await mountWith(characterDTO({ mode: "downtime", downtime: { free: 2, paid: 0, spent: 3, activities: [] } }));
    const remaining = root.querySelector("[data-downtime-remaining]");
    expect(remaining?.getAttribute("data-downtime-remaining")).toBe("-1");
    expect(root.querySelector(".mode-panel .notice")?.textContent).toContain("Over the soft budget");
    const train = Array.from(root.querySelectorAll('[data-section="downtime-activities"] button')).find((b) => b.textContent === "Train") as HTMLButtonElement;
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

// Luna FAIL findings on revision 654c3cff (GAME-MODE-03 review). Each test pins
// the approved mockup behaviour; expected copy is quoted from docs/public/mockups/game-mode.
describe("GAME-MODE-03 approved surfaces (Luna review findings)", () => {
  it("Planning is an overlay dialog (aria-modal) outside the sheet, with the six approach descriptions", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "score-start", step: "planning" } }));
    const dialog = root.querySelector(".game-mode-popup")!;
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.closest(".character-detail")).toBeNull();
    const text = dialog.textContent ?? "";
    expect(text).toContain("Do violence to a target.");
    expect(text).toContain("Lure, trick, or manipulate.");
    expect(text).toContain("Trespass unseen.");
    expect(text).toContain("Engage a supernatural power.");
    expect(text).toContain("Negotiate, bargain, or persuade.");
    expect(text).toContain("Carry cargo or people through danger.");
    const footer = Array.from(dialog.querySelectorAll("button")).map((b) => b.textContent);
    expect(footer).toEqual(expect.arrayContaining(["Back", "Leave flow", "Next: Loadout"]));
  });

  it("Engagement footer ends with Enter Score and shows the approved starting-position reminder", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "score-start", step: "engagement" } }));
    const dialog = root.querySelector(".game-mode-popup")!;
    const footer = Array.from(dialog.querySelectorAll(".game-mode-popup-footer button")).map((b) => b.textContent);
    expect(footer).toEqual(["Back", "Leave flow", "Enter Score"]);
    expect(dialog.textContent).toContain("Critical: past the first obstacle, controlled next");
    expect(dialog.textContent).toContain("This reminder doesn’t roll dice or require a result.");
  });

  it("Change loadout opens a confirmation with Light/Normal/Heavy, gear checkboxes and Back/Leave flow/Confirm change", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "none", step: "" } }));
    const change = Array.from(root.querySelectorAll('[data-section="committed-loadout"] button')).find((b) => b.textContent === "Change loadout") as HTMLButtonElement;
    change.click();
    await vi.waitFor(() => {
      expect(root.querySelector(".game-mode-confirm")).not.toBeNull();
    });
    const confirm = root.querySelector(".game-mode-confirm")!;
    expect(Array.from(confirm.querySelectorAll("button")).map((b) => b.textContent)).toEqual(expect.arrayContaining(["Light · 3", "Normal · 5", "Heavy · 6"]));
    expect(confirm.querySelectorAll("input[type='checkbox']").length).toBeGreaterThanOrEqual(2);
    expect(Array.from(confirm.querySelectorAll("button")).map((b) => b.textContent)).toEqual(expect.arrayContaining(["Back", "Leave flow", "Confirm change"]));
    // The proposed level starts at the current commitment (normal), not the first choice.
    expect(confirm.querySelector("button[aria-pressed='true']")?.textContent).toBe("Normal · 5");
  });

  it("Change loadout Back cancels the proposal and sends no gear write; Confirm change applies the proposed items", async () => {
    const { calls } = await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "none", step: "" } }));
    const openChange = () => (Array.from(root.querySelectorAll('[data-section="committed-loadout"] button')).find((b) => b.textContent === "Change loadout") as HTMLButtonElement).click();
    openChange();
    await vi.waitFor(() => expect(root.querySelector(".game-mode-confirm")).not.toBeNull());
    const confirm = root.querySelector(".game-mode-confirm")!;
    // Uncheck "Fine lockpicks" and check "Climbing gear" in the proposal.
    const boxes = Array.from(confirm.querySelectorAll("input[type='checkbox']")) as HTMLInputElement[];
    const lock = boxes.find((b) => b.closest("label")?.textContent?.includes("Fine lockpicks"))!;
    const climb = boxes.find((b) => b.closest("label")?.textContent?.includes("Climbing gear"))!;
    lock.click();
    climb.click();
    (Array.from(confirm.querySelectorAll("button")).find((b) => b.textContent === "Back") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(root.querySelector(".game-mode-confirm")).toBeNull());
    expect(calls.some((c) => c.url.includes("/ops/gear."))).toBe(false);

    openChange();
    await vi.waitFor(() => expect(root.querySelector(".game-mode-confirm")).not.toBeNull());
    // Re-query after each click: every checkbox change re-renders the proposal.
    const box = (name: string) => Array.from(root.querySelectorAll(".game-mode-confirm input[type='checkbox']") as NodeListOf<HTMLInputElement>)
      .find((b) => b.closest("label")?.textContent?.includes(name))!;
    box("Fine lockpicks").click();
    await vi.waitFor(() => expect(box("Climbing gear").checked).toBe(false));
    box("Climbing gear").click();
    await vi.waitFor(() => expect(box("Climbing gear").checked).toBe(true));
    (Array.from(root.querySelectorAll(".game-mode-confirm button")).find((b) => b.textContent === "Confirm change") as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(calls.some((c) => c.url.endsWith("/ops/gear.uncommit"))).toBe(true);
      expect(calls.some((c) => c.url.endsWith("/ops/gear.commit"))).toBe(true);
    });
  });

  it("End Score with partial stress does not claim stress was cleared", async () => {
    const dto = characterDTO({ mode: "score", modeFlow: { kind: "none", step: "" } });
    const endedDto = characterDTO({ mode: "score", revision: 13, modeFlow: { kind: "resolution", step: "scoundrel-xp" } });
    const api = mockApi(dto);
    const base = global.fetch as unknown as (url: string, init?: RequestInit) => Promise<unknown>;
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === `/api/characters/${CHARACTER_ID}/end-score`) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, character: endedDto, applied: { op: "end-score" }, sideEffects: [], error: null }) };
      }
      return base(url, init);
    }) as unknown as typeof fetch;
    void api;
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    mountCharacterDetailPage(root, CHARACTER_ID);
    await vi.waitFor(() => expect(root.querySelector(".mode-panel")).not.toBeNull());
    (Array.from(root.querySelectorAll(".mode-panel button")).find((b) => b.textContent === "End Score") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(root.textContent).toContain("Score ended"));
    expect(root.textContent).not.toContain("stress cleared");
    expect(root.textContent).toContain("partial stress kept");
    confirmSpy.mockRestore();
  });

  it("direct crew editors use the approved update labels per step", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "resolution", step: "payoff" } }));
    await vi.waitFor(() => expect(root.querySelector('[data-crew-track="rep"]')).not.toBeNull());
    expect(root.querySelector('[data-crew-track="rep"] button')?.textContent).toBe("Update crew");
    expect(root.querySelector('[data-crew-track="coin"] button')?.textContent).toBe("Update crew");
  });

  it("Crew XP and Crew Rep use the approved update labels, and Crew Rep offers a confirmed Skip and Next: Downtime", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "resolution", step: "crew-xp" } }));
    await vi.waitFor(() => expect(root.querySelector('[data-crew-track="xp"]')).not.toBeNull());
    expect(root.querySelector('[data-crew-track="xp"] button')?.textContent).toBe("Update crew XP");
    cleanupRoot();
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "resolution", step: "crew-rep" } }));
    await vi.waitFor(() => expect(root.querySelector('[data-crew-track="rep"]')).not.toBeNull());
    expect(root.querySelector('[data-crew-track="rep"] button')?.textContent).toBe("Update crew rep");
    const footer = Array.from(root.querySelectorAll(".game-mode-resolution .game-mode-popup-footer button")).map((b) => b.textContent);
    expect(footer).toEqual(["Back", "Skip", "Skip Resolution", "Leave flow", "Next: Downtime"]);
  });

  it("the Downtime activity menu lives in the sheet (above the fixed footer on narrow), not only in the panel", async () => {
    await mountWith(characterDTO({ mode: "downtime", downtime: { free: 2, paid: 0, spent: 0, activities: [] } }));
    const menu = root.querySelector('[data-section="downtime-activities"]');
    expect(menu).not.toBeNull();
    expect(menu!.closest(".mode-panel")).toBeNull();
    expect(Array.from(menu!.querySelectorAll("button")).map((b) => b.textContent)).toEqual(expect.arrayContaining(["Acquire Asset", "Train", "Other"]));
  });
});

describe("GAME-MODE-03 Sol round-3 Planning cards (R3-03)", () => {
  it("R3-03: each Planning approach is one selectable card holding its title and description", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "score-start", step: "planning" } }));
    const cards = Array.from(root.querySelectorAll<HTMLButtonElement>(".game-mode-popup .approach-card"));
    expect(cards).toHaveLength(6);
    for (const card of cards) {
      expect(card.tagName).toBe("BUTTON");
      expect(card.getAttribute("aria-pressed")).not.toBeNull();
    }
    expect(cards[2]!.textContent).toContain("Stealth");
    expect(cards[2]!.textContent).toContain("Trespass unseen.");
  });

  it("R3-03: clicking the description itself selects the approach", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "score-start", step: "planning" } }));
    const stealth = Array.from(root.querySelectorAll<HTMLButtonElement>(".game-mode-popup .approach-card"))[2]!;
    const description = Array.from(stealth.querySelectorAll("span, p")).find((n) => n.textContent === "Trespass unseen.") as HTMLElement;
    description.click();
    await vi.waitFor(() => {
      const card = Array.from(root.querySelectorAll<HTMLButtonElement>(".game-mode-popup .approach-card"))[2]!;
      expect(card.getAttribute("aria-pressed")).toBe("true");
    });
  });
});

describe("GAME-MODE-03 Sol round-3 narrow Downtime card (R3-02)", () => {
  it("R3-02: the sheet activities card carries the budget readout and adjustments, not only the panel", async () => {
    await mountWith(characterDTO({ mode: "downtime", downtime: { free: 2, paid: 1, spent: 0, activities: [] } }));
    const card = root.querySelector('[data-section="downtime-activities"]')!;
    expect(card.querySelector("[data-downtime-remaining]")).not.toBeNull();
    const labels = Array.from(card.querySelectorAll("button")).map((b) => b.textContent);
    expect(labels).toEqual(expect.arrayContaining(["+1 (coin)", "+1 (gift)", "−1"]));
  });

  it("R3-02: the activity menu is one two-column grid in the sheet card, with Other last and spanning the row", async () => {
    await mountWith(characterDTO({ mode: "downtime", downtime: { free: 2, paid: 1, spent: 0, activities: [] } }));
    const menu = root.querySelector('[data-section="downtime-activities"] .activity-menu')!;
    expect(menu).not.toBeNull();
    const labels = Array.from(menu.querySelectorAll("button")).map((b) => b.textContent);
    expect(labels[labels.length - 1]).toBe("Other");
    expect(labels).toHaveLength(7);
    // The layout belongs to the stylesheet: an inline display would override the sheet grid.
    expect(menu.getAttribute("style") ?? "").not.toContain("display");
  });
});

describe("GAME-MODE-03 Sol round-3 first-step Back (R3-01)", () => {
  it("R3-01: the first Resolution step's Back is enabled and returns to the Score sheet", async () => {
    const { calls } = await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "resolution", step: "scoundrel-xp" } }));
    const back = Array.from(root.querySelectorAll(".game-mode-resolution button")).find((b) => b.textContent === "Back") as HTMLButtonElement;
    expect(back.disabled).toBe(false);
    back.click();
    await vi.waitFor(() => {
      const call = calls.find((c) => c.url.endsWith("/ops/mode.flow.set"));
      expect(call).toBeTruthy();
      expect(call!.init.body).toBe(JSON.stringify({ kind: "none", step: "" }));
    });
  });
});

describe("GAME-MODE-03 F7 residual layout (Sol focused check, 8642bf5a)", () => {
  it("F7-1: the Score popup header carries the title, the 'Start a Score · N of 3' subtitle and a Close control", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "score-start", step: "planning" } }));
    const header = root.querySelector(".game-mode-popup .popup-header")!;
    expect(header.querySelector("h2")?.textContent).toBe("Planning");
    expect(header.querySelector(".flow-label")?.textContent).toBe("Start a Score · 1 of 3");
    expect(header.querySelector("button")?.textContent).toBe("Close");
  });

  it("F7-1: Loadout and Engagement carry 2 of 3 and 3 of 3", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "score-start", step: "loadout" } }));
    expect(root.querySelector(".game-mode-popup .popup-header .flow-label")?.textContent).toBe("Start a Score · 2 of 3");
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "score-start", step: "engagement" } }));
    expect(root.querySelector(".game-mode-popup .popup-header .flow-label")?.textContent).toBe("Start a Score · 3 of 3");
  });

  it("F7-1: the header Close returns to the Score sheet (flow cleared, mode kept)", async () => {
    const { calls } = await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "score-start", step: "planning" } }));
    const close = Array.from(root.querySelectorAll(".game-mode-popup .popup-header button")).find((b) => b.textContent === "Close") as HTMLButtonElement;
    close.click();
    await vi.waitFor(() => {
      const call = calls.find((c) => c.url.endsWith("/ops/mode.flow.set"));
      expect(call?.init.body).toBe(JSON.stringify({ kind: "none", step: "" }));
    });
  });

  it("F7-2: the footer splits Back on the left and Leave flow with Next on the right", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "score-start", step: "planning" } }));
    const left = Array.from(root.querySelectorAll(".game-mode-popup .game-mode-popup-footer > .left button")).map((b) => b.textContent);
    const right = Array.from(root.querySelectorAll(".game-mode-popup .game-mode-popup-footer > .right button")).map((b) => b.textContent);
    expect(left).toEqual(["Back"]);
    expect(right).toEqual(["Leave flow", "Next: Loadout"]);
  });

  it("F7-2: the Resolution footer keeps Back left and Skip, Skip Resolution, Leave flow, Next right", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "resolution", step: "crew-xp" } }), crewDTO({}));
    const left = Array.from(root.querySelectorAll(".game-mode-resolution .game-mode-popup-footer > .left button")).map((b) => b.textContent);
    const right = Array.from(root.querySelectorAll(".game-mode-resolution .game-mode-popup-footer > .right button")).map((b) => b.textContent);
    expect(left).toEqual(["Back"]);
    expect(right).toEqual(["Skip", "Skip Resolution", "Leave flow", "Next"]);
  });

  it("F7-4: Payoff shows the approved Coin / Score table beside the rep and tithe reference", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "resolution", step: "payoff" } }));
    const body = root.querySelector(".game-mode-resolution")!;
    expect(body.querySelector(".two-col")).not.toBeNull();
    const rows = Array.from(body.querySelectorAll("table.reference-table tr")).map((r) => Array.from(r.children).map((c) => c.textContent));
    expect(rows).toEqual([
      ["Coin", "Score"],
      ["2", "A minor job; several full purses"],
      ["4", "A small job; a strongbox"],
      ["6", "A standard score; decent loot"],
      ["8", "A big score; serious loot"],
      ["10+", "A major score; impressive loot"],
    ]);
  });

  it("F7-4: Heat shows the approved Heat / Exposure table beside the modifiers", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "resolution", step: "heat" } }), crewDTO({ heat: { current: 4, max: 9 } }));
    const body = root.querySelector(".game-mode-resolution")!;
    expect(body.querySelector(".two-col")).not.toBeNull();
    const rows = Array.from(body.querySelectorAll("table.reference-table tr")).map((r) => Array.from(r.children).map((c) => c.textContent));
    expect(rows).toEqual([
      ["Heat", "Exposure"],
      ["0", "Smooth & quiet; low exposure"],
      ["2", "Contained; standard exposure"],
      ["4", "Loud & chaotic; high exposure"],
      ["6", "Wild; devastating exposure"],
    ]);
  });
});

describe("GAME-MODE-03 Sol round-3 approved reminders (R3-04)", () => {
  it("R3-04a: Scoundrel XP carries the success and track-assignment reminders", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "resolution", step: "scoundrel-xp" } }));
    const text = root.querySelector(".game-mode-resolution")?.textContent ?? "";
    expect(text).toContain("Success isn’t required. No trigger means no automatic XP.");
    expect(text).toContain("Mark this XP on any attribute or your playbook track. Desperate-action XP is already marked during play.");
  });

  it("R3-04b: Heat carries the reminder with the crew's own heat maximum (never a literal 9)", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "resolution", step: "heat" } }), crewDTO({ heat: { current: 4, max: 7 } }));
    const text = root.querySelector(".game-mode-resolution")?.textContent ?? "";
    expect(text).toContain("At 7 heat, gain a wanted level and clear heat; excess heat rolls over. Use the crew’s resulting heat and wanted level for entanglements.");
  });

  it("R3-04c: Entanglements says the GM generates the entanglement", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "resolution", step: "entanglements" } }), crewDTO({ heat: { current: 4, max: 9 } }));
    const text = root.querySelector(".game-mode-resolution")?.textContent ?? "";
    expect(text).toContain("Otherwise use the highest die, as with a fortune roll. The GM generates the entanglement for the crew.");
  });
});

describe("Entanglements: SRD text, roll reminder and per-entanglement disclosures", () => {
  const REMINDER = "Before you roll: check that nobody else on the crew is already rolling entanglements for this score.";

  it("shows the roll reminder near the top and lists the heat-4 column's five entanglements as disclosures", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "resolution", step: "entanglements" } }), crewDTO({ heat: { current: 4, max: 9 } }));
    const dialog = root.querySelector(".game-mode-resolution")!;
    expect(dialog.textContent!.indexOf(REMINDER)).toBeGreaterThanOrEqual(0);
    expect(dialog.textContent!.indexOf(REMINDER)).toBeLessThan(dialog.textContent!.indexOf("Heat 4–5"));
    const items = Array.from(root.querySelectorAll(".entanglement-descriptions > details"));
    expect(items.map((d) => d.querySelector("summary")?.textContent)).toEqual([
      "Gang Trouble", "Questioning", "Reprisals", "Unquiet Dead", "Show of Force",
    ]);
    const reprisals = items[2] as HTMLDetailsElement;
    expect(reprisals.open).toBe(false);
    expect(reprisals.textContent).toContain("An enemy faction makes a move against you");
  });

  it("lists the heat-6 column's entanglements for a crew at heat 6", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "resolution", step: "entanglements" } }), crewDTO({ heat: { current: 6, max: 9 } }));
    const names = Array.from(root.querySelectorAll(".entanglement-descriptions > details summary")).map((s) => s.textContent);
    expect(names).toEqual(["Flipped", "Interrogation", "Demonic Notice", "Show of Force", "Arrest"]);
  });

  it("attributes the SRD text with a CC-BY note and an SRD ↗ link", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "resolution", step: "entanglements" } }), crewDTO({ heat: { current: 4, max: 9 } }));
    const dialog = root.querySelector(".game-mode-resolution")!;
    expect(dialog.textContent).toContain("Source: Blades in the Dark SRD (CC-BY).");
    expect(dialog.querySelector('a[href="https://bladesinthedark.com/entanglements"]')?.textContent).toContain("SRD ↗");
  });
});

describe("GAME-MODE-03 Sol 6.1 round 2 finding (R2-03)", () => {
  it("R2-03: Scoundrel XP shows each track's current total beside its mark", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "resolution", step: "scoundrel-xp" } }));
    const text = root.querySelector(".game-mode-resolution")?.textContent ?? "";
    expect(text).toContain("Playbook XP");
    expect(text).toContain("4 / 8 current");
  });
});

describe("GAME-MODE-03 Sol 6.1 round 2 findings (R2-02, R2-04, R2-05)", () => {
  it("R2-02: Scoundrel XP shows this playbook's condition, not the generic Lurk example", async () => {
    await mountWith(characterDTO({ mode: "score", playbook: { name: "Cutter", experience: { points: 0, max: 8 }, abilities: [] }, modeFlow: { kind: "resolution", step: "scoundrel-xp" } }));
    const text = root.querySelector(".game-mode-resolution")?.textContent ?? "";
    expect(text).toContain("violence or coercion");
    expect(text).not.toContain("for example stealth or evasion for the Lurk");
  });

  it("R2-04: Entanglements carries the highest-die rule and the bring-into-play reminder", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "resolution", step: "entanglements" } }), crewDTO({ heat: { current: 4, max: 9 } }));
    const text = root.querySelector(".game-mode-resolution")?.textContent ?? "";
    expect(text).toContain("Otherwise use the highest die, as with a fortune roll");
    expect(text).toContain("Bring the entanglement into play immediately");
    expect(text).toContain("manifest fully before the PCs have a chance to avoid them");
  });

  it("R2-05: Crew XP states that each category can yield up to 2 XP, with the SRD text, CC-BY attribution and SRD link", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "resolution", step: "crew-xp" } }), crewDTO({}));
    const dialog = root.querySelector(".game-mode-resolution")!;
    expect(dialog.textContent).toContain("Each category can yield up to 2 XP");
    expect(dialog.textContent).toContain("mark 2 crew XP for it");
    expect(dialog.textContent).toContain("Express the goals, drives, inner conflict, or essential nature of the crew.");
    expect(dialog.textContent).toContain("Blades in the Dark SRD (CC-BY)");
    expect(dialog.querySelector('a[href="https://bladesinthedark.com/advancement#crew-advancement"]')).not.toBeNull();
  });

  it("R2-05: Crew XP shows the crew type's own XP trigger from the crew data", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "resolution", step: "crew-xp" } }), crewDTO({}));
    await vi.waitFor(() => {
      expect(root.querySelector(".game-mode-resolution")!.textContent).toContain("Execute a successful murder, ransom, or assassination operation.");
    });
  });

  it("R2-05: Crew Rep links to the Payoff SRD page", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "resolution", step: "crew-rep" } }), crewDTO({}));
    expect(root.querySelector('.game-mode-resolution a[href="https://bladesinthedark.com/payoff"]')).not.toBeNull();
  });
});

describe("GAME-MODE-03 Sol 6.1 round 2 findings (R2-06)", () => {
  it("R2-06: the End Score tooltip does not promise an out-of-action transition", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "none", step: "" } }));
    const endScore = Array.from(root.querySelectorAll("button")).find((b) => b.textContent === "End Score") as HTMLButtonElement;
    expect(endScore.title).not.toContain("takes the scoundrel out of action");
    expect(endScore.title).toContain("only when it is completely full");
  });
});

describe("GAME-MODE-03 Sol 6.1 findings (F8, F4, F2)", () => {
  it("F8: the End Score confirmation does not claim the scoundrel goes out of action", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "none", step: "" } }));
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    (Array.from(root.querySelectorAll(".mode-panel button")).find((b) => b.textContent === "End Score") as HTMLButtonElement).click();
    const message = String(confirmSpy.mock.calls[0]?.[0] ?? "");
    expect(message).not.toContain("out of action");
    expect(message).toContain("Stress clears only when it is completely full");
    expect(message).toContain("Resolution follows");
    confirmSpy.mockRestore();
  });

  it("F4: the crew editor copy describes the amount added (a delta), not a displayed total", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "resolution", step: "heat" } }), crewDTO({ heat: { current: 4, max: 9 } }));
    await vi.waitFor(() => expect(root.querySelector('[data-crew-track="heat"]')).not.toBeNull());
    const editor = root.querySelector('[data-crew-track="heat"]')!;
    expect(editor.textContent).not.toContain("the current total, not the amount");
    expect(editor.textContent).toContain("Enter the amount to add");
    expect(editor.textContent).toContain("current 4");
  });

  it("F2: load totals use the selected commitment allowance (Normal 5, Heavy 6), not the absolute maximum", async () => {
    await mountWith(characterDTO({
      mode: "score",
      modeFlow: { kind: "score-start", step: "loadout" },
      gear: {
        loadout: [{ name: "Fine lockpicks", bulk: 0 }],
        availableGear: [{ name: "Fine lockpicks", bulk: 0 }, { name: "Climbing gear", bulk: 2 }],
        commitment: "normal",
        isCommitmentLocked: false,
        maxBulk: 9,
      },
    }));
    const popup = root.querySelector(".game-mode-popup")!;
    expect(popup.textContent).toContain("of 5 load committed");
    expect(popup.textContent).not.toContain("of 9 load");
  });
});

describe("GAME-MODE-03 Luna round 5 findings (F10, F1)", () => {
  it("entanglements show the matching heat band table, and Show all reveals the full result-by-heat table", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "resolution", step: "entanglements" } }), crewDTO({ heat: { current: 4, max: 9 } }));
    await vi.waitFor(() => expect(root.querySelector("table.ent-table")).not.toBeNull());
    const first = root.querySelector("table.ent-table")!;
    expect(Array.from(first.querySelectorAll("tr th")).map((t) => t.textContent)).toEqual(["Result", "Heat 4–5", "1–3", "4–5", "6"]);
    expect(first.textContent).toContain("Gang Trouble or Questioning");
    expect(first.textContent).toContain("Reprisals or Unquiet Dead");
    expect(first.textContent).toContain("Show of Force");
    const full = root.querySelector("details.all-entanglements table.ent-table")!;
    expect(full, "full table inside Show all").not.toBeNull();
    expect(Array.from(full.querySelectorAll("tr")[0]!.querySelectorAll("th")).map((t) => t.textContent)).toEqual(["Result", "Heat 0–3", "Heat 4–5", "Heat 6+"]);
    expect(full.textContent).toContain("Gang Trouble or The Usual Suspects");
    expect(full.textContent).toContain("Flipped or Interrogation");
    expect(full.textContent).toContain("Demonic Notice or Show of Force");
    expect(full.textContent).toContain("Cooperation");
    expect(full.textContent).toContain("Arrest");
  });

  it("the Resolution surface is an aria-modal overlay outside the sheet, with the six-step title and subtitle", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "resolution", step: "payoff" } }));
    const dialog = root.querySelector(".game-mode-resolution")!;
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.closest(".character-detail")).toBeNull();
    expect(dialog.querySelector("h2")?.textContent).toBe("Payoff");
    expect(dialog.textContent).toContain("Score resolution · 2 of 6");
  });
});

describe("GAME-MODE-03 Luna round 4 findings", () => {
  it("Planning Back is enabled and returns to the score sheet (clears the popup cursor)", async () => {
    const { calls } = await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "score-start", step: "planning" } }));
    const back = Array.from(root.querySelectorAll(".game-mode-popup button")).find((b) => b.textContent === "Back") as HTMLButtonElement;
    expect(back.disabled).toBe(false);
    back.click();
    await vi.waitFor(() => {
      const call = calls.find((c) => c.url.endsWith("/ops/mode.flow.set"));
      expect(call).toBeTruthy();
      expect(call!.init.body).toBe(JSON.stringify({ kind: "none", step: "" }));
    });
  });

  it("Engagement shows the approved factor table: Operation, Plan's detail, People, Other elements", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "score-start", step: "engagement" } }));
    const table = root.querySelector(".game-mode-popup table.engagement-factors")!;
    expect(table, "factor table").not.toBeNull();
    const rowHeads = Array.from(table.querySelectorAll("tbody th")).map((th) => th.textContent);
    expect(rowHeads).toEqual(["Operation", "Plan’s detail", "People", "Other elements"]);
    const text = table.textContent ?? "";
    expect(text).toContain("Particularly bold or daring");
    expect(text).toContain("Overly complex; contingent on many factors");
    expect(text).toContain("Exposes a vulnerability; hits the target where they’re weakest");
    expect(text).toContain("The target is strongest here; special defenses or preparations");
    expect(text).toContain("Friends or contacts provide aid or insight");
    expect(text).toContain("Enemies or rivals interfere");
    expect(text).toContain("A lower-Tier target; a helpful district situation");
    expect(text).toContain("A higher-Tier target; a harmful district situation");
  });

  it("the Resolution stepper offers six direct-selection controls that set the stored step", async () => {
    const { calls } = await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "resolution", step: "payoff" } }));
    const stepButtons = Array.from(root.querySelectorAll(".resolution-stepper button")) as HTMLButtonElement[];
    expect(stepButtons.map((b) => b.textContent)).toEqual(["1. Scoundrel XP", "2. Payoff", "3. Heat", "4. Entanglements", "5. Crew XP", "6. Crew Rep"]);
    stepButtons[2]!.click();
    await vi.waitFor(() => {
      const call = calls.find((c) => c.url.endsWith("/ops/mode.flow.set"));
      expect(call).toBeTruthy();
      expect(call!.init.body).toBe(JSON.stringify({ kind: "resolution", step: "heat" }));
    });
  });
});

describe("GAME-MODE-03 Luna round 3 finding: committed gear is listed once", () => {
  // Live server shape (verified): a committed item is in BOTH gear.loadout and gear.availableGear
  // (availableGear is every owned item). The checklist must show each name once, checked when committed.
  const gearDto = () => characterDTO({
    mode: "score",
    modeFlow: { kind: "score-start", step: "loadout" },
    gear: {
      loadout: [{ name: "Climbing gear", bulk: 2 }],
      availableGear: [{ name: "Climbing gear", bulk: 2 }, { name: "Fine lockpicks", bulk: 0 }],
      commitment: "normal",
      isCommitmentLocked: false,
      maxBulk: 5,
    },
  });

  it("the Score Loadout checklist lists each owned item once, checked only when committed", async () => {
    await mountWith(gearDto());
    const rows = Array.from(root.querySelectorAll(".game-mode-popup label.gear")) as HTMLLabelElement[];
    expect(rows.map((r) => r.textContent?.replace(/\s+/g, " ").trim())).toEqual(["Climbing gear 2 load", "Fine lockpicks 0 load"]);
    const boxes = rows.map((r) => r.querySelector("input") as HTMLInputElement);
    expect(boxes.map((b) => b.checked)).toEqual([true, false]);
  });

  it("the Change-loadout checklist lists each owned item once, with the proposal checked", async () => {
    await mountWith(gearDto());
    (Array.from(root.querySelectorAll('[data-section="committed-loadout"] button')).find((b) => b.textContent === "Change loadout") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(root.querySelector(".game-mode-confirm")).not.toBeNull());
    const rows = Array.from(root.querySelectorAll(".game-mode-confirm label.gear")) as HTMLLabelElement[];
    expect(rows.map((r) => r.textContent?.replace(/\s+/g, " ").trim())).toEqual(["Climbing gear 2 load", "Fine lockpicks 0 load"]);
    expect(rows.map((r) => (r.querySelector("input") as HTMLInputElement).checked)).toEqual([true, false]);
  });
});

describe("GAME-MODE-03 Luna round 2 findings", () => {
  it("the Resolution stepper shows the approved step names, not enum ids", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "resolution", step: "payoff" } }));
    const labels = Array.from(root.querySelectorAll(".resolution-stepper li")).map((li) => li.textContent);
    expect(labels).toEqual([
      "1. Scoundrel XP",
      "2. Payoff",
      "3. Heat",
      "4. Entanglements",
      "5. Crew XP",
      "6. Crew Rep",
    ]);
  });

  it("the Downtime activity menu is in the Game Mode panel on wide screens and duplicated in the sheet for narrow screens", async () => {
    await mountWith(characterDTO({ mode: "downtime", downtime: { free: 2, paid: 0, spent: 0, activities: [] } }));
    const panelMenu = root.querySelector('.mode-panel [data-section="downtime-activities-panel"]');
    expect(panelMenu, "panel copy exists").not.toBeNull();
    expect(Array.from(panelMenu!.querySelectorAll("button")).map((b) => b.textContent)).toEqual(expect.arrayContaining(["Train", "Other"]));
    const sheetMenu = root.querySelector('.character-detail [data-section="downtime-activities"]');
    expect(sheetMenu, "sheet copy exists").not.toBeNull();
  });
});

function cleanupRoot() {
  root.innerHTML = "";
}

// XP-TRACKER-04: the Score-only XP Tracker and the Scoundrel XP completion (xp.resolve).
const XP_ATTRS = [
  { name: "Insight", experience: { points: 1, max: 6 }, actions: [] },
  { name: "Prowess", experience: { points: 2, max: 6 }, actions: [] },
  { name: "Resolve", experience: { points: 3, max: 6 }, actions: [] },
];
const SESSION_TWO = { playbookExpressions: 2, characterExpressions: 1, struggleExpressions: 1, max: 2 };

describe("XP Tracker and Scoundrel XP completion (XP-TRACKER-04)", () => {
  it("the XP Tracker exists only in Score mode", async () => {
    await mountWith(characterDTO());
    expect(root.querySelector('[data-section="xp-tracker"]')).toBeNull();
    expect(root.querySelector(".xp-tracker-tab")).toBeNull();
  });

  it("the tracker holds Desperate action XP and the three expression tracks in the sheet's stress structure", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "none", step: "" }, session: SESSION_TWO, talent: { attributes: XP_ATTRS } }));
    const panel = root.querySelector('[data-section="xp-tracker"]')!;
    expect(panel).not.toBeNull();
    expect(panel.textContent).toContain("+ Desperate action XP");
    for (const [short, label] of [["playbook", "Playbook expressions"], ["character", "Scoundrel expressions"], ["struggle", "Struggle expressions"]]) {
      const row = panel.querySelector(`.session-track[data-session-track="${short}"]`)!;
      expect(row.querySelector(".stress .stress-track"), short).not.toBeNull();
      expect(row.querySelector(".stress-label")?.textContent, short).toBe(label);
      expect(row.querySelectorAll(".stress-box").length, short).toBe(2);
    }
  });

  it("the compact tab opens the bottom sheet (aria-expanded), Escape closes it and returns focus to the tab", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "none", step: "" }, session: SESSION_TWO, talent: { attributes: XP_ATTRS } }));
    const tab = root.querySelector<HTMLButtonElement>(".xp-tracker-tab")!;
    expect(tab.getAttribute("aria-expanded")).toBe("false");
    tab.click();
    await vi.waitFor(() => {
      const sheet = root.querySelector('[data-section="xp-tracker-sheet"]');
      expect(sheet).not.toBeNull();
      expect(sheet?.getAttribute("role")).toBe("dialog");
      expect(sheet?.getAttribute("aria-modal")).toBe("true");
      expect(root.querySelector(".xp-tracker-tab")?.getAttribute("aria-expanded")).toBe("true");
    });
    root.querySelector('[data-section="xp-tracker-sheet"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await vi.waitFor(() => {
      expect(root.querySelector('[data-section="xp-tracker-sheet"]')).toBeNull();
      expect(document.activeElement?.classList.contains("xp-tracker-tab")).toBe(true);
    });
  });

  it("the allocation screen shows the counters as the GM total, and remaining XP updates live", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "resolution", step: "scoundrel-xp" }, session: SESSION_TWO, talent: { attributes: XP_ATTRS } }));
    expect(root.querySelector(".xp-alloc-live")?.textContent).toBe("Available 4 XP · Remaining 4 XP");
    (root.querySelector('button[aria-label="Add 1 Insight allocation"]') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(root.querySelector(".xp-alloc-live")?.textContent).toBe("Available 4 XP · Remaining 3 XP");
    });
  });

  it("completion is disabled until every XP is placed, then enabled", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "resolution", step: "scoundrel-xp" }, session: SESSION_TWO, talent: { attributes: XP_ATTRS } }));
    const complete = () => Array.from(root.querySelectorAll<HTMLButtonElement>(".xp-alloc button")).find((b) => b.textContent === "Complete Scoundrel XP")!;
    expect(complete().disabled).toBe(true);
    for (const name of ["Playbook", "Insight", "Prowess", "Resolve"]) {
      (root.querySelector(`button[aria-label="Add 1 ${name} allocation"]`) as HTMLButtonElement).click();
      await vi.waitFor(() => expect(root.querySelector(`button[aria-label="Add 1 ${name} allocation"]`)).not.toBeNull());
    }
    await vi.waitFor(() => {
      expect(root.querySelector(".xp-alloc-live")?.textContent).toBe("Available 4 XP · Remaining 0 XP");
      expect(complete().disabled).toBe(false);
    });
  });

  it("a track beyond its room blocks completion and says by how much", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "resolution", step: "scoundrel-xp" }, session: SESSION_TWO, talent: { attributes: XP_ATTRS } }));
    // Insight has 1 of 6: room 5. Six allocations overflow by one.
    for (let i = 0; i < 6; i++) {
      (root.querySelector('button[aria-label="Add 1 Insight allocation"]') as HTMLButtonElement).click();
      await vi.waitFor(() => expect(root.querySelector('button[aria-label="Add 1 Insight allocation"]')).not.toBeNull());
    }
    await vi.waitFor(() => {
      expect(root.querySelector(".xp-alloc [role=alert]")?.textContent).toContain("Insight exceeds its room by 1.");
      const complete = Array.from(root.querySelectorAll<HTMLButtonElement>(".xp-alloc button")).find((b) => b.textContent === "Complete Scoundrel XP")!;
      expect(complete.disabled).toBe(true);
    });
  });

  it("Adjust unlocks the GM total, and a zero total is allowed with the counters warning", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "resolution", step: "scoundrel-xp" }, session: SESSION_TWO, talent: { attributes: XP_ATTRS } }));
    const total = root.querySelector<HTMLInputElement>('input[aria-label="GM total XP"]')!;
    expect(total.disabled).toBe(true);
    root.querySelector<HTMLInputElement>('.xp-alloc-total input[type="checkbox"]')!.click();
    await vi.waitFor(() => expect(root.querySelector<HTMLInputElement>('input[aria-label="GM total XP"]')!.disabled).toBe(false));
    const field = root.querySelector<HTMLInputElement>('input[aria-label="GM total XP"]')!;
    field.value = "0";
    field.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.waitFor(() => {
      expect(root.querySelector(".xp-alloc-live")?.textContent).toBe("Available 0 XP · Remaining 0 XP");
      expect(root.querySelector(".xp-alloc")?.textContent).toContain("A zero total awards nothing, but completion still clears the counters.");
      const complete = Array.from(root.querySelectorAll<HTMLButtonElement>(".xp-alloc button")).find((b) => b.textContent === "Complete Scoundrel XP")!;
      expect(complete.disabled).toBe(false);
    });
  });

  it("Complete posts xp.resolve with the total and the allocations, under the current revision", async () => {
    const dto = characterDTO({ mode: "score", modeFlow: { kind: "resolution", step: "scoundrel-xp" }, session: SESSION_TWO, talent: { attributes: XP_ATTRS } });
    const { calls } = await mountWith(dto);
    for (const name of ["Playbook", "Insight", "Prowess", "Resolve"]) {
      (root.querySelector(`button[aria-label="Add 1 ${name} allocation"]`) as HTMLButtonElement).click();
      await vi.waitFor(() => expect(root.querySelector(`button[aria-label="Add 1 ${name} allocation"]`)).not.toBeNull());
    }
    await vi.waitFor(() => {
      const complete = Array.from(root.querySelectorAll<HTMLButtonElement>(".xp-alloc button")).find((b) => b.textContent === "Complete Scoundrel XP")!;
      expect(complete.disabled).toBe(false);
      complete.click();
    });
    await vi.waitFor(() => {
      const call = calls.find((c) => c.url.endsWith("/ops/xp.resolve"));
      expect(call).toBeTruthy();
      expect(call!.init.body).toBe(JSON.stringify({ total: 4, allocations: { Playbook: 1, Insight: 1, Prowess: 1, Resolve: 1 } }));
      expect((call!.init.headers as Record<string, string>)["If-Match"]).toBe(String(dto.revision));
    });
  });

  it("the compact sheet traps Tab and Shift+Tab inside the dialog (XP-TRACKER-04 review R2)", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "none", step: "" }, session: SESSION_TWO, talent: { attributes: XP_ATTRS } }));
    root.querySelector<HTMLButtonElement>(".xp-tracker-tab")!.click();
    await vi.waitFor(() => expect(root.querySelector('[data-section="xp-tracker-sheet"]')).not.toBeNull());
    const sheet = root.querySelector<HTMLElement>('[data-section="xp-tracker-sheet"]')!;
    const close = sheet.querySelector<HTMLButtonElement>(".xp-tracker-close")!;
    const focusables = Array.from(sheet.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), select:not([disabled]), input:not([disabled])"));
    const last = focusables[focusables.length - 1]!;
    last.focus();
    sheet.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    expect(document.activeElement).toBe(close);
    close.focus();
    sheet.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }));
    expect(document.activeElement).toBe(last);
  });

  it("while the compact sheet is open, the sheet and the mode panel behind it are inert (XP-TRACKER-04 review R2)", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "none", step: "" }, session: SESSION_TWO, talent: { attributes: XP_ATTRS } }));
    root.querySelector<HTMLButtonElement>(".xp-tracker-tab")!.click();
    await vi.waitFor(() => expect(root.querySelector('[data-section="xp-tracker-sheet"]')).not.toBeNull());
    expect(root.querySelector(".character-detail")!.hasAttribute("inert")).toBe(true);
    expect(root.querySelector(".mode-panel")!.hasAttribute("inert")).toBe(true);
  });

  it("widening to the wide layout closes the compact sheet and releases the sheet behind it (XP-TRACKER-04 review R1)", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "none", step: "" }, session: SESSION_TWO, talent: { attributes: XP_ATTRS } }));
    root.querySelector<HTMLButtonElement>(".xp-tracker-tab")!.click();
    await vi.waitFor(() => expect(root.querySelector('[data-section="xp-tracker-sheet"]')).not.toBeNull());
    const original = window.innerWidth;
    try {
      Object.defineProperty(window, "innerWidth", { value: 1440, configurable: true, writable: true });
      window.dispatchEvent(new Event("resize"));
      await vi.waitFor(() => {
        expect(root.querySelector('[data-section="xp-tracker-sheet"]')).toBeNull();
        expect(root.querySelector(".character-detail")!.hasAttribute("inert")).toBe(false);
        expect(root.querySelector(".mode-panel")!.hasAttribute("inert")).toBe(false);
      });
    } finally {
      Object.defineProperty(window, "innerWidth", { value: original, configurable: true, writable: true });
    }
  });

  it("leaving Score closes the compact sheet and releases the sheet behind it (XP-TRACKER-04 review R1)", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "none", step: "" }, session: SESSION_TWO, talent: { attributes: XP_ATTRS } }));
    root.querySelector<HTMLButtonElement>(".xp-tracker-tab")!.click();
    await vi.waitFor(() => expect(root.querySelector('[data-section="xp-tracker-sheet"]')).not.toBeNull());
    Array.from(root.querySelectorAll<HTMLButtonElement>(".mode-switch button")).find((b) => b.textContent === "Free Play")!.click();
    await vi.waitFor(() => {
      expect(root.querySelector('[data-section="xp-tracker-sheet"]')).toBeNull();
      expect(root.querySelector(".character-detail")!.hasAttribute("inert")).toBe(false);
    });
  });

  it("while the compact sheet is open, the page outside the character (header, skip link, footer) is inert too (XP-TRACKER-04 review round 2 R2)", async () => {
    const outside = document.createElement("header");
    outside.textContent = "Global header";
    document.body.prepend(outside);
    try {
      await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "none", step: "" }, session: SESSION_TWO, talent: { attributes: XP_ATTRS } }));
      root.querySelector<HTMLButtonElement>(".xp-tracker-tab")!.click();
      await vi.waitFor(() => expect(root.querySelector('[data-section="xp-tracker-sheet"]')).not.toBeNull());
      expect(outside.hasAttribute("inert")).toBe(true);
      root.querySelector<HTMLButtonElement>(".xp-tracker-close")!.click();
      await vi.waitFor(() => expect(outside.hasAttribute("inert")).toBe(false));
    } finally {
      outside.remove();
    }
  });

  it("Escape still closes the compact sheet after focus was lost to the page (blocked background click, XP-TRACKER-04 round 3 R2)", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "none", step: "" }, session: SESSION_TWO, talent: { attributes: XP_ATTRS } }));
    root.querySelector<HTMLButtonElement>(".xp-tracker-tab")!.click();
    await vi.waitFor(() => expect(root.querySelector('[data-section="xp-tracker-sheet"]')).not.toBeNull());
    (document.activeElement as HTMLElement).blur();
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await vi.waitFor(() => expect(root.querySelector('[data-section="xp-tracker-sheet"]')).toBeNull());
  });

  it("focus that leaves the open compact sheet returns to its Close button (XP-TRACKER-04 round 3 R2)", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "none", step: "" }, session: SESSION_TWO, talent: { attributes: XP_ATTRS } }));
    root.querySelector<HTMLButtonElement>(".xp-tracker-tab")!.click();
    await vi.waitFor(() => expect(root.querySelector('[data-section="xp-tracker-sheet"]')).not.toBeNull());
    const close = root.querySelector<HTMLButtonElement>(".xp-tracker-close")!;
    (document.activeElement as HTMLElement).blur();
    await vi.waitFor(() => expect(document.activeElement).toBe(close));
  });
});
