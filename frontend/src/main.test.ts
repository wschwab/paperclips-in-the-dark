// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

/**
 * F2aa fix 1: the default route ("/") must land on the roster, not the
 * health page. main.ts is a singleton with import-time side effects, so we
 * set up the DOM and fetch mocks before importing it once.
 */

const ok = (data: unknown) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify(data),
});

describe("app router (F2aa)", () => {
  beforeEach(() => {
    // main.ts captures #app at import time; never replace the element after
    // the module is loaded or render() writes into a detached node.
    if (!document.querySelector("#app")) {
      document.body.innerHTML = '<div id="app"></div>';
    }
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue(
      ok({ characters: [], crews: [] }),
    );
  });

  it('redirects "/" to "/roster" and mounts the roster page', async () => {
    window.history.replaceState({}, "", "/");
    // main.ts is a singleton with import-time side effects; import once here.
    await import("./main.js");

    // The import-time render() must have redirected and mounted the roster.
    expect(window.location.pathname).toBe("/roster");
    expect(document.querySelector(".roster")).not.toBeNull();
    expect(document.querySelector("#health-root")).toBeNull();
  });

  it("mounts the roster on direct /roster navigation", async () => {
    // Module is cached from the first test; trigger a fresh render.
    window.history.replaceState({}, "", "/roster");
    window.dispatchEvent(new PopStateEvent("popstate"));

    await vi.waitFor(() => {
      expect(document.querySelector(".roster")).not.toBeNull();
    });
  });

  it("renders a real 404 (h1 + roster link) for unknown routes with no health fallback or fetch (FV-030)", async () => {
    const fetchMock = global.fetch as unknown as Mock;
    // Clear any fetch bookkeeping from prior tests.
    fetchMock.mockClear();

    window.history.replaceState({}, "", "/no/such/route");
    window.dispatchEvent(new PopStateEvent("popstate"));

    await vi.waitFor(() => {
      expect(document.querySelector(".not-found")).not.toBeNull();
    });

    // One page-level h1, plus a roster escape link.
    const h1s = document.querySelectorAll("h1");
    expect(h1s.length).toBe(1);
    expect(h1s[0]?.textContent).toBe("Page not found");
    expect(document.querySelector('a[href="/roster"]')).not.toBeNull();

    // No silent health-page fallback, no health fetch on the unknown route.
    expect(document.querySelector("#health-root")).toBeNull();
    expect(fetchMock.mock.calls.length).toBe(0);
  });
});

describe("create-page game-data error cards (FV-020)", () => {
  beforeEach(() => {
    if (!document.querySelector("#app")) {
      document.body.innerHTML = '<div id="app"></div>';
    }
    vi.clearAllMocks();
  });

  it("renders a recoverable error card when the playbook list fails to load", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "raw schema boom",
      })
      .mockResolvedValue(ok({ characters: [], crews: [] }));

    window.history.replaceState({}, "", "/character/create");
    window.dispatchEvent(new PopStateEvent("popstate"));

    await vi.waitFor(() => {
      expect(document.querySelector(".error-card")).not.toBeNull();
    });

    // One page-level h1, from the error card.
    const h1s = document.querySelectorAll("h1");
    expect(h1s.length).toBe(1);
    expect(h1s[0]?.textContent).toBe("Couldn't load the creation options");

    // Retry + roster escape are present.
    expect(document.querySelector("button.btn-primary")?.textContent).toBe("Retry");
    expect(document.querySelector('a[href="/roster"]')).not.toBeNull();

    // Friendly category copy per class (FV-020/FV-023): no `ApiError:`
    // leakage, no raw body/parser text anywhere.
    const card = document.querySelector(".error-card-detail");
    expect(card?.textContent).toContain("The server returned an error (500).");
    expect(document.querySelector("#app")?.textContent).not.toContain("ApiError:");
    expect(document.querySelector("#app")?.textContent).not.toContain("raw schema boom");
  });

  it("retries the playbook load from the error card and reaches the create form", async () => {
    const playbookList = [{ Name: "Spider" }, { Name: "Cutter" }];
    const gameSettings = {
      Name: "Blades in the Dark",
      StressMax: 9,
      StartingActionDots: 7,
      StartingActionDotMax: 2,
      Attributes: [
        { Name: "Insight", Actions: [{ Name: "Hunt" }, { Name: "Study" }] },
        { Name: "Prowess", Actions: [{ Name: "Finesse" }, { Name: "Prowl" }] },
        { Name: "Resolve", Actions: [{ Name: "Attune" }, { Name: "Sway" }] },
      ],
    };
    let calls = 0;
    const responseLike = (body: unknown): Response =>
      ({ ok: true, status: 200, text: async () => JSON.stringify(body) }) as unknown as Response;
    global.fetch = vi.fn((input: RequestInfo | URL): Promise<Response> => {
      const url = typeof input === "string" ? input : String(input);
      if (calls === 0) {
        calls += 1;
        return Promise.resolve({ ok: false, status: 503, text: async () => "service unavailable" } as unknown as Response);
      }
      if (url.endsWith("/playbooks")) return Promise.resolve(responseLike(playbookList));
      if (url.endsWith("/crews")) return Promise.resolve(responseLike({ CrewTypes: [{ Name: "Assassins" }] }));
      return Promise.resolve(responseLike(gameSettings));
    });

    window.history.replaceState({}, "", "/character/create");
    window.dispatchEvent(new PopStateEvent("popstate"));

    await vi.waitFor(() => {
      if (!document.querySelector(".error-card")) {
      }
      expect(document.querySelector(".error-card")).not.toBeNull();
    });

    (document.querySelector("button.btn-primary") as HTMLButtonElement).click();

    await vi.waitFor(() => {
      expect(document.querySelector(".character-create")).not.toBeNull();
    });
    // Retry re-fetched the game data instead of navigating away.
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/games/blades-in-the-dark/playbooks",
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
    expect(document.querySelector("#app")?.textContent).toContain("Spider");
  });

  it("renders a recoverable error card when the crew-type list fails to load", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "",
      })
      .mockResolvedValue(ok({ characters: [], crews: [] }));

    window.history.replaceState({}, "", "/crew/create");
    window.dispatchEvent(new PopStateEvent("popstate"));

    await vi.waitFor(() => {
      expect(document.querySelector(".error-card")).not.toBeNull();
    });

    const h1s = document.querySelectorAll("h1");
    expect(h1s.length).toBe(1);
    expect(h1s[0]?.textContent).toBe("Couldn't load the crew types");
    expect(document.querySelector("button.btn-primary")?.textContent).toBe("Retry");
    expect(document.querySelector('a[href="/roster"]')).not.toBeNull();
    expect(document.querySelector("#app")?.textContent).not.toContain("ApiError:");
  });
});

