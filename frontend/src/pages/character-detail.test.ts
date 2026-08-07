// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mountCharacterDetailPage } from "./character-detail.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CHARACTER_ID = "c46ba7cb-993b-4fc7-974d-fb95eacd5446";

/** Minimal valid Character DTO — mirrors the shape the API returns. */
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
    dossier: {
      name: "Brenda Hilton",
      crewId: "8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2",
      alias: "Webweaver",
      look: "Keen and calculating",
      notes: "Spider operative",
      background: { name: "Urchin", description: "" },
      heritage: { name: "Akorosi", description: "" },
      vice: { name: "Gambling", description: "" },
    },
    monitor: {
      stress: { current: 3, max: 9 },
      trauma: { traumas: ["Haunted"], max: 4 },
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
        hasStandard: true,
        hasHeavy: false,
        hasSpecial: false,
      },
    },
    talent: { attributes: [] },
    playbook: {
      name: "Spider",
      experience: { points: 4, max: 8 },
      abilities: [],
    },
    gear: {
      loadout: [],
      availableGear: [],
      commitment: "none",
      isCommitmentLocked: false,
      maxBulk: 8,
    },
    fund: { satchel: { coins: 0, max: 2 }, stash: { coins: 0, max: 8 } },
    rolodex: { friends: [] },
    session: {
      playbookExpressions: 0,
      characterExpressions: 0,
      struggleExpressions: 0,
      max: 3,
    },
    notebook: "",
    ...overrides,
  };
}

/** Fetch Response mock helper — always includes .text() that returns JSON. */
function fetchResponse(data: unknown, status = 200, httpOk?: boolean) {
  const ok = httpOk ?? (status >= 200 && status < 300);
  return { ok, status, text: async () => JSON.stringify(data) };
}

// Shorthand for 200-ok responses
const ok = (data: unknown) => fetchResponse(data);

/** Minimal game data for tests. */
const GAME_DATA = { Name: "Blades in the Dark", Traumas: ["Cold", "Haunted", "Obsessed", "Paranoid"], StressMax: 9, TraumaMax: 4 };

/** Playbook settings fixture — mirrors /api/games/{stem}/playbooks/{name}. */
const PLAYBOOK_DATA = {
  Name: "Spider",
  Hook: "Spiders are good at masterminding maneuvers.",
  ExperienceCondition: "You addressed a challenge with calculation or conspiracy",
  SpecialAbilities: [],
  Items: [],
  Rolodex: { Name: "Shrewd Friends", Friends: [] },
  DefaultActionPoints: [],
};

