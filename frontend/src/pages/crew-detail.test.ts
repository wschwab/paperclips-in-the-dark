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
        expect(root.textContent).toContain("Turf fills rep boxes");
        // Tier value + hold select from contract enum values
        expect(root.querySelector(".crew-tier-value")?.textContent).toBe("1");
        const holdSelect = root.querySelector('select[aria-label="Hold"]') as HTMLSelectElement;
        expect(holdSelect).not.toBeNull();
        expect([...holdSelect.options].map((o) => o.value)).toEqual(["strong", "weak"]);
        expect(holdSelect.value).toBe("strong");
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
        .mockResolvedValueOnce(ok(repResp))
        .mockResolvedValueOnce(ok({
        ok: true,
        crew: crewDTO({ revision: 7, rep: { current: 5, max: 12 } }),
        applied: { op: "rep.add" },
        sideEffects: [],
        error: null,
      }))
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
        .mockResolvedValueOnce(ok(heatResp))
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
        .mockResolvedValueOnce(ok(wantedResp))
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
        .mockResolvedValueOnce(ok(tierResp))
        .mockResolvedValueOnce(ok({
        ok: true,
        crew: crewDTO({ revision: 7, tier: 1 }),
        applied: { op: "tier.add" },
        sideEffects: [],
        error: null,
      }));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector(".crew-tier-value")?.textContent).toBe("1");
      });

      (root.querySelector('button[title="Add 1 tier"]') as HTMLButtonElement).click();
      await vi.waitFor(() => {
        expect(root.querySelector(".crew-tier-value")?.textContent).toBe("2");
      });

      (root.querySelector('button[title="Remove 1 tier"]') as HTMLButtonElement).click();
      await vi.waitFor(() => {
        expect(root.querySelector(".crew-tier-value")?.textContent).toBe("1");
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
        .mockResolvedValueOnce(ok(holdResp));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('select[aria-label="Hold"]')).not.toBeNull();
      });

      const holdSelect = root.querySelector('select[aria-label="Hold"]') as HTMLSelectElement;
      holdSelect.value = "weak";
      (root.querySelector('button[title="Set hold"]') as HTMLButtonElement).click();

      await vi.waitFor(() => {
        const sel = root.querySelector('select[aria-label="Hold"]') as HTMLSelectElement;
        expect(sel.value).toBe("weak");
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
        .mockResolvedValueOnce(ok(coinResp))
        .mockResolvedValueOnce(ok(stashResp));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector(".crew-coin-count")?.textContent).toBe("0");
        expect(root.querySelector(".crew-stash-count")?.textContent).toBe("2");
      });

      (root.querySelector('button[title="Add 1 coin"]') as HTMLButtonElement).click();
      await vi.waitFor(() => {
        expect(root.querySelector(".crew-coin-count")?.textContent).toBe("1");
      });

      (root.querySelector('button[title="Add 1 stash"]') as HTMLButtonElement).click();
      await vi.waitFor(() => {
        expect(root.querySelector(".crew-stash-count")?.textContent).toBe("3");
      });
    });

    it("shows an op-level error notice when a tracker op fails", async () => {
      const errResp = {
        ok: false,
        applied: { op: "heat.add" },
        sideEffects: [],
        error: { code: "VALIDATION", message: "bad delta" },
        crew: crewDTO(),
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok(crewDTO()))
        .mockResolvedValueOnce(ok(errResp));

      mountCrewDetailPage(root, CREW_ID);

      await vi.waitFor(() => {
        expect(root.querySelector('button[title="Add 1 heat"]')).not.toBeNull();
      });

      (root.querySelector('button[title="Add 1 heat"]') as HTMLButtonElement).click();

      await vi.waitFor(() => {
        const err = root.querySelector(".error");
        expect(err?.textContent).toContain("VALIDATION");
      });
    });

    it("refetches the sheet after a STALE_REVISION on a tracker op", async () => {
      const staleResp = {
        ok: false,
        applied: { op: "rep.add" },
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
});
