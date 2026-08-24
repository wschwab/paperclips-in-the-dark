// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { mountCrewCreatePage } from "./crew-create.js";
import { renderShell } from "./shell.js";
import { loadStylesheets, assertFirstH1ClearsSeam } from "./seam.js";

const ok = (data: unknown) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify(data),
});
const err500 = () => ({ ok: false, status: 500, text: async () => "boom" });

function crewDTO(overrides: Record<string, unknown> = {}) {
  return {
    kind: "crew",
    id: "f1e2d3c4-b5a6-4c7d-8e9f-0a1b2c3d4e5f",
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
    reputation: "",
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
    // SC-F1 frozen decoder: contacts and factions are required canonical
    // arrays (Q4) — empty means no entries.
    contacts: [],
    factions: [],
    coin: 0,
    stash: 0,
    notes: [],
    turf: 0,
    claimedClaimIds: [],
    claimOverrides: [],
    ...overrides,
  };
}

const createdResp = (c: ReturnType<typeof crewDTO>) => ({
  ok: true,
  crew: c,
  applied: { op: "create" },
  sideEffects: [],
  error: null,
});

describe("crew-create page (Design Audit F-12 two-step naming)", () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement("div");
    vi.clearAllMocks();
  });

  function submit(name: string) {
    const crewType = root.querySelector("#crewType") as HTMLSelectElement;
    crewType.value = "Assassins";
    if (name) {
      const nameField = root.querySelector("#name") as HTMLInputElement;
      nameField.value = name;
    }
    (root.querySelector("form") as HTMLFormElement).dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  }

  it("places the first h1 below the app bar's torn seam (FV-031)", () => {
    loadStylesheets();
    const { shell, outlet } = renderShell({ currentPath: "/crew/create" });
    document.body.appendChild(shell);
    mountCrewCreatePage(outlet, "blades-in-the-dark", ["Assassins"], vi.fn());
    expect(shell.querySelector(".app-bar.torn-foot")).not.toBeNull();
    assertFirstH1ClearsSeam(outlet);
  });

  it("POSTs create then fields.update with the name, delivering the named DTO", async () => {
    const created = crewDTO();
    const named = crewDTO({ revision: 2, name: "The Red Sashes" });
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(ok(createdResp(created)))
      .mockResolvedValueOnce(
        ok({ ok: true, crew: named, applied: { op: "fields.update" }, sideEffects: [], error: null }),
      );

    const onCreated = vi.fn();
    mountCrewCreatePage(root, "blades-in-the-dark", ["Assassins", "Shadows"], onCreated);

    submit("The Red Sashes");

    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/crews/f1e2d3c4-b5a6-4c7d-8e9f-0a1b2c3d4e5f/ops/fields.update",
        expect.objectContaining({
          headers: expect.objectContaining({ "If-Match": "1" }),
          body: JSON.stringify({ name: "The Red Sashes" }),
        }),
      );
    });
    await vi.waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith(named);
    });
    // Single-post guarantee (absorbed from the deleted duplicate): exactly
    // one POST to /api/crews — the name rides fields.update alone.
    expect(
      (global.fetch as Mock).mock.calls.filter((c) => c[0] === "/api/crews").length,
    ).toBe(1);
  });

  it("skips fields.update when no name is given", async () => {
    const created = crewDTO();
    global.fetch = vi.fn().mockResolvedValueOnce(ok(createdResp(created)));

    const onCreated = vi.fn();
    mountCrewCreatePage(root, "blades-in-the-dark", ["Assassins"], onCreated);

    submit("");

    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(onCreated).toHaveBeenCalledWith(created);
    });
  });

  it("keeps the created crew and retries only fields.update across two failures (FV-017)", async () => {
    const created = crewDTO();
    const named = crewDTO({ revision: 2, name: "The Red Sashes" });
    // create OK → fields.update fails twice → fields.update succeeds.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok(createdResp(created)))
      .mockResolvedValueOnce(err500())
      .mockResolvedValueOnce(err500())
      .mockResolvedValueOnce(
        ok({ ok: true, crew: named, applied: { op: "fields.update" }, sideEffects: [], error: null }),
      );
    global.fetch = fetchMock;

    const onCreated = vi.fn();
    mountCrewCreatePage(root, "blades-in-the-dark", ["Assassins"], onCreated);

    const sheetHref = "/crew/f1e2d3c4-b5a6-4c7d-8e9f-0a1b2c3d4e5f";

    submit("The Red Sashes");

    // Phase-one succeeded, phase-two failed: the retained entity is linked and
    // a retry control is available — no dead end.
    await vi.waitFor(() => {
      expect(root.querySelector(`a[href="${sheetHref}"]`)).not.toBeNull();
      expect(root.querySelector(".crew-create-error button")).not.toBeNull();
    });
    expect(fetchMock.mock.calls.filter((c) => c[0] === "/api/crews").length).toBe(1);

    // Retry #1 fails again: recovery UI stays (fresh controls), create is
    // still not re-POSTed.
    (root.querySelector(".crew-create-error button") as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(root.querySelector(`a[href="${sheetHref}"]`)).not.toBeNull();
    });
    expect(fetchMock.mock.calls.filter((c) => c[0] === "/api/crews").length).toBe(1);

    // Retry #2 succeeds via fields.update alone — the sheet receives the
    // named crew; entity count never grew past one.
    (root.querySelector(".crew-create-error button") as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith(named);
    });
    expect(fetchMock.mock.calls.filter((c) => c[0] === "/api/crews").length).toBe(1);
    const updates = fetchMock.mock.calls.filter(
      (c) => (c[0] as string).endsWith("/ops/fields.update"),
    );
    expect(updates.length).toBe(3);
    // Every retry re-sends the retained revision in If-Match.
    expect(updates[2][1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({ "If-Match": "1" }),
        body: JSON.stringify({ name: "The Red Sashes" }),
      }),
    );
  });
});

