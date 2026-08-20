// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mountRosterPage } from "./roster.js";

const ok = (data: unknown) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify(data),
});

const json = (status: number, data: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(data),
});

function clickByText(container: Element | null, text: string): void {
  if (!container) throw new Error("container missing");
  const nodes = container.querySelectorAll("button");
  const btn = Array.from(nodes).find((b) => b.textContent?.trim() === text);
  if (!btn) throw new Error(`button "${text}" not found`);
  (btn as HTMLButtonElement).click();
}

const rosterDTO = {
  characters: [
    {
      // SC-F1 frozen decoder requires the summary discriminant.
      kind: "character",
      id: "c46ba7cb-993b-4fc7-974d-fb95eacd5446",
      name: "Brenda Hilton",
      alias: "Webweaver",
      playbook: "Spider",
      gameStem: "blades-in-the-dark",
      crewId: "8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2",
      stress: 3,
      traumas: ["Haunted"],
      isRetired: false,
      isDeadish: false,
      revision: 12,
      isReadable: true,
      isRepairable: false,
      isComplete: true,
      deleteToken: "",
      canUndo: false,
      historyCount: 0,
    },
  ],
  crews: [
    {
      kind: "crew",
      id: "8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2",
      name: "The Red Sashes",
      crewType: "Assassins",
      gameStem: "blades-in-the-dark",
      tier: 1,
      heat: 4,
      wanted: 1,
      rep: 3,
      hold: "strong",
      memberCount: 2,
      revision: 5,
      isReadable: true,
      isRepairable: false,
      isComplete: true,
      deleteToken: "",
      canUndo: false,
      historyCount: 0,
    },
  ],
};

