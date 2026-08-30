// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach, type Mock, type MockInstance } from "vitest";
import { mountCrewDetailPage } from "./crew-detail.js";
import { loadStylesheets } from "./seam.js";

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
    stashCapacity: 4,
    contacts: [],
    factions: [],
    notes: ["Up-and-coming crew"],
    turf: 0,
    claimedClaimIds: [],
    claimOverrides: [],
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

  it("renders a recoverable error card while keeping technical details collapsed", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "raw schema boom",
    });

    mountCrewDetailPage(root, CREW_ID);

    await vi.waitFor(() => {
      const err = root.querySelector(".error-card-head");
      expect(err?.textContent).toBe("This crew sheet could not be loaded.");
      expect(root.querySelector("button")?.textContent).toBe("Retry");
      expect(root.querySelector('a[href="/roster"]')?.textContent).toBe("Back to roster");
      const details = root.querySelector("details");
      expect(details?.open).toBe(false);
      expect(details?.textContent).toContain("raw schema boom");
      expect(err?.textContent).not.toContain("raw schema boom");
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
        canUndo: true,
        historyCount: 2,
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
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
        // Heat went from 4 to 2 — FV-028 positive feedback names it.
        expect(root.textContent).toContain("2 / 9");
        expect(root.textContent).toContain("Undone — restored heat to 2/9");
        expect(root.textContent).toContain("2 snapshotted changes can be undone");
      });
    });

    it("shows NO_HISTORY notice when undo returns NO_HISTORY error", async () => {
      const noHistoryResp = {
        ok: false,
        applied: { op: "crew.undo" },
        sideEffects: [],
        error: {
          code: "NO_HISTORY",
          status: 200,
          message: "No history to undo",
          retryable: false,
          recovery: "refresh the crew",
          details: {},
          entity: crewDTO(),
        },
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
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
          status: 409,
          message: "Crew revision mismatch",
          retryable: true,
          recovery: "Refresh the sheet and retry.",
          details: { currentRevision: 7 },
        },
      };

      const [recoveryPromise, resolveRecovery] =
        deferred<any>();

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
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
    it("marks the contact add row for narrow-sheet flex sizing", async () => {
      global.fetch = vi.fn().mockResolvedValue(ok(crewDTO()));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        const row = root.querySelector(".contact-add-row");
        expect(row).not.toBeNull();
        expect(row?.querySelector('input[aria-label="Contact name"]')).not.toBeNull();
        expect(row?.querySelector('input[aria-label="Contact profession"]')).not.toBeNull();
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
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
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
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
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
        error: {
          code: "DUPLICATE",
          status: 200,
          message: "contact already exists",
          retryable: false,
          recovery: "choose another contact",
          details: {},
          entity: crewDTO({ contacts: [{ name: "Rolan Wott", profession: "magistrate" }] }),
        },
        crew: crewDTO({ contacts: [{ name: "Rolan Wott", profession: "magistrate" }] }),
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
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
        // FV-024: known code maps to user copy; no raw code/DTO string.
        expect(err?.textContent).toContain("A contact with that name already exists");
        expect(err?.textContent).not.toContain("DUPLICATE");
        expect(err?.getAttribute("role")).toBe("alert");
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

    it("keeps faction-entry rows shrinkable on narrow sheets (FV-014)", async () => {
      loadStylesheets();
      global.fetch = vi.fn().mockResolvedValue(
        ok(crewDTO({ factions: [{ name: "The Crows", status: 2 }] })),
      );

      mountCrewDetailPage(root, CREW_ID);
      document.body.appendChild(root);

      await vi.waitFor(() => {
        const row = root.querySelector(".faction-entry");
        expect(row).not.toBeNull();
        const statusInput = row?.querySelector(
          'input[aria-label="Set status for The Crows"]',
        );
        expect(statusInput).not.toBeNull();
        // happy-dom does no layout, so the narrow-sheet containment contract
        // is carried by computed style from the real stylesheets (same
        // convention as shell.test.ts FV-016 / seam.ts): the row must be
        // allowed to shrink, and the status input must shrink below its
        // browser-default min-content width (min-width: auto, ~201px) instead
        // of bleeding past the card at 320/360/420 (FV-014).
        expect(getComputedStyle(row as Element).minWidth).toBe("0");
        expect(getComputedStyle(statusInput as Element).minWidth).toBe("0");
        expect(getComputedStyle(statusInput as Element).flexGrow).toBe("1");
        expect(getComputedStyle(statusInput as Element).flexShrink).toBe("1");
        expect(getComputedStyle(statusInput as Element).flexBasis).toBe("10em");
      });
    });

    it("keeps the contact add row shrinkable (FV-014: contact row unchanged)", async () => {
      loadStylesheets();
      global.fetch = vi.fn().mockResolvedValue(ok(crewDTO()));

      mountCrewDetailPage(root, CREW_ID);
      document.body.appendChild(root);

      await vi.waitFor(() => {
        const row = root.querySelector(".contact-add-row");
        expect(row).not.toBeNull();
        const nameInput = row?.querySelector(
          'input[aria-label="Contact name"]',
        );
        expect(nameInput).not.toBeNull();
        // Regression guard: the contact row's shrink contract (the pattern
        // FV-014 generalizes) must stay intact.
        expect(getComputedStyle(row as Element).minWidth).toBe("0");
        expect(getComputedStyle(nameInput as Element).minWidth).toBe("0");
        expect(getComputedStyle(nameInput as Element).flexBasis).toBe("10em");
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
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
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
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
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
        error: {
          code: "NOT_FOUND",
          status: 404,
          message: "faction not found",
          retryable: false,
          recovery: "refresh the crew",
          details: {},
        },
        crew: crewDTO(),
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(
          ok(crewDTO({ factions: [{ name: "The Crows", status: 1 }] })),
        )
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(nfResp));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.textContent).toContain("The Crows");
      });

      (root.querySelector('button[title="Remove faction: The Crows"]') as HTMLButtonElement).click();

      await vi.waitFor(() => {
        const err = root.querySelector(".error");
        // FV-024: known code maps to user copy; no raw code/DTO string.
        expect(err?.textContent).toContain("Not on this sheet (removed elsewhere?)");
        expect(err?.textContent).not.toContain("NOT_FOUND");
        expect(err?.getAttribute("role")).toBe("alert");
      });
    });

    it("refetches the sheet after a STALE_REVISION on contact add", async () => {
      const staleResp = {
        ok: false,
        applied: { op: "contact.add" },
        sideEffects: [],
        error: {
          code: "STALE_REVISION",
          status: 409,
          message: "Crew revision mismatch",
          retryable: true,
          recovery: "Refresh the sheet and retry.",
          details: { currentRevision: 7 },
        },
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
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

  // -- F2u: Profile & Trackers ----------------------------------------------

  describe("F2u Profile & Trackers", () => {
    it("renders profile fields and trackers (rep/heat/wanted boxes, tier, hold select, coin, stash)", async () => {
      global.fetch = vi.fn().mockResolvedValue(ok(crewDTO()));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        // Profile fields
        expect(root.textContent).toContain("Northside safehouse");
        expect(root.textContent).toContain("The Docks");
        expect(root.textContent).toContain("ruthless");
        expect(root.textContent).toContain("Up-and-coming crew");
        // Trackers — box counts come from the DTO maxima, never hardcoded
        expect(root.querySelectorAll(".crew-rep .stress-box").length).toBe(12);
        expect(root.querySelectorAll(".crew-heat .stress-box").length).toBe(9);
        expect(root.querySelectorAll(".crew-wanted .stress-box").length).toBe(4);
        // Rep boxes filled per current
        expect(root.querySelectorAll('.crew-rep [data-stress="1"]').length).toBe(3);
        // Turf row: 6 slots, filled from the left per turf count (0 here)
        expect(root.querySelectorAll(".crew-turf .turf-slot").length).toBe(6);
        expect(root.querySelectorAll('.crew-turf .turf-slot[data-stress="1"]').length).toBe(0);
        // Threshold readout: develop at rep.max − turf = 12 − 0
        expect(root.textContent).toContain("develop at 12 rep (12 − 0 turf)");
        // Develop disabled below threshold (rep 3 < 12)
        const developBtn = root.querySelector('button[title^="Develop"]') as HTMLButtonElement;
        expect(developBtn).not.toBeNull();
        expect(developBtn.disabled).toBe(true);
        // Tier value + hold segmented control from contract enum values
        expect(root.querySelector(".crew-tier-value")?.textContent).toBe("I");
        const holdButtons = [...root.querySelectorAll('button[data-hold]')] as HTMLButtonElement[];
        expect(holdButtons.length).toBe(2);
        expect(holdButtons.map((b) => b.getAttribute("data-hold"))).toEqual(["weak", "strong"]);
        expect(holdButtons.find((b) => b.getAttribute("data-hold") === "strong")?.getAttribute("aria-pressed")).toBe("true");
        // Coin & stash values
        expect(root.textContent).toContain("Coin:");
        expect(root.textContent).toContain("Stash:");
      });
    });

    it("edits and saves a profile field via crewFieldsUpdate", async () => {
      const updated = crewDTO({ revision: 6, name: "Renamed Crew" });
      const fieldsOk = {
        ok: true,
        crew: updated,
        applied: { op: "fields.update" },
        sideEffects: [],
        error: null,
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(fieldsOk));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector("h1")?.textContent).toContain("The Red Sashes");
      });

      (root.querySelector('button[title="Edit Name"]') as HTMLButtonElement).click();

      const input = root.querySelector('input[aria-label="Name"]') as HTMLInputElement;
      expect(input).not.toBeNull();
      input.value = "Renamed Crew";
      input.dispatchEvent(new Event("input", { bubbles: true }));

      (root.querySelector('button[title="Save"]') as HTMLButtonElement).click();

      await vi.waitFor(() => {
        expect(root.querySelector("h1")?.textContent).toContain("Renamed Crew");
      });
      // fields.update sends only the changed field
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const updateCall = calls.find((c) => String(c[0]).endsWith("/ops/fields.update"));
      expect(updateCall).toBeTruthy();
      expect(updateCall![1].body).toBe(JSON.stringify({ name: "Renamed Crew" }));
      expect(updateCall![1].headers["If-Match"]).toBe("5");
    });

    it("cancels a profile edit without saving", async () => {
      global.fetch = vi.fn().mockResolvedValue(ok(crewDTO()));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector("h1")?.textContent).toContain("The Red Sashes");
      });

      (root.querySelector('button[title="Edit Lair"]') as HTMLButtonElement).click();
      const input = root.querySelector('input[aria-label="Lair"]') as HTMLInputElement;
      input.value = "changed but cancelled";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      (root.querySelector('button[title="Cancel"]') as HTMLButtonElement).click();

      expect(root.querySelector('input[aria-label="Lair"]')).toBeNull();
      expect(root.textContent).toContain("Northside safehouse");
    });

    it("ENTER in a profile input saves the typed value via crewFieldsUpdate — F2aa", async () => {
      const updated = crewDTO({ revision: 6, name: "Renamed Crew" });
      const fieldsOk = {
        ok: true,
        crew: updated,
        applied: { op: "fields.update" },
        sideEffects: [],
        error: null,
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(fieldsOk));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector("h1")?.textContent).toContain("The Red Sashes");
      });

      (root.querySelector('button[title="Edit Name"]') as HTMLButtonElement).click();

      const input = root.querySelector('input[aria-label="Name"]') as HTMLInputElement;
      expect(input).not.toBeNull();
      input.value = "Renamed Crew";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );

      await vi.waitFor(() => {
        const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
        const updateCall = calls.find((c) => String(c[0]).endsWith("/ops/fields.update"));
        expect(updateCall).toBeTruthy();
        expect(updateCall![1].body).toBe(JSON.stringify({ name: "Renamed Crew" }));
        expect(updateCall![1].headers["If-Match"]).toBe("5");
      });
    });

    it("TAB order in a profile edit is input → save → cancel (natural document order) — F2aa", async () => {
      global.fetch = vi.fn().mockResolvedValue(ok(crewDTO()));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector("h1")?.textContent).toContain("The Red Sashes");
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

    it("rep +/− and box click issue rep.add with the right delta", async () => {
      const repResp = {
        ok: true,
        crew: crewDTO({ revision: 6, rep: { current: 4, max: 12 } }),
        applied: { op: "rep.add" },
        sideEffects: [],
        error: null,
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(repResp))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok({
        ok: true,
        crew: crewDTO({ revision: 7, rep: { current: 5, max: 12 } }),
        applied: { op: "rep.add" },
        sideEffects: [],
        error: null,
      }))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok({
        ok: true,
        crew: crewDTO({ revision: 8, rep: { current: 4, max: 12 } }),
        applied: { op: "rep.add" },
        sideEffects: [],
        error: null,
      }));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelectorAll(".crew-rep .stress-box").length).toBe(12);
      });

      // + button → delta +1 (3 → 4)
      (root.querySelector('button[title="Add 1 rep"]') as HTMLButtonElement).click();
      await vi.waitFor(() => {
        expect(root.querySelector(".crew-rep .stress-track")?.getAttribute("aria-label")).toContain("4 of 12");
      });

      // Box 5 click → delta = 5 - 4 = +1 (4 → 5)
      const boxes = root.querySelectorAll<HTMLButtonElement>(".crew-rep .stress-box");
      boxes[4]?.click();
      await vi.waitFor(() => {
        expect(root.querySelector(".crew-rep .stress-track")?.getAttribute("aria-label")).toContain("5 of 12");
      });

      // − button → delta -1 (5 → 4)
      (root.querySelector('button[title="Remove 1 rep"]') as HTMLButtonElement).click();
      await vi.waitFor(() => {
        expect(root.querySelector(".crew-rep .stress-track")?.getAttribute("aria-label")).toContain("4 of 12");
      });
    });

    it("heat +/− and box click issue heat.add with the right delta", async () => {
      const heatResp = {
        ok: true,
        crew: crewDTO({ revision: 6, heat: { current: 5, max: 9 } }),
        applied: { op: "heat.add" },
        sideEffects: [],
        error: null,
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(heatResp))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok({
        ok: true,
        crew: crewDTO({ revision: 7, heat: { current: 6, max: 9 } }),
        applied: { op: "heat.add" },
        sideEffects: [],
        error: null,
      }));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelectorAll(".crew-heat .stress-box").length).toBe(9);
      });

      (root.querySelector('button[title="Add 1 heat"]') as HTMLButtonElement).click();
      await vi.waitFor(() => {
        expect(root.querySelector(".crew-heat .stress-track")?.getAttribute("aria-label")).toContain("5 of 9");
      });

      // Box 6 click → delta = 6 - 5 = +1 (5 → 6)
      const boxes = root.querySelectorAll<HTMLButtonElement>(".crew-heat .stress-box");
      boxes[5]?.click();
      await vi.waitFor(() => {
        expect(root.querySelector(".crew-heat .stress-track")?.getAttribute("aria-label")).toContain("6 of 9");
      });
    });

    it("wanted +/− and box click issue wanted.add with the right delta", async () => {
      const wantedResp = {
        ok: true,
        crew: crewDTO({ revision: 6, wanted: { current: 0, max: 4 } }),
        applied: { op: "wanted.add" },
        sideEffects: [],
        error: null,
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(wantedResp))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok({
        ok: true,
        crew: crewDTO({ revision: 7, wanted: { current: 3, max: 4 } }),
        applied: { op: "wanted.add" },
        sideEffects: [],
        error: null,
      }));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelectorAll(".crew-wanted .stress-box").length).toBe(4);
      });

      // − button → delta -1 (1 → 0)
      (root.querySelector('button[title="Remove 1 wanted"]') as HTMLButtonElement).click();
      await vi.waitFor(() => {
        expect(root.querySelector(".crew-wanted .stress-track")?.getAttribute("aria-label")).toContain("0 of 4");
      });

      // Box 3 click → delta = 3 - 0 = +3 (0 → 3)
      const boxes = root.querySelectorAll<HTMLButtonElement>(".crew-wanted .stress-box");
      boxes[2]?.click();
      await vi.waitFor(() => {
        expect(root.querySelector(".crew-wanted .stress-track")?.getAttribute("aria-label")).toContain("3 of 4");
      });
    });

    it("tier +/− issues tier.add with the right delta", async () => {
      const tierResp = {
        ok: true,
        crew: crewDTO({ revision: 6, tier: 2 }),
        applied: { op: "tier.add" },
        sideEffects: [],
        error: null,
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(tierResp))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok({
        ok: true,
        crew: crewDTO({ revision: 7, tier: 1 }),
        applied: { op: "tier.add" },
        sideEffects: [],
        error: null,
      }));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector(".crew-tier-value")?.textContent).toBe("I");
      });

      (root.querySelector('button[title="Add 1 tier"]') as HTMLButtonElement).click();
      await vi.waitFor(() => {
        expect(root.querySelector(".crew-tier-value")?.textContent).toBe("II");
      });

      (root.querySelector('button[title="Remove 1 tier"]') as HTMLButtonElement).click();
      await vi.waitFor(() => {
        expect(root.querySelector(".crew-tier-value")?.textContent).toBe("I");
      });
    });

    it("sets hold via the contract-enum select and hold.set", async () => {
      const holdResp = {
        ok: true,
        crew: crewDTO({ revision: 6, hold: "weak" }),
        applied: { op: "hold.set" },
        sideEffects: [],
        error: null,
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(holdResp));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('button[data-hold="weak"]')).not.toBeNull();
      });

      (root.querySelector('button[data-hold="weak"]') as HTMLButtonElement).click();

      await vi.waitFor(() => {
        const weak = root.querySelector('button[data-hold="weak"]') as HTMLButtonElement;
        expect(weak.getAttribute("aria-pressed")).toBe("true");
      });
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const holdCall = calls.find((c) => String(c[0]).endsWith("/ops/hold.set"));
      expect(holdCall).toBeTruthy();
      expect(holdCall![1].body).toBe(JSON.stringify({ hold: "weak" }));
    });

    it("coin and stash +/− issue coin.add and stash.add", async () => {
      const coinResp = {
        ok: true,
        crew: crewDTO({ revision: 6, coin: 1 }),
        applied: { op: "coin.add" },
        sideEffects: [],
        error: null,
      };
      const stashResp = {
        ok: true,
        crew: crewDTO({ revision: 7, stash: 3 }),
        applied: { op: "stash.add" },
        sideEffects: [],
        error: null,
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(coinResp))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(stashResp));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector(".crew-coin-count")?.textContent).toBe("0 / 4");
        expect(root.querySelector(".crew-stash-count")?.textContent).toBe("2 / 4");
      });

      (root.querySelector('button[title="Add 1 coin"]') as HTMLButtonElement).click();
      await vi.waitFor(() => {
        expect(root.querySelector(".crew-coin-count")?.textContent).toBe("1 / 4");
      });

      (root.querySelector('button[title="Add 1 stash"]') as HTMLButtonElement).click();
      await vi.waitFor(() => {
        expect(root.querySelector(".crew-stash-count")?.textContent).toBe("3 / 4");
      });
    });

    it("CONTRACT-04: renders Tier in Roman numerals (0 stays 0, over-scale falls back to decimal)", async () => {
      global.fetch = vi.fn().mockResolvedValue(ok(crewDTO({ tier: 0, stashCapacity: 4 })));
      mountCrewDetailPage(root, CREW_ID);
      await vi.waitFor(() => {
        expect(root.querySelector(".crew-tier-value")?.textContent).toBe("0");
        expect(root.querySelector(".crew-tier-badge")?.textContent).toBe("Tier 0");
      });

      global.fetch = vi.fn().mockResolvedValue(ok(crewDTO({ tier: 3 })));
      mountCrewDetailPage(root, CREW_ID);
      await vi.waitFor(() => {
        expect(root.querySelector(".crew-tier-value")?.textContent).toBe("III");
        expect(root.querySelector(".crew-tier-badge")?.textContent).toBe("Tier III");
      });

      // Legacy stored values above the printed scale render as decimal.
      global.fetch = vi.fn().mockResolvedValue(ok(crewDTO({ tier: 5 })));
      mountCrewDetailPage(root, CREW_ID);
      await vi.waitFor(() => {
        expect(root.querySelector(".crew-tier-value")?.textContent).toBe("V");
      });

      // Stash header shows current against the server-computed capacity;
      // loose coin keeps its own unbounded count (display-bounded advisory).
      global.fetch = vi.fn().mockResolvedValue(ok(crewDTO({ coin: 9, stash: 16, stashCapacity: 16 })));
      mountCrewDetailPage(root, CREW_ID);
      await vi.waitFor(() => {
        expect(root.querySelector(".crew-stash-count")?.textContent).toBe("16 / 16");
        expect(root.querySelector(".crew-coin-count")?.textContent).toBe("9 / 16");
      });
    });

    it("shows an op-level error notice when a tracker op fails", async () => {
      const errResp = {
        ok: false,
        applied: { op: "heat.add" },
        sideEffects: [],
        error: {
          code: "VALIDATION",
          status: 400,
          message: "bad delta",
          retryable: false,
          recovery: "enter a valid delta",
          details: { issues: [{ pointer: "/delta", reason: "out of range", expected: "an integer" }] },
          entity: crewDTO(),
        },
        crew: crewDTO(),
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(errResp));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Add 1 heat"]')).not.toBeNull();
      });

      (root.querySelector('button[title="Add 1 heat"]') as HTMLButtonElement).click();

      await vi.waitFor(() => {
        const err = root.querySelector(".error");
        // FV-024: known code maps to user copy; no raw code/DTO string.
        expect(err?.textContent).toContain("The request wasn't valid");
        expect(err?.textContent).not.toContain("VALIDATION");
        expect(err?.getAttribute("role")).toBe("alert");
      });
    });

    it("refetches the sheet after a STALE_REVISION on a tracker op", async () => {
      const staleResp = {
        ok: false,
        applied: { op: "rep.add" },
        sideEffects: [],
        error: {
          code: "STALE_REVISION",
          status: 409,
          message: "Crew revision mismatch",
          retryable: true,
          recovery: "Refresh the sheet and retry.",
          details: { currentRevision: 7 },
        },
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce({
          ok: false,
          status: 409,
          text: async () => JSON.stringify(staleResp),
        })
        .mockResolvedValueOnce(ok(crewDTO({ revision: 7 })));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Add 1 rep"]')).not.toBeNull();
      });

      (root.querySelector('button[title="Add 1 rep"]') as HTMLButtonElement).click();

      await vi.waitFor(
        () => {
          const notice = getNotice(root);
          expect(notice?.textContent).toContain("Sheet refreshed");
        },
        { timeout: 2000 },
      );
    });
  });

  // -- F2v: Playbook (abilities) + Upgrades + Lair chart ----------------------

  describe("F2v Playbook & Upgrades", () => {
    /** Crew DTO with a populated playbook section. */
    function playbookDTO(overrides: Record<string, unknown> = {}) {
      return crewDTO({
        specialAbilities: [
          { name: "Predators", timesTaken: 1 },
          { name: "Patron", timesTaken: 1 },
        ],
        upgrades: [{ name: "Secure Lair", boxesMarked: 1 }],
        ...overrides,
      });
    }

    /** Crew-type game data (the menu + description source, never hardcoded). */
    const CREW_TYPE_DATA = {
      Name: "Assassins",
      Hook: "You're professional murderers.",
      SpecialAbilities: [
        { Name: "Predators", TimesTakeable: 1, Description: "When you use a stealth or deception plan to commit murder, take +1d to the engagement roll." },
        { Name: "Deadly", TimesTakeable: 1, Description: "Each PC may add +1 action rating to Hunt, Prowl, or Skirmish." },
        { Name: "Patron", TimesTakeable: 2, Description: "When you advance your Tier, it costs half the coin it normally would." },
      ],
      Upgrades: [
        { Name: "Training", TotalBoxes: 1, Description: "Earn 2 xp instead of 1 when you train a given xp track during downtime." },
        { Name: "Secure Lair", TotalBoxes: 2, Description: "Your lair has locks, alarms, and traps to thwart intruders." },
        { Name: "Vault", TotalBoxes: 2, Description: "Your lair has a secure vault." },
        { Name: "Quality: Weapons", TotalBoxes: 2, Description: "Each upgrade improves the quality rating of all the PCs' weapons." },
      ],
      StartingUpgrades: [],
    };

    const CREW_TYPES_DATA = {
      Name: "Blades in the Dark",
      Language: "en",
      CrewTypes: [CREW_TYPE_DATA],
      CohortGangTypes: ["Adepts", "Rooks", "Rovers", "Skulls", "Thugs"],
      CohortExpertTypes: ["Doctor", "Investigator", "Occultist", "Assassin", "Spy", "Custom"],
    };

    const crewOpOk = (crew: unknown, opName: string) => ({
      ok: true,
      crew,
      applied: { op: opName },
      sideEffects: [],
      error: null,
    });

    const crewOpErr = (opName: string, code: "ABILITY_MAXED" | "UPGRADE_MAXED", message: string, crew: unknown) => ({
      ok: false,
      applied: { op: opName },
      sideEffects: [],
      error: {
        code,
        status: 200,
        message,
        retryable: false,
        recovery: "choose another option",
        details: { limit: 1, current: 1 },
        entity: crew,
      },
      crew,
    });

    it("renders taken abilities from DTO and the take select from game-data SpecialAbilities", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce(ok(playbookDTO())).mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => "games.crew: NOT_FOUND",
      }).mockResolvedValueOnce(ok(CREW_TYPES_DATA));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector(".crew-playbook")).not.toBeNull();
      });

      // Taken abilities come from the DTO, descriptions from game data
      const entries = root.querySelectorAll(".ability-entry");
      expect(entries.length).toBe(2);
      const predators = root.querySelector('.ability-entry[data-ability="Predators"]');
      expect(predators?.textContent).toContain("take +1d to the engagement roll");
      const patron = root.querySelector('.ability-entry[data-ability="Patron"]');
      expect(patron?.textContent).toContain("half the coin");

      // Take select: from game-data SpecialAbilities, excluding maxed takes
      // (Predators taken 1 == TimesTakeable 1; Patron taken 1 < 2 stays)
      const select = root.querySelector('select[aria-label="Take ability"]') as HTMLSelectElement;
      const options = Array.from(select.options).map((o) => o.value);
      expect(options).toEqual(["", "Deadly", "Patron"]);

      // CREW-04 (UX-010): the selected ability's description renders as a
      // full-width block BELOW the picker row — not inside the picker flex
      // row, and without repeating the name as a cramped summary.
      const desc = root.querySelector(".crew-playbook .ability-description") as HTMLElement;
      expect(desc).not.toBeNull();
      expect(desc.tagName).toBe("P");
      expect(desc.querySelector("summary")).toBeNull();
      expect(desc.textContent).toContain("Each PC may add +1 action rating");
      expect(desc.getAttribute("style")).toContain("width: 100%");
      const pickerRow = (root.querySelector('select[aria-label="Take ability"]') as HTMLSelectElement)
        .closest("div") as HTMLElement;
      expect(pickerRow.contains(desc)).toBe(false);
      expect(pickerRow.nextElementSibling).toBe(desc);
      // Selecting another option updates the block below the picker.
      const selectForDesc = root.querySelector('select[aria-label="Take ability"]') as HTMLSelectElement;
      selectForDesc.value = "Patron";
      selectForDesc.dispatchEvent(new Event("change", { bubbles: true }));
      expect((root.querySelector(".crew-playbook .ability-description") as HTMLElement).textContent)
        .toContain("half the coin");
    });

    it("gates ability removal / upgrade unmarking behind an advancement-edit mode (CREW-04)", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce(ok(playbookDTO())).mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => "games.crew: NOT_FOUND",
      }).mockResolvedValueOnce(ok(CREW_TYPES_DATA));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector(".crew-playbook")).not.toBeNull();
      });

      // Acquisition stays available in normal mode.
      expect((root.querySelector('button[title="Take ability"]') as HTMLButtonElement).disabled).toBe(false);
      expect((root.querySelector('button[title="Mark selected upgrade"]') as HTMLButtonElement).disabled).toBe(false);

      // Removal / decrement controls do not exist until edit mode is on.
      const toggle = root.querySelector("button.advancement-toggle") as HTMLButtonElement;
      expect(toggle).not.toBeNull();
      expect(toggle.getAttribute("aria-pressed")).toBe("false");
      expect(root.querySelector('button[title="Remove ability: Predators"]')).toBeNull();
      expect(root.querySelector('button[title="Unmark upgrade: Secure Lair"]')).toBeNull();

      // A filled chart box (an unmark in disguise) is disabled in normal mode
      // and its click never reaches the wire.
      const secureRow = root.querySelector('.lair-chart [data-upgrade="Secure Lair"]') as HTMLElement;
      const filledBox = secureRow.querySelector('.chart-box[data-stress="1"]') as HTMLButtonElement;
      const emptyBox = secureRow.querySelector('.chart-box[data-stress="0"]') as HTMLButtonElement;
      expect(filledBox.disabled).toBe(true);
      expect(emptyBox.disabled).toBe(false);
      filledBox.click();
      expect(global.fetch).not.toHaveBeenCalledWith(
        expect.stringContaining("/ops/upgrade"),
        expect.anything(),
      );

      // Toggling edit mode on reveals every removal/decrement control...
      toggle.click();
      await vi.waitFor(() => {
        expect((root.querySelector("button.advancement-toggle") as HTMLButtonElement).getAttribute("aria-pressed")).toBe("true");
      });
      expect(root.querySelector('button[title="Remove ability: Predators"]')).not.toBeNull();
      expect(root.querySelector('button[title="Unmark upgrade: Secure Lair"]')).not.toBeNull();
      expect(
        (root.querySelector('.lair-chart [data-upgrade="Secure Lair"] .chart-box[data-stress="1"]') as HTMLButtonElement).disabled,
      ).toBe(false);

      // ...and toggling off hides them again.
      (root.querySelector("button.advancement-toggle") as HTMLButtonElement).click();
      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Remove ability: Predators"]')).toBeNull();
      });
      expect(root.querySelector('button[title="Unmark upgrade: Secure Lair"]')).toBeNull();
    });

    it("take posts crewAbilityTake with the selected ability and renders the new entry", async () => {
      const taken = playbookDTO({
        revision: 6,
        specialAbilities: [
          { name: "Predators", timesTaken: 1 },
          { name: "Patron", timesTaken: 1 },
          { name: "Deadly", timesTaken: 1 },
        ],
      });

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(playbookDTO()))
        .mockResolvedValueOnce(ok(CREW_TYPE_DATA))
        .mockResolvedValueOnce(ok(CREW_TYPES_DATA))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewOpOk(taken, "ability.take")));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Take ability"]')).not.toBeNull();
      });

      const select = root.querySelector('select[aria-label="Take ability"]') as HTMLSelectElement;
      select.value = "Deadly";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      (root.querySelector('button[title="Take ability"]') as HTMLButtonElement).click();

      await vi.waitFor(() => {
        expect(root.querySelector('.ability-entry[data-ability="Deadly"]')).not.toBeNull();
      });
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/crews/${CREW_ID}/ops/ability.take`,
        expect.objectContaining({ body: JSON.stringify({ name: "Deadly" }) }),
      );
    });

    it("remove posts crewAbilityRemove with the ability name", async () => {
      const removed = playbookDTO({ revision: 6, specialAbilities: [{ name: "Patron", timesTaken: 1 }] });

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(playbookDTO()))
        .mockResolvedValueOnce(ok(CREW_TYPE_DATA))
        .mockResolvedValueOnce(ok(CREW_TYPES_DATA))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewOpOk(removed, "ability.remove")));

      mountCrewDetailPage(root, CREW_ID);

      // CREW-04: removal requires the explicit advancement-edit mode
      // (session-local toggle); the control doesn't exist in normal mode.
      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Remove ability: Predators"]')).toBeNull();
        expect(root.querySelector("button.advancement-toggle")).not.toBeNull();
      });
      (root.querySelector("button.advancement-toggle") as HTMLButtonElement).click();

      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Remove ability: Predators"]')).not.toBeNull();
      });

      (root.querySelector('button[title="Remove ability: Predators"]') as HTMLButtonElement).click();
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/crews/${CREW_ID}/ops/ability.remove`,
        expect.objectContaining({ body: JSON.stringify({ name: "Predators" }) }),
      );
    });

    it("shows an ABILITY_MAXED notice when take hits the server limit", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(playbookDTO()))
        .mockResolvedValueOnce(ok(CREW_TYPE_DATA))
        .mockResolvedValueOnce(ok(CREW_TYPES_DATA))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewOpErr("ability.take", "ABILITY_MAXED", "already at limit", playbookDTO())));

      mountCrewDetailPage(root, CREW_ID);

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

    it("renders upgrades from DTO with boxes/total from game data and mark/unmark buttons", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce(ok(playbookDTO())).mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => "games.crew: NOT_FOUND",
      }).mockResolvedValueOnce(ok(CREW_TYPES_DATA));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector(".crew-upgrades")).not.toBeNull();
      });

      const entry = root.querySelector('.upgrade-entry[data-upgrade="Secure Lair"]');
      expect(entry).not.toBeNull();
      // boxesMarked from DTO, total + description from game data
      expect(entry?.textContent).toContain("1 / 2");
      expect(entry?.textContent).toContain("locks, alarms, and traps");
      // CREW-04: acquisition allowed; unmark gated behind the advancement-edit
      // toggle and enabled (1 > 0) once it's on.
      expect(root.querySelector('button[title="Mark upgrade: Secure Lair"]')).not.toBeNull();
      expect(root.querySelector('button[title="Unmark upgrade: Secure Lair"]')).toBeNull();
      (root.querySelector("button.advancement-toggle") as HTMLButtonElement).click();

      await vi.waitFor(() => {
        const unmarkBtn = root.querySelector('button[title="Unmark upgrade: Secure Lair"]') as HTMLButtonElement;
        expect(unmarkBtn).not.toBeNull();
        expect(unmarkBtn.disabled).toBe(false);
      });
    });

    it("mark menu lists eligible upgrades from game data and posts upgradeMark", async () => {
      const marked = playbookDTO({
        revision: 6,
        upgrades: [
          { name: "Secure Lair", boxesMarked: 1 },
          { name: "Training", boxesMarked: 1 },
        ],
      });

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(playbookDTO()))
        .mockResolvedValueOnce(ok(CREW_TYPE_DATA))
        .mockResolvedValueOnce(ok(CREW_TYPES_DATA))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewOpOk(marked, "upgrade.mark")));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('select[aria-label="Mark upgrade"]')).not.toBeNull();
      });

      const select = root.querySelector('select[aria-label="Mark upgrade"]') as HTMLSelectElement;
      const options = Array.from(select.options).map((o) => o.value);
      expect(options).toEqual(["", "Training", "Secure Lair", "Vault", "Quality: Weapons"]);
      select.value = "Training";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      (root.querySelector('button[title="Mark selected upgrade"]') as HTMLButtonElement).click();

      await vi.waitFor(() => {
        expect(root.querySelector('.upgrade-entry[data-upgrade="Training"]')).not.toBeNull();
      });
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/crews/${CREW_ID}/ops/upgrade.mark`,
        expect.objectContaining({ body: JSON.stringify({ name: "Training" }) }),
      );
    });

    it("row mark and unmark buttons post upgradeMark / upgradeUnmark", async () => {
      const unmarked = playbookDTO({ revision: 6, upgrades: [] });

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(playbookDTO()))
        .mockResolvedValueOnce(ok(CREW_TYPE_DATA))
        .mockResolvedValueOnce(ok(CREW_TYPES_DATA))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewOpOk(unmarked, "upgrade.unmark")));

      mountCrewDetailPage(root, CREW_ID);

      // CREW-04: unmark lives behind the advancement-edit mode; nothing to
      // click until the toggle reveals it.
      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Unmark upgrade: Secure Lair"]')).toBeNull();
        expect(root.querySelector("button.advancement-toggle")).not.toBeNull();
      });
      (root.querySelector("button.advancement-toggle") as HTMLButtonElement).click();

      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Unmark upgrade: Secure Lair"]')).not.toBeNull();
      });

      (root.querySelector('button[title="Unmark upgrade: Secure Lair"]') as HTMLButtonElement).click();

      await vi.waitFor(() => {
        expect(root.querySelector('.upgrade-entry[data-upgrade="Secure Lair"]')).toBeNull();
      });
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/crews/${CREW_ID}/ops/upgrade.unmark`,
        expect.objectContaining({ body: JSON.stringify({ name: "Secure Lair" }) }),
      );
    });

    it("shows an UPGRADE_MAXED notice when mark hits the server limit", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(playbookDTO()))
        .mockResolvedValueOnce(ok(CREW_TYPE_DATA))
        .mockResolvedValueOnce(ok(CREW_TYPES_DATA))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewOpErr("upgrade.mark", "UPGRADE_MAXED", "all boxes marked", playbookDTO())));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Mark upgrade: Secure Lair"]')).not.toBeNull();
      });

      (root.querySelector('button[title="Mark upgrade: Secure Lair"]') as HTMLButtonElement).click();

      await vi.waitFor(() => {
        const err = root.querySelector(".error");
        // FV-024: known code maps to user copy; no raw code/DTO string.
        expect(err?.textContent).toContain("All of that upgrade's boxes are already marked");
        expect(err?.textContent).not.toContain("UPGRADE_MAXED");
        expect(err?.getAttribute("role")).toBe("alert");
      });
    });

    it("renders the lair chart as a compact chart view of the same upgrades data", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce(ok(playbookDTO())).mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => "games.crew: NOT_FOUND",
      }).mockResolvedValueOnce(ok(CREW_TYPES_DATA));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector(".lair-chart")).not.toBeNull();
      });

      // One chart row per upgrade in game-data order, boxes from TotalBoxes
      const rows = root.querySelectorAll<HTMLElement>(".lair-chart [data-upgrade]");
      expect(rows.length).toBe(4);
      expect(rows[0]?.getAttribute("data-upgrade")).toBe("Training");
      expect(rows[1]?.getAttribute("data-upgrade")).toBe("Secure Lair");

      // Secure Lair: 2 boxes, 1 filled (DTO boxesMarked); Training: 1 box, 0 filled
      const secureRow = root.querySelector<HTMLElement>('.lair-chart [data-upgrade="Secure Lair"]');
      expect(secureRow?.querySelectorAll(".chart-box").length).toBe(2);
      expect(secureRow?.querySelectorAll('.chart-box[data-stress="1"]').length).toBe(1);
      expect(secureRow?.textContent).toContain("1 / 2");
      const trainingRow = root.querySelector<HTMLElement>('.lair-chart [data-upgrade="Training"]');
      expect(trainingRow?.querySelectorAll('.chart-box[data-stress="1"]').length).toBe(0);

      // CREW-04: a filled chart box (an unmark in disguise) is disabled
      // until advancement-edit mode is on.
      const filledChartBox = secureRow?.querySelector('.chart-box[data-stress="1"]') as HTMLButtonElement;
      expect(filledChartBox.disabled).toBe(true);

      // Chart box click posts a single mark step (no set op exists)
      const emptyBox = secureRow?.querySelectorAll<HTMLButtonElement>(".chart-box")[1];
      emptyBox?.click();
      await vi.waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/crews/${CREW_ID}/ops/upgrade.mark`,
          expect.objectContaining({ body: JSON.stringify({ name: "Secure Lair" }) }),
        );
      });
    });

    it("refetches the sheet after a STALE_REVISION on an ability op", async () => {
      const staleResp = {
        ok: false,
        applied: { op: "ability.take" },
        sideEffects: [],
        error: {
          code: "STALE_REVISION",
          status: 409,
          message: "Crew revision mismatch",
          retryable: true,
          recovery: "Refresh the sheet and retry.",
          details: { currentRevision: 7 },
        },
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(playbookDTO()))
        .mockResolvedValueOnce(ok(CREW_TYPE_DATA))
        .mockResolvedValueOnce(ok(CREW_TYPES_DATA))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce({
          ok: false,
          status: 409,
          text: async () => JSON.stringify(staleResp),
        })
        .mockResolvedValueOnce(ok(playbookDTO({ revision: 7 })));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Take ability"]')).not.toBeNull();
      });

      (root.querySelector('button[title="Take ability"]') as HTMLButtonElement).click();

      await vi.waitFor(
        () => {
          const notice = getNotice(root);
          expect(notice?.textContent).toContain("Sheet refreshed");
        },
        { timeout: 2000 },
      );
    });
  });

  // -- F2w: Cohorts ----------------------------------------------------------

  describe("F2w Cohorts", () => {
    const COHORT_ID = "b1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

    function cohortDTO(overrides: Record<string, unknown> = {}) {
      return {
        id: COHORT_ID,
        cohortKind: "gang",
        gangType: "Bravos",
        expertType: "",
        quality: 2,
        scale: 1,
        hasArmor: true,
        edges: ["Tough", "Savage"],
        flaws: ["Loud"],
        harm: "healthy",
        description: "Street toughs who love a fight",
        ...overrides,
      };
    }

    const cohortOpOk = (crew: unknown, opName: string) => ({
      ok: true,
      crew,
      applied: { op: opName },
      sideEffects: [],
      error: null,
    });

    it("renders cohort cards from the DTO (kind badge, type, quality/scale, armor, edges/flaws, harm, description)", async () => {
      global.fetch = vi.fn().mockResolvedValue(
        ok(
          crewDTO({
            cohorts: [
              cohortDTO(),
              cohortDTO({
                id: "c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e6f",
                cohortKind: "expert",
                gangType: "",
                expertType: "Doctor",
                quality: 3,
                scale: 0,
                hasArmor: false,
                edges: [],
                flaws: ["Frail"],
                harm: "impaired",
                description: "A capable sawbones",
              }),
            ],
          }),
        ),
      );

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector(".crew-cohorts")).not.toBeNull();
      });

      const badges = [...root.querySelectorAll(".cohort-kind-badge")].map((b) => b.textContent);
      expect(badges).toEqual(["Gang", "Expert"]);

      const gangCard = root.querySelector(`.cohort-entry[data-cohort-id="${COHORT_ID}"]`);
      expect(gangCard?.querySelector(".cohort-type")?.textContent).toBe("Bravos");
      expect(gangCard?.textContent).toContain("Quality 2");
      expect(gangCard?.textContent).toContain("Scale 1");
      expect(gangCard?.textContent).toContain("Armored");
      expect(gangCard?.textContent).toContain("Edges: Tough, Savage");
      expect(gangCard?.textContent).toContain("Flaws: Loud");
      expect(gangCard?.textContent).toContain("Harm: healthy");
      expect(gangCard?.textContent).toContain("Street toughs who love a fight");

      // expert cohort renders its expertType and no armor
      const expertCard = root.querySelector('.cohort-entry[data-cohort-kind="expert"]');
      expect(expertCard?.querySelector(".cohort-type")?.textContent).toBe("Doctor");
      expect(expertCard?.textContent).toContain("No armor");
      expect(expertCard?.textContent).toContain("Harm: impaired");
      // empty edges render as "(none)"
      expect(expertCard?.textContent).toContain("Edges: (none)");
    });

    it("adds a gang cohort via the add form and posts cohort.add with only the filled fields", async () => {
      const added = crewDTO({ revision: 6, cohorts: [cohortDTO()] });

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(cohortOpOk(added, "cohort.add")));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Add cohort"]')).not.toBeNull();
      });

      // kind select comes from the contract enum (CohortType literal)
      const kindSelect = root.querySelector('select[aria-label="Cohort kind"]') as HTMLSelectElement;
      expect([...kindSelect.options].map((o) => o.value)).toEqual(["gang", "expert"]);
      expect(kindSelect.value).toBe("gang");

      // F2ac: the gang select shows only when kind=gang; options come from
      // game-data CohortGangTypes (canonical fallback when absent)
      const gangSelect = root.querySelector('select[aria-label="Cohort gang type"]') as HTMLSelectElement;
      expect(gangSelect).not.toBeNull();
      expect((gangSelect.closest(".cohort-field") as HTMLElement | null)?.hidden ?? gangSelect.hidden).toBe(false);
      expect([...gangSelect.options].map((o) => o.value)).toEqual([
        "", "Adepts", "Rooks", "Rovers", "Skulls", "Thugs",
      ]);
      const expertSelect = root.querySelector('select[aria-label="Cohort expert type"]') as HTMLSelectElement;
      expect(expertSelect).not.toBeNull();
      expect((expertSelect.closest(".cohort-field") as HTMLElement | null)?.hidden ?? expertSelect.hidden).toBe(true);
      gangSelect.value = "Rooks";
      const qualityInput = root.querySelector('input[aria-label="Cohort quality"]') as HTMLInputElement;
      qualityInput.value = "2";
      const armorInput = root.querySelector('input[aria-label="Cohort armor"]') as HTMLInputElement;
      armorInput.checked = true;
      const edgesInput = root.querySelector('input[aria-label="Cohort edges"]') as HTMLInputElement;
      edgesInput.value = "Tough, Savage";
      const descInput = root.querySelector('input[aria-label="Cohort description"]') as HTMLInputElement;
      descInput.value = "Street toughs who love a fight";

      (root.querySelector('button[title="Add cohort"]') as HTMLButtonElement).click();

      await vi.waitFor(() => {
        expect(root.querySelector(`.cohort-entry[data-cohort-id="${COHORT_ID}"]`)).not.toBeNull();
      });
      // Only filled fields are sent: scale/flaws/expertType omitted
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/crews/${CREW_ID}/ops/cohort.add`,
        expect.objectContaining({
          body: JSON.stringify({
            cohortKind: "gang",
            gangType: "Rooks",
            quality: 2,
            hasArmor: true,
            edges: ["Tough", "Savage"],
            description: "Street toughs who love a fight",
          }),
        }),
      );
    });

    it("updates quality, harm, and armor through the edit form, posting only the changed fields", async () => {
      const updated = crewDTO({
        revision: 6,
        cohorts: [cohortDTO({ quality: 3, hasArmor: false, harm: "weakened" })],
      });

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO({ cohorts: [cohortDTO()] })))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(cohortOpOk(updated, "cohort.update")));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Edit cohort: Bravos"]')).not.toBeNull();
      });

      (root.querySelector('button[title="Edit cohort: Bravos"]') as HTMLButtonElement).click();

      const qualityInput = root.querySelector('input[aria-label="Edit quality"]') as HTMLInputElement;
      expect(qualityInput.value).toBe("2");
      qualityInput.value = "3";
      const armorInput = root.querySelector('input[aria-label="Edit armor"]') as HTMLInputElement;
      expect(armorInput.checked).toBe(true);
      armorInput.checked = false;
      const harmSelect = root.querySelector('select[aria-label="Edit harm"]') as HTMLSelectElement;
      // harm values come from the contract cohortHarm enum, never hardcoded
      expect([...harmSelect.options].map((o) => o.value)).toEqual([
        "healthy",
        "weakened",
        "impaired",
        "broken",
        "dead",
      ]);
      expect(harmSelect.value).toBe("healthy");
      harmSelect.value = "weakened";

      (root.querySelector('button[title="Save cohort: Bravos"]') as HTMLButtonElement).click();

      await vi.waitFor(() => {
        expect(root.textContent).toContain("Harm: weakened");
        expect(root.textContent).toContain("No armor");
        expect(root.textContent).toContain("Quality 3");
      });
      // cohort.update sends only the changed fields (type/scale/edges/flaws/description untouched)
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/crews/${CREW_ID}/ops/cohort.update`,
        expect.objectContaining({
          body: JSON.stringify({ cohortId: COHORT_ID, quality: 3, hasArmor: false, harm: "weakened" }),
        }),
      );
    });

    it("removes a cohort via cohort.remove", async () => {
      const removed = crewDTO({ revision: 6, cohorts: [] });

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO({ cohorts: [cohortDTO()] })))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(cohortOpOk(removed, "cohort.remove")));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Remove cohort: Bravos"]')).not.toBeNull();
      });

      (root.querySelector('button[title="Remove cohort: Bravos"]') as HTMLButtonElement).click();

      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Remove cohort: Bravos"]')).toBeNull();
        expect(root.textContent).toContain("(no cohorts)");
      });
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/crews/${CREW_ID}/ops/cohort.remove`,
        expect.objectContaining({ body: JSON.stringify({ cohortId: COHORT_ID }) }),
      );
    });

    it("shows a NOT_FOUND error notice when removing an unknown cohort", async () => {
      const nfResp = {
        ok: false,
        applied: { op: "cohort.remove" },
        sideEffects: [],
        error: {
          code: "NOT_FOUND",
          status: 404,
          message: "cohort not found",
          retryable: false,
          recovery: "refresh the crew",
          details: {},
        },
        crew: crewDTO({ cohorts: [cohortDTO()] }),
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO({ cohorts: [cohortDTO()] })))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(nfResp));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Remove cohort: Bravos"]')).not.toBeNull();
      });

      (root.querySelector('button[title="Remove cohort: Bravos"]') as HTMLButtonElement).click();

      await vi.waitFor(() => {
        const err = root.querySelector(".error");
        // FV-024: known code maps to user copy; no raw code/DTO string.
        expect(err?.textContent).toContain("Not on this sheet (removed elsewhere?)");
        expect(err?.textContent).not.toContain("NOT_FOUND");
        expect(err?.getAttribute("role")).toBe("alert");
      });
    });

    it("refetches the sheet after a STALE_REVISION on cohort add", async () => {
      const staleResp = {
        ok: false,
        applied: { op: "cohort.add" },
        sideEffects: [],
        error: {
          code: "STALE_REVISION",
          status: 409,
          message: "Crew revision mismatch",
          retryable: true,
          recovery: "Refresh the sheet and retry.",
          details: { currentRevision: 7 },
        },
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce({
          ok: false,
          status: 409,
          text: async () => JSON.stringify(staleResp),
        })
        .mockResolvedValueOnce(ok(crewDTO({ revision: 7 })));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Add cohort"]')).not.toBeNull();
      });

      (root.querySelector('button[title="Add cohort"]') as HTMLButtonElement).click();

      await vi.waitFor(
        () => {
          const notice = getNotice(root);
          expect(notice?.textContent).toContain("Sheet refreshed");
        },
        { timeout: 2000 },
      );
    });
  });

  describe("F2x Crew XP", () => {
    /** Crew-type game data (the criteria-text source, never hardcoded). */
    const CREW_TYPE_DATA = {
      Name: "Assassins",
      ExperienceTrigger: "Execute a successful murder, ransom, or assassination operation.",
    };

    const CREW_TYPES_DATA = {
      Name: "Blades in the Dark",
      Language: "en",
      CrewTypes: [CREW_TYPE_DATA],
      CohortGangTypes: ["Adepts", "Rooks", "Rovers", "Skulls", "Thugs"],
      CohortExpertTypes: ["Doctor", "Investigator", "Occultist", "Assassin", "Spy", "Custom"],
    };

    const crewOpOk = (crew: unknown, opName: string) => ({
      ok: true,
      crew,
      applied: { op: opName },
      sideEffects: [],
      error: null,
    });

    const crewType404 = {
      ok: false,
      status: 404,
      text: async () => "games.crew: NOT_FOUND",
    };

    it("renders the XP tracker (points/max from the DTO) and the ExperienceTrigger criteria text from crew game data", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(CREW_TYPE_DATA)) // per-crew-type endpoint preferred
        .mockResolvedValueOnce(ok(CREW_TYPES_DATA));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector(".crew-xp")).not.toBeNull();
      });

      // points/max come from the DTO experience { points, max }
      expect(root.querySelector(".crew-xp-count")?.textContent).toBe("2 / 8");
      // criteria text from ExperienceTrigger in the crew game data
      expect(root.querySelector(".crew-xp")?.textContent).toContain(
        "Execute a successful murder, ransom, or assassination operation.",
      );
      // − / + / clear controls present
      expect(root.querySelector('button[title="Add 1 crew XP"]')).not.toBeNull();
      expect(root.querySelector('button[title="Remove 1 crew XP"]')).not.toBeNull();
      expect(root.querySelector('button[title="Clear crew XP"]')).not.toBeNull();
    });

    it("+/− post crewXpAdd with the right delta and clear posts crewXpClear (no body)", async () => {
      const gained = crewDTO({ revision: 6, experience: { points: 3, max: 8 } });
      const back = crewDTO({ revision: 7, experience: { points: 2, max: 8 } });
      const cleared = crewDTO({ revision: 8, experience: { points: 0, max: 8 } });

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(crewType404) // fall back to the CrewTypes list
        .mockResolvedValueOnce(ok(CREW_TYPES_DATA))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewOpOk(gained, "xp.add")))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewOpOk(back, "xp.add")))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewOpOk(cleared, "xp.clear")));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Add 1 crew XP"]')).not.toBeNull();
      });

      // +1 → xp.add { delta: 1 }
      (root.querySelector('button[title="Add 1 crew XP"]') as HTMLButtonElement).click();
      await vi.waitFor(() => {
        expect(root.querySelector(".crew-xp-count")?.textContent).toContain("3 / 8");
      });
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/crews/${CREW_ID}/ops/xp.add`,
        expect.objectContaining({ body: JSON.stringify({ delta: 1 }) }),
      );

      // −1 → xp.add { delta: -1 }
      (root.querySelector('button[title="Remove 1 crew XP"]') as HTMLButtonElement).click();
      await vi.waitFor(() => {
        expect(root.querySelector(".crew-xp-count")?.textContent).toContain("2 / 8");
      });
      // caps refresh follows each successful op, so the op POST is no longer the last call
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/crews/${CREW_ID}/ops/xp.add`,
        expect.objectContaining({ body: JSON.stringify({ delta: -1 }) }),
      );

      // clear → xp.clear (no body)
      (root.querySelector('button[title="Clear crew XP"]') as HTMLButtonElement).click();
      await vi.waitFor(() => {
        expect(root.querySelector(".crew-xp-count")?.textContent).toContain("0 / 8");
      });
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/crews/${CREW_ID}/ops/xp.clear`,
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("shows an op-level error notice when an XP op fails", async () => {
      const errResp = {
        ok: false,
        applied: { op: "xp.add" },
        sideEffects: [],
        error: {
          code: "VALIDATION",
          status: 400,
          message: "delta out of range",
          retryable: false,
          recovery: "enter a valid delta",
          details: { issues: [{ pointer: "/delta", reason: "out of range", expected: "an integer" }] },
          entity: crewDTO(),
        },
        crew: crewDTO(),
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(crewType404)
        .mockResolvedValueOnce(ok(CREW_TYPES_DATA))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(errResp));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Add 1 crew XP"]')).not.toBeNull();
      });

      (root.querySelector('button[title="Add 1 crew XP"]') as HTMLButtonElement).click();

      await vi.waitFor(() => {
        const err = root.querySelector(".error");
        // FV-024: known code maps to user copy; no raw code/DTO string.
        expect(err?.textContent).toContain("The request wasn't valid");
        expect(err?.textContent).not.toContain("VALIDATION");
        expect(err?.getAttribute("role")).toBe("alert");
      });
    });

    it("refetches the sheet after a STALE_REVISION on an XP op", async () => {
      const staleResp = {
        ok: false,
        applied: { op: "xp.add" },
        sideEffects: [],
        error: {
          code: "STALE_REVISION",
          status: 409,
          message: "Crew revision mismatch",
          retryable: true,
          recovery: "Refresh the sheet and retry.",
          details: { currentRevision: 7 },
        },
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(crewType404)
        .mockResolvedValueOnce(ok(CREW_TYPES_DATA))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce({
          ok: false,
          status: 409,
          text: async () => JSON.stringify(staleResp),
        })
        .mockResolvedValueOnce(ok(crewDTO({ revision: 7 })));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Add 1 crew XP"]')).not.toBeNull();
      });

      (root.querySelector('button[title="Add 1 crew XP"]') as HTMLButtonElement).click();

      await vi.waitFor(
        () => {
          const notice = getNotice(root);
          expect(notice?.textContent).toContain("Sheet refreshed");
        },
        { timeout: 2000 },
      );
    });

    it("degrades gracefully when crew-type game data is unavailable (no criteria text, tracker still renders)", async () => {
      // getCrewType + getCrewTypes both fail (server/network error) —
      // the criteria line is omitted but the tracker still renders and works.
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "boom" })
        .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "boom" });

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector(".crew-xp")).not.toBeNull();
      });
      expect(root.querySelector(".crew-xp-count")?.textContent).toContain("2 / 8");
      expect(root.querySelector('button[title="Clear crew XP"]')).not.toBeNull();
      // no "Criteria:" label, and no error notice
      expect(root.querySelector(".crew-xp")?.textContent).not.toContain("Criteria:");
      expect(root.querySelector(".error")).toBeNull();
    });
  });

  // -- F2ac: Reputation dropdown ---------------------------------------------

  describe("F2ac Reputation dropdown", () => {
    const REPUTATIONS = [
      "Ambitious", "Brutal", "Daring", "Honorable",
      "Professional", "Savvy", "Subtle", "Strange",
    ];
    const GAME_DATA = {
      Name: "Blades in the Dark",
      Language: "en",
      CrewTypes: [{ Name: "Assassins", Reputations: REPUTATIONS }],
      CohortGangTypes: ["Adepts", "Rooks", "Rovers", "Skulls", "Thugs"],
      CohortExpertTypes: ["Doctor", "Investigator", "Occultist", "Assassin", "Spy", "Custom"],
    };

    it("renders the reputation dropdown from game-data Reputations (the 8 values) with the current value selected", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO({ reputation: "Savvy" })))
        .mockResolvedValueOnce({ ok: false, status: 404, text: async () => "games.crew: NOT_FOUND" })
        .mockResolvedValueOnce(ok(GAME_DATA));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('select[aria-label="Reputation"]')).not.toBeNull();
      });

      const select = root.querySelector('select[aria-label="Reputation"]') as HTMLSelectElement;
      expect([...select.options].map((o) => o.value)).toEqual(REPUTATIONS);
      expect(select.value).toBe("Savvy");
      // the read row still shows the DTO reputation
      expect(root.querySelector(".crew-reputation .field-value")?.textContent).toBe("Savvy");
    });

    it("prefers the per-crew-type endpoint Reputations when it is available", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok({ Name: "Assassins", Reputations: REPUTATIONS }))
        .mockResolvedValueOnce(ok(GAME_DATA));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('select[aria-label="Reputation"]')).not.toBeNull();
      });
      const select = root.querySelector('select[aria-label="Reputation"]') as HTMLSelectElement;
      expect([...select.options].map((o) => o.value)).toEqual(REPUTATIONS);
    });

    it("saves a reputation change via crewFieldsUpdate { reputation }", async () => {
      const updated = crewDTO({ revision: 6, reputation: "Savvy" });
      const fieldsOk = {
        ok: true,
        crew: updated,
        applied: { op: "fields.update" },
        sideEffects: [],
        error: null,
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce({ ok: false, status: 404, text: async () => "games.crew: NOT_FOUND" })
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(fieldsOk));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Set reputation"]')).not.toBeNull();
      });

      const select = root.querySelector('select[aria-label="Reputation"]') as HTMLSelectElement;
      select.value = "Savvy";
      (root.querySelector('button[title="Set reputation"]') as HTMLButtonElement).click();

      await vi.waitFor(() => {
        expect(root.querySelector(".crew-reputation .field-value")?.textContent).toBe("Savvy");
      });
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/crews/${CREW_ID}/ops/fields.update`,
        expect.objectContaining({ body: JSON.stringify({ reputation: "Savvy" }) }),
      );
    });

    it("degrades to a read-only value row when game data has no Reputations", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO({ reputation: "ruthless" })))
        .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "boom" })
        .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "boom" });

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector(".crew-reputation")).not.toBeNull();
      });
      // current value still shown; menu disabled and empty
      expect(root.querySelector(".crew-reputation .field-value")?.textContent).toBe("ruthless");
      const select = root.querySelector('select[aria-label="Reputation"]') as HTMLSelectElement;
      expect(select.disabled).toBe(true);
      expect([...select.options].length).toBe(0);
      expect((root.querySelector('button[title="Set reputation"]') as HTMLButtonElement).disabled).toBe(true);
    });
  });

  // -- F2ac: Rep & Turf tracker + Develop ------------------------------------

  describe("F2ac Rep & Turf tracker and Develop", () => {
    const crewOpOk = (crew: unknown, opName: string) => ({
      ok: true,
      crew,
      applied: { op: opName },
      sideEffects: [],
      error: null,
    });

    it("renders the 6-slot turf row filled from the left (grayed from the right) with +/− controls", async () => {
      global.fetch = vi.fn().mockResolvedValue(ok(crewDTO({ turf: 2 })));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelectorAll(".crew-turf .turf-slot").length).toBe(6);
      });

      const slots = root.querySelectorAll<HTMLElement>(".crew-turf .turf-slot");
      expect(slots.length).toBe(6);
      expect(slots[0]?.getAttribute("data-stress")).toBe("1");
      expect(slots[1]?.getAttribute("data-stress")).toBe("1");
      expect(slots[2]?.getAttribute("data-stress")).toBe("0");
      expect(slots[5]?.getAttribute("data-stress")).toBe("0");
      expect(root.querySelector(".crew-turf .turf-track")?.getAttribute("aria-label")).toContain("Turf: 2 of 6");
      // turf slots are NOT buttons (no box-click rep path)
      expect(root.querySelectorAll(".crew-turf button.turf-slot").length).toBe(0);
      // threshold readout: 12 − 2 turf = 10
      expect(root.querySelector(".develop-threshold")?.textContent).toContain("develop at 10 rep (12 − 2 turf)");
      // Develop enabled at rep 3 >= ... no: rep 3 < 10 → disabled
      expect((root.querySelector('button[title^="Develop"]') as HTMLButtonElement).disabled).toBe(true);
      // +/− present; − enabled at turf 2
      expect((root.querySelector('button[title="Remove 1 turf"]') as HTMLButtonElement).disabled).toBe(false);
      expect((root.querySelector('button[title="Add 1 turf"]') as HTMLButtonElement).disabled).toBe(false);
    });

    it("disables turf +/− at the 0..6 bounds", async () => {
      global.fetch = vi.fn().mockResolvedValue(ok(crewDTO({ turf: 0 })));
      mountCrewDetailPage(root, CREW_ID);
      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Remove 1 turf"]')).not.toBeNull();
      });
      expect((root.querySelector('button[title="Remove 1 turf"]') as HTMLButtonElement).disabled).toBe(true);

      global.fetch = vi.fn().mockResolvedValue(ok(crewDTO({ turf: 6 })));
      mountCrewDetailPage(root, CREW_ID);
      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Add 1 turf"]')).not.toBeNull();
      });
      expect((root.querySelector('button[title="Add 1 turf"]') as HTMLButtonElement).disabled).toBe(true);
      expect(root.querySelector(".crew-turf .turf-track")?.getAttribute("aria-label")).toContain("Turf: 6 of 6");
    });

    it("turf +/− post turf.add with the right delta and re-render the turf row", async () => {
      const lower = crewDTO({ revision: 6, turf: 1 });
      const raised = crewDTO({ revision: 7, turf: 3 });

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO({ turf: 2 })))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewOpOk(lower, "turf.add")))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewOpOk(raised, "turf.add")));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector(".crew-turf .turf-track")?.getAttribute("aria-label")).toContain("Turf: 2 of 6");
      });

      (root.querySelector('button[title="Remove 1 turf"]') as HTMLButtonElement).click();
      await vi.waitFor(() => {
        expect(root.querySelector(".crew-turf .turf-track")?.getAttribute("aria-label")).toContain("Turf: 1 of 6");
      });
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/crews/${CREW_ID}/ops/turf.add`,
        expect.objectContaining({ body: JSON.stringify({ delta: -1 }) }),
      );

      (root.querySelector('button[title="Add 1 turf"]') as HTMLButtonElement).click();
      await vi.waitFor(() => {
        expect(root.querySelector(".crew-turf .turf-track")?.getAttribute("aria-label")).toContain("Turf: 3 of 6");
      });
      // caps refresh follows each successful op, so the op POST is no longer the last call
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/crews/${CREW_ID}/ops/turf.add`,
        expect.objectContaining({ body: JSON.stringify({ delta: 1 }) }),
      );
    });

    it("Develop with weak hold: hold.set strong + rep reset to 0 (rep.add −current)", async () => {
      const strong = crewDTO({ revision: 6, hold: "strong", rep: { current: 12, max: 12 } });
      const reset = crewDTO({ revision: 7, hold: "strong", rep: { current: 0, max: 12 } });

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO({ hold: "weak", rep: { current: 12, max: 12 } })))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewOpOk(strong, "hold.set")))
        .mockResolvedValueOnce(ok(crewOpOk(reset, "rep.add")));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('button[title^="Develop"]')).not.toBeNull();
      });
      const developBtn = root.querySelector('button[title^="Develop"]') as HTMLButtonElement;
      expect(developBtn.disabled).toBe(false);
      developBtn.click();

      await vi.waitFor(() => {
        expect(root.querySelector(".crew-rep .stress-track")?.getAttribute("aria-label")).toContain("0 of 12");
      });
      // hold control reflects strong
      const holdStrong = root.querySelector('button[data-hold="strong"]') as HTMLButtonElement;
      expect(holdStrong.getAttribute("aria-pressed")).toBe("true");
      // two sequential ops with threaded revisions
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/crews/${CREW_ID}/ops/hold.set`,
        expect.objectContaining({ body: JSON.stringify({ hold: "strong" }) }),
      );
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/crews/${CREW_ID}/ops/rep.add`,
        expect.objectContaining({ body: JSON.stringify({ delta: -12 }) }),
      );
    });

    it("Develop with strong hold + funds: coin.add −(tier+1)*8, tier.add +1, rep reset, hold.set weak", async () => {
      // tier 1 → cost (1+1)*8 = 16; coin 20
      const paid = crewDTO({ revision: 6, hold: "strong", coin: 4, rep: { current: 12, max: 12 } });
      const raised = crewDTO({ revision: 7, hold: "strong", tier: 2, coin: 4, rep: { current: 12, max: 12 } });
      const reset = crewDTO({ revision: 8, hold: "strong", tier: 2, coin: 4, rep: { current: 0, max: 12 } });
      const weakened = crewDTO({ revision: 9, hold: "weak", tier: 2, coin: 4, rep: { current: 0, max: 12 } });

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO({ hold: "strong", tier: 1, coin: 20, rep: { current: 12, max: 12 } })))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewOpOk(paid, "coin.add")))
        .mockResolvedValueOnce(ok(crewOpOk(raised, "tier.add")))
        .mockResolvedValueOnce(ok(crewOpOk(reset, "rep.add")))
        .mockResolvedValueOnce(ok(crewOpOk(weakened, "hold.set")));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('button[title^="Develop"]')).not.toBeNull();
      });
      (root.querySelector('button[title^="Develop"]') as HTMLButtonElement).click();

      await vi.waitFor(() => {
        expect(root.querySelector(".crew-tier-value")?.textContent).toBe("II");
      });
      expect(root.querySelector(".crew-rep .stress-track")?.getAttribute("aria-label")).toContain("0 of 12");
      expect(root.querySelector('button[data-hold="weak"]')?.getAttribute("aria-pressed")).toBe("true");
      expect(root.querySelector(".crew-coin-count")?.textContent).toBe("4 / 4");

      expect(global.fetch).toHaveBeenCalledWith(
        `/api/crews/${CREW_ID}/ops/coin.add`,
        expect.objectContaining({ body: JSON.stringify({ delta: -16 }) }),
      );
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/crews/${CREW_ID}/ops/tier.add`,
        expect.objectContaining({ body: JSON.stringify({ delta: 1 }) }),
      );
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/crews/${CREW_ID}/ops/rep.add`,
        expect.objectContaining({ body: JSON.stringify({ delta: -12 }) }),
      );
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/crews/${CREW_ID}/ops/hold.set`,
        expect.objectContaining({ body: JSON.stringify({ hold: "weak" }) }),
      );
    });

    it("Develop with strong hold + insufficient funds surfaces INSUFFICIENT_FUNDS and sends no ops", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO({ hold: "strong", tier: 2, coin: 5, rep: { current: 12, max: 12 } })))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('button[title^="Develop"]')).not.toBeNull();
      });
      (root.querySelector('button[title^="Develop"]') as HTMLButtonElement).click();

      await vi.waitFor(() => {
        const err = root.querySelector(".notice");
        expect(err?.textContent).toContain("INSUFFICIENT_FUNDS");
      });
      // tier 2 → cost (2+1)*8 = 24 > coin 5; nothing was posted (4 load fetches: crew, crewType, gameData, capabilities)
      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(4);
    });
  });

  // -- F2ac: Notes -----------------------------------------------------------

  describe("F2ac Notes", () => {
    const crewOpOk = (crew: unknown, opName: string) => ({
      ok: true,
      crew,
      applied: { op: opName },
      sideEffects: [],
      error: null,
    });

    it("renders the multi-note list and the new-note textarea", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(ok(crewDTO({ notes: ["First note", "Second note"] })));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector(".crew-notes")).not.toBeNull();
      });
      const entries = root.querySelectorAll<HTMLElement>(".note-list .note-entry");
      expect(entries.length).toBe(2);
      expect(entries[0]?.textContent).toContain("First note");
      expect(entries[1]?.textContent).toContain("Second note");
      expect(root.querySelector('textarea[aria-label="New note"]')).not.toBeNull();
      expect(root.querySelector('button[title="Add note"]')).not.toBeNull();
      expect(root.querySelector('button[title="Remove note 0"]')).not.toBeNull();
      expect(root.querySelector('button[title="Remove note 1"]')).not.toBeNull();
    });

    it("adds a note via note.add and renders it", async () => {
      const added = crewDTO({ revision: 6, notes: ["First note", "Second note"] });

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO({ notes: ["First note"] })))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewOpOk(added, "note.add")));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('textarea[aria-label="New note"]')).not.toBeNull();
      });
      const textarea = root.querySelector('textarea[aria-label="New note"]') as HTMLTextAreaElement;
      textarea.value = "Second note";
      (root.querySelector('button[title="Add note"]') as HTMLButtonElement).click();

      await vi.waitFor(() => {
        expect(root.querySelectorAll(".note-list .note-entry").length).toBe(2);
      });
      expect(root.querySelectorAll<HTMLElement>(".note-list .note-entry")[1]?.textContent).toContain("Second note");
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/crews/${CREW_ID}/ops/note.add`,
        expect.objectContaining({ body: JSON.stringify({ text: "Second note" }) }),
      );
    });

    it("removes a note by index via note.remove", async () => {
      const removed = crewDTO({ revision: 6, notes: ["First note", "Third note"] });

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO({ notes: ["First note", "Second note", "Third note"] })))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewOpOk(removed, "note.remove")));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Remove note 1"]')).not.toBeNull();
      });
      (root.querySelector('button[title="Remove note 1"]') as HTMLButtonElement).click();

      await vi.waitFor(() => {
        expect(root.querySelectorAll(".note-list .note-entry").length).toBe(2);
        expect(root.querySelector('button[title="Remove note 1"]')).not.toBeNull();
      });
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/crews/${CREW_ID}/ops/note.remove`,
        expect.objectContaining({ body: JSON.stringify({ index: 1 }) }),
      );
    });
  });

  // -- F2ac: Cohort conditional dropdowns ------------------------------------

  describe("F2ac Cohort conditional dropdowns", () => {
    const COHORT_ID = "b1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
    const GAME_DATA = {
      Name: "Blades in the Dark",
      Language: "en",
      CrewTypes: [{ Name: "Assassins" }],
      CohortGangTypes: ["Adepts", "Rooks", "Rovers", "Skulls", "Thugs"],
      CohortExpertTypes: ["Doctor", "Investigator", "Occultist", "Assassin", "Spy", "Custom"],
    };
    const crewOpOk = (crew: unknown, opName: string) => ({
      ok: true,
      crew,
      applied: { op: opName },
      sideEffects: [],
      error: null,
    });
    function cohortDTO(overrides: Record<string, unknown> = {}) {
      return {
        id: COHORT_ID,
        cohortKind: "gang",
        gangType: "Bravos",
        expertType: "",
        quality: 2,
        scale: 1,
        hasArmor: true,
        edges: [],
        flaws: [],
        harm: "healthy",
        description: "",
        ...overrides,
      };
    }

    it("shows the gang select only when kind=gang and the expert select only when kind=expert, with Custom revealing a text input", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(GAME_DATA));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('select[aria-label="Cohort gang type"]')).not.toBeNull();
      });
      const kindSelect = root.querySelector('select[aria-label="Cohort kind"]') as HTMLSelectElement;
      const gangSelect = root.querySelector('select[aria-label="Cohort gang type"]') as HTMLSelectElement;
      const expertSelect = root.querySelector('select[aria-label="Cohort expert type"]') as HTMLSelectElement;
      const customInput = root.querySelector('input[aria-label="Cohort expert custom type"]') as HTMLInputElement;
      // F-10: the label+control wrapper hides together, not the bare control.
      const field = (control: HTMLElement) => control.closest(".cohort-field") as HTMLElement;

      // default kind=gang: gang field visible, expert field hidden
      expect(field(gangSelect).hidden).toBe(false);
      expect(field(expertSelect).hidden).toBe(true);
      // options come from game-data CohortGangTypes
      expect([...gangSelect.options].map((o) => o.value)).toEqual([
        "", "Adepts", "Rooks", "Rovers", "Skulls", "Thugs",
      ]);

      // switch to expert: gang hidden, expert visible
      kindSelect.value = "expert";
      kindSelect.dispatchEvent(new Event("change", { bubbles: true }));
      expect(field(gangSelect).hidden).toBe(true);
      expect(field(expertSelect).hidden).toBe(false);
      expect([...expertSelect.options].map((o) => o.value)).toEqual([
        "", "Doctor", "Investigator", "Occultist", "Assassin", "Spy", "Custom",
      ]);

      // Custom reveals the free-text input
      expect(field(customInput).hidden).toBe(true);
      expertSelect.value = "Custom";
      expertSelect.dispatchEvent(new Event("change", { bubbles: true }));
      expect(field(customInput).hidden).toBe(false);
    });

    it("marks cohortKind as the one contract-required add-form field and does not over-gate Add", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(GAME_DATA));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('select[aria-label="Cohort kind"]')).not.toBeNull();
      });
      // CREW-05: openapi /crews/{id}/ops/cohort.add declares
      // required: [cohortKind] and nothing else — no other add-form field is
      // contract-required (quality/scale have only minimum: 0, never maxima).
      const kindSelect = root.querySelector('select[aria-label="Cohort kind"]') as HTMLSelectElement;
      expect(kindSelect.getAttribute("aria-required")).toBe("true");
      const kindField = kindSelect.closest(".cohort-field") as HTMLElement;
      expect(kindField.querySelector(".required-marker")).not.toBeNull();

      // The backend stores cohorts with empty types/defaults happily, so a
      // blank gang/expert type must NOT disable Add (client-side gating may
      // only reflect contract requirements).
      const addBtn = root.querySelector('button[title="Add cohort"]') as HTMLButtonElement;
      expect(addBtn.disabled).toBe(false);
    });

    it("adds an expert cohort with a custom type (Custom → text input → expertType)", async () => {
      const added = crewDTO({
        revision: 6,
        cohorts: [cohortDTO({ cohortKind: "expert", gangType: "", expertType: "Sage" })],
      });

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(crewOpOk(added, "cohort.add")));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Add cohort"]')).not.toBeNull();
      });
      const kindSelect = root.querySelector('select[aria-label="Cohort kind"]') as HTMLSelectElement;
      kindSelect.value = "expert";
      kindSelect.dispatchEvent(new Event("change", { bubbles: true }));
      const expertSelect = root.querySelector('select[aria-label="Cohort expert type"]') as HTMLSelectElement;
      expertSelect.value = "Custom";
      expertSelect.dispatchEvent(new Event("change", { bubbles: true }));
      const customInput = root.querySelector('input[aria-label="Cohort expert custom type"]') as HTMLInputElement;
      customInput.value = "Sage";

      (root.querySelector('button[title="Add cohort"]') as HTMLButtonElement).click();

      await vi.waitFor(() => {
        expect(root.querySelector(`.cohort-entry[data-cohort-id="${COHORT_ID}"]`)).not.toBeNull();
      });
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/crews/${CREW_ID}/ops/cohort.add`,
        expect.objectContaining({
          body: JSON.stringify({ cohortKind: "expert", expertType: "Sage", hasArmor: false }),
        }),
      );
    });

    it("edit form uses the gang select and preserves a gang type that is not in the game data", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO({ cohorts: [cohortDTO()] })))
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(GAME_DATA));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Edit cohort: Bravos"]')).not.toBeNull();
      });
      (root.querySelector('button[title="Edit cohort: Bravos"]') as HTMLButtonElement).click();

      const gangSelect = root.querySelector('select[aria-label="Edit gang type"]') as HTMLSelectElement;
      expect(gangSelect).not.toBeNull();
      // current "Bravos" appended so it stays selectable
      expect([...gangSelect.options].map((o) => o.value)).toEqual([
        "Adepts", "Rooks", "Rovers", "Skulls", "Thugs", "Bravos",
      ]);
      expect(gangSelect.value).toBe("Bravos");
      // expert controls are not rendered for a gang cohort
      expect(root.querySelector('select[aria-label="Edit expert type"]')).toBeNull();

      // change the type and save → cohort.update sends gangType
      gangSelect.value = "Rooks";
      const updated = crewDTO({
        revision: 6,
        cohorts: [cohortDTO({ gangType: "Rooks" })],
      });
      global.fetch = vi.fn().mockResolvedValue(ok(crewOpOk(updated, "cohort.update")));
      (root.querySelector('button[title="Save cohort: Bravos"]') as HTMLButtonElement).click();

      await vi.waitFor(() => {
        expect(root.querySelector(".cohort-type")?.textContent).toBe("Rooks");
      });
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/crews/${CREW_ID}/ops/cohort.update`,
        expect.objectContaining({
          body: JSON.stringify({ cohortId: COHORT_ID, gangType: "Rooks" }),
        }),
      );
    });

    it("edit form maps a custom expert type onto the Custom input and saves it", async () => {
      const expert = cohortDTO({
        cohortKind: "expert",
        gangType: "",
        expertType: "Sage",
        hasArmor: false,
      });
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO({ cohorts: [expert] })))
        .mockResolvedValueOnce(ok(GAME_DATA))
        .mockResolvedValueOnce(ok(GAME_DATA));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Edit cohort: Sage"]')).not.toBeNull();
      });
      (root.querySelector('button[title="Edit cohort: Sage"]') as HTMLButtonElement).click();

      const expertSelect = root.querySelector('select[aria-label="Edit expert type"]') as HTMLSelectElement;
      expect(expertSelect.value).toBe("Custom");
      const customInput = root.querySelector('input[aria-label="Edit expert custom type"]') as HTMLInputElement;
      expect(customInput.hidden).toBe(false);
      expect(customInput.value).toBe("Sage");

      // edit the custom text and save
      customInput.value = "Mystic";
      const updated = crewDTO({
        revision: 6,
        cohorts: [cohortDTO({
          cohortKind: "expert",
          gangType: "",
          expertType: "Mystic",
          hasArmor: false,
        })],
      });
      global.fetch = vi.fn().mockResolvedValue(ok(crewOpOk(updated, "cohort.update")));
      (root.querySelector('button[title="Save cohort: Sage"]') as HTMLButtonElement).click();

      await vi.waitFor(() => {
        expect(root.querySelector(".cohort-type")?.textContent).toBe("Mystic");
      });
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/crews/${CREW_ID}/ops/cohort.update`,
        expect.objectContaining({
          body: JSON.stringify({ cohortId: COHORT_ID, expertType: "Mystic" }),
        }),
      );
    });
  });

});

