// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { mountCharacterCreatePage, type CharacterCreateDeps } from "./character-create.js";
import { renderShell } from "./shell.js";
import { loadStylesheets, assertFirstH1ClearsSeam } from "./seam.js";

const ok = (data: unknown) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify(data),
});
const err500 = () => ({ ok: false, status: 500, text: async () => "boom" });
/** OperationResult envelope for a successful create. */
/** OperationResult envelope for a successful crew create. */
const crewCreatedResp = (crew: Record<string, unknown>) => ({
  ok: true,
  applied: { op: "crew.create" },
  sideEffects: [],
  crew,
  error: null,
});
const createdResp = (character: Record<string, unknown>) => ({
  ok: true,
  applied: { op: "character.create" },
  sideEffects: [],
  character,
  error: null,
});

/** Valid Character DTO matching the frontend decoder (mirrors detail test). */
function characterDTO(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "character",
    id: "a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
    gameStem: "blades-in-the-dark",
    gameName: "Blades in the Dark",
    language: "en",
    revision: 1,
    formatVersion: 1,
    createdAt: "2026-07-22T00:00:00.000Z",
    updatedAt: "2026-07-22T00:00:00.000Z",
    isRetired: false,
    isDeadish: false,
    traumaPending: false,
    isOutOfAction: false,
    stressClearPending: false,
    dossier: {
      name: "",
      crewId: "",
      alias: "",
      look: "",
      notes: [],
      background: { name: "", description: "" },
      heritage: { name: "", description: "" },
      vice: { name: "", description: "", purveyor: { name: "", description: "" } },
    },
    monitor: {
      stress: { current: 0, max: 9 },
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
        hasStandard: false,
        hasHeavy: false,
        hasSpecial: false,
      },
    },
    talent: {
      attributes: [
        {
          name: "Insight",
          experience: { points: 0, max: 6 },
          actions: [
            { name: "Hunt", rating: 1, maxRating: 4 },
            { name: "Study", rating: 2, maxRating: 4 },
            { name: "Survey", rating: 2, maxRating: 4 },
            { name: "Tinker", rating: 0, maxRating: 4 },
          ],
        },
        {
          name: "Prowess",
          experience: { points: 0, max: 6 },
          actions: [
            { name: "Finesse", rating: 1, maxRating: 4 },
            { name: "Prowl", rating: 0, maxRating: 4 },
            { name: "Skirmish", rating: 0, maxRating: 4 },
            { name: "Wreck", rating: 0, maxRating: 4 },
          ],
        },
        {
          name: "Resolve",
          experience: { points: 0, max: 6 },
          actions: [
            { name: "Attune", rating: 0, maxRating: 4 },
            { name: "Command", rating: 0, maxRating: 4 },
            { name: "Consort", rating: 0, maxRating: 4 },
            { name: "Sway", rating: 0, maxRating: 4 },
          ],
        },
      ],
    },
    playbook: { name: "Cutter", experience: { points: 0, max: 8 }, abilities: [] },
    gear: { loadout: [], availableGear: [], commitment: "none", isCommitmentLocked: false, maxBulk: 6 },
    fund: { satchel: { coins: 0, max: 12 }, stash: { coins: 0, max: 16 } },
    rolodex: { friends: [] },
    // CONTRACT-05: canonical create emits the empty contacts array; the
    // sparse decoder default materializes it identically on decode.
    contacts: [],
    session: { playbookExpressions: 0, characterExpressions: 0, struggleExpressions: 0, max: 5 },
    notebook: "",
    ...overrides,
  };
}

function crewDTO(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "crew",
    id: "b1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
    gameStem: "blades-in-the-dark",
    gameName: "Blades in the Dark",
    language: "en",
    revision: 1,
    formatVersion: 1,
    createdAt: "2026-07-22T00:00:00.000Z",
    updatedAt: "2026-07-22T00:00:00.000Z",
    crewTypeName: "Assassins",
    name: "",
    lair: "",
    reputation: "ruthless",
    huntingGrounds: "",
    tier: 0,
    hold: "weak",
    heat: { current: 0, max: 9 },
    wanted: { current: 0, max: 4 },
    rep: { current: 0, max: 12 },
    experience: { points: 0, max: 8 },
    specialAbilities: [],
    upgrades: [],
    cohorts: [],
    contacts: [],
    factions: [],
    coin: 0,
    stash: 0,
    stashCapacity: 4,
    notes: [],
    turf: 0,
    claimedClaimIds: [],
    claimOverrides: [],
    ...overrides,
  };
}

