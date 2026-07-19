import { el, setChildren } from "./lib/dom.js";
import { initTheme } from "./lib/theme.js";
import { mountHealthPage } from "./pages/health.js";
import { renderShell } from "./pages/shell.js";
import { mountStyleguidePage } from "./pages/styleguide.js";

import "./styles/fonts.css";
import "./styles/theme.css";
import "./styles/base.css";
import "./styles/components.css";

initTheme();

const appEl = document.querySelector<HTMLElement>("#app");
if (!appEl) {
  throw new Error("#app root missing");
}
const app: HTMLElement = appEl;

type Disposer = () => void;
let disposePage: Disposer | undefined;

function currentPath(): string {
  return window.location.pathname.replace(/\/+$/, "") || "/";
}

function navigate(path: string): void {
  if (path !== currentPath()) {
    window.history.pushState({}, "", path);
  }
  render();
}

function render(): void {
  disposePage?.();
  disposePage = undefined;

  const path = currentPath();
  const { shell, outlet } = renderShell({ currentPath: path });
  setChildren(app, shell);

  if (path === "/styleguide") {
    document.title = "Style guide — Paperclips in the Dark";
    disposePage = mountStyleguidePage(outlet);
    return;
  }

  // default: health (F0)
  document.title = "Paperclips in the Dark";
  const intro = el(
    "div",
    { className: "home pad" },
    el("p", { className: "tagline serif" }, "Campaign sheet manager — health check"),
  );
  outlet.append(intro);
  const healthRoot = el("div", { id: "health-root", className: "pad" });
  outlet.append(healthRoot);
  disposePage = mountHealthPage(healthRoot);
}

// Intercept same-origin link clicks for client routing (no full reload).
document.addEventListener("click", (ev) => {
  const t = ev.target;
  if (!(t instanceof Element)) return;
  const a = t.closest("a");
  if (!a) return;
  if (a.target === "_blank" || a.hasAttribute("download")) return;
  const href = a.getAttribute("href");
  if (!href || href.startsWith("http") || href.startsWith("mailto:")) return;
  if (href.startsWith("#")) return;
  // only internal paths
  if (!href.startsWith("/")) return;
  ev.preventDefault();
  navigate(href);
});

window.addEventListener("popstate", () => render());

render();
