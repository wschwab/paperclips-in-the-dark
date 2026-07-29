// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mountCrewDetailPage } from "./crew-detail.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CREW_ID = "8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2";

/** Minimal valid Crew DTO — mirrors the shape the API returns. */
function crewDTO(overrides: Record<string, unknown> = {}) {
  return {
    kind: "crew",
    id: CREW_ID,
    gameStem: "blades-in-the-dark",
    gameName: "Blades in the Dark",
    language: "en",
    revision: 5,
    formatVersion: 1,
    createdAt: "2026-07-22T00:00:00.000Z",
    updatedAt: "2026-07-22T00:00:00.000Z",
    crewTypeName: "Assassins",
    name: "The Red Sashes",
    lair: "Northside safehouse",
    reputation: "ruthless",
    huntingGrounds: "The Docks",
    tier: 1,
    hold: "strong",
    heat: { current: 4, max: 9 },
    wanted: { current: 1, max: 4 },
    rep: { current: 3, max: 12 },
    experience: { points: 2, max: 8 },
    specialAbilities: [],
    upgrades: [],
    cohorts: [],
    coin: 0,
    stash: 2,
    notes: "Up-and-coming crew",
    ...overrides,
  };
}

/** Fetch Response mock helper. */
function fetchResponse(data: unknown, status = 200, httpOk?: boolean) {
  const ok = httpOk ?? (status >= 200 && status < 300);
  return { ok, status, text: async () => JSON.stringify(data) };
}

const ok = (data: unknown) => fetchResponse(data);

/** Create a deferred promise + resolver pair. */
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

function getUndoButton(root: HTMLElement): HTMLButtonElement | null {
  return root.querySelector('button[title="Undo last change"]');
}

function getNotice(root: HTMLElement): HTMLElement | null {
  return root.querySelector(".notice");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("crew-detail page", () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement("div");
    vi.clearAllMocks();
  });

  afterEach(() => {
    // dispose() would clean up but mock fetch leaves no side effects
  });

  // -- initial render -------------------------------------------------------

  it("renders the crew name after initial load", async () => {
    global.fetch = vi.fn().mockResolvedValue(ok(crewDTO()));

    mountCrewDetailPage(root, CREW_ID);

    await vi.waitFor(() => {
      expect(root.querySelector("h1")?.textContent).toContain(
        "The Red Sashes",
      );
    });
  });

  it("shows loading state before the crew resolves", () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));

    mountCrewDetailPage(root, CREW_ID);

    expect(root.querySelector("h1")?.textContent).toContain("Crew");
    expect(root.textContent).toContain("Loading…");
  });

  it("shows an error message when the initial fetch fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "boom",
    });

    mountCrewDetailPage(root, CREW_ID);

    await vi.waitFor(() => {
      const err = root.querySelector('[role="alert"]');
      expect(err?.textContent).toContain("500");
      expect(err?.textContent).toContain("boom");
    });
  });

  // -- onUndo (mirror of character-detail undo control) ---------------------

  describe("onUndo", () => {
    it("re-renders the crew on successful undo", async () => {
      const undoneCrew = crewDTO({
        revision: 6,
        heat: { current: 2, max: 9 },
      });

      const undoSuccessResp = {
        ok: true,
        crew: undoneCrew,
        applied: { op: "crew.undo" },
        sideEffects: [],
        error: null,
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(undoSuccessResp));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector("h1")?.textContent).toContain(
          "The Red Sashes",
        );
      });

      const undoBtn = getUndoButton(root)!;
      expect(undoBtn.textContent).toBe("Undo last change");

      undoBtn.click();

      await vi.waitFor(() => {
        // Heat went from 4 to 2
        expect(root.textContent).toContain("2 / 9");
      });
    });

    it("shows NO_HISTORY notice when undo returns NO_HISTORY error", async () => {
      const noHistoryResp = {
        ok: false,
        applied: { op: "crew.undo" },
        sideEffects: [],
        error: {
          code: "NO_HISTORY",
          message: "No history to undo",
        },
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(noHistoryResp));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector("h1")?.textContent).toContain(
          "The Red Sashes",
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
      // IMPORTANT: do NOT include `crew: null` — Schema.optional(Crew)
      // rejects null (only accepts undefined/absent).
      const staleResp = {
        ok: false,
        applied: { op: "crew.undo" },
        sideEffects: [],
        error: {
          code: "STALE_REVISION",
          message: "Crew revision mismatch",
          details: { currentRevision: 7 },
        },
      };

      const [recoveryPromise, resolveRecovery] =
        deferred<any>();

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce({
          ok: false,
          status: 409,
          text: async () => JSON.stringify(staleResp),
        })
        .mockReturnValueOnce(recoveryPromise);

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector("h1")?.textContent).toContain(
          "The Red Sashes",
        );
      });

      const undoBtn = getUndoButton(root)!;
      undoBtn.click();
      // Re-query — renderDetail() replaces DOM children
      const loadingBtn = getUndoButton(root)!;
      expect(loadingBtn.disabled).toBe(true); // loading state

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
          crewDTO({
            revision: 7,
            name: "The Red Sashes",
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