// -- SC-F3/P29: tracker clamp feedback + bound controls -----------------------

describe("SC-F3 tracker clamps", () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement("div");
    vi.clearAllMocks();
  });

  it("disables the rep + bound control when the track is full", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(ok(crewDTO({ rep: { current: 12, max: 12 } })))
      .mockResolvedValueOnce(ok(crewDTO()))
      .mockResolvedValueOnce(ok(crewDTO()))
      .mockResolvedValueOnce(ok(crewDTO()))
      .mockResolvedValue(ok(crewDTO({ rep: { current: 12, max: 12 } })));

    mountCrewDetailPage(root, CREW_ID);

    await vi.waitFor(() => {
      const plus = root.querySelector('button[title="Add 1 rep"]') as HTMLButtonElement;
      expect(plus).not.toBeNull();
    });
    const plus = root.querySelector('button[title="Add 1 rep"]') as HTMLButtonElement;
    expect(plus.disabled).toBe(true);
  });
  it("disables the stash + bound control when stash has reached the vault capacity", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(ok(crewDTO({ stash: 4, stashCapacity: 4 })))
      .mockResolvedValueOnce(ok(crewDTO()))
      .mockResolvedValueOnce(ok(crewDTO()))
      .mockResolvedValueOnce(ok(crewDTO()))
      .mockResolvedValue(ok(crewDTO({ stash: 4, stashCapacity: 4 })));

    mountCrewDetailPage(root, CREW_ID);

    await vi.waitFor(() => {
      const plus = root.querySelector('button[title="Add 1 stash"]') as HTMLButtonElement;
      expect(plus).not.toBeNull();
    });
    const plus = root.querySelector('button[title="Add 1 stash"]') as HTMLButtonElement;
    expect(plus.disabled).toBe(true);
  });

  it("keeps the stash + control enabled when below vault capacity", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(ok(crewDTO({ stash: 2, stashCapacity: 4 })))
      .mockResolvedValueOnce(ok(crewDTO()))
      .mockResolvedValueOnce(ok(crewDTO()))
      .mockResolvedValueOnce(ok(crewDTO()))
      .mockResolvedValueOnce(ok(crewDTO({ stash: 2, stashCapacity: 4 })));

    mountCrewDetailPage(root, CREW_ID);

    await vi.waitFor(() => {
      const plus = root.querySelector('button[title="Add 1 stash"]') as HTMLButtonElement;
      expect(plus).not.toBeNull();
    });
    const plus = root.querySelector('button[title="Add 1 stash"]') as HTMLButtonElement;
    expect(plus.disabled).toBe(false);
  });

  it("keeps the coin + control enabled even when display-advised against capacity", async () => {
    // CONTRACT-04 §4: loose crew coin is kept and display-bounded advisory;
    // the server imposes no coin ceiling, so the + control stays live.
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(ok(crewDTO({ coin: 16, stash: 16, stashCapacity: 16 })))
      .mockResolvedValueOnce(ok(crewDTO()))
      .mockResolvedValueOnce(ok(crewDTO()))
      .mockResolvedValueOnce(ok(crewDTO()))
      .mockResolvedValue(ok(crewDTO({ coin: 16, stash: 16, stashCapacity: 16 })));

    mountCrewDetailPage(root, CREW_ID);

    await vi.waitFor(() => {
      const plus = root.querySelector('button[title="Add 1 coin"]') as HTMLButtonElement;
      expect(plus).not.toBeNull();
    });
    const plus = root.querySelector('button[title="Add 1 coin"]') as HTMLButtonElement;
    expect(plus.disabled).toBe(false);
  });

  it("shows a clamp notice when the server applies less than the requested rep delta", async () => {
    const atMax = crewDTO({ revision: 6, rep: { current: 12, max: 12 } });
    const clampOp = {
      ok: true,
      crew: atMax,
      applied: { op: "rep.add", requested: 1, effective: 0 },
      sideEffects: [],
      error: null,
    };
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(ok(crewDTO({ rep: { current: 11, max: 12 } })))
      .mockResolvedValueOnce(ok(crewDTO()))
      .mockResolvedValueOnce(ok(crewDTO()))
      .mockResolvedValueOnce(ok(crewDTO()))
      .mockResolvedValue(ok(clampOp));

    mountCrewDetailPage(root, CREW_ID);

    await vi.waitFor(() => {
      const plus = root.querySelector('button[title="Add 1 rep"]') as HTMLButtonElement;
      expect(plus).not.toBeNull();
    });
    const plus = root.querySelector('button[title="Add 1 rep"]') as HTMLButtonElement;
    plus.click();

    await vi.waitFor(() => {
      const notice = root.querySelector(".notice");
      expect(notice?.textContent).toContain("Rep clamped to");
    });
    expect(root.textContent).toContain("(requested 1)");
  });
});

