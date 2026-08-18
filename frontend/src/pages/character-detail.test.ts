// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
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
      vice: { name: "Gambling", description: "", purveyor: { name: "Mother Narya", description: "House of the Weeping Lady, Six Towers" } },
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
const GAME_DATA = {
  Name: "Blades in the Dark",
  Traumas: ["Cold", "Haunted", "Obsessed", "Paranoid"],
  StressMax: 9,
  TraumaMax: 4,
  Heritages: [
    { Name: "Akoros", BlurbFlavor: "from 'round here", Description: "Akoros is the largest and most industrialized land in the Imperium." },
    { Name: "Skovlan", BlurbFlavor: "from Skovlan", Description: "Skovlan is a conquered island nation of farmers and miners." },
  ],
  Backgrounds: [
    { Name: "Academic", BlurbFlavor: "an academic", Example: "A scholar, a professor or student from Doskvol Academy, etc." },
    { Name: "Labor", BlurbFlavor: "a laborer", Example: "A servant, a factory worker, a coach driver, etc." },
  ],
  Vices: [
    {
      Name: "Obligation",
      Description: "You're devoted to a family, a cause, an organization, etc.",
      Sources: ["Mother Narya, House of the Weeping Lady, Six Towers.", "Ilacille, the ruins of the Temple to forgotten gods, Coalridge."],
    },
    {
      Name: "Gambling",
      Description: "You crave games of chance, betting on sport, etc.",
      Sources: ["The Crows' Nest, Brightstone.", "The Devil's Tooth, Nightmarket."],
    },
  ],
};

/** Crew summaries for the membership selector (GET /api/crews). */
const CREWS_DATA = [
  {
    // SC-F1 frozen decoder requires the summary discriminant.
    kind: "crew",
    id: "8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2",
    name: "The Red Sashes",
    crewType: "Assassins",
    gameStem: "blades-in-the-dark",
    tier: 0,
    heat: 4,
    wanted: 1,
    rep: 3,
    hold: "strong",
    memberCount: 1,
    revision: 5,
  },
];

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

