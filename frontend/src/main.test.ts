// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

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
});