// ---------------------------------------------------------------------------
// FV-012 — mutation focus restoration
// ---------------------------------------------------------------------------

describe("FV-012 focus restoration", () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement("div");
    vi.clearAllMocks();
    // Focus() only tracks elements connected to the document; the sheet root
    // must be attached for the focus-restoration assertions to be meaningful.
    document.body.append(root);
  });

  afterEach(() => {
    root.remove();
  });

  const crewOpOk = (crew: unknown, opName: string) => ({
    ok: true,
    crew,
    applied: { op: opName },
    sideEffects: [],
    error: null,
  });

  /** Mount with the 4 standard load fetches + extra op mocks. */
  const mountWith = (dto: Record<string, unknown>, extraMocks: readonly unknown[] = []) => {
    const mocked = vi
      .fn()
      .mockResolvedValueOnce(ok(dto))
      .mockResolvedValueOnce(ok(crewDTO()))
      .mockResolvedValueOnce(ok(crewDTO()))
      .mockResolvedValueOnce(ok(crewDTO()));
    for (const m of extraMocks) mocked.mockResolvedValueOnce(m);
    global.fetch = mocked;
    mountCrewDetailPage(root, CREW_ID);
  };

  const turfPlus = () => root.querySelector('button[title="Add 1 turf"]') as HTMLButtonElement;
  const addContact = () => root.querySelector('button[title="Add contact"]') as HTMLButtonElement;
  const contactName = () => root.querySelector('input[aria-label="Contact name"]') as HTMLInputElement;

  it("keeps focus on the turf add button after a successful turf add", async () => {
    mountWith(crewDTO({ turf: 0 }), [ok(crewOpOk(crewDTO({ revision: 6, turf: 1 }), "turf.add"))]);

    await vi.waitFor(() => expect(turfPlus()).not.toBeNull());
    turfPlus().focus();
    turfPlus().click();

    await vi.waitFor(() => expect(root.textContent).toContain("1 / 6"));
    expect(document.activeElement).toBe(turfPlus());
  });

  it("returns focus to the turf add button after a failed (422) turf add", async () => {
    mountWith(crewDTO({ turf: 0 }), [
      { ok: false, status: 422, text: async () => "validation failed" },
    ]);

    await vi.waitFor(() => expect(turfPlus()).not.toBeNull());
    turfPlus().focus();
    turfPlus().click();

    await vi.waitFor(() => {
      expect(root.querySelector(".error")).not.toBeNull();
    });
    expect(document.activeElement).toBe(turfPlus());
  });

  it("moves focus to the new contact's remove button after adding a contact", async () => {
    const withContact = crewDTO({
      revision: 6,
      contacts: [{ name: "Rolan Wott", profession: "magistrate" }],
    });
    mountWith(crewDTO({ contacts: [] }), [ok(crewOpOk(withContact, "contact.add"))]);

    await vi.waitFor(() => expect(contactName()).not.toBeNull());
    contactName().value = "Rolan Wott";
    (root.querySelector('input[aria-label="Contact profession"]') as HTMLInputElement).value = "magistrate";
    contactName().focus();
    addContact().click();

    await vi.waitFor(() => {
      expect(root.querySelector('button[title="Remove contact: Rolan Wott"]')).not.toBeNull();
    });
    expect(document.activeElement).toBe(root.querySelector('button[title="Remove contact: Rolan Wott"]'));
  });

  it("moves focus to the next contact's remove button after deleting a contact", async () => {
    const without = crewDTO({
      revision: 6,
      contacts: [{ name: "Veleris", profession: "" }],
    });
    mountWith(
      crewDTO({ contacts: [{ name: "Rolan Wott", profession: "magistrate" }, { name: "Veleris", profession: "" }] }),
      [ok(crewOpOk(without, "contact.remove"))],
    );

    await vi.waitFor(() => {
      expect(root.querySelectorAll('button[title^="Remove contact:"]')).toHaveLength(2);
    });
    const rm = root.querySelector('button[title="Remove contact: Rolan Wott"]') as HTMLButtonElement;
    rm.focus();
    rm.click();

    await vi.waitFor(() => {
      expect(root.querySelector('button[title="Remove contact: Rolan Wott"]')).toBeNull();
    });
    expect(document.activeElement).toBe(root.querySelector('button[title="Remove contact: Veleris"]'));
  });

  it("moves focus to the new note's remove button after adding a note", async () => {
    const withNote = crewDTO({ revision: 6, notes: ["First note"] });
    mountWith(crewDTO({ notes: [] }), [ok(crewOpOk(withNote, "note.add"))]);

    await vi.waitFor(() => {
      expect(root.querySelector('textarea[aria-label="New note"]')).not.toBeNull();
    });
    const textarea = root.querySelector('textarea[aria-label="New note"]') as HTMLTextAreaElement;
    textarea.value = "First note";
    textarea.focus();
    (root.querySelector('button[title="Add note"]') as HTMLButtonElement).click();

    await vi.waitFor(() => {
      expect(root.querySelector('button[aria-label="Remove note 0"]')).not.toBeNull();
    });
    expect(document.activeElement).toBe(root.querySelector('button[aria-label="Remove note 0"]'));
  });

  it("moves focus to the next note's remove button after deleting a middle note", async () => {
    const without = crewDTO({ revision: 6, notes: ["First note", "Third note"] });
    mountWith(
      crewDTO({ notes: ["First note", "Second note", "Third note"] }),
      [ok(crewOpOk(without, "note.remove"))],
    );

    await vi.waitFor(() => {
      expect(root.querySelectorAll('button[aria-label^="Remove note"]')).toHaveLength(3);
    });
    const rm = root.querySelector('button[aria-label="Remove note 1"]') as HTMLButtonElement;
    rm.focus();
    rm.click();

    await vi.waitFor(() => {
      expect(root.querySelectorAll('button[aria-label^="Remove note"]')).toHaveLength(2);
    });
    expect(document.activeElement).toBe(root.querySelector('button[aria-label="Remove note 1"]'));
  });

  it("moves focus to the saved field's Edit button after a profile save", async () => {
    const updated = crewDTO({ revision: 6, name: "Renamed Crew" });
    mountWith(crewDTO(), [ok(crewOpOk(updated, "fields.update"))]);

    await vi.waitFor(() => {
      expect(root.querySelector('button[title="Edit Name"]')).not.toBeNull();
    });
    (root.querySelector('button[title="Edit Name"]') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(root.querySelector('input[aria-label="Name"]')).not.toBeNull();
    });
    (root.querySelector('input[aria-label="Name"]') as HTMLInputElement).value = "Renamed Crew";
    const saveBtn = root.querySelector('.field-editing button[title="Save"]') as HTMLButtonElement;
    saveBtn.focus();
    saveBtn.click();

    await vi.waitFor(() => {
      expect(root.textContent).toContain("Renamed Crew");
    });
    expect(document.activeElement).toBe(root.querySelector('button[title="Edit Name"]'));
  });

  it("keeps focus on the Set reputation button after saving a reputation", async () => {
    const REPUTATIONS = [
      "Ambitious", "Brutal", "Daring", "Honorable",
      "Professional", "Savvy", "Subtle", "Strange",
    ];
    const CREW_TYPES = {
      Name: "Blades in the Dark",
      Language: "en",
      CrewTypes: [{ Name: "Assassins", Reputations: REPUTATIONS }],
    };
    const updated = crewDTO({ revision: 6, reputation: "Savvy" });
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(ok(crewDTO()))
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => "games.crew: NOT_FOUND" })
      .mockResolvedValueOnce(ok(CREW_TYPES))
      .mockResolvedValueOnce(ok(crewDTO()))
      .mockResolvedValueOnce(ok(crewOpOk(updated, "fields.update")));

    mountCrewDetailPage(root, CREW_ID);

    await vi.waitFor(() => {
      expect(root.querySelector('button[title="Set reputation"]')).not.toBeNull();
    });
    (root.querySelector('select[aria-label="Reputation"]') as HTMLSelectElement).value = "Savvy";
    const setBtn = root.querySelector('button[title="Set reputation"]') as HTMLButtonElement;
    setBtn.focus();
    setBtn.click();

    await vi.waitFor(() => {
      expect(root.querySelector(".crew-reputation .field-value")?.textContent).toBe("Savvy");
    });
    expect(document.activeElement).toBe(root.querySelector('button[title="Set reputation"]'));
  });

  it("keeps focus on the undo button after a successful undo", async () => {
    const undoResp = {
      ok: true,
      crew: crewDTO({ revision: 6 }),
      canUndo: true,
      historyCount: 1,
      applied: { op: "crew.undo" },
      sideEffects: [],
      error: null,
    };
    mountWith(crewDTO(), [ok(undoResp)]);

    await vi.waitFor(() => {
      expect(root.querySelector('button[title="Undo last change"]')).not.toBeNull();
    });
    const undoBtn = root.querySelector('button[title="Undo last change"]') as HTMLButtonElement;
    undoBtn.focus();
    undoBtn.click();

    await vi.waitFor(() => {
      expect(root.textContent).toContain("Undone");
    });
    expect(document.activeElement).toBe(root.querySelector('button[title="Undo last change"]'));
  });

  it("moves focus to the next faction's remove button after deleting a faction", async () => {
    const without = crewDTO({
      revision: 6,
      factions: [{ name: "The Lampblacks", status: 1 }],
    });
    mountWith(
      crewDTO({
        factions: [
          { name: "The Crows", status: 2 },
          { name: "The Lampblacks", status: 1 },
        ],
      }),
      [ok(crewOpOk(without, "faction.remove"))],
    );

    await vi.waitFor(() => {
      expect(root.querySelectorAll('button[title^="Remove faction:"]')).toHaveLength(2);
    });
    const rm = root.querySelector('button[title="Remove faction: The Crows"]') as HTMLButtonElement;
    rm.focus();
    rm.click();

    await vi.waitFor(() => {
      expect(root.querySelector('button[title="Remove faction: The Crows"]')).toBeNull();
    });
    expect(document.activeElement).toBe(root.querySelector('button[title="Remove faction: The Lampblacks"]'));
  });

  it("moves focus to the newly taken ability's remove button", async () => {
    const CREW_TYPE_DATA = {
      Name: "Assassins",
      Hook: "You're professional murderers.",
      SpecialAbilities: [
        { Name: "Predators", TimesTakeable: 1, Description: "When you use a stealth or deception plan to commit murder, take +1d to the engagement roll." },
        { Name: "Deadly", TimesTakeable: 1, Description: "Each PC may add +1 action rating to Hunt, Prowl, or Skirmish." },
      ],
      Upgrades: [],
      StartingUpgrades: [],
    };
    const CREW_TYPES_DATA = {
      Name: "Blades in the Dark",
      Language: "en",
      CrewTypes: [CREW_TYPE_DATA],
    };
    const taken = crewDTO({
      revision: 6,
      specialAbilities: [{ name: "Deadly", timesTaken: 1 }],
    });

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(ok(crewDTO({ specialAbilities: [] })))
      .mockResolvedValueOnce(ok(CREW_TYPE_DATA))
      .mockResolvedValueOnce(ok(CREW_TYPES_DATA))
      .mockResolvedValueOnce(ok(crewDTO()))
      .mockResolvedValueOnce(ok(crewOpOk(taken, "ability.take")));

    mountCrewDetailPage(root, CREW_ID);

    await vi.waitFor(() => {
      expect(root.querySelector('button[title="Take ability"]')).not.toBeNull();
    });
    // CREW-04: enabling advancement edits so the remove control exists and
    // can receive focus after the take re-render.
    (root.querySelector("button.advancement-toggle") as HTMLButtonElement).click();
    const select = root.querySelector('select[aria-label="Take ability"]') as HTMLSelectElement;
    select.value = "Deadly";
    select.focus();
    (root.querySelector('button[title="Take ability"]') as HTMLButtonElement).click();

    await vi.waitFor(() => {
      expect(root.querySelector('button[title="Remove ability: Deadly"]')).not.toBeNull();
    });
    expect(document.activeElement).toBe(root.querySelector('button[title="Remove ability: Deadly"]'));
  });

  it("moves focus to the next cohort's remove button after deleting a cohort", async () => {
    const cohort = (id: string, gangType: string) => ({
      id,
      cohortKind: "gang",
      gangType,
      expertType: "",
      quality: 1,
      scale: 1,
      hasArmor: false,
      edges: [],
      flaws: [],
      harm: "healthy",
      description: "",
    });
    const without = crewDTO({ revision: 6, cohorts: [cohort("b1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", "Skulls")] });
    mountWith(
      crewDTO({
        cohorts: [cohort("a0a1a2a3-a4a5-4a6a-8a7a-9a0a1a2a3a4a", "Adepts"), cohort("b1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", "Skulls")],
      }),
      [ok(crewOpOk(without, "cohort.remove"))],
    );

    await vi.waitFor(() => {
      expect(root.querySelectorAll('button[title^="Remove cohort:"]')).toHaveLength(2);
    });
    const rm = root.querySelector('button[title="Remove cohort: Adepts"]') as HTMLButtonElement;
    rm.focus();
    rm.click();

    await vi.waitFor(() => {
      expect(root.querySelector('button[title="Remove cohort: Adepts"]')).toBeNull();
    });
    expect(document.activeElement).toBe(root.querySelector('button[title="Remove cohort: Skulls"]'));
  });

  it("returns focus to the add-contact button after a stale (409) refresh", async () => {
    const staleResp = {
      ok: false,
      applied: { op: "contact.add" },
      sideEffects: [],
      error: {
        code: "STALE_REVISION",
        status: 409,
        message: "Crew revision mismatch",
        retryable: true,
        recovery: "Refresh the sheet and retry.",
        details: { currentRevision: 7 },
      },
    };
    mountWith(crewDTO(), [
      { ok: false, status: 409, text: async () => JSON.stringify(staleResp) },
      ok(crewDTO({ revision: 7 })),
    ]);

    await vi.waitFor(() => expect(addContact()).not.toBeNull());
    contactName().value = "Rolan Wott";
    addContact().focus();
    addContact().click();

    await vi.waitFor(() => {
      expect(root.textContent).toContain("Sheet refreshed");
    });
    expect(document.activeElement).toBe(addContact());
  });
});

