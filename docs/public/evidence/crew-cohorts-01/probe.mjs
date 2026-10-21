// CREW-COHORTS-01 probe: crew sheet cohort editor at 1440/768/390. Records whether the Cohorts heading and the
// add form's first control are visible in the initial view, whether the section overflows horizontally, and the
// derived quality/scale values shown for a Tier-1 crew. Run under the managed launcher (BASE_URL).
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../../..");
const { resolveChromiumExecutable } = await import(pathToFileURL(join(repo, "conformance/scripts/lib/chromium-resolve.mjs")).href);
const { chromium } = await import(pathToFileURL(join(repo, "conformance/node_modules/playwright-core/index.mjs")).href);
const base = process.env.BASE_URL;
const j = (r) => r.json();
const post = (p, b) => fetch(new URL(p, base), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then(j);

const created = await post("/api/crews", { gameStem: "blades-in-the-dark", crewType: "Assassins" });
if (!created.crew) throw new Error(`crew create failed ${JSON.stringify(created.error)}`);
const crewId = created.crew.id;

const browser = await chromium.launch({ executablePath: resolveChromiumExecutable(), headless: true, ...(process.getuid?.() === 0 ? { args: ["--no-sandbox"] } : {}) });
const rows = [];
for (const [width, height] of [[1440, 1000], [768, 1024], [390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const p = await ctx.newPage();
  await p.goto(new URL(`/crew/${crewId}`, base).href);
  await p.waitForSelector(".crew-cohorts", { timeout: 15000 });
  const info = await p.evaluate(() => {
    const sec = document.querySelector(".crew-cohorts");
    const heading = sec.querySelector("h2, h3");
    const firstControl = sec.querySelector("select, input, textarea, button");
    const sr = sec.getBoundingClientRect();
    const vh = window.innerHeight;
    const r = (el) => (el ? Math.round(el.getBoundingClientRect().top - sr.top) : null);
    return {
      sectionHeight: Math.round(sr.height),
      sectionOverflowX: sec.scrollWidth > sec.clientWidth + 1,
      headingVisibleInitially: heading ? heading.getBoundingClientRect().top < vh : null,
      firstControlTopInSection: r(firstControl),
      derivedQuality: sec.querySelector(".cohort-add .cohort-quality-derived")?.textContent ?? null,
      derivedScale: sec.querySelector(".cohort-add .cohort-scale-derived")?.textContent ?? null,
      hasQualityInput: sec.querySelector('input[aria-label="Cohort quality"]') !== null,
    };
  });
  const shot = join(here, `cohorts-${width}.png`);
  await p.screenshot({ path: shot, animations: "disabled", fullPage: false });
  rows.push({ width, height, ...info });
  await ctx.close();
}
await browser.close();
writeFileSync(join(here, "probe.json"), JSON.stringify({ crewId, rows }, null, 2) + "\n");
console.log(JSON.stringify(rows, null, 2));
