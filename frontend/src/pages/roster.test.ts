// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mountRosterPage } from "./roster.js";
import { loadStylesheets } from "./seam.js";

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

  it.each([
    ["empty", { characters: [], crews: [] }],
    ["populated", rosterDTO],
  ])("offers visible, styled creation actions on a %s roster (UI-CREATE-01)", async (_state, roster) => {
    global.fetch = vi.fn().mockResolvedValue(ok(roster));
    loadStylesheets();
    document.body.append(root);
    try {
      mountRosterPage(root);
      await vi.waitFor(() => expect(root.querySelector(".roster")).not.toBeNull());
      const scoundrelPlate = root.querySelector(".roster-characters");
      expect(scoundrelPlate?.querySelector("h2")?.textContent).toBe(`Scoundrels (${roster.characters.length})`);
      expect(scoundrelPlate?.querySelector("summary")?.textContent).toBe("Import scoundrels…");
      expect(scoundrelPlate?.querySelector("select")?.getAttribute("aria-label")).toBe("Choose an existing scoundrel entry to replace");
      expect(scoundrelPlate?.querySelector(".roster-import-hint")?.textContent).toContain("Create a new scoundrel…");
      expect(root.querySelector(".roster-status")?.textContent).toContain(`Showing ${roster.characters.length} of ${roster.characters.length} scoundrels.`);
      if (roster.characters.length === 0) {
        expect(scoundrelPlate?.querySelector(".empty")?.textContent).toBe("No scoundrels yet.");
      }
      const search = root.querySelector<HTMLInputElement>(".roster-search")!;
      search.value = "no-such-name";
      search.dispatchEvent(new Event("input"));
      expect(scoundrelPlate?.querySelector(".roster-note")?.textContent).toBe("No scoundrels match “no-such-name”.");
      expect(root.querySelector(".roster-status")?.textContent).toContain(`0 of ${roster.characters.length} scoundrels match.`);
      for (const [plate, href, label] of [
        [".roster-characters", "/character/create", "Create scoundrel"],
        [".roster-crews", "/crew/create", "Create crew"],
      ]) {
        const action = root.querySelector<HTMLAnchorElement>(`${plate} .roster-create`);
        expect(action?.textContent).toBe(label);
        expect(action?.getAttribute("href")).toBe(href);
        expect(action?.classList.contains("btn-primary")).toBe(true);
        expect(action?.closest("details")).toBeNull();
      }
    } finally {
      root.remove();
    }
  });

  it("does not render hidden pager controls as blank buttons (UI-CREATE-01)", async () => {
    global.fetch = vi.fn().mockResolvedValue(ok({ characters: [], crews: [] }));
    loadStylesheets();
    document.body.append(root);
    try {
      mountRosterPage(root);
      await vi.waitFor(() => expect(root.querySelector(".roster")).not.toBeNull());
      for (const pager of root.querySelectorAll<HTMLElement>(".roster-more")) {
        expect(pager.hidden).toBe(true);
        expect(getComputedStyle(pager).display).toBe("none");
      }
    } finally {
      root.remove();
    }
  });

  it("labels the scoundrel pager without changing entity identifiers", async () => {
    global.fetch = vi.fn().mockResolvedValue(ok({
      characters: Array.from({ length: 101 }, () => ({ ...rosterDTO.characters[0] })),
      crews: [],
    }));
    mountRosterPage(root);
    await vi.waitFor(() => expect(root.querySelector(".roster")).not.toBeNull());
    expect(root.querySelector(".roster-characters .roster-more")?.textContent).toMatch(/^Show \d+ more scoundrels$/);
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
    expect(root.querySelector(".degraded-row")?.textContent).toContain("Unreadable scoundrel");

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

  // -------------------------------------------------------------------------
  // OPT-008: roster search/filter and bounded rendering.  A search input
  // filters visible rows by name/alias/playbook/crewType without removing
  // degraded rows or changing the header counts.  aria-live is narrowed to
  // a status region, not the whole root.
  // -------------------------------------------------------------------------

  it("renders a search input that filters characters by name", async () => {
    const big = {
      characters: [
        ...rosterDTO.characters,
        { ...rosterDTO.characters[0], id: "b2222222-2222-4222-8222-222222222222", name: "Alice Wonderland", alias: "Rabbit" },
        { ...rosterDTO.characters[0], id: "c3333333-3333-4333-8333-333333333333", name: "Charlie", alias: "Bandersnatch" },
      ],
      crews: rosterDTO.crews,
    };
    global.fetch = vi.fn().mockResolvedValue(ok(big));
    mountRosterPage(root);
    await vi.waitFor(() => {
      expect(root.querySelectorAll("[data-character-id]").length).toBe(3);
    });

    const search = root.querySelector("input.roster-search") as HTMLInputElement;
    expect(search).toBeTruthy();

    // Type "Alice" — only one row should be visible
    search.value = "Alice";
    search.dispatchEvent(new Event("input", { bubbles: true }));

    await vi.waitFor(() => {
      const visible = Array.from(root.querySelectorAll("[data-character-id]")).filter(
        (el) => (el as HTMLElement).style.display !== "none",
      );
      expect(visible.length).toBe(1);
      expect(visible[0].querySelector("strong")?.textContent).toContain("Alice");
    });

    // Header count still shows the total, not the filtered count
    expect(root.querySelector("h2")?.textContent).toContain("Scoundrels (3)");
  });
  it("narrowly scopes aria-live to a status region, not the whole root", async () => {
    global.fetch = vi.fn().mockResolvedValue(ok(rosterDTO));
    mountRosterPage(root);
    await vi.waitFor(() => {
      expect(root.querySelector(".roster-search")).toBeTruthy();
    });

    // The root itself must not be an aria-live region (FV-031: a broad
    // aria-live on the root announces every DOM mutation to AT users).
    expect(root.getAttribute("aria-live")).toBeFalsy();
    // A dedicated status region should carry the live region instead.
    const liveRegion = root.querySelector("[aria-live]");
    expect(liveRegion).toBeTruthy();
    expect(liveRegion?.getAttribute("aria-live")).toBe("polite");
  });

  // -------------------------------------------------------------------------
  // PERF-02: bounded roster rendering with degraded reachability. Initial
  // render maps at most ROSTER_PAGE_SIZE readable rows per list into the DOM;
  // "Show more" reveals further batches. Header counts always describe the
  // FULL result set, search runs over the full readable result set (not just
  // rendered rows), and degraded rows are always rendered and never hidden by
  // a query — they are the recovery path.
  //
  // The committed numbers below are pins: raising the page size or DOM
  // budget is a deliberate decision that must edit these tests, not a
  // constant quietly moved in roster.ts.
  // -------------------------------------------------------------------------

  let bulkSeq = 0;
  // Contract uuid pattern: 8-4-4-4-12 hex, version 4, variant [89ab].
  const bulkId = (prefix: string, i: number): string =>
    `${prefix}${String(i).padStart(5, "0")}-0000-4000-8000-${String(i).padStart(12, "0")}`;
  const bulkChar = (overrides: Record<string, unknown> = {}) => {
    bulkSeq += 1;
    return {
      ...rosterDTO.characters[0],
      id: bulkId("7c0", bulkSeq),
      name: `Bulk ${String(bulkSeq).padStart(4, "0")}`,
      alias: `bulk-${bulkSeq}`,
      ...overrides,
    };
  };
  const bulkUnreadable = () =>
    bulkChar({
      isReadable: false,
      isRepairable: false,
      isComplete: false,
      deleteToken: `sha256:${"ab".repeat(32)}`,
    });
  const bulkCrew = (overrides: Record<string, unknown> = {}) => {
    bulkSeq += 1;
    return {
      ...rosterDTO.crews[0],
      id: bulkId("9d0", bulkSeq),
      name: `Bulk Crew ${String(bulkSeq).padStart(4, "0")}`,
      ...overrides,
    };
  };

  const readableRows = (container: HTMLElement): HTMLElement[] =>
    Array.from(
      container.querySelectorAll<HTMLElement>("li[data-character-id]:not([data-degraded])"),
    );
  const degradedRows = (container: HTMLElement): HTMLElement[] =>
    Array.from(container.querySelectorAll<HTMLElement>("li[data-character-id][data-degraded]"));

  it("bounds the initial render at 1000 rows: one page of readable rows, all degraded rows, full-set counts", async () => {
    const big = {
      characters: [
        ...Array.from({ length: 900 }, () => bulkChar()),
        ...Array.from({ length: 100 }, () => bulkUnreadable()),
      ],
      crews: Array.from({ length: 30 }, () => bulkCrew()),
    };
    global.fetch = vi.fn().mockResolvedValue(ok(big));
    mountRosterPage(root);
    await vi.waitFor(() => {
      expect(readableRows(root).length).toBe(100);
    });

    // Readable rows are paged; degraded rows are the recovery path and are
    // all rendered immediately.
    expect(readableRows(root).length).toBe(100);
    expect(degradedRows(root).length).toBe(100);
    expect(root.querySelectorAll("li[data-crew-id]").length).toBe(30);

    // Counts describe the full result set, not the rendered window.
    expect(root.querySelector(".roster-characters h2")?.textContent).toContain(
      "Scoundrels (1000)",
    );
    expect(root.querySelector(".roster-crews h2")?.textContent).toContain("Crews (30)");

    // Committed PERF-02 DOM budget for the sanctioned 1000-row mix
    // (70% readable / 10% unreadable benchmark proportions, here worst-cased
    // to 900 readable + 100 unreadable + 30 crews).
    expect(root.getElementsByTagName("*").length).toBeLessThanOrEqual(2000);
  });

  it("Show more reveals the next batch, moves focus to it, and announces progress in the status region", async () => {
    document.body.append(root);
    try {
      global.fetch = vi.fn().mockResolvedValue(
        ok({ characters: Array.from({ length: 250 }, () => bulkChar()), crews: [] }),
      );
      mountRosterPage(root);
      await vi.waitFor(() => {
        expect(readableRows(root).length).toBe(100);
      });

      const statusRegion = () => root.querySelector<HTMLElement>(".roster-status");
      expect(statusRegion()?.getAttribute("aria-live")).toBe("polite");
      expect(statusRegion()?.textContent).toContain("Showing 100 of 250 scoundrels");

      const moreBtn = root.querySelector<HTMLButtonElement>(
        ".roster-characters button.roster-more",
      );
      expect(moreBtn).toBeTruthy();
      moreBtn!.click();

      await vi.waitFor(() => {
        expect(readableRows(root).length).toBe(200);
      });
      // Keyboard/screen-reader users land on the first newly revealed row…
      const firstNewRow = readableRows(root)[100];
      expect(document.activeElement).toBe(firstNewRow);
      // …and the compact status region announces the new window, not the
      // roster mutation itself.
      expect(statusRegion()?.textContent).toContain("Showing 200 of 250 scoundrels");

      // Exhausting the result set retires the control.
      const exhausted = root.querySelector<HTMLButtonElement>(
        ".roster-characters button.roster-more",
      );
      exhausted!.click();
      await vi.waitFor(() => {
        expect(readableRows(root).length).toBe(250);
        expect(exhausted!.hidden).toBe(true);
      });
    } finally {
      root.remove();
    }
  });

  it("search reaches readable rows outside the rendered window and reports match counts", async () => {
    const needle = bulkChar({ name: "Zed Quillfinder", alias: "the needle" });
    global.fetch = vi.fn().mockResolvedValue(
      ok({
        characters: [...Array.from({ length: 299 }, () => bulkChar()), needle],
        crews: [],
      }),
    );
    mountRosterPage(root);
    await vi.waitFor(() => {
      expect(readableRows(root).length).toBe(100);
    });

    const search = root.querySelector<HTMLInputElement>("input.roster-search")!;
    search.value = "Quillfinder";
    search.dispatchEvent(new Event("input", { bubbles: true }));

    await vi.waitFor(() => {
      const visible = readableRows(root).filter((r) => r.style.display !== "none");
      expect(visible.length).toBe(1);
      expect(visible[0].textContent).toContain("Zed Quillfinder");
    });
    expect(root.querySelector(".roster-status")?.textContent).toContain(
      "1 of 300 scoundrels match",
    );
    // The match fits one page: no pager while filtered.
    const pager = root.querySelector<HTMLButtonElement>(
      ".roster-characters button.roster-more",
    );
    expect(pager?.hidden).toBe(true);
  });

  it("keeps degraded rows visible and controllable under a query that matches nothing", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      ok({
        characters: [
          bulkChar(),
          bulkChar(),
          bulkChar(),
          bulkUnreadable(),
          bulkUnreadable(),
        ],
        crews: [],
      }),
    );
    mountRosterPage(root);
    await vi.waitFor(() => {
      expect(readableRows(root).length).toBe(3);
      expect(degradedRows(root).length).toBe(2);
    });

    const search = root.querySelector<HTMLInputElement>("input.roster-search")!;
    search.value = "zzz-no-such-row";
    search.dispatchEvent(new Event("input", { bubbles: true }));

    await vi.waitFor(() => {
      const visibleReadable = readableRows(root).filter((r) => r.style.display !== "none");
      expect(visibleReadable.length).toBe(0);
    });
    const degraded = degradedRows(root);
    expect(degraded.length).toBe(2);
    for (const li of degraded) {
      // Degraded rows are the recovery group: a nonmatching query must never
      // hide them or strand their repair/delete controls.
      expect(li.style.display).not.toBe("none");
      expect(li.querySelector("button")).toBeTruthy();
    }

    // The no-match message stays OUTSIDE the <ul> (a <p> is invalid as a
    // list child — review finding), and the note names the empty state.
    const charList = root.querySelector("ul.character-list")!;
    expect(Array.from(charList.children).every((c) => c.tagName === "LI")).toBe(true);
    const note = root.querySelector<HTMLElement>(".roster-characters .roster-note")!;
    expect(note.hidden).toBe(false);
    expect(note.textContent).toContain("No scoundrels match");

    // Clearing the query hides the note and restores the paged view.
    search.value = "";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.waitFor(() => {
      expect(readableRows(root).length).toBe(3);
      expect((root.querySelector(".roster-characters .roster-note") as HTMLElement).hidden).toBe(
        true,
      );
    });
  });

  it("restores the paged view when the query is cleared", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      ok({ characters: Array.from({ length: 250 }, () => bulkChar()), crews: [] }),
    );
    mountRosterPage(root);
    await vi.waitFor(() => {
      expect(readableRows(root).length).toBe(100);
    });

    const search = root.querySelector<HTMLInputElement>("input.roster-search")!;
    search.value = "Bulk";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.waitFor(() => {
      expect(root.querySelector(".roster-status")?.textContent).toContain(
        "250 of 250 scoundrels match",
      );
    });

    search.value = "";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.waitFor(() => {
      expect(readableRows(root).length).toBe(100);
    });
    const pager = root.querySelector<HTMLButtonElement>(
      ".roster-characters button.roster-more",
    );
    expect(pager?.hidden).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// RECOVERY-01: degraded rows visibly classify `repairable` / `needs-input` /
