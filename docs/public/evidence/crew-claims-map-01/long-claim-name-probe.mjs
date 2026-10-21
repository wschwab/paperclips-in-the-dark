// CREW-CLAIMS-MAP-01 review fix probe: a 64-character claim name must not widen the page at 390px.
// Acquires Fixer, edits its name to 64 "X" characters (benefit text kept), saves, then measures the document
// and the Active claim benefits list at 1440, 768 and 390 in light theme. Run under the managed launcher.
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../../..");
const { resolveChromiumExecutable } = await import(pathToFileURL(join(repo, "conformance/scripts/lib/chromium-resolve.mjs")).href);
const { chromium } = await import(pathToFileURL(join(repo, "conformance/node_modules/playwright-core/index.mjs")).href);
const base = process.env.BASE_URL;
const post = (p, b) => fetch(new URL(p, base), { method: "POST", headers: { "content-type": "application/json", Accept: "application/json" }, body: JSON.stringify(b) }).then((r) => r.json());

const browser = await chromium.launch({ executablePath: resolveChromiumExecutable(), headless: true, ...(process.getuid?.() === 0 ? { args: ["--no-sandbox"] } : {}) });
const rows = [];
for (const [width, height] of [[1440, 1000], [768, 1024], [390, 844]]) {
  const crew = (await post("/api/crews", { gameStem: "blades-in-the-dark", crewType: "Assassins" })).crew;
  const ctx = await browser.newContext({ viewport: { width, height } });
  const p = await ctx.newPage();
  p.on("dialog", (d) => d.accept());
  await p.goto(new URL(`/crew/${crew.id}`, base).href);
  await p.waitForSelector(".claims-grid");
  const fixer = p.locator('.claims-grid button:not(.claim-owned):has(> strong:text-is("Fixer"))').first();
  await fixer.click();
  await p.waitForSelector(".claims-grid .claim-owned");
  await p.locator(".claim-edit-start").click();
  await p.locator(".claims-grid .claim-owned").first().click();
  await p.waitForSelector(".claim-editor");
  await p.locator('.claim-editor input[aria-label="Claim name"]').fill("X".repeat(64));
  await p.locator(".claim-editor button[type=submit]").click();
  await p.waitForFunction(() => !document.querySelector(".claim-editor"), null, { timeout: 10000 }).catch(() => {});
  await p.waitForTimeout(200);
  const m = await p.evaluate(() => {
    const list = document.querySelector(".active-claim-list");
    return {
      documentScroll: document.documentElement.scrollWidth,
      documentClient: document.documentElement.clientWidth,
      activeListScroll: list ? list.scrollWidth : null,
      activeListClient: list ? list.clientWidth : null,
      mapScroll: document.querySelector(".claims-map")?.scrollWidth ?? null,
      mapClient: document.querySelector(".claims-map")?.clientWidth ?? null,
    };
  });
  rows.push({ width, ...m, documentOverflow: m.documentScroll - m.documentClient });
  await ctx.close();
}
await browser.close();
writeFileSync(join(here, "long-claim-name.json"), JSON.stringify(rows, null, 2) + "\n");
console.log(JSON.stringify(rows));
