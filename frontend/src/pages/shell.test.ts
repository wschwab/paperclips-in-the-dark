// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { renderShell } from "./shell.js";

describe("shell accessibility skeleton (Design Audit F-13)", () => {
  it("wraps the outlet in a single <main> landmark", () => {
    const { shell } = renderShell({ currentPath: "/roster" });
    const mains = shell.querySelectorAll("main");
    expect(mains.length).toBe(1);
    expect(mains[0].id).toBe("main");
    expect(mains[0].querySelector("#outlet")).not.toBeNull();
  });

  it("does not emit a second <h1> from the app bar", () => {
    const { shell } = renderShell({ currentPath: "/roster" });
    const h1s = shell.querySelectorAll("h1");
    expect(h1s.length).toBe(0);
    // The wordmark is a styled paragraph, not a heading.
    expect(shell.querySelector(".app-title")?.tagName).toBe("P");
  });

  it("provides a skip link as the first focusable element targeting #main", () => {
    const { shell } = renderShell({ currentPath: "/roster" });
    const skip = shell.querySelector(".skip-link");
    expect(skip).not.toBeNull();
    expect(skip?.getAttribute("href")).toBe("#main");
    // First child of the shell so it precedes the app bar in tab order.
    expect(shell.firstElementChild).toBe(skip);
  });

  it("composes with a route to exactly one page-level h1", async () => {
    const { shell, outlet } = renderShell({ currentPath: "/roster" });
    // Mount the roster into the shell outlet (as main.ts does).
    const { mountRosterPage } = await import("./roster.js");
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          characters: [],
          crews: [],
        }),
    });
    mountRosterPage(outlet);
    await vi.waitFor(() => {
      // exactly one h1 across the composed shell + route DOM
      expect(shell.querySelectorAll("h1").length).toBe(1);
    });
  });

  it("applies the torn-edge seam to the app bar within the approved ceremony scope", () => {
    const { shell } = renderShell({ currentPath: "/roster" });
    // Design Audit Appendix A: the seam lives on the app bar; it must not
    // have leaked onto arbitrary chrome.
    expect(shell.querySelector(".app-bar.torn-foot")).not.toBeNull();
    // Exactly one torn seam on this surface (the bar), none elsewhere in shell chrome.
    expect(shell.querySelectorAll(".torn-foot").length).toBe(1);
  });
});