/**
 * SC-F3: the mount now fetches /api/characters/{id}/capabilities as a sixth
 * load call. Every test that mounts must supply a mock that FAILS caps decode
 * (caps=null → graceful game-data fallback) so it isn't consumed by the
 * capabilities fetch instead of the intended op mock.
 */

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
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}));

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

  it("renders a recoverable error card while keeping technical details collapsed", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "raw schema boom",
    });

    mountCharacterDetailPage(root, CHARACTER_ID);

    await vi.waitFor(() => {
      const err = root.querySelector(".error-card-head");
      expect(err?.textContent).toBe("This character sheet could not be loaded.");
      expect(root.querySelector("button")?.textContent).toBe("Retry");
      expect(root.querySelector('a[href="/roster"]')?.textContent).toBe("Back to roster");
      const details = root.querySelector("details");
      expect(details?.open).toBe(false);
      expect(details?.textContent).toContain("raw schema boom");
      expect(err?.textContent).not.toContain("raw schema boom");
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
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
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
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
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
        // FV-023: rejected HTTP gets distinct friendly copy, never the body.
        expect(err?.textContent).toBe("The server returned an error (422).");
        expect(err?.textContent).not.toContain("validation failed");
        // FV-024: the error message is an accessible alert.
        expect(err?.getAttribute("role")).toBe("alert");
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
          status: 409,
          message: "Character revision mismatch",
          retryable: true,
          recovery: "Refresh the sheet and retry.",
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
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
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
              vice: { name: "Gambling", description: "", purveyor: { name: "Mother Narya", description: "House of the Weeping Lady, Six Towers" } },
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
        canUndo: true,
        historyCount: 3,
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(characterDTO()))
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
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

      // FV-028: positive feedback names the restored state (stress went 3→1),
      // and the history count is surfaced.
      await vi.waitFor(() => {
        expect(root.textContent).toContain("1 / 9");
        expect(root.textContent).toContain("Undone — restored stress to 1/9");
        expect(root.textContent).toContain("3 snapshotted changes can be undone");
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
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
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
          status: 409,
          message: "Character revision mismatch",
          retryable: true,
          recovery: "Refresh the sheet and retry.",
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
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
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
              vice: { name: "Gambling", description: "", purveyor: { name: "Mother Narya", description: "House of the Weeping Lady, Six Towers" } },
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
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}));

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
          vice: { name: "Gambling", description: "", purveyor: { name: "Mother Narya", description: "House of the Weeping Lady, Six Towers" } },
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
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
        .mockResolvedValueOnce(ok(dossierOk));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.textContent).toContain("Brenda Hilton");
      });

      // Find the edit button for name field and click it
      const editBtns = root.querySelectorAll('button[title^="Edit"]');
      expect(editBtns.length).toBeGreaterThan(0);
    });

    it("ENTER in a dossier input saves the typed value (same as the checkmark) — F2aa", async () => {
      const updated = characterDTO({
        revision: 13,
        dossier: {
          ...characterDTO().dossier,
          name: "Renamed",
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
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
        .mockResolvedValueOnce(ok(dossierOk));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector("h1")?.textContent).toContain("Brenda Hilton");
      });

      (root.querySelector('button[title="Edit Name"]') as HTMLButtonElement).click();

      const input = root.querySelector('input[aria-label="Name"]') as HTMLInputElement;
      expect(input).not.toBeNull();
      input.value = "Renamed";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );

      await vi.waitFor(() => {
        const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
        const updateCall = calls.find((c) => String(c[0]).endsWith("/ops/dossier.update"));
        expect(updateCall).toBeTruthy();
        expect(updateCall![1].body).toBe(JSON.stringify({ name: "Renamed" }));
        expect(updateCall![1].headers["If-Match"]).toBe("12");
      });
    });

    it("TAB order in a dossier edit is input → save → cancel (natural document order) — F2aa", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(characterDTO()))
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector("h1")?.textContent).toContain("Brenda Hilton");
      });

      (root.querySelector('button[title="Edit Name"]') as HTMLButtonElement).click();

      const input = root.querySelector('input[aria-label="Name"]') as HTMLInputElement;
      const saveBtn = root.querySelector('button[title="Save"]') as HTMLButtonElement;
      const cancelBtn = root.querySelector('button[title="Cancel"]') as HTMLButtonElement;
      expect(input).not.toBeNull();
      expect(saveBtn).not.toBeNull();
      expect(cancelBtn).not.toBeNull();

      const following = (a: Element, b: Element) =>
        (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      expect(following(input, saveBtn)).toBe(true);
      expect(following(saveBtn, cancelBtn)).toBe(true);
    });
  });

  // -- F2ab: Heritage/Background dropdowns + Vice in Stress -----------------

  describe("F2ab Heritage + Background dropdowns", () => {
    const dropdownDTO = () =>
      characterDTO({
        dossier: {
          ...characterDTO().dossier,
          heritage: { name: "Akoros", description: "" },
          background: { name: "Academic", description: "" },
        },
      });

    it("renders heritage/background read mode with game-data descriptions", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(dropdownDTO()))
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector(".character-personal")?.textContent).toContain("Akoros");
      });
      const personal = root.querySelector(".character-personal") as HTMLElement;
      // Game-data description/example is shown next to the name.
      expect(personal.textContent).toContain("Akoros is the largest and most industrialized land in the Imperium.");
      expect(personal.textContent).toContain("A scholar, a professor or student from Doskvol Academy, etc.");
    });

    it("editing heritage via dropdown saves name + game-data description via dossierUpdate", async () => {
      const updated = characterDTO({
        revision: 13,
        dossier: {
          ...characterDTO().dossier,
          heritage: { name: "Skovlan", description: "Skovlan is a conquered island nation of farmers and miners." },
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
        .mockResolvedValueOnce(ok(dropdownDTO()))
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
        .mockResolvedValueOnce(ok(dossierOk));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Edit Heritage"]')).not.toBeNull();
      });

      (root.querySelector('button[title="Edit Heritage"]') as HTMLButtonElement).click();

      const select = root.querySelector('select[aria-label="Heritage (choose)"]') as HTMLSelectElement;
      expect(select).not.toBeNull();
      expect(Array.from(select.options).map((o) => o.value)).toEqual(["Akoros", "Skovlan", "__custom__"]);
      select.value = "Skovlan";
      (root.querySelector('button[title="Save"]') as HTMLButtonElement).click();

      await vi.waitFor(() => {
        const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
        const updateCall = calls.find((c) => String(c[0]).endsWith("/ops/dossier.update"));
        expect(updateCall).toBeTruthy();
        expect(updateCall![1].body).toBe(JSON.stringify({
          heritage: { name: "Skovlan", description: "Skovlan is a conquered island nation of farmers and miners." },
        }));
        expect(updateCall![1].headers["If-Match"]).toBe("12");
      });
    });

    it("custom heritage reveals a text input and saves with empty description", async () => {
      const updated = characterDTO({
        revision: 13,
        dossier: {
          ...characterDTO().dossier,
          heritage: { name: "My Homeland", description: "" },
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
        .mockResolvedValueOnce(ok(dropdownDTO()))
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
        .mockResolvedValueOnce(ok(dossierOk));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Edit Heritage"]')).not.toBeNull();
      });
      (root.querySelector('button[title="Edit Heritage"]') as HTMLButtonElement).click();

      const select = root.querySelector('select[aria-label="Heritage (choose)"]') as HTMLSelectElement;
      select.value = "__custom__";
      select.dispatchEvent(new Event("change", { bubbles: true }));

      const customInput = root.querySelector('input[aria-label="Heritage custom name"]') as HTMLInputElement;
      expect(customInput).not.toBeNull();
      customInput.value = "My Homeland";
      customInput.dispatchEvent(new Event("input", { bubbles: true }));
      (root.querySelector('button[title="Save"]') as HTMLButtonElement).click();

      await vi.waitFor(() => {
        const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
        const updateCall = calls.find((c) => String(c[0]).endsWith("/ops/dossier.update"));
        expect(updateCall).toBeTruthy();
        expect(updateCall![1].body).toBe(JSON.stringify({ heritage: { name: "My Homeland", description: "" } }));
      });
    });

    it("editing background via dropdown saves name + game-data example as description", async () => {
      const updated = characterDTO({
        revision: 13,
        dossier: {
          ...characterDTO().dossier,
          background: { name: "Labor", description: "A servant, a factory worker, a coach driver, etc." },
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
        .mockResolvedValueOnce(ok(dropdownDTO()))
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
        .mockResolvedValueOnce(ok(dossierOk));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Edit Background"]')).not.toBeNull();
      });
      (root.querySelector('button[title="Edit Background"]') as HTMLButtonElement).click();

      const select = root.querySelector('select[aria-label="Background (choose)"]') as HTMLSelectElement;
      select.value = "Labor";
      (root.querySelector('button[title="Save"]') as HTMLButtonElement).click();

      await vi.waitFor(() => {
        const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
        const updateCall = calls.find((c) => String(c[0]).endsWith("/ops/dossier.update"));
        expect(updateCall).toBeTruthy();
        expect(updateCall![1].body).toBe(JSON.stringify({
          background: { name: "Labor", description: "A servant, a factory worker, a coach driver, etc." },
        }));
      });
    });

    it("current custom names open the editor on Custom… with the name prefilled", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(characterDTO()))
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Edit Heritage"]')).not.toBeNull();
      });
      (root.querySelector('button[title="Edit Heritage"]') as HTMLButtonElement).click();

      const select = root.querySelector('select[aria-label="Heritage (choose)"]') as HTMLSelectElement;
      expect(select.value).toBe("__custom__");
      const customInput = root.querySelector('input[aria-label="Heritage custom name"]') as HTMLInputElement;
      expect(customInput.value).toBe("Akorosi");
    });
  });

  describe("F2ab Vice in Stress + purveyor", () => {
    const viceDTO = () =>
      characterDTO({
        dossier: {
          ...characterDTO().dossier,
          vice: {
            name: "Obligation",
            description: "You're devoted to a family, a cause, an organization, etc.",
            purveyor: { name: "Mother Narya, House of the Weeping Lady, Six Towers.", description: "House of the Weeping Lady" },
          },
        },
      });

    it("renders vice inside the stress section with purveyor", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(viceDTO()))
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.textContent).toContain("Obligation");
      });
      const stress = root.querySelector(".character-stress") as HTMLElement;
      expect(stress.textContent).toContain("Obligation");
      expect(stress.textContent).toContain("You're devoted to a family, a cause, an organization, etc.");
      expect(stress.textContent).toContain("Mother Narya, House of the Weeping Lady, Six Towers.");
    });

    it("editing vice saves name + description + purveyor {name, description}", async () => {
      const updated = characterDTO({
        revision: 13,
        dossier: {
          ...characterDTO().dossier,
          vice: {
            name: "Obligation",
            description: "You're devoted to a family, a cause, an organization, etc.",
            purveyor: { name: "Ilacille, the ruins of the Temple to forgotten gods, Coalridge.", description: "Ruins contact" },
          },
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
        .mockResolvedValueOnce(ok(viceDTO()))
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
        .mockResolvedValueOnce(ok(dossierOk));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Edit Vice"]')).not.toBeNull();
      });
      (root.querySelector('button[title="Edit Vice"]') as HTMLButtonElement).click();

      const viceSelect = root.querySelector('select[aria-label="Vice (choose)"]') as HTMLSelectElement;
      expect(viceSelect.value).toBe("Obligation");
      const purveyorSelect = root.querySelector('select[aria-label="Vice purveyor (choose)"]') as HTMLSelectElement;
      expect(Array.from(purveyorSelect.options).map((o) => o.value)).toEqual([
        "", "Mother Narya, House of the Weeping Lady, Six Towers.", "Ilacille, the ruins of the Temple to forgotten gods, Coalridge.",
      ]);
      purveyorSelect.value = "Ilacille, the ruins of the Temple to forgotten gods, Coalridge.";
      purveyorSelect.dispatchEvent(new Event("change", { bubbles: true }));

      const purveyorName = root.querySelector('input[aria-label="Vice purveyor name"]') as HTMLInputElement;
      expect(purveyorName.value).toBe("Ilacille, the ruins of the Temple to forgotten gods, Coalridge.");
      const purveyorDesc = root.querySelector('input[aria-label="Vice purveyor description"]') as HTMLInputElement;
      purveyorDesc.value = "Ruins contact";
      purveyorDesc.dispatchEvent(new Event("input", { bubbles: true }));

      (root.querySelector('button[title="Save"]') as HTMLButtonElement).click();

      await vi.waitFor(() => {
        const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
        const updateCall = calls.find((c) => String(c[0]).endsWith("/ops/dossier.update"));
        expect(updateCall).toBeTruthy();
        expect(updateCall![1].body).toBe(JSON.stringify({
          vice: {
            name: "Obligation",
            description: "You're devoted to a family, a cause, an organization, etc.",
            purveyor: { name: "Ilacille, the ruins of the Temple to forgotten gods, Coalridge.", description: "Ruins contact" },
          },
        }));
      });
    });

    it("custom vice saves custom name/description and purveyor", async () => {
      const updated = characterDTO({
        revision: 13,
        dossier: {
          ...characterDTO().dossier,
          vice: {
            name: "Tinkering",
            description: "I must take things apart",
            purveyor: { name: "Gearsmith Alva", description: "Nightmarket workshop" },
          },
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
        .mockResolvedValueOnce(ok(viceDTO()))
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
        .mockResolvedValueOnce(ok(dossierOk));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Edit Vice"]')).not.toBeNull();
      });
      (root.querySelector('button[title="Edit Vice"]') as HTMLButtonElement).click();

      const viceSelect = root.querySelector('select[aria-label="Vice (choose)"]') as HTMLSelectElement;
      viceSelect.value = "__custom__";
      viceSelect.dispatchEvent(new Event("change", { bubbles: true }));

      const nameInput = root.querySelector('input[aria-label="Vice custom name"]') as HTMLInputElement;
      nameInput.value = "Tinkering";
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
      const descInput = root.querySelector('input[aria-label="Vice custom description"]') as HTMLInputElement;
      descInput.value = "I must take things apart";
      descInput.dispatchEvent(new Event("input", { bubbles: true }));
      const purveyorName = root.querySelector('input[aria-label="Vice purveyor name"]') as HTMLInputElement;
      purveyorName.value = "Gearsmith Alva";
      purveyorName.dispatchEvent(new Event("input", { bubbles: true }));
      const purveyorDesc = root.querySelector('input[aria-label="Vice purveyor description"]') as HTMLInputElement;
      purveyorDesc.value = "Nightmarket workshop";
      purveyorDesc.dispatchEvent(new Event("input", { bubbles: true }));

      (root.querySelector('button[title="Save"]') as HTMLButtonElement).click();

      await vi.waitFor(() => {
        const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
        const updateCall = calls.find((c) => String(c[0]).endsWith("/ops/dossier.update"));
        expect(updateCall).toBeTruthy();
        expect(updateCall![1].body).toBe(JSON.stringify({
          vice: {
            name: "Tinkering",
            description: "I must take things apart",
            purveyor: { name: "Gearsmith Alva", description: "Nightmarket workshop" },
          },
        }));
      });
    });
  });

  // -- F2m: Stress section -------------------------------------------------

  describe("F2m Stress", () => {
    it("renders clickable stress track with correct value and max", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(characterDTO()))
        .mockResolvedValueOnce(ok({ Name: "Blades in the Dark", Traumas: ["Cold", "Haunted"], StressMax: 9, TraumaMax: 4 }))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}));

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
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
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
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}));

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
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}));

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
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}));

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
      // trauma.add is resolution-only: the generic add control is enabled
      // while a trauma is pending.
      const pending = characterDTO({
        traumaPending: true,
      });
      const withCold = characterDTO({
        revision: 13,
        monitor: {
          ...characterDTO().monitor,
          trauma: { traumas: ["Haunted", "Cold"], max: 4 },
        },
        traumaPending: false,
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
        .mockResolvedValueOnce(ok(pending))
        .mockResolvedValueOnce(ok({ Name: "Blades in the Dark", Traumas: ["Cold", "Haunted", "Obsessed"], StressMax: 9, TraumaMax: 4 }))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
        .mockResolvedValueOnce(ok(traumaAddOk));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.textContent).toContain("Haunted");
      });

      // Click add button
      const addBtn = root.querySelector('button[title="Resolve pending trauma"]') as HTMLButtonElement;
      expect(addBtn).not.toBeNull();
      addBtn.click();

      await vi.waitFor(() => {
        expect(root.textContent).toContain("Cold");
      });
    });
  });

  // -- F2ab: Stress-full → trauma picker + Heal picker ----------------------

  describe("F4 pending-trauma picker", () => {
    it("shows the pending-trauma prompt when traumaPending is set, with out-of-action copy", async () => {
      const pending = characterDTO({
        monitor: {
          ...characterDTO().monitor,
          stress: { current: 9, max: 9 },
        },
        traumaPending: true,
      });

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(pending))
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector(".stress-trauma-picker")).not.toBeNull();
      });
      const picker = root.querySelector(".stress-trauma-picker") as HTMLElement;
      expect(picker.textContent).toContain("Stress is at its maximum");
      expect(picker.textContent).toContain("out of action");
      const select = picker.querySelector('select[aria-label="Trauma when stressed"]') as HTMLSelectElement;
      // Haunted is already stamped on the fixture — only unstamped traumas are offered.
      expect(Array.from(select.options).map((o) => o.value)).toEqual(["", "Cold", "Obsessed", "Paranoid"]);
      expect(picker.querySelector('button[title="Take trauma to resolve pending stress (stress stays full)"]')).not.toBeNull();
    });

    it("hits max via the + button, then resolving keeps stress full and marks out-of-action (no stress.clear)", async () => {
      const nearFull = characterDTO({
        monitor: {
          ...characterDTO().monitor,
          stress: { current: 8, max: 9 },
        },
      });
      const full = characterDTO({
        revision: 13,
        monitor: {
          ...characterDTO().monitor,
          stress: { current: 9, max: 9 },
        },
        traumaPending: true,
      });
      const withTrauma = characterDTO({
        revision: 14,
        monitor: {
          ...characterDTO().monitor,
          stress: { current: 9, max: 9 },
          trauma: { traumas: ["Haunted", "Cold"], max: 4 },
        },
        traumaPending: false,
        isOutOfAction: true,
        stressClearPending: true,
      });
      const stressOk = {
        ok: true,
        character: full,
        applied: { op: "stress.add", requested: 1, effective: 1 },
        sideEffects: [],
        error: null,
      };
      const traumaOk = {
        ok: true,
        character: withTrauma,
        applied: { op: "trauma.add" },
        sideEffects: [],
        error: null,
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(nearFull))
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
        .mockResolvedValueOnce(ok(stressOk))
        .mockResolvedValueOnce(ok(traumaOk));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector("h1")?.textContent).toContain("Brenda Hilton");
      });
      // 8/9 is not full — no pending prompt yet.
      expect(root.querySelector(".stress-trauma-picker")).toBeNull();
      expect(root.textContent).toContain("8 / 9");

      (root.querySelector('button[title="Add 1 stress"]') as HTMLButtonElement).click();

      // Server returns traumaPending — the pending prompt appears.
      await vi.waitFor(() => {
        expect(root.querySelector(".stress-trauma-picker")).not.toBeNull();
      });

      const pickerSelect = root.querySelector('select[aria-label="Trauma when stressed"]') as HTMLSelectElement;
      pickerSelect.value = "Cold";
      (root.querySelector('button[title="Take trauma to resolve pending stress (stress stays full)"]') as HTMLButtonElement).click();

      // Q42: resolving keeps stress FULL (no stress.clear chain) and marks
      // out-of-action — the sheet explains it instead.
      await vi.waitFor(() => {
        expect(root.textContent).toContain("9 / 9");
        expect(root.textContent).toContain("Cold");
      });
      await vi.waitFor(() => {
        expect(root.querySelector(".stress-trauma-picker")).toBeNull();
      });
      // Out-of-action explained (not the picker's copy, which is now gone).
      expect(root.textContent).toContain("out of action for the remainder");

      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const traumaCall = calls.find((c) => String(c[0]).endsWith("/ops/trauma.add"));
      expect(traumaCall).toBeTruthy();
      expect(traumaCall![1].body).toBe(JSON.stringify({ trauma: "Cold" }));
      expect(traumaCall![1].headers["If-Match"]).toBe("13");
      // No stress.clear should be issued after resolving the pending trauma.
      const clearCall = calls.find((c) => String(c[0]).endsWith("/ops/stress.clear"));
      expect(clearCall).toBeUndefined();
    });
  });

  describe("F2ab Heal picker", () => {
    const healDTO = (overrides: Record<string, unknown> = {}) =>
      characterDTO({
        monitor: {
          ...characterDTO().monitor,
          harm: {
            lesser: ["Battered"],
            moderate: ["Stabbed"],
            severe: [],
            fatal: [],
            healingClock: { segments: 6, size: 6, rollover: 0 },
          },
        },
        ...overrides,
      });

    it("renders the heal picker with active harms when the clock is full", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(healDTO()))
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        const select = root.querySelector('select[aria-label="Harm to heal"]') as HTMLSelectElement;
        expect(select).not.toBeNull();
        expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
          "--", "lesser: Battered", "moderate: Stabbed",
        ]);
      });
    });

    it("healing posts harm.heal with the selected harm's intensity and description", async () => {
      const healed = healDTO({
        revision: 13,
        monitor: {
          ...healDTO().monitor,
          harm: {
            lesser: ["Battered"],
            moderate: [],
            severe: [],
            fatal: [],
            healingClock: { segments: 0, size: 6, rollover: 0 },
          },
        },
      });
      const healOk = {
        ok: true,
        character: healed,
        applied: { op: "harm.heal" },
        sideEffects: [],
        error: null,
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(healDTO()))
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
        .mockResolvedValueOnce(ok(healOk));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('select[aria-label="Harm to heal"]')).not.toBeNull();
      });

      const select = root.querySelector('select[aria-label="Harm to heal"]') as HTMLSelectElement;
      select.value = "1"; // moderate: Stabbed
      (root.querySelector('button[title="Heal harm (requires full clock)"]') as HTMLButtonElement).click();

      await vi.waitFor(() => {
        const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
        const healCall = calls.find((c) => String(c[0]).endsWith("/ops/harm.heal"));
        expect(healCall).toBeTruthy();
        expect(healCall![1].body).toBe(JSON.stringify({ intensity: "moderate", description: "Stabbed" }));
        expect(healCall![1].headers["If-Match"]).toBe("12");
      });
      await vi.waitFor(() => {
        expect(root.textContent).toContain("Healed moderate — Stabbed; clock reset");
      });
    });

    it("shows a friendly CANNOT_HEAL notice when the server rejects healing", async () => {
      const healErr = {
        ok: false,
        applied: { op: "harm.heal" },
        sideEffects: [],
        error: { code: "CANNOT_HEAL", message: "healing clock is not full" },
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(healDTO()))
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
        .mockResolvedValueOnce(ok(healErr));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('select[aria-label="Harm to heal"]')).not.toBeNull();
      });

      const select = root.querySelector('select[aria-label="Harm to heal"]') as HTMLSelectElement;
      select.value = "0";
      (root.querySelector('button[title="Heal harm (requires full clock)"]') as HTMLButtonElement).click();

      await vi.waitFor(() => {
        const err = root.querySelector(".error");
        expect(err?.textContent).toContain("Cannot heal");
      });
    });

    it("shows a friendly NOT_FOUND notice when the selected harm is gone", async () => {
      const healErr = {
        ok: false,
        applied: { op: "harm.heal" },
        sideEffects: [],
        error: { code: "NOT_FOUND", message: "no such harm" },
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(healDTO()))
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
        .mockResolvedValueOnce(ok(healErr));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('select[aria-label="Harm to heal"]')).not.toBeNull();
      });

      const select = root.querySelector('select[aria-label="Harm to heal"]') as HTMLSelectElement;
      select.value = "0";
      (root.querySelector('button[title="Heal harm (requires full clock)"]') as HTMLButtonElement).click();

      await vi.waitFor(() => {
        const err = root.querySelector(".error");
        expect(err?.textContent).toContain("no longer there");
      });
    });

    it("shows (no harms to heal) when the clock is full but no harms are active", async () => {
      const noHarms = characterDTO({
        monitor: {
          ...characterDTO().monitor,
          harm: {
            lesser: [],
            moderate: [],
            severe: [],
            fatal: [],
            healingClock: { segments: 6, size: 6, rollover: 0 },
          },
        },
      });

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(noHarms))
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.textContent).toContain("(no harms to heal)");
      });
      const healBtn = root.querySelector('button[title="Heal harm (requires full clock)"]') as HTMLButtonElement;
      expect(healBtn.disabled).toBe(true);
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
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}));

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
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}));

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
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
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
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}));

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
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
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
        expect(global.fetch).toHaveBeenCalledTimes(7); // + caps projection on mount
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
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
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
        expect(global.fetch).toHaveBeenCalledTimes(7); // + caps projection on mount
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
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
        .mockResolvedValueOnce(ok(removeResp));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.textContent).toContain("Battered");
      });

      const removeBtn = root.querySelector("button.harm-remove-btn") as HTMLButtonElement;
      expect(removeBtn).not.toBeNull();
      // F2aa: the harm-table remove button is a subtle ghost icon — tooltip
      // marks it as a clerical-error correction, not the healing path.
      expect(removeBtn.title).toBe("Remove (clerical error)");
      removeBtn.click();

      await vi.waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(7); // + caps projection on mount
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
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}));

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
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
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
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}));

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

      // F2aa: one clean name per action — the underlined .action-name from
      // the dots component. The duplicate dot-row label is gone.
      const nameEls = huntRow!.querySelectorAll(".action-name");
      expect(nameEls.length).toBe(1);
      expect(nameEls[0]?.textContent).toBe("Hunt");
      expect(huntRow!.querySelectorAll(".lbl").length).toBe(0);
      // Tooltips come from game data Attributes, on the action-name
      expect(nameEls[0]?.getAttribute("title")).toContain("When you Hunt");
    });

    // SC-F3/P21: the UI respects the server-computed effective action cap —
    // a crewless DTO at DTO max 4 whose effective cap is 3 renders 3 dots
    // (never offering a dot the server would reject with RATING_MAXED).
    it("renders the effective action cap from the capability projection, not the raw max", async () => {
      const capsProjection = {
        characterId: CHARACTER_ID,
        effectiveActionCaps: [
          { action: "Hunt", maxRating: 4, effectiveMax: 3, masteryTotalBoxes: 3, masteryMarkedBoxes: 0 },
          { action: "Study", maxRating: 4, effectiveMax: 3, masteryTotalBoxes: 3, masteryMarkedBoxes: 0 },
          { action: "Survey", maxRating: 4, effectiveMax: 3, masteryTotalBoxes: 3, masteryMarkedBoxes: 0 },
          { action: "Tinker", maxRating: 4, effectiveMax: 3, masteryTotalBoxes: 3, masteryMarkedBoxes: 0 },
        ],
        harmCapacities: [
          { level: "lesser", capacity: 2, remaining: 2 },
          { level: "moderate", capacity: 2, remaining: 2 },
          { level: "severe", capacity: 1, remaining: 1 },
          { level: "fatal", capacity: 1, remaining: 1 },
        ],
        loadLimits: [{ commitment: "none", maxBulk: 8, remainingBulk: 8 }],
        availableAbilityTakes: [],
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(talentDTO()))
        .mockResolvedValueOnce(ok(TALENT_GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok(capsProjection));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('.talent-action-row[data-action="Hunt"]')).not.toBeNull();
      });

      const huntRow = root.querySelector('.talent-action-row[data-action="Hunt"]')!;
      // 3 dots (the effective cap), not the raw 4-dot max.
      expect(huntRow.querySelectorAll(".action-dot")).toHaveLength(3);
      // Count text reflects the effective cap, not the raw maxRating.
      expect(huntRow.textContent).toContain("1/3");
    });

    // FV-007/P07: the healing-clock +1 control sends a DELTA (clock-progress
    // family), never an absolute segment count — a clock at 5/6 sends 1, with
    // rollover handled by the server.
    it("healing-clock +1 sends a segment delta, not an absolute count", async () => {
      const atFive = characterDTO({
        revision: 13,
        monitor: {
          stress: { current: 3, max: 9 },
          trauma: { traumas: ["Haunted"], max: 4 },
          harm: {
            lesser: [],
            moderate: [],
            severe: [],
            fatal: [],
            healingClock: { segments: 5, size: 6, rollover: 0 },
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
      const atSix = characterDTO({
        revision: 14,
        monitor: {
          stress: { current: 3, max: 9 },
          trauma: { traumas: ["Haunted"], max: 4 },
          harm: {
            lesser: [],
            moderate: [],
            severe: [],
            fatal: [],
            healingClock: { segments: 6, size: 6, rollover: 0 },
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
      const tickOp = {
        ok: true,
        character: atSix,
        applied: { op: "harm.healing-clock", requested: 1, effective: 1 },
        sideEffects: [],
        error: null,
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(atFive))
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
        // capabilities GET degrades (no explicit mock) — harm/load fall back.
        .mockResolvedValueOnce(ok(tickOp))
        .mockResolvedValueOnce(ok(tickOp));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        const btn = root.querySelector('button[title="Add healing segment"]') as HTMLButtonElement;
        expect(btn).not.toBeNull();
      });
      // Extra load fetches consume the extra OK responses; the capabilities
      // GET and the op both resolve through the leftover ok() mocks. Cast the
      // mock fetch to read the request body.
      const fetchMock = global.fetch as unknown as Mock;
      const addSegmentBtn = root.querySelector('button[title="Add healing segment"]') as HTMLButtonElement;
      addSegmentBtn.click();

      await vi.waitFor(() => {
        const opCall = fetchMock.mock.calls.find(
          (c) => String(c[0]).includes("/ops/harm.healing-clock"),
        );
        expect(opCall).toBeTruthy();
        const body = JSON.parse(String((opCall![1] as RequestInit).body));
        // delta 1, never the absolute 6 a 5/6 clock would otherwise send.
        expect(body).toEqual({ segments: 1 });
      });
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
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
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

    it("action dots adjust the rating via actionSetRating", async () => {
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
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
        .mockResolvedValueOnce(ok(charOpOk(plusResp, "action.set-rating")))
        .mockResolvedValueOnce(ok(charOpOk(minusResp, "action.set-rating")));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('button[aria-label="Hunt 2"]')).not.toBeNull();
      });

      // Click dot 2 → rating 2
      (root.querySelector('button[aria-label="Hunt 2"]') as HTMLButtonElement).click();
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

      // Click dot 2 again (filled terminal) → clears to 1
      (root.querySelector('button[aria-label="Hunt 2"]') as HTMLButtonElement).click();
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
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
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
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
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
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
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
        .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}));

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
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
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
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
        // no playbook mock: the /playbooks/{name} fetch fails and degrades gracefully
        .mockResolvedValueOnce(ok(charOpOk(talentDTO(), "action.set-rating")));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.textContent).toContain("You wove a conspiracy from the shadows");
      });
    });
  });

  describe("F2p Playbook", () => {
    /** Character DTO with a populated playbook section. */
    function playbookDTO(overrides: Record<string, unknown> = {}) {
      return characterDTO({
        playbook: {
          name: "Spider",
          experience: { points: 4, max: 8 },
          abilities: [
            { name: "Battleborn", description: "You may expend your special armor.", timesTaken: 1 },
            { name: "Veteran", description: "Choose a special ability from another source.", timesTaken: 2 },
          ],
        },
        ...overrides,
      });
    }

    /** Playbook settings with SpecialAbilities (game data — the take-menu source). */
    const PLAYBOOK_ABILITIES_DATA = {
      Name: "Spider",
      Hook: "Spiders are good at masterminding maneuvers.",
      ExperienceCondition: "You addressed a challenge with calculation or conspiracy",
      SpecialAbilities: [
        { Name: "Battleborn", TimesTakeable: 1, Description: "You may expend your special armor." },
        { Name: "Bodyguard", TimesTakeable: 1, Description: "When you protect a teammate, take +1d." },
        { Name: "Veteran", TimesTakeable: 99, Description: "Choose a special ability from another source." },
      ],
      Items: [],
      Rolodex: { Name: "Shrewd Friends", Friends: [] },
      DefaultActionPoints: [],
    };

    const charOpOk = (character: unknown, opName: string) => ({
      ok: true,
      character,
      applied: { op: opName },
      sideEffects: [],
      error: null,
    });

    it("renders XP tracker, taken abilities from DTO, and take select from game-data SpecialAbilities", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(playbookDTO()))
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_ABILITIES_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector(".character-playbook")).not.toBeNull();
      });

      // XP tracker shows points/max from the DTO
      expect(root.querySelector(".playbook-xp")?.textContent).toContain("4 / 8");

      // Taken abilities come from the DTO with description + timesTaken
      const entries = root.querySelectorAll(".ability-entry");
      expect(entries.length).toBe(2);
      const battleborn = root.querySelector('.ability-entry[data-ability="Battleborn"]');
      expect(battleborn?.textContent).toContain("You may expend your special armor.");
      const veteran = root.querySelector('.ability-entry[data-ability="Veteran"]');
      expect(veteran?.textContent).toContain("×2");
      expect(veteran?.textContent).toContain("Choose a special ability from another source.");

      // Take select: from game-data SpecialAbilities, excluding maxed takes
      const select = root.querySelector('select[aria-label="Take ability"]') as HTMLSelectElement;
      const options = Array.from(select.options).map((o) => o.value);
      expect(options).toEqual(["", "Bodyguard", "Veteran"]); // Battleborn excluded (taken == TimesTakeable)

      // <details>/<summary> shows the description of the pre-selected ability
      const details = root.querySelector(".ability-description");
      expect(details?.querySelector("summary")?.textContent).toBe("Bodyguard");
      expect(details?.textContent).toContain("When you protect a teammate, take +1d.");
    });

    it("XP tracker +/− posts playbookXpAdd and clear posts playbookXpClear", async () => {
      const added = playbookDTO({
        revision: 13,
        playbook: { name: "Spider", experience: { points: 5, max: 8 }, abilities: [] },
      });
      const cleared = playbookDTO({
        revision: 14,
        playbook: { name: "Spider", experience: { points: 0, max: 8 }, abilities: [] },
      });

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(playbookDTO()))
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_ABILITIES_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
        .mockResolvedValueOnce(ok(charOpOk(added, "playbook-xp.add")))
        .mockResolvedValueOnce(ok(charOpOk(playbookDTO(), "playbook-xp.add")))
        .mockResolvedValueOnce(ok(charOpOk(cleared, "playbook-xp.clear")));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Add 1 playbook XP"]')).not.toBeNull();
      });

      // +1 → playbook-xp.add { delta: 1 }
      (root.querySelector('button[title="Add 1 playbook XP"]') as HTMLButtonElement).click();
      await vi.waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/characters/${CHARACTER_ID}/ops/playbook-xp.add`,
          expect.objectContaining({ body: JSON.stringify({ delta: 1 }) }),
        );
      });
      await vi.waitFor(() => {
        expect(root.querySelector(".playbook-xp")?.textContent).toContain("5 / 8");
      });

      // −1 → playbook-xp.add { delta: -1 }
      (root.querySelector('button[title="Remove 1 playbook XP"]') as HTMLButtonElement).click();
      await vi.waitFor(() => {
        expect(global.fetch).toHaveBeenLastCalledWith(
          `/api/characters/${CHARACTER_ID}/ops/playbook-xp.add`,
          expect.objectContaining({ body: JSON.stringify({ delta: -1 }) }),
        );
      });
      await vi.waitFor(() => {
        expect(root.querySelector(".playbook-xp")?.textContent).toContain("4 / 8");
      });

      // clear → playbook-xp.clear (no body)
      (root.querySelector('button[title="Clear playbook XP"]') as HTMLButtonElement).click();
      await vi.waitFor(() => {
        expect(global.fetch).toHaveBeenLastCalledWith(
          `/api/characters/${CHARACTER_ID}/ops/playbook-xp.clear`,
          expect.objectContaining({ method: "POST" }),
        );
      });
      await vi.waitFor(() => {
        expect(root.querySelector(".playbook-xp")?.textContent).toContain("0 / 8");
      });
    });

    it("take posts abilityTake with the selected ability and renders the new entry", async () => {
      const taken = playbookDTO({
        revision: 13,
        playbook: {
          name: "Spider",
          experience: { points: 4, max: 8 },
          abilities: [
            { name: "Battleborn", description: "You may expend your special armor.", timesTaken: 1 },
            { name: "Bodyguard", description: "When you protect a teammate, take +1d.", timesTaken: 1 },
            { name: "Veteran", description: "Choose a special ability from another source.", timesTaken: 2 },
          ],
        },
      });

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(playbookDTO()))
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_ABILITIES_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
        .mockResolvedValueOnce(ok(charOpOk(taken, "ability.take")));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('select[aria-label="Take ability"]')).not.toBeNull();
      });

      // Select Bodyguard (pre-selected) and take it
      (root.querySelector('button[title="Take ability"]') as HTMLButtonElement).click();
      await vi.waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/characters/${CHARACTER_ID}/ops/ability.take`,
          expect.objectContaining({ body: JSON.stringify({ name: "Bodyguard" }) }),
        );
      });
      await vi.waitFor(() => {
        expect(root.querySelector('.ability-entry[data-ability="Bodyguard"]')).not.toBeNull();
      });
    });

    it("remove posts abilityRemove with the ability name", async () => {
      const removed = playbookDTO({
        revision: 13,
        playbook: {
          name: "Spider",
          experience: { points: 4, max: 8 },
          abilities: [{ name: "Veteran", description: "Choose a special ability from another source.", timesTaken: 1 }],
        },
      });

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(playbookDTO()))
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_ABILITIES_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
        .mockResolvedValueOnce(ok(charOpOk(removed, "ability.remove")));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Remove ability: Battleborn"]')).not.toBeNull();
      });

      (root.querySelector('button[title="Remove ability: Battleborn"]') as HTMLButtonElement).click();
      await vi.waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/characters/${CHARACTER_ID}/ops/ability.remove`,
          expect.objectContaining({ body: JSON.stringify({ name: "Battleborn" }) }),
        );
      });
      await vi.waitFor(() => {
        expect(root.querySelector('.ability-entry[data-ability="Battleborn"]')).toBeNull();
      });
    });

    it("shows a friendly notice when abilityTake returns an op-level ABILITY_MAXED error", async () => {
      const opErr = {
        ok: false,
        applied: { op: "ability.take" },
        sideEffects: [],
        error: { code: "ABILITY_MAXED", message: "already taken to its limit" },
        character: playbookDTO(),
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(playbookDTO()))
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(PLAYBOOK_ABILITIES_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
        .mockResolvedValueOnce(ok(opErr));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Take ability"]')).not.toBeNull();
      });

      (root.querySelector('button[title="Take ability"]') as HTMLButtonElement).click();
      await vi.waitFor(() => {
        const err = root.querySelector(".error");
        // FV-024: known code maps to user copy; no raw code/DTO string.
        expect(err?.textContent).toContain("That ability is already taken to its limit");
        expect(err?.textContent).not.toContain("ABILITY_MAXED");
        expect(err?.getAttribute("role")).toBe("alert");
      });
    });

    it("falls back to game-data Playbooks SpecialAbilities when the playbook fetch fails", async () => {
      const gameWithPlaybooks = {
        ...GAME_DATA,
        Playbooks: [
          {
            Name: "Spider",
            SpecialAbilities: [
              { Name: "Bodyguard", TimesTakeable: 1, Description: "When you protect a teammate, take +1d." },
            ],
          },
        ],
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(playbookDTO({ playbook: { name: "Spider", experience: { points: 4, max: 8 }, abilities: [] } })))
        .mockResolvedValueOnce(ok(gameWithPlaybooks))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        const select = root.querySelector('select[aria-label="Take ability"]') as HTMLSelectElement;
        expect(Array.from(select.options).map((o) => o.value)).toEqual(["", "Bodyguard"]);
      });
    });
  });
describe("F2r Gear", () => {
    /** Character DTO with a populated gear section. */
    function gearDTO(overrides: Record<string, unknown> = {}) {
      return characterDTO({
        gear: {
          loadout: [],
          availableGear: [],
          commitment: "none",
          isCommitmentLocked: false,
          maxBulk: 5,
        },
        ...overrides,
      });
    }

    /** Game data with SharedItems (the add-menu source for shared gear). */
    const GEAR_GAME_DATA = {
      ...GAME_DATA,
      SharedItems: [
        { Name: "A Blade or Two", Bulk: 1 },
        { Name: "Throwing Knives", Bulk: 1 },
        { Name: "A Large Weapon", Bulk: 2 },
      ],
    };

    /** Playbook settings with Items (the add-menu source for playbook gear). */
    const GEAR_PLAYBOOK_DATA = {
      ...PLAYBOOK_DATA,
      Items: [
        { Name: "Fine cover identity", Bulk: 0 },
        { Name: "Concealed palm pistol", Bulk: 0 },
        { Name: "A Blade or Two", Bulk: 1 }, // dup with SharedItems — must be deduped
      ],
    };

    const charOpOk = (character: unknown, opName: string) => ({
      ok: true,
      character,
      applied: { op: opName },
      sideEffects: [],
      error: null,
    });

    it("renders the loadout from the DTO with bulk sum and derived headroom", async () => {
      const dto = gearDTO({
        gear: {
          loadout: [
            { name: "Fine cover identity", bulk: 0 },
            { name: "A Blade or Two", bulk: 1 },
            { name: "A Large Weapon", bulk: 2 },
          ],
          availableGear: [
            { name: "Fine cover identity", bulk: 0 },
            { name: "A Blade or Two", bulk: 1 },
            { name: "A Large Weapon", bulk: 2 },
          ],
          commitment: "normal",
          isCommitmentLocked: true,
          maxBulk: 5,
        },
      });

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(dto))
        .mockResolvedValueOnce(ok(GEAR_GAME_DATA))
        .mockResolvedValueOnce(ok(GEAR_PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector(".character-gear")).not.toBeNull();
      });

      // Each loadout item shows name + bulk
      const entries = root.querySelectorAll(".gear-loadout-entry");
      expect(entries.length).toBe(3);
      const blade = root.querySelector('.gear-loadout-entry[data-gear-item="A Blade or Two"]');
      expect(blade?.textContent).toContain("A Blade or Two");
      expect(blade?.textContent).toContain("1");
      const large = root.querySelector('.gear-loadout-entry[data-gear-item="A Large Weapon"]');
      expect(large?.textContent).toContain("2");

      // Bulk sum and derived headroom (maxBulk - sum, from the DTO — never hardcoded)
      expect(root.querySelector(".gear-bulk-sum")?.textContent).toContain("3 / 5");
      expect(root.querySelector(".gear-headroom")?.textContent).toContain("2");

      // Commitment + lock state rendered
      expect(root.querySelector('select[aria-label="Set commitment"]')).not.toBeNull();
      expect(root.querySelector('button[title="Unlock commitment"]')).not.toBeNull();
    });

    it("populates the add menu from playbook Items + SharedItems (deduped by name) inside details/summary", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(gearDTO()))
        .mockResolvedValueOnce(ok(GEAR_GAME_DATA))
        .mockResolvedValueOnce(ok(GEAR_PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('select[aria-label="Add gear item"]')).not.toBeNull();
      });

      // Menu comes from game data only: playbook Items + SharedItems, deduped by name
      const select = root.querySelector('select[aria-label="Add gear item"]') as HTMLSelectElement;
      const options = Array.from(select.options).map((o) => o.value);
      expect(options).toEqual(["", "Fine cover identity", "Concealed palm pistol", "A Blade or Two", "Throwing Knives", "A Large Weapon"]);
      // Bulk shown per option
      const large = Array.from(select.options).find((o) => o.value === "A Large Weapon");
      expect(large?.textContent).toContain("2");

      // Per the plan idiom the menu lives in a <details>/<summary>
      const details = root.querySelector("details.gear-add-menu");
      expect(details?.querySelector("summary")?.textContent).toContain("Add item");
    });

    it("adds an item from the menu via gearAdd with name + bulk from game data", async () => {
      const added = gearDTO({
        revision: 13,
        gear: {
          loadout: [],
          availableGear: [{ name: "A Large Weapon", bulk: 2 }],
          commitment: "none",
          isCommitmentLocked: false,
          maxBulk: 5,
        },
      });

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(gearDTO()))
        .mockResolvedValueOnce(ok(GEAR_GAME_DATA))
        .mockResolvedValueOnce(ok(GEAR_PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
        .mockResolvedValueOnce(ok(charOpOk(added, "gear.add")));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Add gear item"]')).not.toBeNull();
      });

      const select = root.querySelector('select[aria-label="Add gear item"]') as HTMLSelectElement;
      select.value = "A Large Weapon";
      (root.querySelector('button[title="Add gear item"]') as HTMLButtonElement).click();

      await vi.waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/characters/${CHARACTER_ID}/ops/gear.add`,
          expect.objectContaining({ body: JSON.stringify({ name: "A Large Weapon", bulk: 2 }) }),
        );
      });
      // The new item appears in the loadout selector (availableGear from DTO)
      await vi.waitFor(() => {
        const gearSelect = root.querySelector('select[aria-label="Select gear item"]') as HTMLSelectElement;
        expect(Array.from(gearSelect.options).map((o) => o.value)).toContain("A Large Weapon");
      });
    });

    it("removes a loadout item via gearRemove with its name", async () => {
      const dto = gearDTO({
        gear: {
          loadout: [{ name: "Fine cover identity", bulk: 0 }],
          availableGear: [{ name: "Fine cover identity", bulk: 0 }],
          commitment: "normal",
          isCommitmentLocked: false,
          maxBulk: 5,
        },
      });
      const removed = gearDTO({
        revision: 13,
        gear: {
          loadout: [],
          availableGear: [],
          commitment: "normal",
          isCommitmentLocked: false,
          maxBulk: 5,
        },
      });

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(dto))
        .mockResolvedValueOnce(ok(GEAR_GAME_DATA))
        .mockResolvedValueOnce(ok(GEAR_PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
        .mockResolvedValueOnce(ok(charOpOk(removed, "gear.remove")));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Remove gear: Fine cover identity"]')).not.toBeNull();
      });

      (root.querySelector('button[title="Remove gear: Fine cover identity"]') as HTMLButtonElement).click();
      await vi.waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/characters/${CHARACTER_ID}/ops/gear.remove`,
          expect.objectContaining({ body: JSON.stringify({ name: "Fine cover identity" }) }),
        );
      });
      await vi.waitFor(() => {
        expect(root.querySelector('.gear-loadout-entry[data-gear-item="Fine cover identity"]')).toBeNull();
      });
    });

    it("sets the commitment via gearSetCommitment and reflects maxBulk from the DTO", async () => {
      const set = gearDTO({
        revision: 13,
        gear: {
          loadout: [],
          availableGear: [],
          commitment: "heavy",
          isCommitmentLocked: false,
          maxBulk: 6,
        },
      });

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(gearDTO()))
        .mockResolvedValueOnce(ok(GEAR_GAME_DATA))
        .mockResolvedValueOnce(ok(GEAR_PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
        .mockResolvedValueOnce(ok(charOpOk(set, "gear.set-commitment")));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('select[aria-label="Set commitment"]')).not.toBeNull();
      });

      const select = root.querySelector('select[aria-label="Set commitment"]') as HTMLSelectElement;
      select.value = "heavy";
      (root.querySelector('button[title="Set commitment"]') as HTMLButtonElement).click();

      await vi.waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/characters/${CHARACTER_ID}/ops/gear.set-commitment`,
          expect.objectContaining({ body: JSON.stringify({ commitment: "heavy" }) }),
        );
      });
      await vi.waitFor(() => {
        // maxBulk comes from the updated DTO (6 for heavy) — never hardcoded
        expect(root.querySelector(".gear-bulk-sum")?.textContent).toContain("0 / 6");
      });
    });

    it("commits and uncommits items from the loadout selector via gearCommit/gearUncommit", async () => {
      const committed = gearDTO({
        revision: 13,
        gear: {
          loadout: [{ name: "A Blade or Two", bulk: 1 }],
          availableGear: [{ name: "A Blade or Two", bulk: 1 }],
          commitment: "normal",
          isCommitmentLocked: true,
          maxBulk: 5,
        },
      });
      const uncommitted = gearDTO({
        revision: 14,
        gear: {
          loadout: [],
          availableGear: [{ name: "A Blade or Two", bulk: 1 }],
          commitment: "normal",
          isCommitmentLocked: true,
          maxBulk: 5,
        },
      });

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(gearDTO({ gear: {
          loadout: [],
          availableGear: [{ name: "A Blade or Two", bulk: 1 }],
          commitment: "normal",
          isCommitmentLocked: true,
          maxBulk: 5,
        } })))
        .mockResolvedValueOnce(ok(GEAR_GAME_DATA))
        .mockResolvedValueOnce(ok(GEAR_PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
        .mockResolvedValueOnce(ok(charOpOk(committed, "gear.commit")))
        .mockResolvedValueOnce(ok(charOpOk(uncommitted, "gear.uncommit")));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('select[aria-label="Select gear item"]')).not.toBeNull();
      });

      // commit: select the item, click commit → gearCommit { name }
      const gearSelect = root.querySelector('select[aria-label="Select gear item"]') as HTMLSelectElement;
      gearSelect.value = "A Blade or Two";
      (root.querySelector('button[title="Commit selected gear"]') as HTMLButtonElement).click();
      await vi.waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/characters/${CHARACTER_ID}/ops/gear.commit`,
          expect.objectContaining({ body: JSON.stringify({ name: "A Blade or Two" }) }),
        );
      });
      await vi.waitFor(() => {
        expect(root.querySelector('.gear-loadout-entry[data-gear-item="A Blade or Two"]')).not.toBeNull();
      });

      // uncommit: re-select the item (the re-render resets the select), then
      // click uncommit → gearUncommit { name }
      const gearSelect2 = root.querySelector('select[aria-label="Select gear item"]') as HTMLSelectElement;
      gearSelect2.value = "A Blade or Two";
      (root.querySelector('button[title="Uncommit selected gear"]') as HTMLButtonElement).click();
      await vi.waitFor(() => {
        expect(global.fetch).toHaveBeenLastCalledWith(
          `/api/characters/${CHARACTER_ID}/ops/gear.uncommit`,
          expect.objectContaining({ body: JSON.stringify({ name: "A Blade or Two" }) }),
        );
      });
      await vi.waitFor(() => {
        expect(root.querySelector('.gear-loadout-entry[data-gear-item="A Blade or Two"]')).toBeNull();
      });
    });

    it("locks/unlocks the commitment via gearLock/gearUnlock", async () => {
      const locked = gearDTO({
        revision: 13,
        gear: {
          loadout: [],
          availableGear: [],
          commitment: "normal",
          isCommitmentLocked: true,
          maxBulk: 5,
        },
      });
      const unlocked = gearDTO({
        revision: 14,
        gear: {
          loadout: [],
          availableGear: [],
          commitment: "normal",
          isCommitmentLocked: false,
          maxBulk: 5,
        },
      });

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(gearDTO({ gear: {
          loadout: [],
          availableGear: [],
          commitment: "normal",
          isCommitmentLocked: false,
          maxBulk: 5,
        } })))
        .mockResolvedValueOnce(ok(GEAR_GAME_DATA))
        .mockResolvedValueOnce(ok(GEAR_PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
        .mockResolvedValueOnce(ok(charOpOk(locked, "gear.lock")))
        .mockResolvedValueOnce(ok(charOpOk(unlocked, "gear.unlock")));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Lock commitment"]')).not.toBeNull();
      });

      (root.querySelector('button[title="Lock commitment"]') as HTMLButtonElement).click();
      await vi.waitFor(() => {
        expect(global.fetch).toHaveBeenLastCalledWith(
          `/api/characters/${CHARACTER_ID}/ops/gear.lock`,
          expect.objectContaining({ method: "POST" }),
        );
      });
      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Unlock commitment"]')).not.toBeNull();
      });

      (root.querySelector('button[title="Unlock commitment"]') as HTMLButtonElement).click();
      await vi.waitFor(() => {
        expect(global.fetch).toHaveBeenLastCalledWith(
          `/api/characters/${CHARACTER_ID}/ops/gear.unlock`,
          expect.objectContaining({ method: "POST" }),
        );
      });
      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Lock commitment"]')).not.toBeNull();
      });
    });

    it("surfaces a COMMITMENT_LOCKED op error when set-commitment is rejected server-side", async () => {
      const opErr = {
        ok: false,
        applied: { op: "gear.set-commitment" },
        sideEffects: [],
        error: { code: "COMMITMENT_LOCKED", message: "commitment is locked" },
        character: gearDTO({ gear: {
          loadout: [],
          availableGear: [],
          commitment: "normal",
          isCommitmentLocked: true,
          maxBulk: 5,
        } }),
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(gearDTO({ gear: {
          loadout: [],
          availableGear: [],
          commitment: "normal",
          isCommitmentLocked: true,
          maxBulk: 5,
        } })))
        .mockResolvedValueOnce(ok(GEAR_GAME_DATA))
        .mockResolvedValueOnce(ok(GEAR_PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
        .mockResolvedValueOnce(ok(opErr));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Set commitment"]')).not.toBeNull();
      });

      const select = root.querySelector('select[aria-label="Set commitment"]') as HTMLSelectElement;
      select.value = "heavy";
      (root.querySelector('button[title="Set commitment"]') as HTMLButtonElement).click();

      await vi.waitFor(() => {
        const err = root.querySelector(".error");
        // FV-024: known code maps to user copy; no raw code/DTO string.
        expect(err?.textContent).toContain("The commitment is locked");
        expect(err?.textContent).not.toContain("COMMITMENT_LOCKED");
        expect(err?.getAttribute("role")).toBe("alert");
      });
    });

    it("clears commitments via gearClearCommitments (loadout + commitment reset)", async () => {
      const cleared = gearDTO({
        revision: 13,
        gear: {
          loadout: [],
          availableGear: [],
          commitment: "none",
          isCommitmentLocked: false,
          maxBulk: 0,
        },
      });

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(gearDTO({ gear: {
          loadout: [{ name: "A Blade or Two", bulk: 1 }],
          availableGear: [{ name: "A Blade or Two", bulk: 1 }],
          commitment: "normal",
          isCommitmentLocked: false,
          maxBulk: 5,
        } })))
        .mockResolvedValueOnce(ok(GEAR_GAME_DATA))
        .mockResolvedValueOnce(ok(GEAR_PLAYBOOK_DATA))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok(CREWS_DATA))
        .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
        .mockResolvedValueOnce(ok(charOpOk(cleared, "gear.clear-commitments")));

      mountCharacterDetailPage(root, CHARACTER_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Clear commitments"]')).not.toBeNull();
      });

      (root.querySelector('button[title="Clear commitments"]') as HTMLButtonElement).click();
      await vi.waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/characters/${CHARACTER_ID}/ops/gear.clear-commitments`,
          expect.objectContaining({ method: "POST" }),
        );
      });
      await vi.waitFor(() => {
        expect(root.querySelector('.gear-loadout-entry[data-gear-item="A Blade or Two"]')).toBeNull();
        expect(root.querySelector(".gear-bulk-sum")?.textContent).toContain("0 / 0");
      });
    });
  });


// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// F2ab: ability descriptions, multiple notes, crew membership
// ---------------------------------------------------------------------------

describe("F2ab Ability descriptions", () => {
  it("taken abilities show their game-data description when the DTO description is empty", async () => {
    const dto = characterDTO({
      playbook: {
        name: "Spider",
        experience: { points: 4, max: 8 },
        abilities: [{ name: "Bodyguard", description: "", timesTaken: 1 }],
      },
    });
    const gameWithAbilities = {
      ...GAME_DATA,
      Playbooks: [
        {
          Name: "Spider",
          SpecialAbilities: [
            { Name: "Bodyguard", TimesTakeable: 1, Description: "When you protect a teammate, take +1d." },
          ],
        },
      ],
    };

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(ok(dto))
      .mockResolvedValueOnce(ok(gameWithAbilities))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok(CREWS_DATA));
    // No playbook mock: the /playbooks/{name} fetch fails, so descriptions
    // fall back to the game-data Playbooks list.

    mountCharacterDetailPage(root, CHARACTER_ID);

    await vi.waitFor(() => {
      const entry = root.querySelector('.ability-entry[data-ability="Bodyguard"]') as HTMLElement;
      expect(entry).not.toBeNull();
      expect(entry.textContent).toContain("When you protect a teammate, take +1d.");
    });
  });

  it("prefers the DTO description when present and degrades to a placeholder when unavailable", async () => {
    const dto = characterDTO({
      playbook: {
        name: "Spider",
        experience: { points: 4, max: 8 },
        abilities: [
          { name: "Bodyguard", description: "Stored server-side description", timesTaken: 1 },
          { name: "Mystery", description: "", timesTaken: 1 },
        ],
      },
    });

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(ok(dto))
      .mockResolvedValueOnce(ok(GAME_DATA))
      .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok(CREWS_DATA));

    mountCharacterDetailPage(root, CHARACTER_ID);

    await vi.waitFor(() => {
      const entries = root.querySelectorAll(".ability-entry");
      expect(entries).toHaveLength(2);
    });
    const text = (root.querySelector(".character-playbook") as HTMLElement).textContent;
    expect(text).toContain("Stored server-side description");
    expect(text).toContain("No description available.");
  });
});

