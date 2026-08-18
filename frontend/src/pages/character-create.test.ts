// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mountCharacterCreatePage } from "./character-create.js";

const ok = (data: unknown) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify(data),
});
const err500 = () => ({ ok: false, status: 500, text: async () => "boom" });

/** Valid Character DTO matching the frontend decoder (mirrors detail test). */
function characterDTO(overrides: Record<string, unknown> = {}) {
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
    // SC-F1 frozen decoder emits these optional-with-default lifecycle flags.
    isOutOfAction: false,
    traumaPending: false,
    stressClearPending: false,
    dossier: {
      name: "",
      crewId: "",
      alias: "",
      look: "",
      notes: "",
      background: { name: "", description: "" },
      heritage: { name: "", description: "" },
      vice: { name: "", description: "", purveyor: { name: "", description: "" } },
    },
    monitor: {
      stress: { current: 0, max: 9 },
      trauma: { traumas: [], max: 4 },
      harm: { lesser: [], moderate: [], severe: [], fatal: [], healingClock: { segments: 0, size: 6, rollover: 0 } },
      armor: { standardUsed: false, heavyUsed: false, specialUsed: false, hasStandard: true, hasHeavy: false, hasSpecial: false },
    },
    talent: { attributes: [] },
    playbook: { name: "Spider", experience: { points: 0, max: 8 }, abilities: [] },
    gear: { loadout: [], availableGear: [], commitment: "none", isCommitmentLocked: false, maxBulk: 8 },
    fund: { satchel: { coins: 0, max: 2 }, stash: { coins: 0, max: 8 } },
    rolodex: { friends: [] },
    session: { playbookExpressions: 0, characterExpressions: 0, struggleExpressions: 0, max: 3 },
    notebook: "",
    ...overrides,
  };
}

const createdResp = (c: ReturnType<typeof characterDTO>) => ({
  ok: true,
  character: c,
  applied: { op: "create" },
  sideEffects: [],
  error: null,
});

describe("character-create page (Design Audit F-12 two-step naming)", () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement("div");
    vi.clearAllMocks();
  });

  function submit(name: string) {
    const playbook = root.querySelector("#playbook") as HTMLSelectElement;
    playbook.value = "Spider";
    if (name) {
      const nameField = root.querySelector("#name") as HTMLInputElement;
      nameField.value = name;
    }
    (root.querySelector("form") as HTMLFormElement).dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  }

  it("POSTs create then dossier.update with the name, delivering the named DTO", async () => {
    const created = characterDTO();
    const named = characterDTO({
      revision: 2,
      dossier: { ...characterDTO().dossier, name: "Ives" },
    });
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(ok(createdResp(created)))
      .mockResolvedValueOnce(
        ok({ ok: true, character: named, applied: { op: "dossier.update" }, sideEffects: [], error: null }),
      );

    const onCreated = vi.fn();
    mountCharacterCreatePage(root, "blades-in-the-dark", ["Spider", "Cutter"], onCreated);

    submit("Ives");

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
      expect(onCreated).toHaveBeenCalledWith(named);
    });
  });

  it("skips dossier.update when no name is given", async () => {
    const created = characterDTO();
    global.fetch = vi.fn().mockResolvedValueOnce(ok(createdResp(created)));

    const onCreated = vi.fn();
    mountCharacterCreatePage(root, "blades-in-the-dark", ["Spider"], onCreated);

    submit("");

    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(onCreated).toHaveBeenCalledWith(created);
    });
  });

  it("does not re-POST a second character when dossier.update fails", async () => {
    const created = characterDTO();
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(ok(createdResp(created)))
      .mockResolvedValueOnce(err500());

    const onCreated = vi.fn();
    mountCharacterCreatePage(root, "blades-in-the-dark", ["Spider"], onCreated);

    submit("Ives");

    await vi.waitFor(() => {
      expect(root.querySelector(".character-create-error")).not.toBeNull();
    });
    // Exactly one POST to /api/characters — the dossier.update failure must
    // not trigger a second character creation on a retry-shaped path.
    const posts = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === "/api/characters");
    expect(posts.length).toBe(1);
  });

  it("keeps the created character and retries only dossier.update across two failures (FV-017)", async () => {
    const created = characterDTO();
    const named = characterDTO({
      revision: 2,
      dossier: { ...characterDTO().dossier, name: "Ives" },
    });
    // create OK → dossier.update fails twice → dossier.update succeeds.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok(createdResp(created)))
      .mockResolvedValueOnce(err500())
      .mockResolvedValueOnce(err500())
      .mockResolvedValueOnce(
        ok({ ok: true, character: named, applied: { op: "dossier.update" }, sideEffects: [], error: null }),
      );
    global.fetch = fetchMock;

    const onCreated = vi.fn();
    mountCharacterCreatePage(root, "blades-in-the-dark", ["Spider"], onCreated);

    const sheetHref = "/character/a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

    submit("Ives");

    // Phase-one succeeded, phase-two failed: the retained entity is linked and
    // a retry control is available — no dead end.
    await vi.waitFor(() => {
      expect(root.querySelector(`a[href="${sheetHref}"]`)).not.toBeNull();
      expect(root.querySelector(".character-create-error button")).not.toBeNull();
    });
    expect(fetchMock.mock.calls.filter((c) => c[0] === "/api/characters").length).toBe(1);

    // Retry #1 fails again: recovery UI stays (fresh controls), create is
    // still not re-POSTed.
    (root.querySelector(".character-create-error button") as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(root.querySelector(`a[href="${sheetHref}"]`)).not.toBeNull();
    });
    expect(fetchMock.mock.calls.filter((c) => c[0] === "/api/characters").length).toBe(1);

    // Retry #2 succeeds via dossier.update alone — the sheet receives the
    // named character; entity count never grew past one.
    (root.querySelector(".character-create-error button") as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith(named);
    });
    expect(fetchMock.mock.calls.filter((c) => c[0] === "/api/characters").length).toBe(1);
    const updates = fetchMock.mock.calls.filter(
      (c) => (c[0] as string).endsWith("/ops/dossier.update"),
    );
    expect(updates.length).toBe(3);
    // Every retry re-sends the retained revision in If-Match.
    expect(updates[2][1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({ "If-Match": "1" }),
        body: JSON.stringify({ name: "Ives" }),
      }),
    );
  });
});
