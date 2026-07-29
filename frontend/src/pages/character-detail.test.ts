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
    global.fetch = vi.fn().mockResolvedValue(ok(characterDTO()));

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
        // 2) stressAdd POST → 409 STALE_REVISION
        .mockResolvedValueOnce({
          ok: false,
          status: 409,
          text: async () => JSON.stringify(staleResp),
        })
        // 3) recovery getCharacter → deferred (we control when it resolves)
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
});
