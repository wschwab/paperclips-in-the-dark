// CREW-CLAIMS-EDIT-01 / CREW-CLAIMS-MAP-01 probe: claims map geometry at 1440x1000, 768x1024 and 390x844,
// plus the direct-click acquire/relinquish flow and the Edit claim editor. Run under the managed launcher.
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../../..");
const { resolveChromiumExecutable } = await import(pathToFileURL(join(repo, "conformance/scripts/lib/chromium-resolve.mjs")).href);
const { chromium } = await import(pathToFileURL(join(repo, "conformance/node_modules/playwright-core/index.mjs")).href);
const base = process.env.BASE_URL;
const post = (p, b) => fetch(new URL(p, base), { method: "POST", headers: { "content-type": "application/json", Accept: "application/json" }, body: JSON.stringify(b) }).then((r) => r.json());

const crew = (await post("/api/crews", { gameStem: "blades-in-the-dark", crewType: "Assassins" })).crew;
const browser = await chromium.launch({ executablePath: resolveChromiumExecutable(), headless: true, ...(process.getuid?.() === 0 ? { args: ["--no-sandbox"] } : {}) });
const rows = [];
for (const [width, height] of [[1440, 1000], [768, 1024], [390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const p = await ctx.newPage();
  const dialogs = [];
  let acceptNext = true;
  p.on("dialog", (d) => { dialogs.push(d.message()); if (acceptNext) d.accept(); else d.dismiss(); });
  await p.goto(new URL(`/crew/${crew.id}`, base).href);
  await p.waitForSelector(".claims-grid");
  const geometry = await p.evaluate(() => {
    const map = document.querySelector(".claims-map");
    const grid = document.querySelector(".claims-grid");
    const r = grid.getBoundingClientRect();
    return {
      mapScrollWidth: map.scrollWidth, mapClientWidth: map.clientWidth,
      docScrollWidth: document.documentElement.scrollWidth, docClientWidth: document.documentElement.clientWidth,
      gridLeft: Math.round(r.left), gridRight: Math.round(r.right), gridBottom: Math.round(r.bottom),
      viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
      editToggleCount: document.querySelectorAll(".claims-edit-toggle").length,
      activeListButtons: document.querySelectorAll(".active-claim-list button").length,
    };
  });
  const ownedCount = () => p.locator(".claims-grid .claim-owned").count();
  // Acquire by a direct click on a connected claim: the dialog is accepted.
  acceptNext = true;
  const before = await ownedCount();
  await p.locator(".claims-grid button.claim-connected").first().click();
  await p.waitForFunction((n) => document.querySelectorAll(".claims-grid .claim-owned").length === n + 1, before, { timeout: 10000 });
  // Relinquish by a direct click on the owned claim: the dialog is dismissed, nothing changes.
  acceptNext = false;
  const beforeCancel = await ownedCount();
  await p.locator(".claims-grid .claim-owned").first().click();
  await p.waitForTimeout(400);
  const afterCancel = await ownedCount();
  // Edit claim: choose the owned claim, the inline form appears with its current name.
  await p.locator(".claim-edit-start").click();
  await p.locator(".claims-grid .claim-owned").first().click();
  await p.waitForSelector(".claim-editor");
  const editorName = await p.locator('.claim-editor input[aria-label="Claim name"]').inputValue();
  const screenshot = join(here, `claims-${width}.png`);
  await p.screenshot({ path: screenshot, animations: "disabled" });
  rows.push({
    width, height, ...geometry,
    ownedBeforeAcquire: before, ownedAfterAcquire: beforeCancel,
    ownedAfterCancelledRelinquish: afterCancel,
    editorName,
    dialogs,
    screenshot: `claims-${width}.png`,
  });
  await ctx.close();
}
await browser.close();
writeFileSync(join(here, "probe.json"), JSON.stringify(rows, null, 2) + "\n");
console.log(JSON.stringify(rows.map((r) => ({
  w: r.width,
  mapFits: r.mapScrollWidth === r.mapClientWidth,
  docFits: r.docScrollWidth === r.docClientWidth,
  gridRight: r.gridRight,
  owned: [r.ownedBeforeAcquire, r.ownedAfterAcquire, r.ownedAfterCancelledRelinquish],
  editorName: r.editorName,
  toggles: r.editToggleCount,
  activeButtons: r.activeListButtons,
}))));
