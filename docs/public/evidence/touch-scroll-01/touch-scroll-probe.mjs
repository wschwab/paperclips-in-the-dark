// TOUCH-SCROLL-01 probe: touch scrolling over the Resolution card at 390x844 and 768x1024.
// Uses Chromium touch emulation (hasTouch, isMobile) and real CDP Input.dispatchTouchEvent drags.
// Checks: (1) a vertical drag starting over the card scrolls the card's inner list;
// (2) once the card is at its end, a further drag over the card scrolls the page (no scroll trap);
// (3) horizontal overflow is 0. Writes touch-scroll.json next to this file.
// Run under the managed launcher (BASE_URL):
//   node conformance/scripts/managed-browser-smoke.mjs --seed-defaults -- node docs/public/evidence/touch-scroll-01/touch-scroll-probe.mjs
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../../..");
const { resolveChromiumExecutable } = await import(pathToFileURL(join(repo, "conformance/scripts/lib/chromium-resolve.mjs")).href);
const { chromium } = await import(pathToFileURL(join(repo, "conformance/node_modules/playwright-core/index.mjs")).href);
const base = process.env.BASE_URL;
const post = (p, b, h = {}) => fetch(new URL(p, base), { method: "POST", headers: { "content-type": "application/json", ...h }, body: JSON.stringify(b) }).then((r) => r.json());

// A Score character on the Resolution Payoff step: the overlay card is the touch target.
const created = (await post("/api/characters", { gameStem: "blades-in-the-dark", playbook: "Cutter" })).character;
const modeRes = await post(`/api/characters/${created.id}/ops/mode.set`, { mode: "score" }, { "If-Match": String(created.revision) });
const flowRes = await post(`/api/characters/${created.id}/ops/mode.flow.set`, { kind: "resolution", step: "payoff" }, { "If-Match": String(modeRes.character.revision) });
if (!flowRes.ok && !flowRes.character) throw new Error(`setup failed: ${JSON.stringify(flowRes).slice(0, 300)}`);

const browser = await chromium.launch({ executablePath: resolveChromiumExecutable(), headless: true, ...(process.getuid?.() === 0 ? { args: ["--no-sandbox"] } : {}) });

// Drag with real touch events. Returns the number of steps dispatched.
async function drag(cdp, x, fromY, toY, steps = 12) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: fromY, id: 1 }] });
  for (let i = 1; i <= steps; i++) {
    const y = fromY + ((toY - fromY) * i) / steps;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y, id: 1 }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await new Promise((r) => setTimeout(r, 400)); // let momentum/scroll settle
}

const SIZES = [[390, 844], [768, 1024]];
const rows = [];
for (const [width, height] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => localStorage.setItem("pitd.theme", "light"));
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
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
  // Start the drag on the card's middle, below its title, and drag up (finger moves up = scroll down).
  const x = Math.round((before.cardRect.left + before.cardRect.right) / 2);
  const startY = Math.round(before.cardRect.top + (before.cardRect.bottom - before.cardRect.top) * 0.6);

  await drag(cdp, x, startY, startY - 160);
  const afterCardDrag = await state();

  // Drive the card to its end with repeated drags over it; record each step.
  for (let i = 0; i < 40; i++) {
    const s = await state();
    if (s.cardScrollTop >= s.cardMaxScroll) break;
    await drag(cdp, x, startY, startY - 220);
  }
  const atCardEnd = await state();

  // The scroll-trap check: one more drag over the card, now that the card cannot scroll further.
  await drag(cdp, x, startY, startY - 160);
  const afterEndDrag = await state();

  rows.push({
    width,
    height,
    before,
    afterCardDrag,
    atCardEnd,
    afterEndDrag,
    cardScrolledByDrag: afterCardDrag.cardScrollTop > before.cardScrollTop,
    pageUnchangedByCardDrag: afterCardDrag.pageScrollY === before.pageScrollY,
    pageScrolledAtCardEnd: afterEndDrag.pageScrollY > atCardEnd.pageScrollY,
    pageIsScrollable: before.pageMaxScroll > 0,
    horizontalOverflow: Math.max(before.docOverflowX, afterCardDrag.docOverflowX, afterEndDrag.docOverflowX),
  });
  await ctx.close();
}
await browser.close();
writeFileSync(join(here, "touch-scroll.json"), JSON.stringify({ rows }, null, 2) + "\n");
const failures = rows.filter((r) => !r.cardScrolledByDrag || !r.pageUnchangedByCardDrag || (r.pageIsScrollable && !r.pageScrolledAtCardEnd) || r.horizontalOverflow !== 0);
console.log(`touch scroll: ${rows.length} sizes, ${failures.length} failures`);
for (const r of rows) console.log(JSON.stringify({ width: r.width, cardScrolledByDrag: r.cardScrolledByDrag, pageUnchangedByCardDrag: r.pageUnchangedByCardDrag, pageScrolledAtCardEnd: r.pageScrolledAtCardEnd, pageIsScrollable: r.pageIsScrollable, horizontalOverflow: r.horizontalOverflow }));
if (failures.length > 0) process.exit(1);
