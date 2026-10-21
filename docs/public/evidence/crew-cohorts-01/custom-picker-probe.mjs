// CREW-COHORTS-01 review fix probe: choosing "Custom" in an Add-form trait picker (Edges) must not widen the page.
// At 1440, 768 and 390 (light, dark, high contrast) it selects Custom in the Edges picker of a gang add form, then
// measures document overflow, the form's scroll width, and whether the picker "+" stays inside the viewport.
// Run under the managed launcher (BASE_URL).
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../../..");
const { resolveChromiumExecutable } = await import(pathToFileURL(join(repo, "conformance/scripts/lib/chromium-resolve.mjs")).href);
const { chromium } = await import(pathToFileURL(join(repo, "conformance/node_modules/playwright-core/index.mjs")).href);
const base = process.env.BASE_URL;
const post = (p, b) => fetch(new URL(p, base), { method: "POST", headers: { "content-type": "application/json", Accept: "application/json" }, body: JSON.stringify(b) }).then((r) => r.json());
const THEMES = {
  light: { theme: "light", contrast: false },
  dark: { theme: "dark", contrast: false },
  high: { theme: "light", contrast: true },
};
const browser = await chromium.launch({ executablePath: resolveChromiumExecutable(), headless: true, ...(process.getuid?.() === 0 ? { args: ["--no-sandbox"] } : {}) });
const rows = [];
for (const [width, height] of [[1440, 1000], [768, 1024], [390, 844]]) {
  for (const [themeName, t] of Object.entries(THEMES)) {
    const crew = (await post("/api/crews", { gameStem: "blades-in-the-dark", crewType: "Assassins" })).crew;
    const ctx = await browser.newContext({ viewport: { width, height } });
    const p = await ctx.newPage();
    await p.goto(new URL(`/crew/${crew.id}`, base).href);
    await p.waitForSelector(".cohort-add");
    await p.evaluate((th) => {
      const root = document.documentElement;
      root.setAttribute("data-theme", th.theme);
      if (th.contrast) root.setAttribute("data-contrast", "high"); else root.removeAttribute("data-contrast");
    }, t);
    // The Edges picker is the picker whose select offers a "Custom" option and sits beside an edge "+" control.
    const picked = await p.evaluate(() => {
      const pickers = [...document.querySelectorAll(".cohort-add .cohort-trait-picker")];
      const target = pickers.find((pk) => [...pk.querySelectorAll("option")].some((o) => o.textContent.trim() === "Custom"));
      if (!target) return null;
      const sel = target.querySelector("select");
      const customValue = [...sel.options].find((o) => o.textContent.trim() === "Custom").value;
      sel.value = customValue;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      return sel.getAttribute("aria-label") ?? sel.name ?? "picker";
    });
    await p.waitForTimeout(150);
    const m = await p.evaluate(() => {
      const form = document.querySelector(".cohort-add");
      const picker = [...document.querySelectorAll(".cohort-add .cohort-trait-picker")].find((pk) => {
        const sel = pk.querySelector("select");
        return sel && sel.value && [...sel.options].some((o) => o.textContent.trim() === "Custom" && o.selected);
      });
      const plus = picker?.querySelector('button[title^="Add "]');
      const plusR = plus?.getBoundingClientRect();
      return {
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        formClient: form.clientWidth,
        formScroll: form.scrollWidth,
        plusRight: plusR ? Math.round(plusR.right * 10) / 10 : null,
        viewport: window.innerWidth,
      };
    });
    rows.push({ width, theme: themeName, pickedAria: picked, ...m, plusInsideViewport: m.plusRight === null ? null : m.plusRight <= m.viewport });
    await ctx.close();
  }
}
await browser.close();
writeFileSync(join(here, "custom-picker.json"), JSON.stringify(rows, null, 2) + "\n");
console.log(JSON.stringify(rows.map((r) => ({ w: r.width, t: r.theme, doc: r.documentOverflow, form: [r.formClient, r.formScroll], plusRight: r.plusRight }))));
