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

  it("Resolution Payoff shows the coin guide, the tithe rule and the Leave flow footer", async () => {
    await mountWith(characterDTO({ mode: "score", modeFlow: { kind: "resolution", step: "payoff" } }));
    const body = root.querySelector(".game-mode-resolution")!;
    expect(body.textContent).toContain("2 minor");
    expect(body.textContent).toContain("10+ major");
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
    const footer = Array.from(dialog.querySelectorAll("button")).map((b) => b.textContent);
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
    const footer = Array.from(root.querySelector(".game-mode-resolution")!.lastElementChild!.querySelectorAll("button")).map((b) => b.textContent);
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