describe("import-route load failures (FV-020/SC-F2)", () => {
  beforeEach(() => {
    if (!document.querySelector("#app")) {
      document.body.innerHTML = '<div id="app"></div>';
    }
    vi.clearAllMocks();
  });

  it("renders a friendly repair error card for a repairable deep-link character import (no raw 422 payload)", async () => {
    const raw422 = JSON.stringify({
      ok: false,
      error: { code: "INVALID_ENTITY", status: 422, message: "cannot parse stored bytes" },
    });
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 422, text: async () => raw422 })
      .mockResolvedValue(ok({ characters: [], crews: [] }));

    window.history.replaceState({}, "", "/character/c46ba7cb-993b-4fc7-974d-fb95eacd5446/import");
    window.dispatchEvent(new PopStateEvent("popstate"));

    await vi.waitFor(() => {
      expect(document.querySelector(".error-card")).not.toBeNull();
    });
    // One page-level h1, from the error card.
    const h1s = document.querySelectorAll("h1");
    expect(h1s.length).toBe(1);
    expect(h1s[0]?.textContent).toBe("This character could not be loaded for import.");
    // Retry + roster escape are present.
    expect(document.querySelector("button.btn-primary")?.textContent).toBe("Retry");
    expect(document.querySelector('a[href="/roster"]')).not.toBeNull();
    // Friendly repair copy, never the raw 422 JSON/parser payload.
    expect(document.querySelector(".error-card-detail")?.textContent).toContain("needs repair");
    expect(document.querySelector("#app")?.textContent).not.toContain("ApiError:");
    expect(document.querySelector("#app")?.textContent).not.toContain("cannot parse stored bytes");
  });

  it("renders friendly transport copy for a crew import load failure (no raw payload)", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "boom crew" })
      .mockResolvedValue(ok({ characters: [], crews: [] }));

    window.history.replaceState({}, "", "/crew/c46ba7cb-993b-4fc7-974d-fb95eacd5446/import");
    window.dispatchEvent(new PopStateEvent("popstate"));

    await vi.waitFor(() => {
      expect(document.querySelector(".error-card")).not.toBeNull();
    });
    expect(document.querySelector(".error-card-detail")?.textContent).toContain("The server returned an error (500).");
    expect(document.querySelector("#app")?.textContent).not.toContain("ApiError:");
    expect(document.querySelector("#app")?.textContent).not.toContain("boom crew");
  });
});

describe("route focus (FV-013)", () => {
  beforeEach(() => {
    if (!document.querySelector("#app")) {
      document.body.innerHTML = '<div id="app"></div>';
    }
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue(
      ok({ characters: [], crews: [] }),
    );
  });

  it("moves focus to the new route's main after click navigation (not BODY)", async () => {
    window.history.replaceState({}, "", "/roster");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await vi.waitFor(() => {
      expect(document.querySelector(".roster")).not.toBeNull();
    });

    // Client-side click on a same-origin nav link (main.ts intercepts it).
    const link = document.querySelector<HTMLAnchorElement>(
      '.app-bar a[href="/styleguide"]',
    );
    expect(link).not.toBeNull();
    link!.click();

    await vi.waitFor(() => {
      expect(document.querySelector(".styleguide")).not.toBeNull();
    });
    // Focus must not silently stay on BODY: the new route's main owns it.
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement?.id).toBe("main");
  });

  it("moves focus to the page main after browser Back (popstate)", async () => {
    window.history.replaceState({}, "", "/styleguide");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await vi.waitFor(() => {
      expect(document.querySelector(".styleguide")).not.toBeNull();
    });

    window.history.replaceState({}, "", "/roster");
    window.dispatchEvent(new PopStateEvent("popstate"));

    await vi.waitFor(() => {
      expect(document.querySelector(".roster")).not.toBeNull();
    });
    expect(document.activeElement?.id).toBe("main");
  });
});
