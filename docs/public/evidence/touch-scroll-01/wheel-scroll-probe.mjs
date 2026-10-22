// TOUCH-SCROLL-01 follow-up: mouse-wheel scrolling over the Resolution card at 1440x1000, 768x1024, 390x844.
// Checks: (1) a wheel over the card scrolls the card's inner list; (2) once the card is at its end,
// further wheel over the card scrolls the page (no scroll trap); (3) horizontal overflow is 0.
// Writes wheel-scroll.json next to this file. Run under the managed launcher (BASE_URL):
//   node conformance/scripts/managed-browser-smoke.mjs --seed-defaults -- node docs/public/evidence/touch-scroll-01/wheel-scroll-probe.mjs
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

// 1440 uses a short height (560) so the card overflows; at 1440x1000 the card fits and its inner list cannot be tested.
const SIZES = [[1440, 560], [768, 1024], [390, 844]];
const rows = [];
for (const [width, height] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  await ctx.addInitScript(() => localStorage.setItem("pitd.theme", "light"));
  const page = await ctx.newPage();
  await page.goto(new URL(`/character/${created.id}`, base).href);
  await page.locator(".game-mode-resolution .game-mode-popup-card").waitFor({ state: "visible", timeout: 15000 });

  const state = () => page.evaluate(() => {
    const card = document.querySelector(".game-mode-resolution .game-mode-popup-card");
    const r = card.getBoundingClientRect();
    return {
      cardScrollTop: Math.round(card.scrollTop),
      cardMaxScroll: card.scrollHeight - card.clientHeight,
      cardRect: { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom) },
      pageScrollY: Math.round(window.scrollY),
      pageMaxScroll: document.documentElement.scrollHeight - window.innerHeight,
      docOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  const before = await state();
  const x = Math.round((before.cardRect.left + before.cardRect.right) / 2);
  const y = Math.round(before.cardRect.top + (before.cardRect.bottom - before.cardRect.top) * 0.6);
  await page.mouse.move(x, y);

  // One wheel over the card: the inner list should move.
  await page.mouse.wheel(0, 160);
  await page.waitForTimeout(300);
  const afterCardWheel = await state();

  // Drive the card to its end with wheel notches over it.
  for (let i = 0; i < 60; i++) {
    const s = await state();
    if (s.cardScrollTop >= s.cardMaxScroll) break;
    await page.mouse.wheel(0, 240);
    await page.waitForTimeout(80);
  }
  const atCardEnd = await state();

  // The trap check: one more wheel over the card, now at its end.
  await page.mouse.wheel(0, 160);
  await page.waitForTimeout(300);
  const afterEndWheel = await state();

  rows.push({
    width,
    height,
    before,
    afterCardWheel,
    atCardEnd,
    afterEndWheel,
    cardCanScroll: before.cardMaxScroll > 0,
    cardScrolledByWheel: afterCardWheel.cardScrollTop > before.cardScrollTop,
    cardReachedEnd: atCardEnd.cardScrollTop >= atCardEnd.cardMaxScroll,
    pageScrolledAtCardEnd: afterEndWheel.pageScrollY > atCardEnd.pageScrollY,
    pageIsScrollable: before.pageMaxScroll > 0,
    horizontalOverflow: Math.max(before.docOverflowX, afterCardWheel.docOverflowX, afterEndWheel.docOverflowX),
  });
  await ctx.close();
}
await browser.close();
writeFileSync(join(here, "wheel-scroll.json"), JSON.stringify({ rows }, null, 2) + "\n");
const failures = rows.filter((r) => !r.cardCanScroll || !r.cardScrolledByWheel || !r.cardReachedEnd || (r.pageIsScrollable && !r.pageScrolledAtCardEnd) || r.horizontalOverflow !== 0);
console.log(`wheel scroll: ${rows.length} sizes, ${failures.length} failures`);
for (const r of rows) console.log(JSON.stringify({ width: r.width, cardCanScroll: r.cardCanScroll, cardScrolledByWheel: r.cardScrolledByWheel, cardReachedEnd: r.cardReachedEnd, pageScrolledAtCardEnd: r.pageScrolledAtCardEnd, pageIsScrollable: r.pageIsScrollable, horizontalOverflow: r.horizontalOverflow }));
if (failures.length > 0) process.exit(1);