const SETTINGS_NO_BUDGET: Record<string, unknown> = { Name: "Some Game", StressMax: 9 };
const ACTIONS = ["Hunt", "Study", "Survey", "Tinker", "Finesse", "Prowl", "Skirmish", "Wreck", "Attune", "Command", "Consort", "Sway"];
const SETTINGS_WITH_BUDGET: Record<string, unknown> = {
  Name: "Blades in the Dark",
  StressMax: 9,
  StartingActionDots: 7,
  StartingActionDotMax: 2,
  Attributes: [
    { Name: "Insight", Actions: ACTIONS.slice(0, 4).map((n) => ({ Name: n })) },
    { Name: "Prowess", Actions: ACTIONS.slice(4, 8).map((n) => ({ Name: n })) },
    { Name: "Resolve", Actions: ACTIONS.slice(8, 12).map((n) => ({ Name: n })) },
  ],
};

function baseDeps(overrides: Partial<CharacterCreateDeps> = {}): CharacterCreateDeps {
  return {
    gameStem: "blades-in-the-dark",
    playbooks: ["Spider", "Cutter"],
    settings: SETTINGS_WITH_BUDGET,
    crewTypes: ["Assassins", "Bravos"],
    onCreated: vi.fn(),
    onCrewCreated: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// PC chargen flow (CONTRACT-01 stage 3)
// ---------------------------------------------------------------------------

describe("PC chargen flow", () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement("div");
    vi.clearAllMocks();
  });

  function pickPlaybook(value: string) {
    const select = root.querySelector<HTMLSelectElement>("#pc-playbook")!;
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function dot(action: string, index: number): HTMLButtonElement {
    const btn = root.querySelector<HTMLButtonElement>(
      `.pc-chargen-form button[aria-label="${action} ${index}"]`,
    );
    if (!btn) throw new Error(`dot not found: ${action} ${index}`);
    return btn;
  }

  function unspent(): number {
    const el = root.querySelector<HTMLElement>("[data-chargen-unspent]")!;
    return Number(el.textContent);
  }

  function submitBtn(): HTMLButtonElement {
    return root.querySelector<HTMLButtonElement>(".pc-chargen-form button[type=submit]")!;
  }

  function submitPc() {
    root.querySelector<HTMLFormElement>(".pc-chargen-form")!.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  }

  /** Allocate the full budget within the per-action cap: 2+2+2+1 = 7. */
  function allocateAll() {
    dot("Hunt", 2).click();
    dot("Study", 2).click();
    dot("Survey", 2).click();
    dot("Tinker", 1).click();
  }

  it("renders per-action pickers grouped by attribute for every published action", () => {
    mountCharacterCreatePage(root, baseDeps());

    const groups = Array.from(root.querySelectorAll<HTMLElement>(".chargen-group"));
    expect(groups.map((g) => g.getAttribute("data-attribute"))).toEqual([
      "Insight",
      "Prowess",
      "Resolve",
    ]);
    // 3 attributes × 4 actions, each showing StartingActionDotMax dots.
    const rows = root.querySelectorAll(".pc-chargen-form .action");
    expect(rows.length).toBe(12);
    for (const row of rows) {
      expect(row.querySelectorAll(".action-dot").length).toBe(2);
    }
  });

  it("shows both budget numbers and keeps the unspent counter live", () => {
    mountCharacterCreatePage(root, baseDeps());
    expect(root.querySelector("[data-chargen-budget]")!.textContent).toBe("7");
    expect(unspent()).toBe(7);

    pickPlaybook("Cutter");
    dot("Skirmish", 2).click();
    dot("Hunt", 2).click();
    dot("Study", 2).click();
    expect(unspent()).toBe(1);
    dot("Survey", 1).click();
    expect(unspent()).toBe(0);

    // Un-picking (clicking the filled terminal dot) returns the point.
    dot("Survey", 1).click();
    expect(unspent()).toBe(1);
    expect(submitBtn().disabled).toBe(true);
  });

  it("keeps Create disabled until a playbook is chosen AND unspent is exactly zero", () => {
    mountCharacterCreatePage(root, baseDeps());

    // Dots without a playbook stay blocked…
    allocateAll();
    expect(unspent()).toBe(0);
    expect(submitBtn().disabled).toBe(true);
    // …and choosing a playbook resets the allocation (fresh sheet).
    pickPlaybook("Cutter");
    expect(unspent()).toBe(7);
    expect(submitBtn().disabled).toBe(true);

    allocateAll();
    expect(unspent()).toBe(0);
    expect(submitBtn().disabled).toBe(false);
  });

  it("POSTs the full final-ratings map to /api/characters/pc and delivers the DTO", async () => {
    const created = characterDTO();
    global.fetch = vi.fn().mockResolvedValue(ok(createdResp(created)));
    const onCreated = vi.fn();
    mountCharacterCreatePage(root, baseDeps({ onCreated }));

    pickPlaybook("Cutter");
    dot("Hunt", 2).click();
    dot("Hunt", 1).click(); // terminal-dot click steps back down to 1
    dot("Study", 2).click();
    dot("Survey", 2).click();
    dot("Finesse", 1).click();
    dot("Command", 1).click();
    expect(unspent()).toBe(0);
    submitPc();

    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/characters/pc", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          gameStem: "blades-in-the-dark",
          playbook: "Cutter",
          actionRatings: {
            Hunt: 1, Study: 2, Survey: 2, Tinker: 0,
            Finesse: 1, Prowl: 0, Skirmish: 0, Wreck: 0,
            Attune: 0, Command: 1, Consort: 0, Sway: 0,
          },
        }),
      });
      expect(onCreated).toHaveBeenCalledWith(created);
    });
  });

  it("hides the PC flow when settings publish no budget, keeping only the unvalidated path", () => {
    mountCharacterCreatePage(root, baseDeps({ settings: SETTINGS_NO_BUDGET }));

    expect(root.querySelector(".pc-chargen-form")).toBeNull();
    expect(root.querySelector(".character-create .notice")).not.toBeNull();
    // The legacy form IS the create path here — no opt-in disclosure.
    expect(root.querySelector("details.create-unvalidated")).toBeNull();
    expect(root.querySelector("#playbook")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Unvalidated path (two-step naming; FV-017 semantics kept)
// ---------------------------------------------------------------------------

describe("unvalidated create path (two-step naming)", () => {
  let root: HTMLElement;
  let deps: CharacterCreateDeps;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.body;
    vi.clearAllMocks();
    deps = baseDeps({ settings: SETTINGS_NO_BUDGET });
    mountCharacterCreatePage(root, deps);
  });

  function legacySubmit(name: string) {
    const playbook = root.querySelector<HTMLInputElement>("#playbook")!;
    playbook.value = "Spider";
    if (name) {
      const nameField = root.querySelector<HTMLInputElement>("#name")!;
      nameField.value = name;
    }
    root.querySelector<HTMLFormElement>(".character-create-form")!.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  }

  it("POSTs create then dossier.update with the name, delivering the named DTO", async () => {
    const created = characterDTO();
    const named = characterDTO({
      revision: 2,
      dossier: { ...(created.dossier as Record<string, unknown>), name: "Ives" },
    });
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(ok(createdResp(created)))
      .mockResolvedValueOnce(
        ok({ ok: true, character: named, applied: { op: "dossier.update" }, sideEffects: [], error: null }),
      );

    legacySubmit("Ives");

    await vi.waitFor(() => {
      // revision travels in If-Match, not the body
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/characters/a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d/ops/dossier.update",
        expect.objectContaining({
          headers: expect.objectContaining({ "If-Match": "1" }),
          body: JSON.stringify({ name: "Ives" }),
        }),
      );
    });
    await vi.waitFor(() => {
      expect(deps.onCreated).toHaveBeenCalledWith(named);
    });
    // Single-post guarantee: exactly one POST to /api/characters — the name
    // rides dossier.update alone.
    expect(
      (global.fetch as Mock).mock.calls.filter((c) => c[0] === "/api/characters").length,
    ).toBe(1);
  });

  it("skips dossier.update when no name is given", async () => {
    const created = characterDTO();
    global.fetch = vi.fn().mockResolvedValueOnce(ok(createdResp(created)));

    legacySubmit("");

    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(deps.onCreated).toHaveBeenCalledWith(created);
    });
  });

  it("keeps the created character and retries only dossier.update across failures (FV-017)", async () => {
    const created = characterDTO();
    const named = characterDTO({
      revision: 2,
      dossier: { ...(created.dossier as Record<string, unknown>), name: "Ives" },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok(createdResp(created)))
      .mockResolvedValueOnce(err500())
      .mockResolvedValueOnce(err500())
      .mockResolvedValueOnce(
        ok({ ok: true, character: named, applied: { op: "dossier.update" }, sideEffects: [], error: null }),
      );
    global.fetch = fetchMock;

    const sheetHref = "/character/a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

    legacySubmit("Ives");

    // Phase-one succeeded, phase-two failed: retained entity linked, retry
    // control offered — no dead end, no second create POST.
    await vi.waitFor(() => {
      expect(root.querySelector(`a[href="${sheetHref}"]`)).not.toBeNull();
      expect(root.querySelector(".create-phase-two-recovery button")).not.toBeNull();
    });
    expect(fetchMock.mock.calls.filter((c) => c[0] === "/api/characters").length).toBe(1);

    (root.querySelector(".create-phase-two-recovery button") as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(root.querySelector(`a[href="${sheetHref}"]`)).not.toBeNull();
    });
    expect(fetchMock.mock.calls.filter((c) => c[0] === "/api/characters").length).toBe(1);

    (root.querySelector(".create-phase-two-recovery button") as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(deps.onCreated).toHaveBeenCalledWith(named);
    });
    const updates = fetchMock.mock.calls.filter(
      (c) => (c[0] as string).endsWith("/ops/dossier.update"),
    );
    expect(updates.length).toBe(3);
    expect(updates[2][1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({ "If-Match": "1" }),
        body: JSON.stringify({ name: "Ives" }),
      }),
    );
  });

  it("places the first h1 below the app bar's torn seam (FV-031)", () => {
    loadStylesheets();
    const { shell, outlet } = renderShell({
      currentPath: "/character/create",
    });
    document.body.appendChild(shell);
    mountCharacterCreatePage(outlet, baseDeps({ settings: SETTINGS_NO_BUDGET }));
    expect(shell.querySelector(".app-bar.torn-foot")).not.toBeNull();
    assertFirstH1ClearsSeam(outlet);
  });
});

