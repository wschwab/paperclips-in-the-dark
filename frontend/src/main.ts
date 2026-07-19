import { el, setChildren } from "./lib/dom.js";
import { mountHealthPage } from "./pages/health.js";

const app = document.querySelector<HTMLElement>("#app");
if (!app) {
  throw new Error("#app root missing");
}

const shell = el(
  "main",
  { id: "shell" },
  el("h1", {}, "Paperclips in the Dark"),
  el("p", { className: "tagline" }, "Campaign sheet manager — health check"),
);

const healthRoot = el("div", { id: "health-root" });
shell.append(healthRoot);
setChildren(app, shell);

mountHealthPage(healthRoot);
