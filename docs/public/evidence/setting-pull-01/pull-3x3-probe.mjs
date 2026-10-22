// SETTING-PULL-01 probe: 3 sizes x light/dark/high on a crew sheet with no world data.
// Expects: no stock faction picker, no districts disclosure, manual faction entry still present,
// zero document overflow, zero console errors. Writes pull-3x3.json and one screenshot per combination.
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
const SIZES = [[1440, 1000], [768, 1024], [390, 844]];

const browser = await chromium.launch({ executablePath: resolveChromiumExecutable(), headless: true, ...(process.getuid?.() === 0 ? { args: ["--no-sandbox"] } : {}) });
const rows = [];
const crew = (await post("/api/crews", { gameStem: "blades-in-the-dark", crewType: "Assassins" })).crew;
for (const [width, height] of SIZES) {
  for (const [themeName, t] of Object.entries(THEMES)) {
    const ctx = await browser.newContext({ viewport: { width, height } });
    const p = await ctx.newPage();
    const errors = [];
    p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    p.on("pageerror", (e) => errors.push(String(e)));
    await p.goto(new URL(`/crew/${crew.id}`, base).href);
    await p.waitForSelector(".cohort-add");
    await p.evaluate((th) => {
      const root = document.documentElement;
      root.setAttribute("data-theme", th.theme);
      if (th.contrast) root.setAttribute("data-contrast", "high"); else root.removeAttribute("data-contrast");
    }, t);
    await p.waitForTimeout(150);
    const state = await p.evaluate(() => ({
      stockFactionSelects: document.querySelectorAll('select[aria-label="Stock faction"]').length,
      districtsDisclosures: document.querySelectorAll(".doskvol-districts").length,
      stockFieldLabels: [...document.querySelectorAll(".faction-stock-field")].length,
      manualFactionName: document.querySelectorAll(".faction-name-field input").length,
      docOverflowPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    const pass = state.stockFactionSelects === 0 && state.districtsDisclosures === 0 && state.stockFieldLabels === 0
      && state.manualFactionName > 0 && state.docOverflowPx === 0 && errors.length === 0;
    await p.screenshot({ path: join(here, `${width}-${themeName}.png`), fullPage: true });
    rows.push({ width, height, theme: themeName, ...state, consoleErrors: errors, pass });
    await ctx.close();
  }
}
await browser.close();
writeFileSync(join(here, "pull-3x3.json"), JSON.stringify({ crewId: crew.id, rows, allPass: rows.every((r) => r.pass) }, null, 2) + "\n");
console.log(JSON.stringify({ allPass: rows.every((r) => r.pass), rows: rows.length }));
