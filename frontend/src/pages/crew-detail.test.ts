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

  // -- F2y: Contacts & Factions ---------------------------------------------

  describe("F2y Contacts & Factions", () => {
    it("renders contacts with name and profession", async () => {
      global.fetch = vi.fn().mockResolvedValue(
        ok(
          crewDTO({
            contacts: [{ name: "Rolan Wott", profession: "magistrate" }],
          }),
        ),
      );

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.textContent).toContain("Contacts & Factions");
        expect(root.textContent).toContain("Rolan Wott");
        expect(root.textContent).toContain("magistrate");
      });
    });

    it("adds a contact via the add form", async () => {
      const withContact = crewDTO({
        revision: 6,
        contacts: [{ name: "Rolan Wott", profession: "magistrate" }],
      });
      const addResp = {
        ok: true,
        crew: withContact,
        applied: { op: "contact.add" },
        sideEffects: [],
        error: null,
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(addResp));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector("h1")?.textContent).toContain(
          "The Red Sashes",
        );
      });

      const nameInput = root.querySelector(
        'input[aria-label="Contact name"]',
      ) as HTMLInputElement;
      const profInput = root.querySelector(
        'input[aria-label="Contact profession"]',
      ) as HTMLInputElement;
      nameInput.value = "Rolan Wott";
      profInput.value = "magistrate";
      (root.querySelector('button[title="Add contact"]') as HTMLButtonElement).click();

      await vi.waitFor(() => {
        expect(root.textContent).toContain("Rolan Wott");
        expect(root.textContent).toContain("magistrate");
      });
    });

    it("removes a contact", async () => {
      const without = crewDTO({ revision: 6, contacts: [] });
      const removeResp = {
        ok: true,
        crew: without,
        applied: { op: "contact.remove" },
        sideEffects: [],
        error: null,
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(
          ok(crewDTO({ contacts: [{ name: "Rolan Wott", profession: "magistrate" }] })),
        )
        .mockResolvedValueOnce(ok(removeResp));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.textContent).toContain("Rolan Wott");
      });

      (root.querySelector('button[title="Remove contact: Rolan Wott"]') as HTMLButtonElement).click();

      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Remove contact: Rolan Wott"]')).toBeNull();
      });
    });

    it("shows a DUPLICATE error notice when adding a duplicate contact", async () => {
      const dupResp = {
        ok: false,
        applied: { op: "contact.add" },
        sideEffects: [],
        error: { code: "DUPLICATE", message: "contact already exists" },
        crew: crewDTO({ contacts: [{ name: "Rolan Wott", profession: "magistrate" }] }),
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(dupResp));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector("h1")?.textContent).toContain(
          "The Red Sashes",
        );
      });

      const nameInput = root.querySelector(
        'input[aria-label="Contact name"]',
      ) as HTMLInputElement;
      nameInput.value = "Rolan Wott";
      (root.querySelector('button[title="Add contact"]') as HTMLButtonElement).click();

      await vi.waitFor(() => {
        const err = root.querySelector(".error");
        expect(err?.textContent).toContain("DUPLICATE");
      });
    });

    it("renders factions with name and status", async () => {
      global.fetch = vi.fn().mockResolvedValue(
        ok(
          crewDTO({
            factions: [
              { name: "The Crows", status: 2 },
              { name: "Ironhook Prison", status: -1 },
            ],
          }),
        ),
      );

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.textContent).toContain("The Crows");
        expect(root.textContent).toContain("Ironhook Prison");
      });
    });

    it("shows the applied.effective when set-status clamps", async () => {
      const withClamp = crewDTO({
        revision: 6,
        factions: [{ name: "The Crows", status: 9 }],
      });
      const setResp = {
        ok: true,
        crew: withClamp,
        applied: { op: "faction.set-status", requested: 999, effective: 9 },
        sideEffects: [],
        error: null,
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(
          ok(crewDTO({ factions: [{ name: "The Crows", status: 0 }] })),
        )
        .mockResolvedValueOnce(ok(setResp));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.textContent).toContain("The Crows");
      });

      const input = root.querySelector(
        'input[aria-label="Set status for The Crows"]',
      ) as HTMLInputElement;
      input.value = "999";
      (root.querySelector('button[title="Set status for The Crows"]') as HTMLButtonElement).click();

      await vi.waitFor(() => {
        expect(root.textContent).toContain("clamped to 9");
      });
    });

    it("removes a faction", async () => {
      const without = crewDTO({ revision: 6, factions: [] });
      const removeResp = {
        ok: true,
        crew: without,
        applied: { op: "faction.remove" },
        sideEffects: [],
        error: null,
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(
          ok(crewDTO({ factions: [{ name: "The Crows", status: 1 }] })),
        )
        .mockResolvedValueOnce(ok(removeResp));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.textContent).toContain("The Crows");
      });

      (root.querySelector('button[title="Remove faction: The Crows"]') as HTMLButtonElement).click();

      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Remove faction: The Crows"]')).toBeNull();
      });
    });

    it("shows a NOT_FOUND error notice when removing an unknown faction", async () => {
      const nfResp = {
        ok: false,
        applied: { op: "faction.remove" },
        sideEffects: [],
        error: { code: "NOT_FOUND", message: "faction not found" },
        crew: crewDTO(),
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(
          ok(crewDTO({ factions: [{ name: "The Crows", status: 1 }] })),
        )
        .mockResolvedValueOnce(ok(nfResp));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.textContent).toContain("The Crows");
      });

      (root.querySelector('button[title="Remove faction: The Crows"]') as HTMLButtonElement).click();

      await vi.waitFor(() => {
        const err = root.querySelector(".error");
        expect(err?.textContent).toContain("NOT_FOUND");
      });
    });

    it("refetches the sheet after a STALE_REVISION on contact add", async () => {
      const staleResp = {
        ok: false,
        applied: { op: "contact.add" },
        sideEffects: [],
        error: {
          code: "STALE_REVISION",
          message: "Crew revision mismatch",
          details: { currentRevision: 7 },
        },
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce({
          ok: false,
          status: 409,
          text: async () => JSON.stringify(staleResp),
        })
        .mockResolvedValueOnce(ok(crewDTO({ revision: 7 })));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector("h1")?.textContent).toContain(
          "The Red Sashes",
        );
      });

      const nameInput = root.querySelector(
        'input[aria-label="Contact name"]',
      ) as HTMLInputElement;
      nameInput.value = "Rolan Wott";
      (root.querySelector('button[title="Add contact"]') as HTMLButtonElement).click();

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