// ---------------------------------------------------------------------------
// CHAR-06 — tracker and field affordances
// ---------------------------------------------------------------------------

describe("CHAR-06 crew tracker affordances", () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement("div");
    vi.clearAllMocks();
  });

  it("labels every ±1 stepper with the +1/−1 convention", async () => {
    global.fetch = vi.fn().mockResolvedValue(ok(crewDTO()));
    mountCrewDetailPage(root, CREW_ID);

    await vi.waitFor(() => {
      expect(root.querySelector(".crew-rep")).not.toBeNull();
    });

    const pairs: Array<[string, string]> = [
      ["Add 1 rep", "+1"],
      ["Remove 1 rep", "−1"],
      ["Add 1 heat", "+1"],
      ["Remove 1 heat", "−1"],
      ["Add 1 wanted", "+1"],
      ["Remove 1 wanted", "−1"],
      ["Add 1 tier", "+1"],
      ["Remove 1 tier", "−1"],
      ["Add 1 turf", "+1"],
      ["Remove 1 turf", "−1"],
      ["Add 1 coin", "+1"],
      ["Remove 1 coin", "−1"],
      ["Add 1 stash", "+1"],
      ["Remove 1 stash", "−1"],
      ["Add 1 crew XP", "+1"],
      ["Remove 1 crew XP", "−1"],
    ];
    for (const [title, expected] of pairs) {
      const btn = root.querySelector(`button[title="${title}"]`);
      expect(btn, title).not.toBeNull();
      expect(btn!.textContent, title).toBe(expected);
    }
  });

  it("uses semantic default option text instead of -- in pickers", async () => {
    global.fetch = vi.fn().mockResolvedValue(ok(crewDTO()));
    mountCrewDetailPage(root, CREW_ID);

    await vi.waitFor(() => {
      expect(root.querySelector('select[aria-label="Take ability"]')).not.toBeNull();
    });

    const firstOption = (ariaLabel: string): { text: string | null; value: string | null } => {
      const select = root.querySelector(`select[aria-label="${ariaLabel}"]`) as HTMLSelectElement;
      return { text: select.options[0]?.textContent ?? null, value: select.options[0]?.value ?? null };
    };

    // Placeholder text names what is being chosen; values stay "" so form
    // logic keyed on the empty value is unaffected.
    expect(firstOption("Take ability")).toEqual({ text: "Ability", value: "" });
    expect(firstOption("Mark upgrade")).toEqual({ text: "Upgrade", value: "" });
    expect(firstOption("Cohort gang type")).toEqual({ text: "Gang type", value: "" });
    expect(firstOption("Cohort expert type")).toEqual({ text: "Expert type", value: "" });
  });
});

