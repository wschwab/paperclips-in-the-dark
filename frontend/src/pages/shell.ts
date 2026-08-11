/**
 * App chrome — top bar with nav + theme controls.
 * Shared by health and styleguide routes.
 */

import { el } from "../lib/dom.js";
import { mountThemeControls } from "../lib/theme.js";

export interface ShellOptions {
  currentPath: string;
}

export function renderShell(opts: ShellOptions): {
  shell: HTMLElement;
  outlet: HTMLElement;
} {
  // F2aa: "/" redirects to /roster (the app's landing page), so the nav
  // leads with Roster instead of the F0 health check.
  const nav = el(
    "nav",
    { "aria-label": "Primary" },
    navLink("/roster", "Roster", opts.currentPath),
    navLink("/styleguide", "Style guide", opts.currentPath),
    mountThemeControls(),
  );

  // Skip link: first tabbable element, jumps keyboard/AT users past the
  // 150+ controls on a sheet to the <main> landmark (Design Audit F-13).
  const skip = el(
    "a",
    { className: "skip-link", href: "#main" },
    "Skip to sheet",
  );

  const bar = el(
    "header",
    { className: "app-bar torn-foot" },
    el("p", { className: "app-title" }, el("a", { href: "/" }, "Paperclips in the Dark")),
    nav,
  );

  const outlet = el("div", { id: "outlet", className: "outlet" });
  // Single <main> landmark and single page-level <h1> (per-page), as the
  // audit requires; each page owns its own <h1>.
  const main = el("main", { id: "main", tabindex: -1 }, outlet);
  const shell = el("div", { id: "shell" }, skip, bar, main);
  return { shell, outlet };
}

function navLink(href: string, label: string, current: string): HTMLAnchorElement {
  const a = el("a", { href }, label) as HTMLAnchorElement;
  if (pathMatches(href, current)) {
    a.setAttribute("aria-current", "page");
  }
  return a;
}

function pathMatches(href: string, current: string): boolean {
  if (href === "/") return current === "/" || current === "";
  return current === href || current.startsWith(`${href}/`);
}