describe("roster page (F2aa)", () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement("div");
    vi.clearAllMocks();
  });

  it("renders characters and crews after initial load", async () => {
    global.fetch = vi.fn().mockResolvedValue(ok(rosterDTO));

    mountRosterPage(root);

    await vi.waitFor(() => {
      expect(root.querySelector('[data-character-id]')?.textContent).toContain("Brenda Hilton");
      expect(root.querySelector('[data-crew-id]')?.textContent).toContain("The Red Sashes");
    });
  });

  it("falls back to an Unnamed {playbook} placeholder when a character has no name", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      ok({
        characters: [{ ...rosterDTO.characters[0], name: "", alias: "" }],
        crews: rosterDTO.crews,
      }),
    );

    mountRosterPage(root);

    await vi.waitFor(() => {
      expect(root.querySelector("[data-character-id] .unnamed")?.textContent).toBe("Unnamed Spider");
    });
  });

  it("falls back to an Unnamed {crewType} placeholder when a crew has no name (FV-018)", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      ok({
        characters: rosterDTO.characters,
        crews: [{ ...rosterDTO.crews[0], name: "" }],
      }),
    );

    mountRosterPage(root);

    await vi.waitFor(() => {
      const row = root.querySelector("[data-crew-id]");
      // Deterministic placeholder instead of an empty <strong>; the row link
      // keeps its href and still surfaces the crew type.
      expect(row?.querySelector(".unnamed")?.textContent).toBe("Unnamed Assassins");
      expect(row?.querySelector("strong")).toBeNull();
      expect(row?.querySelector("a")?.getAttribute("href")).toBe(
        `/crew/${rosterDTO.crews[0].id}`,
      );
    });
  });

  it("renders a recoverable error card with retry, back link, and collapsed detail", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "raw schema boom",
    });

    mountRosterPage(root);

    await vi.waitFor(() => {
      const alert = root.querySelector(".error-card-head");
      expect(alert?.textContent).toContain("This roster could not be loaded.");
      expect(root.querySelector("button")?.textContent).toBe("Retry");
      expect(root.querySelector('a[href="/roster"]')).not.toBeNull();
      const details = root.querySelector("details");
      expect(details?.open).toBe(false);
      expect(details?.textContent).toContain("raw schema boom");
      expect(alert?.textContent).not.toContain("raw schema boom");
    });
  });

  it("recovers via Retry: a successful re-fetch replaces the error card", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "boom",
      })
      .mockResolvedValueOnce(ok(rosterDTO));

    mountRosterPage(root);

    // First failure → error card
    await vi.waitFor(() => {
      expect(root.querySelector(".error-card")).not.toBeNull();
    });

    // Click Retry (guards the manual addEventListener wiring in errorCard)
    const retry = root.querySelector(".error-card button");
    expect(retry).not.toBeNull();
    (retry as HTMLButtonElement).click();

    // Second fetch succeeds → the roster replaces the error card
    await vi.waitFor(() => {
      expect(root.querySelector(".error-card")).toBeNull();
      expect(root.querySelector(".roster")).not.toBeNull();
      expect(root.querySelector('[data-character-id]')?.textContent).toContain("Brenda Hilton");
    });
  });

  // -------------------------------------------------------------------------
  // SC-F2 degraded-row controls (E11 total collections): repairable rows get
  // a repair affordance; unreadable rows are delete-only via the deleteToken.
  // -------------------------------------------------------------------------

  const CHAR_ID = rosterDTO.characters[0].id;
  const degradedChar = (overrides: Record<string, unknown> = {}) => ({
    ...rosterDTO.characters[0],
    name: "",
    alias: "",
    playbook: "",
    gameStem: "",
    crewId: "",
    stress: 0,
    traumas: [],
    isRetired: false,
    isDeadish: false,
    isReadable: false,
    isRepairable: false,
    isComplete: false,
    deleteToken: `sha256:${"a".repeat(64)}`,
    canUndo: false,
    historyCount: 0,
    ...overrides,
  });

  it("shows delete-only controls for an unreadable character and deletes it via its deleteToken", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/campaign/roster") {
        return Promise.resolve(ok({ characters: [degradedChar()], crews: [] }));
      }
      return Promise.resolve(ok({ ok: true, applied: { op: "deleteCharacter" }, sideEffects: [], error: null }));
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    mountRosterPage(root);
    await vi.waitFor(() => expect(root.querySelector(".degraded-row")).not.toBeNull());
    expect(root.querySelector(".degraded-row")?.textContent).toContain("Unreadable character");

    // Delete-only: no Repair affordance on an unrepairable row.
    const controlButtons = Array.from(root.querySelectorAll(".degraded-controls button"));
    expect(controlButtons.some((b) => b.textContent === "Repair")).toBe(false);
    expect(controlButtons.some((b) => b.textContent === "Delete")).toBe(true);

    const container = root.querySelector(".degraded-controls-container");
    clickByText(container, "Delete");
    await vi.waitFor(() => expect(root.querySelector(".degraded-delete-confirm")).not.toBeNull());
    clickByText(container, "Delete");

    // Delete succeeded → the roster re-fetches.
    await vi.waitFor(() => {
      const urls = mockFetch.mock.calls.map((c) => c[0]);
      expect(urls.filter((u) => u === "/api/campaign/roster").length).toBeGreaterThanOrEqual(2);
    });
    const deleteCall = mockFetch.mock.calls.find((c) => String(c[0]).includes("/delete"));
    expect((deleteCall?.[1]?.headers as Record<string, string> | undefined)?.["If-Match"]).toBe(`sha256:${"a".repeat(64)}`);
  });

  it("repairs a repairable character row: preview → confirm → apply → re-fetch", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/campaign/roster") {
        return Promise.resolve(ok({ characters: [degradedChar({ isRepairable: true })], crews: [] }));
      }
      if (url === `/api/characters/${CHAR_ID}/repair-preview`) {
        return Promise.resolve(
          json(409, {
            ok: false,
            error: {
              code: "NORMALIZATION_REQUIRED",
              status: 409,
              message: "Normalization required",
              retryable: true,
              recovery: "Confirm the repair",
              details: { warnings: ["legacy notes converted"], previewToken: "tok-r" },
              preview: {
                changes: [{ pointer: "/dossier/notes", reason: "legacy conversion", previous: "legacy note", replacement: ["legacy note"] }],
                warnings: ["legacy notes converted"],
                previewToken: "tok-r",
                canonical: false,
                document: {},
              },
              token: "tok-r",
            },
          }),
        );
      }
      if (url === `/api/characters/${CHAR_ID}/repair`) {
        return Promise.resolve(ok({ ok: true, applied: { op: "repairCharacter" }, sideEffects: [], error: null }));
      }
      return Promise.resolve(json(404, { ok: false, error: { code: "NOT_FOUND", message: "nope" } }));
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    mountRosterPage(root);
    await vi.waitFor(() => expect(root.querySelector(".degraded-row")).not.toBeNull());
    const container = root.querySelector(".degraded-controls-container");
    clickByText(container, "Repair");

    await vi.waitFor(() => expect(root.querySelector(".norm-preview")).not.toBeNull());
    expect(root.querySelector(".norm-warnings")?.textContent).toContain("legacy notes converted");
    expect(root.querySelector(".norm-changes")?.textContent).toContain("/dossier/notes");
    clickByText(root.querySelector(".norm-preview"), "Confirm repair");

    // Repair applied → the roster re-fetches.
    await vi.waitFor(() => {
      const urls = mockFetch.mock.calls.map((c) => c[0]);
      expect(urls.filter((u) => u === "/api/campaign/roster").length).toBeGreaterThanOrEqual(2);
    });
    const repairCall = mockFetch.mock.calls.find((c) => String(c[0]).includes("/repair"));
    expect((repairCall?.[1]?.headers as Record<string, string> | undefined)?.["If-Match"]).toBe(`sha256:${"a".repeat(64)}`);
  });

  it("renders repair needs-input pointers as editable fields, re-previews with values, then applies", async () => {
    let previewCalls = 0;
    const previewBodies: Array<Record<string, unknown>> = [];
    const mockFetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/campaign/roster") {
        return Promise.resolve(ok({ characters: [degradedChar({ isRepairable: true })], crews: [] }));
      }
      if (url === `/api/characters/${CHAR_ID}/repair-preview`) {
        previewCalls += 1;
        previewBodies.push(init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {});
        return Promise.resolve(
          previewCalls === 1
            ? json(409, {
                ok: false,
                error: {
                  code: "NORMALIZATION_REQUIRED",
                  status: 409,
                  message: "Normalization required",
                  retryable: true,
                  recovery: "Provide values",
                  details: { warnings: [], previewToken: "tok-r" },
                  preview: {
                    changes: [],
                    warnings: [],
                    needsInputPointers: ["/dossier/name"],
                    previewToken: "tok-r",
                    canonical: false,
                    document: {},
                  },
                  token: "tok-r",
                },
              })
            : json(200, { changes: [], warnings: [], canonical: true, previewToken: "tok-r2", document: {} }),
        );
      }
      if (url === `/api/characters/${CHAR_ID}/repair`) {
        return Promise.resolve(ok({ ok: true, applied: { op: "repairCharacter" }, sideEffects: [], error: null }));
      }
      return Promise.resolve(json(404, { ok: false, error: { code: "NOT_FOUND", message: "nope" } }));
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    mountRosterPage(root);
    await vi.waitFor(() => expect(root.querySelector(".degraded-row")).not.toBeNull());
    const container = root.querySelector(".degraded-controls-container");
    clickByText(container, "Repair");

    // Needs-input pointers render as editable fields.
    await vi.waitFor(() => expect(root.querySelector(".norm-inputs")).not.toBeNull());
    const input = root.querySelector("#ni--dossier-name") as HTMLInputElement;
    expect(input).not.toBeNull();
    input.value = "Adrika";
    clickByText(root.querySelector(".norm-preview"), "Continue");

    // Re-preview with the supplied values → ready → confirm → apply.
    await vi.waitFor(() => expect(root.querySelector(".norm-preview .btn-primary")?.textContent).toContain("Confirm repair"));
    clickByText(root.querySelector(".norm-preview"), "Confirm repair");
    await vi.waitFor(() => {
      const urls = mockFetch.mock.calls.map((c) => c[0]);
      expect(urls.filter((u) => u === "/api/campaign/roster").length).toBeGreaterThanOrEqual(2);
    });
    // The supplied value was passed as the repair-preview body on re-preview.
    expect(previewBodies[1]?.["/dossier/name"]).toBe("Adrika");
  });

  it("surfaces friendly stale-token copy on a 409 delete and refreshes the roster", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/campaign/roster") {
        return Promise.resolve(ok({ characters: [degradedChar()], crews: [] }));
      }
      return Promise.resolve(
        json(409, {
          ok: false,
          error: {
            code: "STALE_REVISION",
            status: 409,
            message: "Stale revision",
            retryable: true,
            recovery: "Re-fetch the roster",
            details: { currentContentToken: `sha256:${"c".repeat(64)}` },
            entity: null,
          },
        }),
      );
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    mountRosterPage(root);
    await vi.waitFor(() => expect(root.querySelector(".degraded-row")).not.toBeNull());
    const container = root.querySelector(".degraded-controls-container");
    clickByText(container, "Delete");
    await vi.waitFor(() => expect(root.querySelector(".degraded-delete-confirm")).not.toBeNull());
    clickByText(container, "Delete");

    await vi.waitFor(() =>
      expect(root.querySelector(".degraded-failure")?.textContent).toContain("changed since you opened it"),
    );
    // Friendly refresh/re-token copy, never the raw code.
    expect(root.querySelector(".degraded-failure")?.textContent).not.toContain("STALE_REVISION");

    clickByText(root.querySelector(".degraded-failure"), "Refresh roster");
    await vi.waitFor(() => {
      const urls = mockFetch.mock.calls.map((c) => c[0]);
      expect(urls.filter((u) => u === "/api/campaign/roster").length).toBeGreaterThanOrEqual(2);
    });
  });
});