describe("F2ab Notes", () => {
  it("renders multiple notes with per-note remove buttons", async () => {
    const dto = characterDTO({
      dossier: {
        ...characterDTO().dossier,
        notes: ["First note", "Second note"],
      },
    });

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(ok(dto))
      .mockResolvedValueOnce(ok(GAME_DATA))
      .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok(CREWS_DATA));

    mountCharacterDetailPage(root, CHARACTER_ID);

    await vi.waitFor(() => {
      const notes = root.querySelector(".character-notes .note-list");
      expect(notes?.querySelectorAll("li")).toHaveLength(2);
      expect(notes?.textContent).toContain("First note");
      expect(notes?.textContent).toContain("Second note");
    });
    expect(root.querySelectorAll('.character-notes button[title^="Remove note"]')).toHaveLength(2);
  });

  it("adds a note via note.add with the typed text", async () => {
    const withNote = characterDTO({
      revision: 13,
      dossier: {
        ...characterDTO().dossier,
        notes: ["Spider operative", "Watch the Lamplighters"],
      },
    });
    const noteOk = {
      ok: true,
      character: withNote,
      applied: { op: "note.add" },
      sideEffects: [],
      error: null,
    };

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(ok(characterDTO()))
      .mockResolvedValueOnce(ok(GAME_DATA))
      .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok(CREWS_DATA))
      .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
      .mockResolvedValueOnce(ok(noteOk));

    mountCharacterDetailPage(root, CHARACTER_ID);

    await vi.waitFor(() => {
      expect(root.querySelector('input[aria-label="New note"]')).not.toBeNull();
    });

    const input = root.querySelector('input[aria-label="New note"]') as HTMLInputElement;
    input.value = "Watch the Lamplighters";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    (root.querySelector('button[title="Add note"]') as HTMLButtonElement).click();

    await vi.waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const addCall = calls.find((c) => String(c[0]).endsWith("/ops/note.add"));
      expect(addCall).toBeTruthy();
      expect(addCall![1].body).toBe(JSON.stringify({ text: "Watch the Lamplighters" }));
      expect(addCall![1].headers["If-Match"]).toBe("12");
    });
    await vi.waitFor(() => {
      expect(root.textContent).toContain("Watch the Lamplighters");
    });
  });

  it("removes a note by index via note.remove", async () => {
    const afterRemove = characterDTO({
      revision: 13,
      dossier: {
        ...characterDTO().dossier,
        notes: ["Second note"],
      },
    });
    const removeOk = {
      ok: true,
      character: afterRemove,
      applied: { op: "note.remove" },
      sideEffects: [],
      error: null,
    };

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(ok(characterDTO({
        dossier: { ...characterDTO().dossier, notes: ["First note", "Second note"] },
      })))
      .mockResolvedValueOnce(ok(GAME_DATA))
      .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok(CREWS_DATA))
      .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
      .mockResolvedValueOnce(ok(removeOk));

    mountCharacterDetailPage(root, CHARACTER_ID);

    await vi.waitFor(() => {
      expect(root.querySelectorAll('.character-notes button[title^="Remove note"]')).toHaveLength(2);
    });

    (root.querySelector('button[title="Remove note 1"]') as HTMLButtonElement).click();

    await vi.waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const removeCall = calls.find((c) => String(c[0]).endsWith("/ops/note.remove"));
      expect(removeCall).toBeTruthy();
      expect(removeCall![1].body).toBe(JSON.stringify({ index: 0 }));
      expect(removeCall![1].headers["If-Match"]).toBe("12");
    });
  });
});