// `unreadable` with the correct recovery path, and general Character/Crew
// Import moves from per-row links to roster-level actions. The import flow —
// not an ordinary row — decides create vs replace under the preview-token,
// confirmation, and stale-token rules of the existing import page module.
// ---------------------------------------------------------------------------

describe("RECOVERY-01 degraded-row classification and roster-level import", () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement("div");
    vi.clearAllMocks();
  });

  const R_ID = "c46ba7cb-993b-4fc7-974d-fb95eacd5446";
  const D_REPAIRABLE = "cafe0001-0000-4000-8000-000000000001";
  const D_UNREADABLE = "dead0001-0000-4000-8000-000000000002";

  const summaryChar = (overrides: Record<string, unknown> = {}) => ({
    kind: "character",
    id: R_ID,
    name: "Brenda Hilton",
    alias: "Webweaver",
    playbook: "Spider",
    gameStem: "blades-in-the-dark",
    crewId: "",
    stress: 3,
    traumas: [],
    isRetired: false,
    isDeadish: false,
    revision: 12,
    isReadable: true,
    isRepairable: false,
    isComplete: true,
    deleteToken: "",
    canUndo: false,
    historyCount: 0,
    ...overrides,
  });

  const degraded = (id: string, isRepairable: boolean) =>
    summaryChar({
      id,
      name: "",
      alias: "",
      playbook: "",
      gameStem: "",
      revision: 1,
      isReadable: false,
      isRepairable,
      isComplete: false,
      deleteToken: `sha256:${"ab".repeat(32)}`,
    });

  const mixedRoster = (overrides: Record<string, unknown> = {}) => ({
    characters: [
      summaryChar(),
      degraded(D_REPAIRABLE, true),
      degraded(D_UNREADABLE, false),
    ],
    crews: [],
    ...overrides,
  });

  const repairNeedsInput409 = () =>
    json(409, {
      ok: false,
      error: {
        code: "NORMALIZATION_REQUIRED",
        status: 409,
        message: "Normalization required",
        retryable: true,
        recovery: "Provide values",
        details: { warnings: [], previewToken: "tok-ni" },
        preview: {
          changes: [],
          warnings: [],
          needsInputPointers: ["/dossier/name"],
          previewToken: "tok-ni",
          canonical: false,
          document: {},
        },
        token: "tok-ni",
      },
    });

  const canonicalPreview200 = (token: string) =>
    json(200, { changes: [], warnings: [], canonical: true, previewToken: token, document: {} });

  const applyOk = (id: string) =>
    ok({
      ok: true,
      applied: { op: "importCharacter" },
      sideEffects: [],
      character: { id, revision: 13, dossier: { name: "Sable Verity" } },
      error: null,
    });

  interface MockResponse {
    ok: boolean;
    status: number;
    text: () => Promise<string>;
  }

  /** Mount the roster behind a scripted fetch surface and wait for first paint. */
  async function mountWith(
    mocks: (url: string, init?: RequestInit) => Promise<MockResponse>,
  ): Promise<void> {
    global.fetch = vi.fn().mockImplementation(mocks) as unknown as typeof fetch;
    mountRosterPage(root);
    await vi.waitFor(() => expect(root.querySelector(".roster")).not.toBeNull());
  }

  /**
   * Open the characters import panel and return its target select. Test seam:
   * several flow tests exercise identical toggle mechanics lockstep.
   */
  function openCharImport(): HTMLSelectElement {
    const panel = root.querySelector<HTMLDetailsElement>(
      ".roster-characters details.roster-import-panel",
    );
    expect(panel).not.toBeNull();
    panel!.open = true;
    panel!.dispatchEvent(new Event("toggle"));
    const select = panel!.querySelector<HTMLSelectElement>("select.import-target");
    expect(select).not.toBeNull();
    return select!;
  }

  it("classifies a repairable row as data-recovery-class=repairable with Repair + Delete and visible explanation", async () => {
    await mountWith((url) =>
      url === "/api/campaign/roster"
        ? Promise.resolve(ok(mixedRoster()))
        : Promise.resolve(json(404, { ok: false, error: { code: "NOT_FOUND", message: "nope" } })),
    );
    const li = root.querySelector(
      `li[data-character-id="${D_REPAIRABLE}"][data-degraded]`,
    );
    expect(li).not.toBeNull();
    expect(li?.getAttribute("data-recovery-class")).toBe("repairable");
    expect(li?.textContent).toContain("Repairable scoundrel");
    // Explanation names the recovery path without exposing raw error JSON.
    expect(li?.textContent).toContain("normalized");
    const buttons = Array.from(li!.querySelectorAll("button"));
    expect(buttons.some((b) => b.textContent === "Repair")).toBe(true);
    expect(buttons.some((b) => b.textContent === "Delete")).toBe(true);
    // No detail link — direct reads stay strict at 422.
    expect(li?.querySelector("a")).toBeNull();
  });

  it("classifies an unreadable row as data-recovery-class=unreadable — delete-only, with re-import guidance", async () => {
    await mountWith((url) =>
      url === "/api/campaign/roster"
        ? Promise.resolve(ok(mixedRoster()))
        : Promise.resolve(json(404, { ok: false, error: { code: "NOT_FOUND", message: "nope" } })),
    );
    const li = root.querySelector(
      `li[data-character-id="${D_UNREADABLE}"][data-degraded]`,
    );
    expect(li).not.toBeNull();
    expect(li?.getAttribute("data-recovery-class")).toBe("unreadable");
    expect(li?.textContent).toContain("Unreadable scoundrel");
    expect(li?.textContent).toContain("re-import");
    const buttons = Array.from(li!.querySelectorAll("button"));
    expect(buttons.some((b) => b.textContent === "Repair")).toBe(false);
    expect(buttons.some((b) => b.textContent === "Delete")).toBe(true);
  });
  it("flips a repairable row to needs-input while its repair awaits values, and back after Cancel", async () => {
    await mountWith((url) => {
      if (url === "/api/campaign/roster") return Promise.resolve(ok(mixedRoster()));
      if (url === `/api/characters/${D_REPAIRABLE}/repair-preview`) {
        return Promise.resolve(repairNeedsInput409());
      }
      return Promise.resolve(json(404, { ok: false, error: { code: "NOT_FOUND", message: "nope" } }));
    });
    const li = root.querySelector(
      `li[data-character-id="${D_REPAIRABLE}"][data-degraded]`,
    )!;
    expect(li.getAttribute("data-recovery-class")).toBe("repairable");

    clickByText(root.querySelector(".character-list"), "Repair");
    await vi.waitFor(() =>
      expect(li.getAttribute("data-recovery-class")).toBe("needs-input"),
    );
    expect(li.textContent).toContain("values");

    clickByText(li.querySelector(".norm-preview"), "Cancel");
    await vi.waitFor(() =>
      expect(li.getAttribute("data-recovery-class")).toBe("repairable"),
    );
  });

  it("keeps no per-row Import anchors; every readable row is link-only", async () => {
    await mountWith((url) =>
      url === "/api/campaign/roster"
        ? Promise.resolve(ok(mixedRoster()))
        : Promise.resolve(json(404, { ok: false, error: { code: "NOT_FOUND", message: "nope" } })),
    );
    expect(root.querySelector("a.roster-import")).toBeNull();
  });

  it("offers roster-level Import panels per kind that decide create vs replace", async () => {
    await mountWith((url) =>
      url === "/api/campaign/roster"
        ? Promise.resolve(ok(mixedRoster()))
        : Promise.resolve(json(404, { ok: false, error: { code: "NOT_FOUND", message: "nope" } })),
    );
    const charPanel = root.querySelector<HTMLDetailsElement>(
      ".roster-characters details.roster-import-panel",
    );
    const crewPanel = root.querySelector<HTMLDetailsElement>(
      ".roster-crews details.roster-import-panel",
    );
    expect(charPanel).not.toBeNull();
    expect(crewPanel).not.toBeNull();
    expect(charPanel?.textContent).toContain("Import scoundrels");
    expect(crewPanel?.textContent).toContain("Import crews");
    // Create leg: flows out to the existing creation routes.
    expect(charPanel?.querySelector('a[href="/character/create"]')).not.toBeNull();
    expect(crewPanel?.querySelector('a[href="/crew/create"]')).not.toBeNull();

    charPanel!.open = true;
    charPanel!.dispatchEvent(new Event("toggle"));
    const options = Array.from(
      charPanel!.querySelectorAll<HTMLSelectElement>("select.import-target option"),
    ).map((o) => ({ value: o.value, label: o.textContent ?? "" }));
    // Placeholder + every existing entry (readable AND degraded) is offered.
    expect(options.some((o) => o.value === "")).toBe(true);
    expect(options.find((o) => o.value === R_ID)?.label).toContain("Brenda Hilton");
    expect(options.find((o) => o.value === D_REPAIRABLE)?.value).toBe(D_REPAIRABLE);
    expect(options.find((o) => o.value === D_UNREADABLE)?.label).toContain("Unreadable");
  });

  it("replace target = readable row: inline importer previews and applies with If-Match = revision", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    await mountWith((url, init) => {
      calls.push({ url, init });
      if (url === "/api/campaign/roster") return Promise.resolve(ok(mixedRoster()));
      if (url === `/api/characters/${R_ID}/import?preview=1`) {
        return Promise.resolve(canonicalPreview200("tok-p"));
      }
      if (url === `/api/characters/${R_ID}/import`) {
        return Promise.resolve(applyOk(R_ID));
      }
      return Promise.resolve(json(404, { ok: false, error: { code: "NOT_FOUND", message: "nope" } }));
    });

    const select = openCharImport();
    select.value = R_ID;
    select.dispatchEvent(new Event("change"));
    clickByText(root.querySelector(".roster-characters"), "Open import");

    const textarea = await vi.waitFor(() => {
      const t = root.querySelector<HTMLTextAreaElement>("#import-doc");
      expect(t).not.toBeNull();
      return t!;
    });
    textarea.value = '{"dossier":{"name":"Sable Verity"}}';
    root.querySelector<HTMLButtonElement>("#import-preview-btn")!.click();

    await vi.waitFor(() => {
      expect(calls.some((c) => c.url === `/api/characters/${R_ID}/import?preview=1`)).toBe(true);
      // The preview panel renders after the fiber resolves; wait for the
      // control, not just the request.
      const confirm = Array.from(root.querySelectorAll("button")).find(
        (b) => b.textContent?.trim() === "Confirm import",
      );
      expect(confirm).toBeTruthy();
    });
    clickByText(root.querySelector(".import-preview"), "Confirm import");
    await vi.waitFor(() => {
      const applyCall = calls.find((c) => c.url === `/api/characters/${R_ID}/import`);
      expect(applyCall).toBeTruthy();
      expect((applyCall!.init?.headers as Record<string, string>)["If-Match"]).toBe("12");
    });
  });

  it("replace target = degraded row: the confirming apply sends the sha256 deleteToken as If-Match", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    await mountWith((url, init) => {
      calls.push({ url, init });
      if (url === "/api/campaign/roster") return Promise.resolve(ok(mixedRoster()));
      if (url === `/api/characters/${D_UNREADABLE}/import?preview=1`) {
        return Promise.resolve(canonicalPreview200("tok-d"));
      }
      if (url === `/api/characters/${D_UNREADABLE}/import`) {
        return Promise.resolve(applyOk(D_UNREADABLE));
      }
      return Promise.resolve(json(404, { ok: false, error: { code: "NOT_FOUND", message: "nope" } }));
    });

    const select = openCharImport();
    select.value = D_UNREADABLE;
    select.dispatchEvent(new Event("change"));
    clickByText(root.querySelector(".roster-characters"), "Open import");

    const textarea = await vi.waitFor(() => {
      const t = root.querySelector<HTMLTextAreaElement>("#import-doc");
      expect(t).not.toBeNull();
      return t!;
    });
    textarea.value = "{}";
    root.querySelector<HTMLButtonElement>("#import-preview-btn")!.click();
    await vi.waitFor(() => {
      expect(calls.some((c) => c.url === `/api/characters/${D_UNREADABLE}/import?preview=1`)).toBe(true);
      const confirm = Array.from(root.querySelectorAll("button")).find(
        (b) => b.textContent?.trim() === "Confirm import",
      );
      expect(confirm).toBeTruthy();
    });
    clickByText(root.querySelector(".import-preview"), "Confirm import");
    await vi.waitFor(() => {
      const applyCall = calls.find(
        (c) => c.url === `/api/characters/${D_UNREADABLE}/import`,
      );
      expect(applyCall).toBeTruthy();
      expect((applyCall!.init?.headers as Record<string, string>)["If-Match"]).toBe(
        `sha256:${"ab".repeat(32)}`,
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Accessibility: character roster row text on the torn-foot band (THEME-01 / UX-015).
// The roster plates (.roster-characters.torn-foot / .roster-crews.torn-foot)
// are inked-band surfaces. Primary text (strong, li) resolves through
// --band-text (>=4.5:1 against --band-ink) in every theme+contrast combo.
// The character roster span (secondary copy: alias, playbook, status) resolves
// through the dedicated --band-text-muted token (>=4.5:1 against --band-ink),
// NOT through --text-muted (an ink-on-paper token that is dark-on-dark on the
// band in light+HiC: 1:1). This test pins: (a) WCAG AA floor for every text
// element; (b) the hierarchy: character span uses --band-text-muted (#d6cdb8)
// while strong uses --band-text (#efe7d6); (c) the bug guard: span never
// resolves to --text-muted (#5a5044 light / #1a1a1a HiC).
// Note: crew roster spans are NOT tested here — they remain on --band-text
// (original behavior, not changed by this fix).
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) throw new Error(`cannot parse ${hex}`);
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}
function channel(v: number): number {
  v /= 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function luminance(c: { r: number; g: number; b: number }): number {
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}
function contrastRatio(fg: string, bg: string): number {
  const l1 = luminance(hexToRgb(fg));
  const l2 = luminance(hexToRgb(bg));
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// --band-text-muted = --paper-sunk = #d6cdb8 in all themes.
// --text-muted = --ink = #1a1a1a in light+HiC / dark+HiC; #5a5044 in light.
const TEXT_MUTED_LIGHT = "#5a5044";
const TEXT_MUTED_HIC = "#1a1a1a";
function isTextMuted(color: string, hc: boolean): boolean {
  return hc
    ? color.toLowerCase() === TEXT_MUTED_HIC.toLowerCase()
    : color.toLowerCase() === TEXT_MUTED_LIGHT.toLowerCase();
}

const THEME_STATES = [
  { theme: "light" as const, contrast: false, label: "light" },
  { theme: "light" as const, contrast: true, label: "light+HiC" },
  { theme: "dark" as const, contrast: false, label: "dark" },
  { theme: "dark" as const, contrast: true, label: "dark+HiC" },
];

/** Mount a single readable character row inside the torn-foot band and return
  * the computed colors of each text element. Mirrors the real renderCharacter
  * markup: <li><a><strong>Name</strong><span> alias • playbook</span></a></li>. */
function mountRosterRow(
  theme: "light" | "dark",
  hiC: boolean,
): { spanColor: string; bandBg: string; strongColor: string; liColor: string } {
  loadStylesheets();
  document.documentElement.setAttribute("data-theme", theme);
  if (hiC) document.documentElement.setAttribute("data-contrast", "high");
  else document.documentElement.removeAttribute("data-contrast");

  const band = document.createElement("div");
  band.className = "roster-characters torn-foot";
  const ul = document.createElement("ul");
  ul.className = "character-list";
  const li = document.createElement("li");
  li.setAttribute("data-character-id", "test");
  const a = document.createElement("a");
  a.href = "/character/test";
  const strong = document.createElement("strong");
  strong.textContent = "Test Character";
  const span = document.createElement("span");
  span.textContent = " Webweaver • Spider";
  a.appendChild(strong);
  a.appendChild(span);
  li.appendChild(a);
  ul.appendChild(li);
  band.appendChild(ul);
  document.body.appendChild(band);

  const spanColor = getComputedStyle(span).color;
  const bandBg = getComputedStyle(band).backgroundColor;
  const strongColor = getComputedStyle(strong).color;
  const liColor = getComputedStyle(li).color;

  document.body.removeChild(band);
  return { spanColor, bandBg, strongColor, liColor };
}

describe("roster row text on the torn-foot band (THEME-01)", () => {
  for (const state of THEME_STATES) {
    it(`character roster span text meets WCAG AA (>=4.5:1) in ${state.label}`, () => {
      const { spanColor, bandBg } = mountRosterRow(state.theme, state.contrast);
      const ratio = contrastRatio(spanColor, bandBg);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it(`character roster span resolves through --band-text-muted (not --text-muted) in ${state.label}`, () => {
      const { spanColor } = mountRosterRow(state.theme, state.contrast);
      // Bug guard: span must NOT be the ink-on-paper --text-muted value.
      expect(isTextMuted(spanColor, state.contrast)).toBe(false);
      // Positive: span must be --band-text-muted = --paper-sunk = #d6cdb8.
      expect(spanColor.toLowerCase()).toBe("#d6cdb8");
    });

    it(`character roster strong text meets WCAG AA (>=4.5:1) in ${state.label}`, () => {
      const { strongColor, bandBg } = mountRosterRow(state.theme, state.contrast);
      const ratio = contrastRatio(strongColor, bandBg);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it(`character roster li text meets WCAG AA (>=4.5:1) in ${state.label}`, () => {
      const { liColor, bandBg } = mountRosterRow(state.theme, state.contrast);
      const ratio = contrastRatio(liColor, bandBg);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it(`secondary span differs from primary strong (hierarchy preserved) in ${state.label}`, () => {
      const { spanColor, strongColor } = mountRosterRow(state.theme, state.contrast);
      // --band-text-muted (#d6cdb8) should differ from --band-text (#efe7d6).
      expect(spanColor).not.toBe(strongColor);
    });
  }
});

describe("roster creation keyboard focus (UI-CREATE-01)", () => {
  for (const state of THEME_STATES) {
    it(`uses a focus token distinguishable from the inked band in ${state.label}`, () => {
      loadStylesheets();
      document.documentElement.setAttribute("data-theme", state.theme);
      if (state.contrast) document.documentElement.setAttribute("data-contrast", "high");
      else document.documentElement.removeAttribute("data-contrast");
      const band = document.createElement("div");
      band.className = "roster-characters torn-foot";
      const heading = document.createElement("div");
      heading.className = "roster-heading-row";
      const action = document.createElement("a");
      action.className = "btn-primary roster-create";
      action.href = "/character/create";
      action.textContent = "Create scoundrel";
      // happy-dom cannot generate keyboard :focus-visible. Probe the same
      // token consumed by base.css; the real Chromium checkpoint checks focus.
      action.style.outlineColor = "var(--focus-ring)";
      heading.append(action);
      band.append(heading);
      document.body.append(band);
      try {
        expect(contrastRatio(getComputedStyle(action).outlineColor, getComputedStyle(band).backgroundColor))
          .toBeGreaterThanOrEqual(3);
      } finally {
        band.remove();
      }
    });
  }
});