// ---------------------------------------------------------------------------
// CREW-02 — intentional claim acquisition and removal
// ---------------------------------------------------------------------------

/** Crew-type game data with a small claims graph:
 *  lair (3,2) — north-markets (2,2) — forgery-office (1,1).
 *  With nothing claimed, only north-markets is connected to the network. */
const ASSASSIN_TYPE = {
  Name: "Assassins",
  Claims: {
    Columns: 5,
    Rows: 3,
    Nodes: [
      { Id: "lair", Name: "Lair", Description: "", Kind: "lair", Column: 3, Row: 2 },
      { Id: "north-markets", Name: "North Markets", Description: "smuggling route", Kind: "claim", Column: 2, Row: 2 },
      { Id: "forgery-office", Name: "Forgery Office", Description: "counterfeit papers", Kind: "claim", Column: 1, Row: 1 },
    ],
    Edges: [
      { From: "lair", To: "north-markets" },
      { From: "north-markets", To: "forgery-office" },
    ],
  },
};

function claimSetResult(claimedIds: string[], revision = 6) {
  return fetchResponse({
    ok: true,
    crew: crewDTO({ revision, claimedClaimIds: claimedIds }),
    applied: { op: "claim.set" },
    sideEffects: [],
    error: null,
    canUndo: true,
    historyCount: 4,
  });
}