/**
 * FV-025: every create-form control must have an accessible name from a
 * VISIBLE <label for> association (the placeholder alone is not a name).
 */
function controlName(rootEl: ParentNode, id: string): string | null {
  const control = rootEl.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`);
  if (!control) return null;
  const aria = control.getAttribute("aria-label");
  if (aria) return aria;
  const label = rootEl.querySelector<HTMLLabelElement>(`label[for="${id}"]`);
  if (!label) return null;
  const text = label.textContent?.trim() ?? "";
  if (!text) return null;
  if (label.getAttribute("for") !== control.id) return null;
  const labels = control.labels ? Array.from(control.labels) : null;
  if (labels && labels.length > 0 && !labels.includes(label)) return null;
  return text;
}

describe("accessible names and id hygiene (FV-025)", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.body;
    vi.clearAllMocks();
    mountCharacterCreatePage(root, baseDeps({ settings: SETTINGS_NO_BUDGET }));
  });

  it("gives gameStem/name/playbook accessible names via visible label associations", () => {
    const expected: Record<string, string> = {
      gameStem: "Game",
      name: "Name",
      playbook: "Playbook *",
    };
    for (const [id, want] of Object.entries(expected)) {
      const label = root.querySelector<HTMLLabelElement>(`label[for="${id}"]`);
      expect(label, `visible <label for="${id}">`).not.toBeNull();
      expect(label?.textContent?.trim(), `visible label text for ${id}`).toBe(want);
      expect(controlName(root, id), `accessible name for ${id}`).toBe(want);
    }
    const nameInput = root.querySelector<HTMLInputElement>("#name");
    expect(nameInput?.getAttribute("placeholder") ?? "").not.toBe("");
    expect(nameInput?.getAttribute("aria-label")).toBeNull();
  });

  it("keeps ids unique and labels associated after an invalid submit (validation)", () => {
    // Validation gate: required playbook missing → form stays mounted, no fetch.
    root.querySelector<HTMLFormElement>(".character-create-form")!.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    expect(global.fetch).not.toHaveBeenCalled();
    expect(root.querySelector(".character-create-form")).not.toBeNull();
    const ids = Array.from(root.querySelectorAll<HTMLElement>("[id]")).map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ["gameStem", "name", "playbook"]) {
      expect(controlName(root, id), `accessible name for ${id}`).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Crew multi-step flow (type → name → confirm)
// ---------------------------------------------------------------------------

describe("crew multi-step flow", () => {
  let root: HTMLElement;
  let deps: CharacterCreateDeps;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.body;
    vi.clearAllMocks();
    deps = baseDeps();
    mountCharacterCreatePage(root, deps);
  });

  function selectType(value: string) {
    const select = root.querySelector<HTMLSelectElement>("#crew-type-step")!;
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function click(selector: string) {
    (root.querySelector(selector) as HTMLButtonElement).click();
  }

  it("advances type → name → confirm and shows the summary before creating", () => {
    expect(root.querySelector("#crew-type-step")).not.toBeNull();
    // Next is blocked until a type is chosen.
    expect(root.querySelector<HTMLButtonElement>(".crew-next")!.disabled).toBe(true);
    selectType("Assassins");
    click(".crew-next");

    const nameInput = root.querySelector<HTMLInputElement>("#crew-name-step")!;
    expect(nameInput).not.toBeNull();
    nameInput.value = "The Red Lamps";
    click(".crew-next");

    const summary = root.querySelector(".crew-summary")!.textContent ?? "";
    expect(summary).toContain("Assassins");
    expect(summary).toContain("The Red Lamps");
    expect(root.querySelector(".crew-confirm")).not.toBeNull();
  });

  it("creates the crew then names it via fields.update with the returned revision", async () => {
    const created = crewDTO();
    const named = crewDTO({
      revision: 2,
      name: "The Red Lamps",
    });
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(ok(crewCreatedResp(created)))
      .mockResolvedValueOnce(
        ok({ ok: true, crew: named, applied: { op: "fields.update" }, sideEffects: [], error: null }),
      );

    selectType("Assassins");
    click(".crew-next");
    root.querySelector<HTMLInputElement>("#crew-name-step")!.value = "The Red Lamps";
    click(".crew-next");
    click(".crew-confirm");

    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenNthCalledWith(1, "/api/crews", expect.objectContaining({ method: "POST" }));
      expect(global.fetch).toHaveBeenNthCalledWith(
        2,
        "/api/crews/b1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d/ops/fields.update",
        expect.objectContaining({
          headers: expect.objectContaining({ "If-Match": "1" }),
          body: JSON.stringify({ name: "The Red Lamps" }),
        }),
      );
      expect(deps.onCrewCreated).toHaveBeenCalledWith(named);
    });
    // Create was POSTed exactly once.
    expect((global.fetch as Mock).mock.calls.filter((c) => c[0] === "/api/crews").length).toBe(1);
  });

  it("skips the naming call when the name step was left blank", async () => {
    const created = crewDTO();
    global.fetch = vi.fn().mockResolvedValue(ok(crewCreatedResp(created)));

    selectType("Bravos");
    click(".crew-next");
    click(".crew-next"); // leave name blank
    const summary = root.querySelector(".crew-summary")!.textContent ?? "";
    expect(summary).toContain("(unnamed");
    click(".crew-confirm");

    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(deps.onCrewCreated).toHaveBeenCalledWith(created);
    });
  });
});
