// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
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

  it("does not re-POST a second crew when fields.update fails", async () => {
    const created = crewDTO();
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(ok(createdResp(created)))
      .mockResolvedValueOnce(err500());

    const onCreated = vi.fn();
    mountCrewCreatePage(root, "blades-in-the-dark", ["Assassins"], onCreated);

    submit("The Red Sashes");

    await vi.waitFor(() => {
      expect(root.querySelector(".crew-create-error")).not.toBeNull();
    });
    const posts = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === "/api/crews");
    expect(posts.length).toBe(1);
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
