// TOUCH-SCROLL-01 follow-up: horizontal-only input over the Resolution card must not be cancelled.
// Setup: card scrolled to 100px (so it is not at its top). At 390x844, a horizontal-only wheel notch (deltaY 0)
// and a horizontal-only touch drag (dy 0) are sent over the card.
// Expected: neither event is defaultPrevented, and the card's scrollTop stays at 100.
// Writes horizontal-edge.json next to this file. Run under the managed launcher (BASE_URL):
//   node conformance/scripts/managed-browser-smoke.mjs --seed-defaults -- node docs/public/evidence/touch-scroll-01/horizontal-edge-probe.mjs
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../../..");
const { resolveChromiumExecutable } = await import(pathToFileURL(join(repo, "conformance/scripts/lib/chromium-resolve.mjs")).href);
const { chromium } = await import(pathToFileURL(join(repo, "conformance/node_modules/playwright-core/index.mjs")).href);
const base = process.env.BASE_URL;
const post = (p, b, h = {}) => fetch(new URL(p, base), { method: "POST", headers: { "content-type": "application/json", ...h }, body: JSON.stringify(b) }).then((r) => r.json());

const created = (await post("/api/characters", { gameStem: "blades-in-the-dark", playbook: "Cutter" })).character;
const modeRes = await post(`/api/characters/${created.id}/ops/mode.set`, { mode: "score" }, { "If-Match": String(created.revision) });
const flowRes = await post(`/api/characters/${created.id}/ops/mode.flow.set`, { kind: "resolution", step: "payoff" }, { "If-Match": String(modeRes.character.revision) });
if (!flowRes.ok && !flowRes.character) throw new Error(`setup failed: ${JSON.stringify(flowRes).slice(0, 300)}`);

const browser = await chromium.launch({ executablePath: resolveChromiumExecutable(), headless: true, ...(process.getuid?.() === 0 ? { args: ["--no-sandbox"] } : {}) });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await ctx.addInitScript(() => localStorage.setItem("pitd.theme", "light"));
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await page.goto(new URL(`/character/${created.id}`, base).href);
await page.locator(".game-mode-resolution .game-mode-popup-card").waitFor({ state: "visible", timeout: 15000 });

// Record defaultPrevented for wheel and touchmove after the app's own window listeners have run.
await page.evaluate(() => {
  window.__wheelPrevented = null;
  window.__touchPrevented = [];
  window.addEventListener("wheel", (e) => { window.__wheelPrevented = e.defaultPrevented; }, { passive: true });
  window.addEventListener("touchmove", (e) => { window.__touchPrevented.push(e.defaultPrevented); }, { passive: true });
  const card = document.querySelector(".game-mode-resolution .game-mode-popup-card");
  card.scrollTop = 100;
});

const info = await page.evaluate(() => {
  const card = document.querySelector(".game-mode-resolution .game-mode-popup-card");
  const r = card.getBoundingClientRect();
  return { scrollTop: Math.round(card.scrollTop), maxScroll: card.scrollHeight - card.clientHeight, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
});
const x = Math.round((info.left + info.right) / 2);
const y = Math.round(info.top + (info.bottom - info.top) * 0.5);
await page.mouse.move(x, y);

// Horizontal-only wheel notch over the card.
await page.mouse.wheel(128, 0);
await page.waitForTimeout(300);
const afterWheel = await page.evaluate(() => ({
  scrollTop: Math.round(document.querySelector(".game-mode-resolution .game-mode-popup-card").scrollTop),
  prevented: window.__wheelPrevented,
}));

// Horizontal-only touch drag over the card: finger moves right, no vertical travel.
await page.evaluate(() => { window.__touchPrevented = []; });
await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x - 60, y, id: 1 }] });
for (let i = 1; i <= 12; i++) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - 60 + i * 10, y, id: 1 }] });
}
await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await page.waitForTimeout(300);
const afterTouch = await page.evaluate(() => ({
  scrollTop: Math.round(document.querySelector(".game-mode-resolution .game-mode-popup-card").scrollTop),
  prevented: window.__touchPrevented,
}));

const failures = [];
if (afterWheel.prevented !== false) failures.push("wheel horizontal notch was defaultPrevented");
if (afterWheel.scrollTop !== 100) failures.push(`wheel moved card to ${afterWheel.scrollTop}`);
if (afterTouch.prevented.some((p) => p)) failures.push("touch horizontal move was defaultPrevented");
if (afterTouch.scrollTop !== 100) failures.push(`touch moved card to ${afterTouch.scrollTop}`);

const result = { width: 390, height: 844, maxScroll: info.maxScroll, before: info.scrollTop, afterWheel, afterTouch, failures };
await browser.close();
writeFileSync(join(here, "horizontal-edge.json"), JSON.stringify(result, null, 2) + "\n");
console.log(`horizontal edge: ${failures.length} failures`);
for (const f of failures) console.log(f);
if (failures.length > 0) process.exit(1);
