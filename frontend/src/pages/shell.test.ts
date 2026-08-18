// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { renderShell } from "./shell.js";
import { loadStylesheets } from "./seam.js";

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

  it("keeps the app-bar nav from bleeding past the viewport (FV-016)", () => {
    loadStylesheets();
    const { shell } = renderShell({ currentPath: "/roster" });
    document.body.appendChild(shell);
    const nav = shell.querySelector(".app-bar nav");
    expect(nav).not.toBeNull();
    // happy-dom does no layout, so the 320px containment contract is carried
    // by computed style from the real stylesheets (same convention as seam.ts):
    // the nav must be allowed to wrap its own children and shrink below its
    // content width instead of overflowing the bar as a rigid nowrap row.
    expect(getComputedStyle(nav!).flexWrap).toBe("wrap");
    expect(getComputedStyle(nav!).minWidth).toBe("0");
  });

  it("keeps nav links and theme controls visible and focusable (FV-016)", () => {
    const { shell } = renderShell({ currentPath: "/roster" });
    const nav = shell.querySelector(".app-bar nav");
    expect(nav).not.toBeNull();
    // Two primary nav links plus the theme control group stay in the bar.
    const links = nav!.querySelectorAll("a");
    expect(links.length).toBe(2);
    const controls = nav!.querySelector(".theme-controls");
    expect(controls).not.toBeNull();
    // Every theme control is a real, focusable button.
    const buttons = controls!.querySelectorAll("button");
    expect(buttons.length).toBe(4);
    for (const b of buttons) {
      expect((b as HTMLButtonElement).type).toBe("button");
      expect(b.hasAttribute("tabindex")).toBe(false); // naturally focusable
    }
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

describe("route focus target and skip link (FV-013)", () => {
  it("makes #main the focusable landmark the skip link targets", () => {
    document.body.innerHTML = "";
    const { shell } = renderShell({ currentPath: "/roster" });
    document.body.appendChild(shell);
    const main = shell.querySelector<HTMLElement>("#main");
    // Browsers move focus to the tabindex=-1 fragment target when the
    // skip link is activated, and the router relies on the same target.
    expect(main?.tabIndex).toBe(-1);
    main?.focus();
    expect(document.activeElement).toBe(main);
  });

  it("keeps the skip link as the first focusable shell element", () => {
    const { shell } = renderShell({ currentPath: "/roster" });
    const focusables = shell.querySelectorAll<HTMLElement>(
      "a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex='-1'])",
    );
    expect(focusables.length).toBeGreaterThan(0);
    expect(focusables[0]).toBe(shell.querySelector(".skip-link"));
  });
});