/**
 * FV-025: every create-form control must have an accessible name from a
 * VISIBLE <label for> association (the placeholder alone is not a name).
 */
function controlName(root: ParentNode, id: string): string | null {
  const control = root.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`);
  if (!control) return null;
  const aria = control.getAttribute("aria-label");
  if (aria) return aria;
  const label = root.querySelector<HTMLLabelElement>(`label[for="${id}"]`);
  if (!label) return null;
  const text = label.textContent?.trim() ?? "";
  if (!text) return null;
  // The label's `for` must resolve to exactly this control's id (paired with
  // the id-uniqueness assertions this IS the association). happy-dom reports
  // an empty .labels for disabled controls in detached roots, so the label
  // list only corroborates when it is populated.
  if (label.getAttribute("for") !== control.id) return null;
  const labels = control.labels ? Array.from(control.labels) : null;
  if (labels && labels.length > 0 && !labels.includes(label)) return null;
  return text;
}

describe("crew create form accessible names (FV-025)", () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement("div");
    vi.clearAllMocks();
  });

  function submit(name: string) {
    const crewType = root.querySelector("#crewType") as HTMLSelectElement;
    crewType.value = "Assassins";
    if (name) {
      const nameField = root.querySelector("#name") as HTMLInputElement;
      nameField.value = name;
    }
    (root.querySelector("form") as HTMLFormElement).dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  }

  it("gives gameStem/name/crewType accessible names via visible label associations", () => {
    mountCrewCreatePage(root, "blades-in-the-dark", ["Assassins"], vi.fn());

    const expected: Record<string, string> = {
      gameStem: "Game",
      name: "Name",
      crewType: "Crew Type *",
    };
    for (const [id, want] of Object.entries(expected)) {
      const label = root.querySelector<HTMLLabelElement>(`label[for="${id}"]`);
      expect(label, `visible <label for="${id}">`).not.toBeNull();
      expect(label?.textContent?.trim(), `visible label text for ${id}`).toBe(want);
      expect(controlName(root, id), `accessible name for ${id}`).toBe(want);
    }
    // The name input is labeled by its visible label, not by placeholder or
    // an aria crutch — exactly the FV-025 gap.
    const nameInput = root.querySelector<HTMLInputElement>("#name");
    expect(nameInput?.getAttribute("placeholder") ?? "").not.toBe("");
    expect(nameInput?.getAttribute("aria-label")).toBeNull();
  });

  it("keeps ids unique and labels associated after an invalid submit (validation)", () => {
    mountCrewCreatePage(root, "blades-in-the-dark", ["Assassins"], vi.fn());
    // Validation gate: required crew type missing → the form stays mounted
    // (no fetch, no re-render) — ids must stay unique and labels intact.
    (root.querySelector("form") as HTMLFormElement).dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    expect(global.fetch).not.toHaveBeenCalled();
    expect(root.querySelector("form")).not.toBeNull();
    const ids = Array.from(root.querySelectorAll<HTMLElement>("[id]")).map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ["gameStem", "name", "crewType"]) {
      expect(controlName(root, id), `accessible name for ${id}`).not.toBeNull();
    }
  });

  it("keeps ids unique across phase-two retries (FV-017 flow)", async () => {
    const created = crewDTO();
    const named = crewDTO({ revision: 2, name: "The Red Sashes" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok(createdResp(created)))
      .mockResolvedValueOnce(err500())
      .mockResolvedValueOnce(err500())
      .mockResolvedValueOnce(
        ok({ ok: true, crew: named, applied: { op: "fields.update" }, sideEffects: [], error: null }),
      );
    global.fetch = fetchMock;

    const onCreated = vi.fn();
    mountCrewCreatePage(root, "blades-in-the-dark", ["Assassins"], onCreated);
    const idsUnique = () => {
      const ids = Array.from(root.querySelectorAll<HTMLElement>("[id]")).map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);
    };

    idsUnique(); // initial form render
    submit("The Red Sashes");
    // First phase-two failure: recovery UI replaces the form without
    // reusing or duplicating any of the form's ids.
    await vi.waitFor(() => {
      expect(root.querySelector(".crew-create-error")).not.toBeNull();
    });
    idsUnique();
    // Retry #1 fails again: freshly rendered recovery UI, ids still unique.
    (root.querySelector(".crew-create-error button") as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(root.querySelector(".crew-create-error button")).not.toBeNull();
    });
    idsUnique();
    // Retry #2 succeeds — the invariant held through every render.
    (root.querySelector(".crew-create-error button") as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith(named);
    });
    idsUnique();
  });
});