describe("CREW-02 claim acquisition and removal gating", () => {
  let root: HTMLElement;
  let confirmSpy: MockInstance;

  beforeEach(() => {
    root = document.createElement("div");
    vi.clearAllMocks();
    confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
  });

  afterEach(() => {
    confirmSpy.mockRestore();
  });

  function mountWithClaims(crewOverrides: Record<string, unknown> = {}) {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === `/api/crews/${CREW_ID}`) return Promise.resolve(ok(crewDTO(crewOverrides)));
      if (url === `/api/crews/${CREW_ID}/capabilities`) return Promise.resolve(ok({}));
      if (url.endsWith("/ops/claim.set")) return Promise.resolve(claimSetResult(["north-markets"]));
      if (url === "/api/games/blades-in-the-dark/crews") {
        return Promise.resolve(ok({ Name: "Blades in the Dark", CrewTypes: [ASSASSIN_TYPE] }));
      }
      // /api/games/blades-in-the-dark/crews/Assassins and anything else
      return Promise.resolve(ok(ASSASSIN_TYPE));
    });
    mountCrewDetailPage(root, CREW_ID);
    return vi.waitFor(() => {
      expect(root.querySelector(".claims-grid")).not.toBeNull();
    });
  }

  const cell = (name: string) =>
    Array.from(root.querySelectorAll<HTMLButtonElement>(".claims-grid button.claim-node")).find(
      (b) => b.textContent?.includes(name),
    )!;

  it("renders the claims map and keeps removal behind an Edit claims toggle that starts off", async () => {
    await mountWithClaims({ claimedClaimIds: ["north-markets"] });

    expect(cell("North Markets")).toBeTruthy();
    expect(cell("Forgery Office")).toBeTruthy();

    const toggle = root.querySelector<HTMLButtonElement>(".claims-edit-toggle");
    expect(toggle).not.toBeNull();
    expect(toggle!.textContent).toBe("Edit claims");

    // Active list has no Relinquish control outside edit mode.
    const list = root.querySelector(".active-claim-list");
    expect(list?.textContent).toContain("North Markets");
    expect(list?.textContent).not.toContain("Relinquish");
  });

  it("asks confirmation before acquiring; cancel writes nothing, accept posts ops/claim.set", async () => {
    await mountWithClaims();

    const postsClaimOps = () =>
      (global.fetch as Mock).mock.calls.filter((c: unknown[]) =>
        String(c[0]).includes("/ops/"),
      ).length;

    // Cancel — no write.
    cell("North Markets").click();
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0]?.[0]).toContain("North Markets");
    expect(postsClaimOps()).toBe(0);

    // Accept — acquire.
    confirmSpy.mockReturnValueOnce(true);
    cell("North Markets").click();

    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/crews/${CREW_ID}/ops/claim.set`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ claimId: "north-markets", claimed: true }),
        }),
      );
    });
  });

  it("strengthens the acquisition warning for a claim disconnected from the network", async () => {
    await mountWithClaims();

    cell("Forgery Office").click();

    const msg = confirmSpy.mock.calls[0]?.[0] ?? "";
    expect(msg).toContain("Forgery Office");
    expect(msg.toLowerCase()).toContain("not connected");
    // The same message must still offer the acquisition itself.
    expect(msg.toLowerCase()).toContain("acquire");

    // And the warning is visible on the cell before clicking.
    expect(cell("Forgery Office").textContent.toLowerCase()).toContain("not connected");
    expect(cell("North Markets").textContent.toLowerCase()).not.toContain("not connected");
  });

  it("keeps owned cells inert outside edit mode with an explanatory hint", async () => {
    await mountWithClaims({ claimedClaimIds: ["north-markets"] });

    const owned = cell("North Markets");
    expect(owned.disabled).toBe(true);
    expect(owned.getAttribute("title")).toMatch(/Edit claims/i);

    owned.click();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect((global.fetch as Mock).mock.calls.some((c: unknown[]) => String(c[0]).includes("/ops/"))).toBe(false);
  });

  it("in edit mode, relinquishing confirms with strong wording then posts claimed:false", async () => {
    await mountWithClaims({ claimedClaimIds: ["north-markets"] });

    root.querySelector<HTMLButtonElement>(".claims-edit-toggle")!.click();
    const toggle = root.querySelector<HTMLButtonElement>(".claims-edit-toggle")!;
    expect(toggle.textContent).toBe("Done editing");

    // Active list exposes Relinquish only inside edit mode.
    const relBtn = Array.from(root.querySelectorAll(".active-claim-list button")).find(
      (b) => b.textContent === "Relinquish",
    ) as HTMLButtonElement;
    expect(relBtn).toBeTruthy();

    // Cancel first.
    relBtn.click();
    const ownedMsg = confirmSpy.mock.calls.at(-1)?.[0] ?? "";
    expect(ownedMsg).toContain("North Markets");
    expect(ownedMsg.toLowerCase()).toContain("relinquish");
    expect(ownedMsg.toLowerCase()).toContain("remove");
    expect((global.fetch as Mock).mock.calls.some((c: unknown[]) => String(c[0]).includes("/ops/"))).toBe(false);

    // Accept via the active-list path.
    confirmSpy.mockReturnValueOnce(true);
    relBtn.click();
    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/crews/${CREW_ID}/ops/claim.set`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ claimId: "north-markets", claimed: false }),
        }),
      );
    });
  });
});