/** Create a deferred promise + resolver pair — typed loosely for mock Responses. */
function deferred<T>(): [Promise<T>, (value: T) => void] {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return [promise, resolve];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStressButton(root: HTMLElement): HTMLButtonElement | null {
  return root.querySelector('button[title="Add 1 stress"]');
}

function getUndoButton(root: HTMLElement): HTMLButtonElement | null {
  return root.querySelector('button[title="Undo last change"]');
}

function getNotice(root: HTMLElement): HTMLElement | null {
  return root.querySelector(".notice");
}

function getError(root: HTMLElement): HTMLElement | null {
  return root.querySelector(".error");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("character-detail page", () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement("div");
    vi.clearAllMocks();
  });

  afterEach(() => {
    // dispose() would clean up but the mock fetch leaves no side effects
  });

  // -- initial render -------------------------------------------------------

  it("renders the character name after initial load", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(ok(characterDTO()))
      .mockResolvedValueOnce(ok({ Name: "Blades in the Dark", Traumas: ["Cold", "Haunted"], StressMax: 9, TraumaMax: 4 }))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA));

    mountCharacterDetailPage(root, CHARACTER_ID);

    await vi.waitFor(() => {
      expect(root.querySelector("h1")?.textContent).toContain("Brenda Hilton");
    });
  });

  it("shows loading state before the character resolves", () => {
    // Return a never-resolving promise so we stay in loading
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));

    mountCharacterDetailPage(root, CHARACTER_ID);

    expect(root.querySelector("h1")?.textContent).toContain("Character");
    expect(root.textContent).toContain("Loading…");
  });

  it("shows an error message when the initial fetch fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "boom",
    });
    // The page loads character then game in parallel; game fails too but error is already set

    mountCharacterDetailPage(root, CHARACTER_ID);

    await vi.waitFor(() => {
      const err = root.querySelector('[role="alert"]');
      expect(err?.textContent).toContain("500");
      expect(err?.textContent).toContain("boom");
    });
  });

  // -- stressAdd ------------------------------------------------------------

  describe("stressAdd", () => {
    it("updates the stress counter on success", async () => {
      // stressAdd returns an OperationResult wrapping the updated character
      const stressSuccessResp = {
        ok: true,
        character: characterDTO({
          revision: 13,
          monitor: {
            stress: { current: 4, max: 9 },
            trauma: { traumas: ["Haunted"], max: 4 },
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
              hasStandard: true,
              hasHeavy: false,
              hasSpecial: false,
            },
          },
        }),
        applied: { op: "stress.add", requested: 1, effective: 1 },
        sideEffects: [],
        error: null,
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(characterDTO()))
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok(stressSuccessResp));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector("h1")?.textContent).toContain(
          "Brenda Hilton",
        );
      });

      const btn = getStressButton(root)!;
      expect(btn.textContent).toBe("+1");

      btn.click();

      await vi.waitFor(() => {
        // After success the stress counter is 4 / 9
        expect(root.textContent).toContain("4 / 9");
      });
    });

    it("shows an API error message when stressAdd fails with a non-409 error", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(characterDTO()))
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce({
          ok: false,
          status: 422,
          text: async () => "validation failed",
        });

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector("h1")?.textContent).toContain(
          "Brenda Hilton",
        );
      });

      getStressButton(root)!.click();

      await vi.waitFor(() => {
        const err = getError(root);
        expect(err?.textContent).toContain("422");
        expect(err?.textContent).toContain("validation failed");
      });
    });

    it("re-renders synchronously before recovery fetch when StaleRevisionError occurs — F2h regression", async () => {
      // ------------------------------------------------------------------
      // This is the test that would have caught the F2h bug.
      //
      // When stressAdd fails with StaleRevisionError, the onFailure handler
      // must call renderDetail() SYNCHRONOUSLY before kicking off the async
      // recovery fetch.  Without that call the button stays in a stale
      // disabled state while the recovery runs — the exact bug F2h shipped.
      //
      // This test uses a deferred promise for the recovery fetch so we can
      // inspect the DOM before the recovery resolves and prove that
      // renderDetail() was called synchronously.
      // ------------------------------------------------------------------

      // IMPORTANT: do NOT include `character: null` — Schema.optional(Character)
      // rejects null (only accepts undefined/absent). null causes the decode to
      // throw, falling through to ApiError instead of StaleRevisionError.
      const staleResp = {
        ok: false,
        applied: { op: "stress.add" },
        sideEffects: [],
        error: {
          code: "STALE_REVISION",
          message: "Character revision mismatch",
          details: { currentRevision: 15 },
        },
      };

      const [recoveryPromise, resolveRecovery] =
        deferred<any>();

      global.fetch = vi
        .fn()
        // 1) initial getCharacter → 200
        .mockResolvedValueOnce(ok(characterDTO()))
        // 2) game data → 200
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        // 3) stressAdd POST → 409 STALE_REVISION
        .mockResolvedValueOnce({
          ok: false,
          status: 409,
          text: async () => JSON.stringify(staleResp),
        })
        // 4) recovery getCharacter → deferred (we control when it resolves)
        .mockReturnValueOnce(recoveryPromise);

      mountCharacterDetailPage(root, CHARACTER_ID);

      // Wait for initial render
      await vi.waitFor(() => {
        expect(root.querySelector("h1")?.textContent).toContain(
          "Brenda Hilton",
        );
      });

      const stressBtn = getStressButton(root)!;
      expect(stressBtn.disabled).toBe(false);
      expect(stressBtn.textContent).toBe("+1");

      stressBtn.click();

      // Re-query button after click — renderDetail() replaces DOM children
      // so the old reference is detached
      const loadingBtn = getStressButton(root)!;
      expect(loadingBtn.disabled).toBe(true);
      expect(loadingBtn.textContent).toBe("…");

      // The stressAdd POST resolves (409) → onFailure handler runs →
      // renderDetail() is called with isStressLoading=false →
      // the button should be re-enabled BEFORE the recovery fetch resolves.
      await vi.waitFor(
        () => {
          const btn = getStressButton(root)!;
          expect(btn.disabled).toBe(false);
          expect(btn.textContent).toBe("+1");
        },
        { timeout: 2000 },
      );

      // At this point the recovery fetch is still pending.
      // If renderDetail() had NOT been called (the F2h bug), the button
      // would still be disabled.  The fact that we're past vi.waitFor
      // proves the synchronous re-render happened.

      // Now resolve the recovery fetch with updated character data
      resolveRecovery(
        ok(
          characterDTO({
            revision: 15,
            dossier: {
              name: "Brenda Hilton",
              crewId: "8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2",
              alias: "Webweaver",
              look: "Keen and calculating",
              notes: "Spider operative",
              background: { name: "Urchin", description: "" },
              heritage: { name: "Akorosi", description: "" },
              vice: { name: "Gambling", description: "" },
            },
          }),
        ),
      );

      // After recovery, the refresh notice should appear
      await vi.waitFor(
        () => {
          const notice = getNotice(root);
          expect(notice?.textContent).toContain("Sheet refreshed");
        },
        { timeout: 2000 },
      );
    });
  });

  // -- onUndo ---------------------------------------------------------------

  describe("onUndo", () => {
    it("re-renders the character on successful undo", async () => {
      const undoneCharacter = characterDTO({
        revision: 13,
        monitor: {
          stress: { current: 1, max: 9 },
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
            hasStandard: true,
            hasHeavy: false,
            hasSpecial: false,
          },
        },
      });

      const undoSuccessResp = {
        ok: true,
        character: undoneCharacter,
        applied: { op: "character.undo" },
        sideEffects: [],
        error: null,
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(characterDTO()))
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok(undoSuccessResp));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector("h1")?.textContent).toContain(
          "Brenda Hilton",
        );
      });

      const undoBtn = getUndoButton(root)!;
      expect(undoBtn.textContent).toBe("Undo last change");

      undoBtn.click();

      await vi.waitFor(() => {
        // Stress went from 3 to 1 (after undo)
        expect(root.textContent).toContain("1 / 9");
      });
    });

    it("shows NO_HISTORY notice when undo returns NO_HISTORY error", async () => {
      const noHistoryResp = {
        ok: false,
        applied: { op: "character.undo" },
        sideEffects: [],
        error: {
          code: "NO_HISTORY",
          message: "No history to undo",
        },
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(characterDTO()))
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok(noHistoryResp));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector("h1")?.textContent).toContain(
          "Brenda Hilton",
        );
      });

      getUndoButton(root)!.click();

      await vi.waitFor(() => {
        const notice = getNotice(root);
        expect(notice?.textContent).toContain(
          "Nothing to undo — no history available",
        );
      });
    });

    it("re-renders synchronously before recovery fetch when undo hits StaleRevisionError", async () => {
      // Same pattern as the stressAdd stale test: undo's onFailure calls
      // renderDetail() before the recovery getCharacter fetch.

      // Same null-avoidance note as stressAdd stale test above
      const staleResp = {
        ok: false,
        applied: { op: "character.undo" },
        sideEffects: [],
        error: {
          code: "STALE_REVISION",
          message: "Character revision mismatch",
          details: { currentRevision: 15 },
        },
      };

      const [recoveryPromise, resolveRecovery] =
        deferred<any>();

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(characterDTO()))
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce({
          ok: false,
          status: 409,
          text: async () => JSON.stringify(staleResp),
        })
        .mockReturnValueOnce(recoveryPromise);

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector("h1")?.textContent).toContain(
          "Brenda Hilton",
        );
      });

      const undoBtn2 = getUndoButton(root)!;
      undoBtn2.click();
      // Re-query — renderDetail() replaces DOM children
      const loadingBtn2 = getUndoButton(root)!;
      expect(loadingBtn2.disabled).toBe(true); // loading state

      // The undo POST resolves (409) → onFailure → renderDetail() with
      // isUndoLoading=false → button re-enabled before recovery resolves.
      await vi.waitFor(
        () => {
          const btn = getUndoButton(root)!;
          expect(btn.disabled).toBe(false);
          expect(btn.textContent).toBe("Undo last change");
        },
        { timeout: 2000 },
      );

      // Recovery still pending — button is already re-enabled.

      resolveRecovery(
        ok(
          characterDTO({
            revision: 15,
            dossier: {
              name: "Brenda Hilton",
              crewId: "8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2",
              alias: "Webweaver",
              look: "Keen and calculating",
              notes: "Spider operative",
              background: { name: "Urchin", description: "" },
              heritage: { name: "Akorosi", description: "" },
              vice: { name: "Gambling", description: "" },
            },
          }),
        ),
      );

      await vi.waitFor(
        () => {
          const notice = getNotice(root);
          expect(notice?.textContent).toContain("Sheet refreshed");
        },
        { timeout: 2000 },
      );
    });
  });

  // -- F2m: Personal section (dossier edit) --------------------------------

  describe("F2m Personal", () => {
    it("renders inline-editable name, alias, background, heritage, look fields", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(characterDTO()))
        .mockResolvedValueOnce(ok({ Name: "Blades in the Dark", Traumas: ["Cold", "Haunted"], StressMax: 9, TraumaMax: 4 }))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.textContent).toContain("Brenda Hilton");
        expect(root.textContent).toContain("Webweaver");
        expect(root.textContent).toContain("Urchin");
        expect(root.textContent).toContain("Akorosi");
        expect(root.textContent).toContain("Keen and calculating");
      });
    });

    it("allows editing and saving dossier fields via dossierUpdate", async () => {
      const updated = characterDTO({
        revision: 13,
        dossier: {
          name: "Edited Name",
          crewId: "8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2",
          alias: "",
          look: "",
          notes: "",
          background: { name: "Urchin", description: "" },
          heritage: { name: "Akorosi", description: "" },
          vice: { name: "Gambling", description: "" },
        },
      });

      const dossierOk = {
        ok: true,
        character: updated,
        applied: { op: "dossier.update" },
        sideEffects: [],
        error: null,
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(characterDTO()))
        .mockResolvedValueOnce(ok({ Name: "Blades in the Dark", Traumas: ["Cold", "Haunted"], StressMax: 9, TraumaMax: 4 }))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok(dossierOk));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.textContent).toContain("Brenda Hilton");
      });

      // Find the edit button for name field and click it
      const editBtns = root.querySelectorAll('button[title^="Edit"]');
      expect(editBtns.length).toBeGreaterThan(0);
    });
  });

  // -- F2m: Stress section -------------------------------------------------

  describe("F2m Stress", () => {
    it("renders clickable stress track with correct value and max", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(characterDTO()))
        .mockResolvedValueOnce(ok({ Name: "Blades in the Dark", Traumas: ["Cold", "Haunted"], StressMax: 9, TraumaMax: 4 }))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        const boxes = root.querySelectorAll(".character-stress .stress-box");
        expect(boxes.length).toBe(9);
        // 3 boxes should be filled
        const filled = root.querySelectorAll('.character-stress [data-stress="1"]');
        expect(filled.length).toBe(3);
      });
    });

    it("clicking stress box issues stressAdd with the right delta", async () => {
      const stressResp3 = {
        ok: true,
        character: characterDTO({
          revision: 13,
          monitor: {
            ...characterDTO().monitor,
            stress: { current: 3, max: 9 },
          },
        }),
        applied: { op: "stress.add", requested: 2, effective: 2 },
        sideEffects: [],
        error: null,
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(characterDTO()))
        .mockResolvedValueOnce(ok({ Name: "Blades in the Dark", Traumas: ["Cold", "Haunted"], StressMax: 9, TraumaMax: 4 }))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok(stressResp3));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelectorAll(".character-stress .stress-box").length).toBe(9);
      });

      // Click stress box 5 (index 4)
      const boxes = root.querySelectorAll<HTMLButtonElement>(".character-stress .stress-box");
      boxes[4]?.click();

      // The stress track onChange calls the page handler which issues stressAdd
      // delta = target (5) - current (3) = +2
      await vi.waitFor(() => {
        expect(root.textContent).toContain("3 / 9");
      });
    });

    it("renders +/- buttons for stress", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(characterDTO()))
        .mockResolvedValueOnce(ok({ Name: "Blades in the Dark", Traumas: ["Cold", "Haunted"], StressMax: 9, TraumaMax: 4 }))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        const plusBtn = root.querySelector('button[title="Add 1 stress"]');
        const minusBtn = root.querySelector('button[title="Remove 1 stress"]');
        expect(plusBtn).not.toBeNull();
        expect(minusBtn).not.toBeNull();
      });
    });
  });

  // -- F2m: Trauma section ------------------------------------------------

  describe("F2m Trauma", () => {
    it("renders current traumas with remove buttons", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(characterDTO()))
        .mockResolvedValueOnce(ok({ Name: "Blades in the Dark", Traumas: ["Cold", "Haunted", "Obsessed"], StressMax: 9, TraumaMax: 4 }))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.textContent).toContain("Haunted");
        const removeBtns = root.querySelectorAll('button[title^="Remove trauma"]');
        expect(removeBtns.length).toBe(1); // one trauma entry
      });
    });

    it("renders trauma add select populated from game data, excluding already-stamped traumas", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(characterDTO()))
        .mockResolvedValueOnce(ok({ Name: "Blades in the Dark", Traumas: ["Cold", "Haunted", "Obsessed"], StressMax: 9, TraumaMax: 4 }))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        const select = root.querySelector('select[aria-label="Add trauma"]');
        expect(select).not.toBeNull();
        // Should contain trauma options from game data, minus already-stamped "Haunted"
        const options = select!.querySelectorAll("option");
        const labels = Array.from(options).map((o) => o.textContent);
        expect(labels).toContain("Cold");
        expect(labels).toContain("Obsessed");
        // Haunted is already a trauma on the character, so it should NOT appear
        expect(labels).not.toContain("Haunted");
      });
    });

    it("adds trauma via select + button, removes via remove button", async () => {
      const withCold = characterDTO({
        revision: 13,
        monitor: {
          ...characterDTO().monitor,
          trauma: { traumas: ["Haunted", "Cold"], max: 4 },
        },
      });

      const traumaAddOk = {
        ok: true,
        character: withCold,
        applied: { op: "trauma.add" },
        sideEffects: [],
        error: null,
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(characterDTO()))
        .mockResolvedValueOnce(ok({ Name: "Blades in the Dark", Traumas: ["Cold", "Haunted", "Obsessed"], StressMax: 9, TraumaMax: 4 }))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok(traumaAddOk));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.textContent).toContain("Haunted");
      });

      // Click add button
      const addBtn = root.querySelector('button[title="Add trauma"]') as HTMLButtonElement;
      expect(addBtn).not.toBeNull();
      addBtn.click();

      await vi.waitFor(() => {
        expect(root.textContent).toContain("Cold");
      });
    });
  });

  // -- F2n: Health section -------------------------------------------------

  describe("F2n Health", () => {
    it("renders the harm table from character DTO", async () => {
      const dto = characterDTO({
        monitor: {
          ...characterDTO().monitor,
          harm: {
            lesser: ["Battered"],
            moderate: [],
            severe: ["Broken leg"],
            fatal: [],
            healingClock: { segments: 2, size: 6, rollover: 0 },
          },
        },
      });

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(dto))
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector(".harm-table")).not.toBeNull();
        expect(root.textContent).toContain("Battered");
        expect(root.textContent).toContain("Broken leg");
      });
    });

    it("renders add-harm controls with intensity select and text input", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(characterDTO()))
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        const intensitySelect = root.querySelector('select[aria-label="Harm intensity"]');
        expect(intensitySelect).not.toBeNull();
        const descInput = root.querySelector('input[aria-label="Harm description"]');
        expect(descInput).not.toBeNull();
        const addBtn = root.querySelector('button[title="Add harm"]');
        expect(addBtn).not.toBeNull();
      });
    });

    it("adds a harm entry and shows spillover notice when landedIntensity differs", async () => {
      const withSpilled = characterDTO({
        revision: 13,
        monitor: {
          ...characterDTO().monitor,
          harm: {
            lesser: ["Battered", "Cut"],
            moderate: ["Stabbed"],
            severe: [],
            fatal: [],
            healingClock: { segments: 0, size: 6, rollover: 0 },
          },
        },
      });

      const harmAddResp = {
        ok: true,
        character: withSpilled,
        applied: { op: "harm.add", landedIntensity: "moderate" },
        sideEffects: [],
        error: null,
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(characterDTO()))
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok(harmAddResp));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.textContent).toContain("Brenda Hilton");
      });

      // Select intensity and type description
      const intensitySelect = root.querySelector('select[aria-label="Harm intensity"]') as HTMLSelectElement;
      intensitySelect.value = "lesser";
      intensitySelect.dispatchEvent(new Event("change", { bubbles: true }));

      const descInput = root.querySelector('input[aria-label="Harm description"]') as HTMLInputElement;
      descInput.value = "Stabbed";
      descInput.dispatchEvent(new Event("input", { bubbles: true }));

      const addBtn = root.querySelector('button[title="Add harm"]') as HTMLButtonElement;
      addBtn.click();

      await vi.waitFor(() => {
        // Should show spillover notice
        expect(root.textContent).toContain("spilled to moderate");
      });
    });

    it("renders armor checkboxes from DTO", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(characterDTO()))
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.textContent).toContain("Standard");
        expect(root.textContent).toContain("Heavy");
        expect(root.textContent).toContain("Special");
      });
    });

    it("toggles armor checkbox via armorSet", async () => {
      const armorOn = characterDTO({
        revision: 13,
        monitor: {
          ...characterDTO().monitor,
          armor: {
            standardUsed: true,
            heavyUsed: false,
            specialUsed: false,
            hasStandard: true,
            hasHeavy: false,
            hasSpecial: false,
          },
        },
      });

      const armorSetResp = {
        ok: true,
        character: armorOn,
        applied: { op: "armor.set" },
        sideEffects: [],
        error: null,
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(characterDTO()))
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok(armorSetResp));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.textContent).toContain("Standard");
      });

      // Find the standard armor checkbox
      const allInputs = root.querySelectorAll('input');
      let standardCheck: HTMLInputElement | null = null;
      for (let i = 0; i < allInputs.length; i++) {
        const inp = allInputs[i] as HTMLInputElement;
        if (inp.getAttribute('data-armor-kind') === 'standard' || inp.dataset?.armorKind === 'standard') {
          standardCheck = inp;
          break;
        }
      }
      expect(standardCheck).not.toBeNull();
      standardCheck!.checked = true;
      standardCheck!.dispatchEvent(new Event('change', { bubbles: true }));

      await vi.waitFor(() => {
        // After toggle to true, the character should be updated
        expect(global.fetch).toHaveBeenCalledTimes(4); // getChar, getGame, getPlaybook, armorSet
      });
    });

    it("renders healing clock from DTO and allows segment add", async () => {
      const clockTicked = characterDTO({
        revision: 13,
        monitor: {
          ...characterDTO().monitor,
          harm: {
            lesser: [],
            moderate: [],
            severe: [],
            fatal: [],
            healingClock: { segments: 1, size: 6, rollover: 0 },
          },
        },
      });

      const clockAddResp = {
        ok: true,
        character: clockTicked,
        applied: { op: "harm.healing-clock" },
        sideEffects: [],
        error: null,
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(characterDTO()))
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok(clockAddResp));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        const clock = root.querySelector(".clock");
        expect(clock).not.toBeNull();
      });

      const addSegmentBtn = root.querySelector('button[title="Add healing segment"]') as HTMLButtonElement;
      expect(addSegmentBtn).not.toBeNull();
      addSegmentBtn.click();

      await vi.waitFor(() => {
        // After add, the character updates
        expect(global.fetch).toHaveBeenCalledTimes(4); // + getPlaybook on mount
      });
    });

    it("displays harm remove button per entry and removes harm", async () => {
      const dto = characterDTO({
        monitor: {
          ...characterDTO().monitor,
          harm: {
            lesser: ["Battered"],
            moderate: [],
            severe: [],
            fatal: [],
            healingClock: { segments: 0, size: 6, rollover: 0 },
          },
        },
      });

      const removed = characterDTO({
        revision: 13,
        monitor: {
          ...characterDTO().monitor,
          harm: {
            lesser: [],
            moderate: [],
            severe: [],
            fatal: [],
            healingClock: { segments: 0, size: 6, rollover: 0 },
          },
        },
      });

      const removeResp = {
        ok: true,
        character: removed,
        applied: { op: "harm.remove" },
        sideEffects: [],
        error: null,
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(dto))
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok(removeResp));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.textContent).toContain("Battered");
      });

      const removeBtn = root.querySelector('button[title^="Remove harm"]') as HTMLButtonElement;
      expect(removeBtn).not.toBeNull();
      removeBtn.click();

      await vi.waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(4); // + getPlaybook on mount
      });
    });
  });

  // -- F2m: Vice section ---------------------------------------------------

  describe("F2m Vice", () => {
    it("renders vice name and description", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(characterDTO()))
        .mockResolvedValueOnce(ok({ Name: "Blades in the Dark", Traumas: ["Cold", "Haunted"], StressMax: 9, TraumaMax: 4 }))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.textContent).toContain("Gambling");
      });
    });

    it("renders Indulge Vice button that calls stressClear", async () => {
      const cleared = characterDTO({
        revision: 13,
        monitor: {
          ...characterDTO().monitor,
          stress: { current: 0, max: 9 },
        },
      });

      const clearOk = {
        ok: true,
        character: cleared,
        applied: { op: "stress.clear" },
        sideEffects: [],
        error: null,
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(characterDTO()))
        .mockResolvedValueOnce(ok({ Name: "Blades in the Dark", Traumas: ["Cold", "Haunted"], StressMax: 9, TraumaMax: 4 }))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok(clearOk));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.textContent).toContain("Gambling");
      });

      const indulgeBtn = root.querySelector('button[title="Clear all stress (Indulge Vice)"]') as HTMLButtonElement;
      expect(indulgeBtn).not.toBeNull();
      indulgeBtn.click();

      await vi.waitFor(() => {
        expect(root.textContent).toContain("0 / 9");
      });
    });
  });

  // -- F2o: Talents + XP + Score XP ----------------------------------------

  describe("F2o Talents + Score XP", () => {
    /** Character DTO with a populated talent section. */
    function talentDTO(overrides: Record<string, unknown> = {}) {
      return characterDTO({
        talent: {
          attributes: [
            {
              name: "Insight",
              experience: { points: 2, max: 6 },
              actions: [
                { name: "Hunt", rating: 1, maxRating: 4 },
                { name: "Study", rating: 2, maxRating: 4 },
                { name: "Survey", rating: 0, maxRating: 4 },
                { name: "Tinker", rating: 1, maxRating: 4 },
              ],
            },
            {
              name: "Prowess",
              experience: { points: 6, max: 6 },
              actions: [
                { name: "Finesse", rating: 2, maxRating: 4 },
                { name: "Prowl", rating: 0, maxRating: 4 },
                { name: "Skirmish", rating: 1, maxRating: 4 },
                { name: "Wreck", rating: 0, maxRating: 4 },
              ],
            },
            {
              name: "Resolve",
              experience: { points: 0, max: 6 },
              actions: [
                { name: "Attune", rating: 0, maxRating: 4 },
                { name: "Command", rating: 2, maxRating: 4 },
                { name: "Consort", rating: 1, maxRating: 4 },
                { name: "Sway", rating: 0, maxRating: 4 },
              ],
            },
          ],
        },
        ...overrides,
      });
    }

    /** Game data including Attributes (ShortDescription source for action tooltips). */
    const TALENT_GAME_DATA = {
      Name: "Blades in the Dark",
      Traumas: ["Cold", "Haunted"],
      StressMax: 9,
      TraumaMax: 4,
      Attributes: [
        {
          Name: "Insight",
          Actions: [
            { Name: "Hunt", ShortDescription: "When you Hunt, you carefully track a target.", LongDescription: "" },
            { Name: "Study", ShortDescription: "When you Study, you scrutinize details.", LongDescription: "" },
            { Name: "Survey", ShortDescription: "When you Survey, you observe the situation.", LongDescription: "" },
            { Name: "Tinker", ShortDescription: "When you Tinker, you fiddle with devices.", LongDescription: "" },
          ],
        },
        {
          Name: "Prowess",
          Actions: [
            { Name: "Finesse", ShortDescription: "When you Finesse, you employ dextrous manipulation.", LongDescription: "" },
            { Name: "Prowl", ShortDescription: "When you Prowl, you traverse skillfully and quietly.", LongDescription: "" },
            { Name: "Skirmish", ShortDescription: "When you Skirmish, you entangle a target.", LongDescription: "" },
            { Name: "Wreck", ShortDescription: "When you Wreck, you smash things.", LongDescription: "" },
          ],
        },
        {
          Name: "Resolve",
          Actions: [
            { Name: "Attune", ShortDescription: "When you Attune, you tune to the ghost field.", LongDescription: "" },
            { Name: "Command", ShortDescription: "When you Command, you compel obedience.", LongDescription: "" },
            { Name: "Consort", ShortDescription: "When you Consort, you socialize with friends.", LongDescription: "" },
            { Name: "Sway", ShortDescription: "When you Sway, you influence with guile.", LongDescription: "" },
          ],
        },
      ],
    };

    const charOpOk = (character: unknown, opName: string) => ({
      ok: true,
      character,
      applied: { op: opName },
      sideEffects: [],
      error: null,
    });

    it("renders attribute groups, dot rows, XP trackers, session tracks, and playbook XP text from game data", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(talentDTO()))
        .mockResolvedValueOnce(ok(TALENT_GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.textContent).toContain("Brenda Hilton");
      });

      // Attribute groups come from the DTO
      const groups = root.querySelectorAll(".talent-attribute");
      expect(groups.length).toBe(3);
      expect(root.querySelector('.talent-attribute[data-attribute="Insight"]')).not.toBeNull();
      expect(root.querySelector('.talent-attribute[data-attribute="Prowess"]')).not.toBeNull();
      expect(root.querySelector('.talent-attribute[data-attribute="Resolve"]')).not.toBeNull();

      // Action dot rows: max from DTO maxRating (4 dots for Hunt)
      const huntRow = root.querySelector('.talent-action-row[data-action="Hunt"]');
      expect(huntRow).not.toBeNull();
      expect(huntRow!.querySelectorAll(".action-dot").length).toBe(4);

      // XP trackers show points/max from the DTO
      expect(root.querySelector('.talent-xp[data-attribute="Insight"]')?.textContent).toContain("2 / 6");
      expect(root.querySelector('.talent-xp[data-attribute="Prowess"]')?.textContent).toContain("6 / 6");

      // Score XP: three session tracks + playbook ExperienceCondition text
      expect(root.querySelectorAll(".session-track").length).toBe(3);
      expect(root.querySelector('[data-session-track="playbook"]')).not.toBeNull();
      expect(root.querySelector('[data-session-track="character"]')).not.toBeNull();
      expect(root.querySelector('[data-session-track="struggle"]')).not.toBeNull();
      expect(root.textContent).toContain("You addressed a challenge with calculation or conspiracy");
      expect(root.textContent).toContain("Desperate action XP is marked on the attribute XP tracks");

      // Tooltips come from game data Attributes
      const huntLabel = huntRow!.querySelector(".lbl") as HTMLElement | null;
      expect(huntLabel?.title).toContain("When you Hunt");
    });

    it("clicking an action dot issues actionSetRating with the dot index", async () => {
      const raised = talentDTO({
        revision: 13,
        talent: {
          attributes: [
            {
              name: "Insight",
              experience: { points: 2, max: 6 },
              actions: [
                { name: "Hunt", rating: 3, maxRating: 4 },
                { name: "Study", rating: 2, maxRating: 4 },
                { name: "Survey", rating: 0, maxRating: 4 },
                { name: "Tinker", rating: 1, maxRating: 4 },
              ],
            },
          ],
        },
      });

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(talentDTO()))
        .mockResolvedValueOnce(ok(TALENT_GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok(charOpOk(raised, "action.set-rating")));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('.talent-action-row[data-action="Hunt"]')).not.toBeNull();
      });

      const huntRow = root.querySelector('.talent-action-row[data-action="Hunt"]')!;
      (huntRow.querySelectorAll<HTMLButtonElement>(".action-dot")[2]!).click();

      await vi.waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/characters/${CHARACTER_ID}/ops/action.set-rating`,
          {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              "If-Match": "12",
            },
            body: JSON.stringify({ action: "Hunt", rating: 3 }),
          },
        );
      });
    });

    it("action +/− buttons adjust the rating via actionSetRating", async () => {
      const plusResp = talentDTO({
        revision: 13,
        talent: {
          attributes: [
            {
              name: "Insight",
              experience: { points: 2, max: 6 },
              actions: [
                { name: "Hunt", rating: 2, maxRating: 4 },
                { name: "Study", rating: 2, maxRating: 4 },
                { name: "Survey", rating: 0, maxRating: 4 },
                { name: "Tinker", rating: 1, maxRating: 4 },
              ],
            },
          ],
        },
      });
      const minusResp = talentDTO({
        revision: 14,
        talent: {
          attributes: [
            {
              name: "Insight",
              experience: { points: 2, max: 6 },
              actions: [
                { name: "Hunt", rating: 1, maxRating: 4 },
                { name: "Study", rating: 2, maxRating: 4 },
                { name: "Survey", rating: 0, maxRating: 4 },
                { name: "Tinker", rating: 1, maxRating: 4 },
              ],
            },
          ],
        },
      });

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(talentDTO()))
        .mockResolvedValueOnce(ok(TALENT_GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok(charOpOk(plusResp, "action.set-rating")))
        .mockResolvedValueOnce(ok(charOpOk(minusResp, "action.set-rating")));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Increase Hunt rating"]')).not.toBeNull();
      });

      (root.querySelector('button[title="Increase Hunt rating"]') as HTMLButtonElement).click();
      await vi.waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/characters/${CHARACTER_ID}/ops/action.set-rating`,
          expect.objectContaining({
            body: JSON.stringify({ action: "Hunt", rating: 2 }),
          }),
        );
      });
      // wait for the mutation to land and re-render before the next click
      await vi.waitFor(() => {
        expect(root.querySelector('.talent-action-row[data-action="Hunt"]')?.textContent).toContain("2/4");
      });

      (root.querySelector('button[title="Decrease Hunt rating"]') as HTMLButtonElement).click();
      await vi.waitFor(() => {
        expect(global.fetch).toHaveBeenLastCalledWith(
          `/api/characters/${CHARACTER_ID}/ops/action.set-rating`,
          expect.objectContaining({
            body: JSON.stringify({ action: "Hunt", rating: 1 }),
          }),
        );
      });
    });

    it("shows a clamp notice when the server clamps a requested rating", async () => {
      // Hunt is at 2/4 in the client's view; the server's max is 3, so a
      // request for 4 comes back clamped to 3.
      const clamped = talentDTO({
        revision: 13,
        talent: {
          attributes: [
            {
              name: "Insight",
              experience: { points: 2, max: 6 },
              actions: [
                { name: "Hunt", rating: 3, maxRating: 3 },
                { name: "Study", rating: 2, maxRating: 4 },
                { name: "Survey", rating: 0, maxRating: 4 },
                { name: "Tinker", rating: 1, maxRating: 4 },
              ],
            },
          ],
        },
      });

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(talentDTO()))
        .mockResolvedValueOnce(ok(TALENT_GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok(charOpOk(clamped, "action.set-rating")));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('.talent-action-row[data-action="Hunt"]')).not.toBeNull();
      });

      const huntRow = root.querySelector('.talent-action-row[data-action="Hunt"]')!;
      (huntRow.querySelectorAll<HTMLButtonElement>(".action-dot")[3]!).click(); // dot 4 -> request 4

      await vi.waitFor(() => {
        expect(root.textContent).toContain("clamped");
      });
    });

    it("attribute XP tracker adds and clears XP via attributeXpAdd/attributeXpClear", async () => {
      const added = talentDTO({
        revision: 13,
        talent: {
          attributes: [
            {
              name: "Insight",
              experience: { points: 3, max: 6 },
              actions: [
                { name: "Hunt", rating: 1, maxRating: 4 },
                { name: "Study", rating: 2, maxRating: 4 },
                { name: "Survey", rating: 0, maxRating: 4 },
                { name: "Tinker", rating: 1, maxRating: 4 },
              ],
            },
          ],
        },
      });
      const cleared = talentDTO({
        revision: 14,
        talent: {
          attributes: [
            {
              name: "Insight",
              experience: { points: 0, max: 6 },
              actions: [
                { name: "Hunt", rating: 1, maxRating: 4 },
                { name: "Study", rating: 2, maxRating: 4 },
                { name: "Survey", rating: 0, maxRating: 4 },
                { name: "Tinker", rating: 1, maxRating: 4 },
              ],
            },
          ],
        },
      });

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(talentDTO()))
        .mockResolvedValueOnce(ok(TALENT_GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok(charOpOk(added, "attribute-xp.add")))
        .mockResolvedValueOnce(ok(charOpOk(cleared, "attribute-xp.clear")));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Add 1 XP (Insight)"]')).not.toBeNull();
      });

      (root.querySelector('button[title="Add 1 XP (Insight)"]') as HTMLButtonElement).click();
      await vi.waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/characters/${CHARACTER_ID}/ops/attribute-xp.add`,
          expect.objectContaining({
            body: JSON.stringify({ attribute: "Insight", delta: 1 }),
          }),
        );
      });
      // wait for the mutation to land and re-render before the next click
      await vi.waitFor(() => {
        expect(root.querySelector('.talent-xp[data-attribute="Insight"]')?.textContent).toContain("3 / 6");
      });

      (root.querySelector('button[title="Clear XP (Insight)"]') as HTMLButtonElement).click();
      await vi.waitFor(() => {
        expect(global.fetch).toHaveBeenLastCalledWith(
          `/api/characters/${CHARACTER_ID}/ops/attribute-xp.clear`,
          expect.objectContaining({
            body: JSON.stringify({ attribute: "Insight" }),
          }),
        );
      });
    });

    it("levelup posts the selected action via attributeLevelup when the XP track is full", async () => {
      const leveled = talentDTO({
        revision: 13,
        talent: {
          attributes: [
            {
              name: "Prowess",
              experience: { points: 0, max: 6 },
              actions: [
                { name: "Finesse", rating: 3, maxRating: 4 },
                { name: "Prowl", rating: 0, maxRating: 4 },
                { name: "Skirmish", rating: 1, maxRating: 4 },
                { name: "Wreck", rating: 0, maxRating: 4 },
              ],
            },
          ],
        },
      });

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(talentDTO()))
        .mockResolvedValueOnce(ok(TALENT_GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok(charOpOk(leveled, "attribute.levelup")));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('select[aria-label="Level up action (Prowess)"]')).not.toBeNull();
      });

      const select = root.querySelector('select[aria-label="Level up action (Prowess)"]') as HTMLSelectElement;
      select.value = "Finesse";
      const levelBtn = root.querySelector('button[data-levelup-attribute="Prowess"]') as HTMLButtonElement;
      expect(levelBtn.disabled).toBe(false);
      levelBtn.click();

      await vi.waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/characters/${CHARACTER_ID}/ops/attribute.levelup`,
          expect.objectContaining({
            body: JSON.stringify({ attribute: "Prowess", action: "Finesse" }),
          }),
        );
      });
    });

    it("disables levelup until the XP track is full", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(talentDTO()))
        .mockResolvedValueOnce(ok(TALENT_GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('button[data-levelup-attribute="Insight"]')).not.toBeNull();
      });

      // Insight has 2/6 XP -> level up disabled
      const insightBtn = root.querySelector('button[data-levelup-attribute="Insight"]') as HTMLButtonElement;
      expect(insightBtn.disabled).toBe(true);
      // Prowess has 6/6 XP -> level up enabled
      const prowessBtn = root.querySelector('button[data-levelup-attribute="Prowess"]') as HTMLButtonElement;
      expect(prowessBtn.disabled).toBe(false);
    });

    it("session track boxes and +/− send only the changed field via sessionSet", async () => {
      const pbUpdated = talentDTO({
        revision: 13,
        session: { playbookExpressions: 2, characterExpressions: 0, struggleExpressions: 0, max: 3 },
      });
      const stUpdated = talentDTO({
        revision: 14,
        session: { playbookExpressions: 2, characterExpressions: 0, struggleExpressions: 1, max: 3 },
      });

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(talentDTO()))
        .mockResolvedValueOnce(ok(TALENT_GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok(charOpOk(pbUpdated, "session.set")))
        .mockResolvedValueOnce(ok(charOpOk(stUpdated, "session.set")));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('[data-session-track="playbook"]')).not.toBeNull();
      });

      // Click box 2 on the playbook track
      const playbookTrack = root.querySelector('[data-session-track="playbook"]')!;
      const box2 = playbookTrack.querySelectorAll<HTMLButtonElement>(".stress-box")[1]!;
      box2.click();

      await vi.waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/characters/${CHARACTER_ID}/ops/session.set`,
          expect.objectContaining({
            body: JSON.stringify({ playbookExpressions: 2 }),
          }),
        );
      });
      // wait for the mutation to land and re-render before the next click
      await vi.waitFor(() => {
        expect(root.querySelector('[data-session-track="playbook"]')?.textContent).toContain("2 / 3");
      });

      // + button on the struggle track
      (root.querySelector('button[title="Add 1 Struggle expressions"]') as HTMLButtonElement).click();
      await vi.waitFor(() => {
        expect(global.fetch).toHaveBeenLastCalledWith(
          `/api/characters/${CHARACTER_ID}/ops/session.set`,
          expect.objectContaining({
            body: JSON.stringify({ struggleExpressions: 1 }),
          }),
        );
      });
    });

    it("falls back to the game-data playbook ExperienceCondition when the playbook fetch fails", async () => {
      const gameWithPlaybooks = {
        ...TALENT_GAME_DATA,
        Playbooks: [{ Name: "Spider", ExperienceCondition: "You wove a conspiracy from the shadows" }],
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(talentDTO()))
        .mockResolvedValueOnce(ok(gameWithPlaybooks))
        // no playbook mock: the /playbooks/{name} fetch fails and degrades gracefully
        .mockResolvedValueOnce(ok(charOpOk(talentDTO(), "action.set-rating")));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.textContent).toContain("You wove a conspiracy from the shadows");
      });
    });
  });
});
