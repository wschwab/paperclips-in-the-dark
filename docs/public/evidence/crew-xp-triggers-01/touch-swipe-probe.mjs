// CREW-XP-TRIGGERS-01 review fix probe: a touch swipe over the Resolution Crew XP card must scroll the card.
// Seeds the same Crew XP step as probe.mjs, then at 390x844 (touch enabled) swipes upward over the card with CDP
// touch events three times and records the card's scrollTop and whether the underlying page scrolled.
// Run under the managed launcher (BASE_URL).
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../../..");
const { resolveChromiumExecutable } = await import(pathToFileURL(join(repo, "conformance/scripts/lib/chromium-resolve.mjs")).href);
const { chromium } = await import(pathToFileURL(join(repo, "conformance/node_modules/playwright-core/index.mjs")).href);
const base = process.env.BASE_URL;
const j = (r) => r.json();
const post = (p, b, h = {}) => fetch(new URL(p, base), { method: "POST", headers: { "content-type": "application/json", ...h }, body: JSON.stringify(b) }).then(j);
const getJson = (p) => fetch(new URL(p, base)).then(j);

const c = (await post("/api/characters", { gameStem: "blades-in-the-dark", playbook: "Cutter" })).character;
const crew = (await post("/api/crews", { gameStem: "blades-in-the-dark", crewType: "Assassins" })).crew;
const rev = async () => (await getJson(`/api/characters/${c.id}`)).revision;
const linked = await post(`/api/characters/${c.id}/ops/dossier.update`, { crewId: crew.id }, { "If-Match": String(await rev()) });
if (!linked.ok) throw new Error(`link failed ${JSON.stringify(linked.error)}`);
const m = await post(`/api/characters/${c.id}/ops/mode.set`, { mode: "score" }, { "If-Match": String(await rev()) });
if (!m.ok) throw new Error(`mode failed ${JSON.stringify(m.error)}`);
const f = await post(`/api/characters/${c.id}/ops/mode.flow.set`, { kind: "resolution", step: "crew-xp" }, { "If-Match": String(await rev()) });
if (!f.ok) throw new Error(`flow failed ${JSON.stringify(f.error)}`);

const browser = await chromium.launch({ executablePath: resolveChromiumExecutable(), headless: true, ...(process.getuid?.() === 0 ? { args: ["--no-sandbox"] } : {}) });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
await p.goto(new URL(`/character/${c.id}`, base).href);
await p.waitForSelector(".game-mode-resolution");
await p.waitForFunction(() => document.querySelectorAll(".game-mode-resolution li").length >= 4, null, { timeout: 15000 }).catch(() => {});
const cdp = await ctx.newCDPSession(p);
const box = await p.locator(".game-mode-resolution .game-mode-popup-card").boundingBox();
const x = box.x + box.width / 2;
const state = () => p.evaluate(() => ({
  card: document.querySelector(".game-mode-resolution .game-mode-popup-card").scrollTop,
  page: window.scrollY,
}));
const before = await state();
const swipes = [];
for (let i = 0; i < 3; i++) {
  const startY = box.y + box.height - 40;
  const endY = box.y + 40;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: startY }] });
  for (let s = 1; s <= 10; s++) {
    const y = startY + ((endY - startY) * s) / 10;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await p.waitForTimeout(400);
  swipes.push(await state());
}
const lastLiTop = await p.evaluate(() => {
  const lis = [...document.querySelectorAll(".game-mode-resolution li")];
  const last = lis[lis.length - 1];
  return last ? Math.round(last.getBoundingClientRect().bottom) : null;
});
const result = {
  before,
  swipes,
  cardScrolledAfterTouch: swipes.at(-1).card > before.card,
  pageScrolledAfterTouch: swipes.at(-1).page > before.page,
  lastTriggerBottomAfterSwipes: lastLiTop,
  viewportHeight: 844,
};
await browser.close();
writeFileSync(join(here, "touch-swipe.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result));
