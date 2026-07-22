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
  const nav = el(
    "nav",
    { "aria-label": "Primary" },
    navLink("/", "Health", opts.currentPath),
    navLink("/roster", "Roster", opts.currentPath),
    navLink("/styleguide", "Style guide", opts.currentPath),
    mountThemeControls(),
  );

  const bar = el(
    "header",
    { className: "app-bar" },
    el("h1", {}, el("a", { href: "/", className: "app-title" }, "Paperclips in the Dark")),
    nav,
  );

  const outlet = el("div", { id: "outlet", className: "outlet" });
  const shell = el("div", { id: "shell" }, bar, outlet);
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
