// CREW-CLAIMS-EDIT-01 review fix probe: contrast of an owned claim cell, at rest and on hover.
// Acquires a connected-or-not claim (dialog accepted), then reads the computed text and background colour of
// the owned cell at rest and while hovered. Reports the WCAG contrast ratio. Run under the managed launcher.
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
for (const [width, height] of SIZES) {
  for (const [themeName, t] of Object.entries(THEMES)) {
    const crew = (await post("/api/crews", { gameStem: "blades-in-the-dark", crewType: "Assassins" })).crew;
    const ctx = await browser.newContext({ viewport: { width, height } });
    const p = await ctx.newPage();
    p.on("dialog", (d) => d.accept());
    await p.goto(new URL(`/crew/${crew.id}`, base).href);
    await p.waitForSelector(".claims-grid");
    await p.evaluate((th) => {
      const root = document.documentElement;
      root.setAttribute("data-theme", th.theme);
      if (th.contrast) root.setAttribute("data-contrast", "high"); else root.removeAttribute("data-contrast");
    }, t);
    const cell = p.locator('.claims-grid button:not(.claim-owned):has(> strong:text-is("Training Rooms"))').first();
    await cell.click();
    await p.waitForSelector(".claims-grid .claim-owned");
    const owned = p.locator(".claims-grid .claim-owned").first();
    const read = () => owned.evaluate((el) => {
      const lum = (rgb) => {
        const [r, g, b] = rgb.match(/[\d.]+/g).slice(0, 3).map((v) => {
          const c = Number(v) / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const cs = getComputedStyle(el);
      const label = el.querySelector("strong") ?? el;
      const text = getComputedStyle(label).color;
      const bg = cs.backgroundColor;
      const [hi, lo] = [lum(text), lum(bg)].sort((a, b) => b - a);
      return { text, bg, ratio: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100 };
    });
    const atRest = await read();
    await owned.hover();
    await p.waitForTimeout(250);
    const hovered = await read();
    rows.push({ width, theme: themeName, atRest, hovered });
    await ctx.close();
  }
}
await browser.close();
writeFileSync(join(here, "owned-hover-contrast.json"), JSON.stringify(rows, null, 2) + "\n");
console.log(JSON.stringify(rows.map((r) => ({ w: r.width, t: r.theme, rest: r.atRest.ratio, hover: r.hovered.ratio }))));