describe("F2ab Crew membership", () => {
  it("shows the current crew name and renders the join/leave controls", async () => {
    const dto = characterDTO(); // crewId 8f14e45f... matches CREWS_DATA[0]

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(ok(dto))
      .mockResolvedValueOnce(ok(GAME_DATA))
      .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok(CREWS_DATA));

    mountCharacterDetailPage(root, CHARACTER_ID);

    await vi.waitFor(() => {
      const membership = root.querySelector(".crew-membership") as HTMLElement;
      expect(membership).not.toBeNull();
      expect(membership.textContent).toContain("The Red Sashes");
    });
    const membership = root.querySelector(".crew-membership") as HTMLElement;
    expect(membership.querySelector('select[aria-label="Join crew"]')).not.toBeNull();
    expect(membership.querySelector('button[title="Leave crew"]')).not.toBeNull();
    expect(membership.querySelector('a[href="/crew/create"]')).not.toBeNull();
  });

  it("joins a crew via dossierUpdate {crewId}", async () => {
    const joined = characterDTO({
      revision: 13,
      dossier: { ...characterDTO().dossier, crewId: "8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2" },
    });
    const joinOk = {
      ok: true,
      character: joined,
      applied: { op: "dossier.update" },
      sideEffects: [],
      error: null,
    };
    const noCrew = characterDTO({
      dossier: { ...characterDTO().dossier, crewId: "" },
    });

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(ok(noCrew))
      .mockResolvedValueOnce(ok(GAME_DATA))
      .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok(CREWS_DATA))
      .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
      .mockResolvedValueOnce(ok(joinOk));

    mountCharacterDetailPage(root, CHARACTER_ID);

    await vi.waitFor(() => {
      expect(root.querySelector(".crew-membership")?.textContent).toContain("(none)");
    });

    const select = root.querySelector('select[aria-label="Join crew"]') as HTMLSelectElement;
    select.value = "8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2";
    (root.querySelector('button[title="Join crew"]') as HTMLButtonElement).click();

    await vi.waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const joinCall = calls.find((c) => String(c[0]).endsWith("/ops/dossier.update"));
      expect(joinCall).toBeTruthy();
      expect(joinCall![1].body).toBe(JSON.stringify({ crewId: "8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2" }));
    });
  });

  it("leaves a crew via dossierUpdate {crewId: ''}", async () => {
    const left = characterDTO({
      revision: 13,
      dossier: { ...characterDTO().dossier, crewId: "" },
    });
    const leaveOk = {
      ok: true,
      character: left,
      applied: { op: "dossier.update" },
      sideEffects: [],
      error: null,
    };

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(ok(characterDTO()))
      .mockResolvedValueOnce(ok(GAME_DATA))
      .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok(CREWS_DATA))
      .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
      .mockResolvedValueOnce(ok(leaveOk));

    mountCharacterDetailPage(root, CHARACTER_ID);

    await vi.waitFor(() => {
      expect(root.querySelector('button[title="Leave crew"]')).not.toBeNull();
    });

    (root.querySelector('button[title="Leave crew"]') as HTMLButtonElement).click();

    await vi.waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const leaveCall = calls.find((c) => String(c[0]).endsWith("/ops/dossier.update"));
      expect(leaveCall).toBeTruthy();
      expect(leaveCall![1].body).toBe(JSON.stringify({ crewId: "" }));
    });
  });
});

// F2s Coin + Projects
// ---------------------------------------------------------------------------

describe("F2s Coin", () => {
  /** Character DTO with a populated fund section. */
  function fundDTO(overrides: Record<string, unknown> = {}) {
    return characterDTO({
      fund: { satchel: { coins: 0, max: 2 }, stash: { coins: 0, max: 8 } },
      ...overrides,
    });
  }

  /** OperationResult for a fund/stash op with requested/effective clamp reporting. */
  const fundOk = (character: unknown, op: string, requested: number, effective: number) => ({
    ok: true,
    character,
    applied: { op, requested, effective },
    sideEffects: [],
    error: null,
  });

  const mountWithFund = (dto: unknown) => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(ok(dto))
      .mockResolvedValueOnce(ok(GAME_DATA))
      .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
      .mockResolvedValueOnce(ok([]));
    mountCharacterDetailPage(root, CHARACTER_ID);
  };

  it("renders satchel + stash with current/max and derived Lifestyle (stash ÷ 10) from the DTO", async () => {
    mountWithFund(fundDTO({ fund: { satchel: { coins: 2, max: 2 }, stash: { coins: 25, max: 40 } } }));

    await vi.waitFor(() => {
      expect(root.querySelector(".character-coin")).not.toBeNull();
    });
    expect(root.querySelector(".coin-satchel-count")?.textContent).toContain("2 / 2");
    expect(root.querySelector(".coin-stash-count")?.textContent).toContain("25 / 40");
    // Lifestyle is derived, display-only: stash ÷ 10 (never stored, never hardcoded)
    expect(root.querySelector(".coin-lifestyle")?.textContent).toContain("Lifestyle 2");
  });

  it("gain + posts fund.gain with 1 coin and updates the satchel from the returned DTO", async () => {
    const updated = fundDTO({
      revision: 13,
      fund: { satchel: { coins: 1, max: 2 }, stash: { coins: 0, max: 8 } },
    });
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(ok(fundDTO()))
      .mockResolvedValueOnce(ok(GAME_DATA))
      .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok(CREWS_DATA))
      .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
      .mockResolvedValueOnce(ok(fundOk(updated, "fund.gain", 1, 1)));

    mountCharacterDetailPage(root, CHARACTER_ID);
    await vi.waitFor(() => {
      expect(root.querySelector('button[title="Gain 1 coin"]')).not.toBeNull();
    });

    (root.querySelector('button[title="Gain 1 coin"]') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/characters/${CHARACTER_ID}/ops/fund.gain`,
        expect.objectContaining({ body: JSON.stringify({ coins: 1 }) }),
      );
    });
    await vi.waitFor(() => {
      expect(root.querySelector(".coin-satchel-count")?.textContent).toContain("1 / 2");
    });
  });

  it("spend − posts fund.spend with 1 coin and updates the satchel from the returned DTO", async () => {
    const dto = fundDTO({ fund: { satchel: { coins: 2, max: 2 }, stash: { coins: 0, max: 8 } } });
    const updated = fundDTO({
      revision: 13,
      fund: { satchel: { coins: 1, max: 2 }, stash: { coins: 0, max: 8 } },
    });
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(ok(dto))
      .mockResolvedValueOnce(ok(GAME_DATA))
      .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok(CREWS_DATA))
      .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
      .mockResolvedValueOnce(ok(fundOk(updated, "fund.spend", 1, 1)));

    mountCharacterDetailPage(root, CHARACTER_ID);
    await vi.waitFor(() => {
      expect(root.querySelector('button[title="Spend 1 coin"]')).not.toBeNull();
    });

    (root.querySelector('button[title="Spend 1 coin"]') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/characters/${CHARACTER_ID}/ops/fund.spend`,
        expect.objectContaining({ body: JSON.stringify({ coins: 1 }) }),
      );
    });
    await vi.waitFor(() => {
      expect(root.querySelector(".coin-satchel-count")?.textContent).toContain("1 / 2");
    });
  });

  ;

  it("liquidate posts fund.liquidate with the entered coins", async () => {
    const dto = fundDTO({ fund: { satchel: { coins: 0, max: 2 }, stash: { coins: 6, max: 8 } } });
    const updated = fundDTO({
      revision: 13,
      fund: { satchel: { coins: 1, max: 2 }, stash: { coins: 4, max: 8 } },
    });
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(ok(dto))
      .mockResolvedValueOnce(ok(GAME_DATA))
      .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok(CREWS_DATA))
      .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
      .mockResolvedValueOnce(ok(fundOk(updated, "fund.liquidate", 1, 1)));

    mountCharacterDetailPage(root, CHARACTER_ID);
    await vi.waitFor(() => {
      expect(root.querySelector('input[aria-label="Coins to liquidate"]')).not.toBeNull();
    });

    const coinInput = root.querySelector('input[aria-label="Coins to liquidate"]') as HTMLInputElement;
    coinInput.value = "1";
    (root.querySelector('button[title="Liquidate stash to coins"]') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/characters/${CHARACTER_ID}/ops/fund.liquidate`,
        expect.objectContaining({ body: JSON.stringify({ coins: 1 }) }),
      );
    });
    await vi.waitFor(() => {
      expect(root.querySelector(".coin-satchel-count")?.textContent).toContain("1 / 2");
      expect(root.querySelector(".coin-stash-count")?.textContent).toContain("4 / 8");
    });
  });

  it("shows a clamp notice when fund.gain stores fewer coins than requested (satchel + stash full)", async () => {
    const full = fundDTO({ fund: { satchel: { coins: 2, max: 2 }, stash: { coins: 8, max: 8 } } });
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(ok(full))
      .mockResolvedValueOnce(ok(GAME_DATA))
      .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok(CREWS_DATA))
      .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
      .mockResolvedValueOnce(ok(fundOk(full, "fund.gain", 3, 0)));

    mountCharacterDetailPage(root, CHARACTER_ID);
    await vi.waitFor(() => {
      expect(root.querySelector('button[title="Gain 1 coin"]')).not.toBeNull();
    });

    (root.querySelector('button[title="Gain 1 coin"]') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      const notice = root.querySelector(".character-coin .notice");
      expect(notice?.textContent).toContain("Stored 0 of 3 coins");
    });
  });

  it("surfaces an INSUFFICIENT_FUNDS op error when spend is rejected server-side", async () => {
    const opErr = {
      ok: false,
      character: fundDTO(),
      applied: { op: "fund.spend" },
      sideEffects: [],
      error: { code: "INSUFFICIENT_FUNDS", message: "not enough coins" },
    };
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(ok(fundDTO()))
      .mockResolvedValueOnce(ok(GAME_DATA))
      .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok(CREWS_DATA))
      .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
      .mockResolvedValueOnce(ok(opErr));

    mountCharacterDetailPage(root, CHARACTER_ID);
    await vi.waitFor(() => {
      expect(root.querySelector('button[title="Spend 1 coin"]')).not.toBeNull();
    });

    (root.querySelector('button[title="Spend 1 coin"]') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      const err = root.querySelector(".error");
      // FV-024: known code maps to user copy; no raw code/DTO string.
      expect(err?.textContent).toContain("Not enough coins to cover that");
      expect(err?.textContent).not.toContain("INSUFFICIENT_FUNDS");
      expect(err?.getAttribute("role")).toBe("alert");
    });
  });
});

describe("F2s Projects", () => {
  /** Minimal valid Clock DTO. */
  function clockDTO(overrides: Record<string, unknown> = {}) {
    return {
      kind: "clock",
      id: "b0b1c2d3-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
      revision: 2,
      formatVersion: 1,
      createdAt: "2026-07-24T00:00:00.000Z",
      updatedAt: "2026-07-24T00:00:00.000Z",
      name: "Infiltrate the Bluecoats",
      clockKind: "project",
      segments: 2,
      size: 6,
      rollover: 0,
      ...overrides,
    };
  }

  /** OperationResult wrapping a clock entity. */
  const clockOk = (clock: unknown, op: string) => ({
    ok: true,
    clock,
    applied: { op },
    sideEffects: [],
    error: null,
  });

  const mountWithClocks = (clocks: unknown[], dto = characterDTO()) => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(ok(dto))
      .mockResolvedValueOnce(ok(GAME_DATA))
      .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
      .mockResolvedValueOnce(ok(clocks))
      .mockResolvedValueOnce(ok(CREWS_DATA));
    mountCharacterDetailPage(root, CHARACTER_ID);
  };

  it("renders the clock list from GET /clocks: name, kind, segments/size and an SVG dial", async () => {
    mountWithClocks([clockDTO()]);

    await vi.waitFor(() => {
      expect(root.querySelector(".character-projects")).not.toBeNull();
    });
    const row = root.querySelector('.project-clock[data-clock-id="b0b1c2d3-4e5f-4a6b-8c7d-9e0f1a2b3c4d"]');
    expect(row).not.toBeNull();
    expect(row?.querySelector(".project-clock-name")?.textContent).toContain("Infiltrate the Bluecoats");
    expect(row?.querySelector(".project-clock-kind")?.textContent).toContain("project");
    // segments / size come from the clock's own DTO — never hardcoded
    expect(row?.querySelector(".project-clock-progress")?.textContent).toContain("2 / 6");
    expect(row?.querySelector("svg.clock")).not.toBeNull();
  });

  it("shows an empty state when there are no clocks", async () => {
    mountWithClocks([]);

    await vi.waitFor(() => {
      expect(root.querySelector(".character-projects")).not.toBeNull();
    });
    expect(root.querySelector(".project-empty")?.textContent).toContain("no clocks");
  });

  it("creates a clock via createClock with name/kind/size from the form and appends it", async () => {
    const created = clockDTO({
      id: "d0d1e2f3-4a5b-4c6d-8e7f-9a0b1c2d3e4f",
      name: "Secure the Docks",
      clockKind: "rollover",
      segments: 0,
      size: 8,
      revision: 1,
    });
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(ok(characterDTO()))
      .mockResolvedValueOnce(ok(GAME_DATA))
      .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok(CREWS_DATA))
      .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
      .mockResolvedValueOnce(ok(clockOk(created, "clock.create")));

    mountCharacterDetailPage(root, CHARACTER_ID);
    await vi.waitFor(() => {
      expect(root.querySelector('button[title="Create clock"]')).not.toBeNull();
    });

    (root.querySelector('input[aria-label="Clock name"]') as HTMLInputElement).value = "Secure the Docks";
    const kindSelect = root.querySelector('select[aria-label="Clock kind"]') as HTMLSelectElement;
    expect(Array.from(kindSelect.options).map((o) => o.value)).toEqual(["project", "rollover"]);
    kindSelect.value = "rollover";
    (root.querySelector('input[aria-label="Clock size"]') as HTMLInputElement).value = "8";
    (root.querySelector('button[title="Create clock"]') as HTMLButtonElement).click();

    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/clocks",
        expect.objectContaining({
          body: JSON.stringify({ name: "Secure the Docks", clockKind: "rollover", size: 8 }),
        }),
      );
    });
    await vi.waitFor(() => {
      const row = root.querySelector('.project-clock[data-clock-id="d0d1e2f3-4a5b-4c6d-8e7f-9a0b1c2d3e4f"]');
      expect(row?.querySelector(".project-clock-name")?.textContent).toContain("Secure the Docks");
      expect(row?.querySelector(".project-clock-progress")?.textContent).toContain("0 / 8");
    });
  });

  it("progress + posts clock.progress with the clock's revision (If-Match) and updates segments", async () => {
    const progressed = clockDTO({ revision: 3, segments: 3 });
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(ok(characterDTO()))
      .mockResolvedValueOnce(ok(GAME_DATA))
      .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
      .mockResolvedValueOnce(ok([clockDTO()]))
      .mockResolvedValueOnce(ok(CREWS_DATA))
      .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
      .mockResolvedValueOnce(ok(clockOk(progressed, "clock.progress")));

    mountCharacterDetailPage(root, CHARACTER_ID);
    await vi.waitFor(() => {
      expect(root.querySelector('button[title="Add 1 segment: Infiltrate the Bluecoats"]')).not.toBeNull();
    });

    (root.querySelector('button[title="Add 1 segment: Infiltrate the Bluecoats"]') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/clocks/b0b1c2d3-4e5f-4a6b-8c7d-9e0f1a2b3c4d/ops/clock.progress",
        expect.objectContaining({
          body: JSON.stringify({ segments: 1 }),
          headers: expect.objectContaining({ "If-Match": "2" }),
        }),
      );
    });
    await vi.waitFor(() => {
      expect(root.querySelector(".project-clock-progress")?.textContent).toContain("3 / 6");
    });
  });

  it("clicking a dial segment posts clock.progress with the right delta — F2aa", async () => {
    // clockDTO has segments: 2 / size 6. Clicking segment 4 → next = 4,
    // delta = 4 - 2 = +2.
    const progressed = clockDTO({ revision: 3, segments: 4 });
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(ok(characterDTO()))
      .mockResolvedValueOnce(ok(GAME_DATA))
      .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
      .mockResolvedValueOnce(ok([clockDTO()]))
      .mockResolvedValueOnce(ok(CREWS_DATA))
      .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
      .mockResolvedValueOnce(ok(clockOk(progressed, "clock.progress")));

    mountCharacterDetailPage(root, CHARACTER_ID);
    await vi.waitFor(() => {
      expect(root.querySelector('svg.clock')).not.toBeNull();
    });

    const row = root.querySelector('.project-clock[data-clock-id="b0b1c2d3-4e5f-4a6b-8c7d-9e0f1a2b3c4d"]')!;
    const segs = row.querySelectorAll<SVGPathElement>(".clock-segment");
    expect(segs.length).toBe(6);
    const click = (seg: SVGPathElement) =>
      seg.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    click(segs[3]!); // segment 4

    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/clocks/b0b1c2d3-4e5f-4a6b-8c7d-9e0f1a2b3c4d/ops/clock.progress",
        expect.objectContaining({
          body: JSON.stringify({ segments: 2 }),
          headers: expect.objectContaining({ "If-Match": "2" }),
        }),
      );
    });
    await vi.waitFor(() => {
      expect(root.querySelector(".project-clock-progress")?.textContent).toContain("4 / 6");
    });
  });

  it("reset posts clock.reset with the clock's revision and zeroes the clock", async () => {
    const reset = clockDTO({ revision: 3, segments: 0 });
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(ok(characterDTO()))
      .mockResolvedValueOnce(ok(GAME_DATA))
      .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
      .mockResolvedValueOnce(ok([clockDTO()]))
      .mockResolvedValueOnce(ok(CREWS_DATA))
      .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
      .mockResolvedValueOnce(ok(clockOk(reset, "clock.reset")));

    mountCharacterDetailPage(root, CHARACTER_ID);
    await vi.waitFor(() => {
      expect(root.querySelector('button[title="Reset clock: Infiltrate the Bluecoats"]')).not.toBeNull();
    });

    (root.querySelector('button[title="Reset clock: Infiltrate the Bluecoats"]') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/clocks/b0b1c2d3-4e5f-4a6b-8c7d-9e0f1a2b3c4d/ops/clock.reset",
        expect.objectContaining({
          body: JSON.stringify({}),
          headers: expect.objectContaining({ "If-Match": "2" }),
        }),
      );
    });
    await vi.waitFor(() => {
      expect(root.querySelector(".project-clock-progress")?.textContent).toContain("0 / 6");
    });
  });

  it("delete posts /delete with confirm and the clock's revision, then removes the clock", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(ok(characterDTO()))
      .mockResolvedValueOnce(ok(GAME_DATA))
      .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
      .mockResolvedValueOnce(ok([clockDTO()]))
      .mockResolvedValueOnce(ok(CREWS_DATA))
      .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
      .mockResolvedValueOnce(ok(clockOk(clockDTO(), "delete")));

    mountCharacterDetailPage(root, CHARACTER_ID);
    await vi.waitFor(() => {
      expect(root.querySelector('button[title="Delete clock: Infiltrate the Bluecoats"]')).not.toBeNull();
    });

    (root.querySelector('button[title="Delete clock: Infiltrate the Bluecoats"]') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/clocks/b0b1c2d3-4e5f-4a6b-8c7d-9e0f1a2b3c4d/delete",
        expect.objectContaining({
          body: JSON.stringify({ confirm: true }),
          headers: expect.objectContaining({ "If-Match": "2" }),
        }),
      );
    });
    await vi.waitFor(() => {
      expect(root.querySelector(".project-clock")).toBeNull();
      expect(root.querySelector(".project-empty")?.textContent).toContain("no clocks");
    });
  });

  it("surfaces a VALIDATION op error when clock creation is rejected server-side", async () => {
    const opErr = {
      ok: false,
      applied: { op: "clock.create" },
      sideEffects: [],
      error: { code: "VALIDATION", message: "name is required" },
    };
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(ok(characterDTO()))
      .mockResolvedValueOnce(ok(GAME_DATA))
      .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok(CREWS_DATA))
      .mockResolvedValueOnce(ok({}))  // 6th load fetch: capabilities (decode-fail => fallback to game data)
      .mockResolvedValueOnce(ok(opErr));

    mountCharacterDetailPage(root, CHARACTER_ID);
    await vi.waitFor(() => {
      expect(root.querySelector('button[title="Create clock"]')).not.toBeNull();
    });

    (root.querySelector('input[aria-label="Clock name"]') as HTMLInputElement).value = "";
    (root.querySelector('input[aria-label="Clock size"]') as HTMLInputElement).value = "4";
    (root.querySelector('button[title="Create clock"]') as HTMLButtonElement).click();
    // Empty name is ignored client-side (minLength 1), so force a server-side rejection:
    // the handler only fires with a non-empty name — set one and let the mock reject.
    (root.querySelector('input[aria-label="Clock name"]') as HTMLInputElement).value = "Bad";
    (root.querySelector('button[title="Create clock"]') as HTMLButtonElement).click();

    await vi.waitFor(() => {
      const err = root.querySelector(".error");
      // FV-024: known code maps to user copy; no raw code/DTO string.
      expect(err?.textContent).toContain("The request wasn't valid");
      expect(err?.textContent).not.toContain("VALIDATION");
      expect(err?.getAttribute("role")).toBe("alert");
    });
  });
});
});

// ---------------------------------------------------------------------------
// F4 — lifecycle UI (pending trauma, out-of-action, end-score, retire, delete)
// ---------------------------------------------------------------------------

describe("F4 lifecycle UI", () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement("div");
    vi.clearAllMocks();
  });

  /** Mount with the given character DTO and the standard trailing fetches. */
  const mountWith = (dto: Record<string, unknown>, extraMocks: readonly unknown[] = []) => {
    const mocked = vi
      .fn()
      .mockResolvedValueOnce(ok(dto))
      .mockResolvedValueOnce(ok(GAME_DATA))
      .mockResolvedValueOnce(ok(PLAYBOOK_DATA))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok(CREWS_DATA))
      .mockResolvedValueOnce(ok({}));
    for (const m of extraMocks) {
      mocked.mockResolvedValueOnce(m);
    }
    global.fetch = mocked;
    mountCharacterDetailPage(root, CHARACTER_ID);
  };

  const getStressPlus = (r: HTMLElement) => r.querySelector('button[title="Add 1 stress"]') as HTMLButtonElement | null;
  const getIndulge = (r: HTMLElement) => r.querySelector('button[title="Clear all stress (Indulge Vice)"]') as HTMLButtonElement | null;
  const getEndScore = (r: HTMLElement) => r.querySelector('button[title^="End the score"], button[title^="Resolve the pending trauma before ending the score"]') as HTMLButtonElement | null;
  const getRetire = (r: HTMLElement) => r.querySelector('button[title="Retire this character (confirmation required)"]') as HTMLButtonElement | null;
  const getDelete = (r: HTMLElement) => r.querySelector('button[title="Delete this character (confirmation required, not undoable)"]') as HTMLButtonElement | null;

  it("pending trauma blocks stress ops and end-score with TRAUMA_REQUIRED copy", async () => {
    const pending = characterDTO({
      monitor: { ...characterDTO().monitor, stress: { current: 9, max: 9 } },
      traumaPending: true,
    });
    mountWith(pending);

    await vi.waitFor(() => {
      expect(root.querySelector("h1")?.textContent).toContain("Brenda Hilton");
    });
    // Stress + and Indulge Vice are disabled while pending.
    expect(getStressPlus(root)!.disabled).toBe(true);
    expect(getIndulge(root)!.disabled).toBe(true);
    // End-score is disabled and the pending banner explains the gate.
    expect(getEndScore(root)!.disabled).toBe(true);
    expect(root.textContent).toContain("A trauma is pending");
  });

  it("out-of-action blocks stress ops with OUT_OF_ACTION copy but leaves end-score enabled", async () => {
    const ooa = characterDTO({
      monitor: { ...characterDTO().monitor, stress: { current: 9, max: 9 } },
      isOutOfAction: true,
      stressClearPending: true,
    });
    mountWith(ooa);

    await vi.waitFor(() => {
      expect(root.querySelector("h1")?.textContent).toContain("Brenda Hilton");
    });
    expect(getStressPlus(root)!.disabled).toBe(true);
    expect(getIndulge(root)!.disabled).toBe(true);
    expect(root.textContent).toContain("out of action");
    // End-score is the release — it stays enabled.
    expect(getEndScore(root)!.disabled).toBe(false);
  });

  it("end-score posts endScore after confirmation and clears stress", async () => {
    const ended = characterDTO({
      revision: 13,
      monitor: { ...characterDTO().monitor, stress: { current: 0, max: 9 } },
    });
    const endOk = {
      ok: true,
      character: ended,
      applied: { op: "end-score" },
      sideEffects: [],
      error: null,
    };
    mountWith(characterDTO(), [ok(endOk)]);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    await vi.waitFor(() => {
      expect(getEndScore(root)).not.toBeNull();
    });

    getEndScore(root)!.click();

    await vi.waitFor(() => {
      expect(root.textContent).toContain("0 / 9");
      expect(root.textContent).toContain("Score ended");
    });
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const endCall = calls.find((c) => String(c[0]).endsWith("/end-score"));
    expect(endCall).toBeTruthy();
    expect(endCall![1].headers["If-Match"]).toBe("12");
    confirmSpy.mockRestore();
  });

  it("retire posts retireCharacter after confirmation and shows the RETIRED banner", async () => {
    const retired = characterDTO({
      revision: 13,
      isRetired: true,
      monitor: { ...characterDTO().monitor, stress: { current: 0, max: 9 } },
    });
    const retireOk = {
      ok: true,
      character: retired,
      applied: { op: "retire" },
      sideEffects: [],
      error: null,
    };
    mountWith(characterDTO(), [ok(retireOk)]);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    await vi.waitFor(() => {
      expect(getRetire(root)).not.toBeNull();
    });

    getRetire(root)!.click();

    await vi.waitFor(() => {
      expect(root.textContent).toContain("has retired");
    });
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const retireCall = calls.find((c) => String(c[0]).endsWith("/retire"));
    expect(retireCall).toBeTruthy();
    expect(retireCall![1].body).toBe(JSON.stringify({ confirm: true }));
    confirmSpy.mockRestore();
  });

  it("retired characters keep dossier/notes editable but disable gameplay with RETIRED copy", async () => {
    const retired = characterDTO({
      isRetired: true,
      monitor: { ...characterDTO().monitor, stress: { current: 0, max: 9 } },
    });
    mountWith(retired);

    await vi.waitFor(() => {
      expect(root.querySelector("h1")?.textContent).toContain("(retired)");
    });
    // RETIRED banner + copy.
    expect(root.textContent).toContain("This character has retired");
    // Gameplay disabled: stress + and harm add.
    expect(getStressPlus(root)!.disabled).toBe(true);
    const harmAdd = root.querySelector('button[title="Add harm"]') as HTMLButtonElement;
    expect(harmAdd.disabled).toBe(true);
    // Dossier (name) and notes remain editable.
    const nameEdit = root.querySelector('button[title="Edit Name"]') as HTMLButtonElement;
    expect(nameEdit.disabled).toBe(false);
    const noteAdd = root.querySelector('button[title="Add note"]') as HTMLButtonElement;
    expect(noteAdd.disabled).toBe(false);
  });

  it("delete posts deleteCharacter after confirmation", async () => {
    const delOk = {
      ok: true,
      applied: { op: "deleteCharacter" },
      sideEffects: [],
      error: null,
    };
    mountWith(characterDTO(), [ok(delOk)]);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const assignSpy = vi.spyOn(window.location, "assign").mockReturnValue(undefined as never);

    await vi.waitFor(() => {
      expect(getDelete(root)).not.toBeNull();
    });

    getDelete(root)!.click();

    await vi.waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const delCall = calls.find((c) => String(c[0]).endsWith("/delete"));
      expect(delCall).toBeTruthy();
      expect(delCall![1].body).toBe(JSON.stringify({ confirm: true }));
      expect(delCall![1].headers["If-Match"]).toBe("12");
    });
    confirmSpy.mockRestore();
    assignSpy.mockRestore();
  });

  it("undo button is disabled when the server reports canUndo false", async () => {
    const undoResp = {
      ok: true,
      character: characterDTO({ revision: 13 }),
      applied: { op: "character.undo" },
      sideEffects: [],
      error: null,
      canUndo: false,
      historyCount: 0,
    };
    mountWith(characterDTO(), [ok(undoResp)]);

    await vi.waitFor(() => {
      expect(getUndoButton(root)).not.toBeNull();
    });
    // First load has no projection → enabled; after the undo reports canUndo
    // false the button becomes disabled and the NO_HISTORY-style copy shows.
    getUndoButton(root)!.click();
    await vi.waitFor(() => {
      expect(getUndoButton(root)!.disabled).toBe(true);
      expect(root.textContent).toContain("No history is available to undo");
    });
  });
});


