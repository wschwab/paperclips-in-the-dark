// CREW-XP-TRIGGERS-01 probe: Resolution → Crew XP step. Does each SRD trigger render inside the visible card,
// and can a mouse wheel scroll the card to reach the lower triggers? Run under the managed launcher.
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

const seed = async () => {
  const c = (await post("/api/characters", { gameStem: "blades-in-the-dark", playbook: "Cutter" })).character;
  const crew = (await post("/api/crews", { gameStem: "blades-in-the-dark", crewType: "Assassins" })).crew;
  const rev = async () => (await getJson(`/api/characters/${c.id}`)).revision;
  const linked = await post(`/api/characters/${c.id}/ops/dossier.update`, { crewId: crew.id }, { "If-Match": String(await rev()) });
  if (!linked.ok) throw new Error(`link failed ${JSON.stringify(linked.error)}`);
  const m = await post(`/api/characters/${c.id}/ops/mode.set`, { mode: "score" }, { "If-Match": String(await rev()) });
  if (!m.ok) throw new Error(`mode failed ${JSON.stringify(m.error)}`);
  const f = await post(`/api/characters/${c.id}/ops/mode.flow.set`, { kind: "resolution", step: "crew-xp" }, { "If-Match": String(await rev()) });
  if (!f.ok) throw new Error(`flow failed ${JSON.stringify(f.error)}`);
  return { characterId: c.id };
};

const seeded = await seed();
const browser = await chromium.launch({ executablePath: resolveChromiumExecutable(), headless: true, ...(process.getuid?.() === 0 ? { args: ["--no-sandbox"] } : {}) });
const rows = [];
for (const [width, height] of [[1440, 1000], [768, 1024], [390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const p = await ctx.newPage();
  await p.goto(new URL(`/character/${seeded.characterId}`, base).href);
  await p.waitForSelector(".game-mode-resolution");
  await p.waitForFunction(() => document.querySelectorAll(".game-mode-resolution li").length >= 4, null, { timeout: 15000 }).catch(() => {});
  const info = await p.evaluate(() => {
    const card = document.querySelector(".game-mode-resolution .game-mode-popup-card");
    const cs = getComputedStyle(card);
    const cardRect = card.getBoundingClientRect();
    const lis = [...document.querySelectorAll(".game-mode-resolution li")].filter((li) => li.textContent.includes("crew") || li.querySelector("strong"));
    const visible = lis.map((li) => {
      const r = li.getBoundingClientRect();
      return { title: li.querySelector("strong")?.textContent ?? "", inCard: r.top >= cardRect.top && r.bottom <= cardRect.bottom + 1 };
    });
    const heading = [...document.querySelectorAll(".game-mode-resolution h3")].find((h) => h.textContent.includes("Crew XP triggers"));
    const headingTop = heading ? Math.round(heading.getBoundingClientRect().top - cardRect.top) : null;
    const firstTop = lis.length ? Math.round(lis[0].getBoundingClientRect().top - cardRect.top) : null;
    return { pointerEvents: cs.pointerEvents, overflowY: cs.overflowY, cardClient: card.clientHeight, cardScroll: card.scrollHeight, headingTop, firstTop, visible };
  });
  // Wheel over the card's upper area: does the card scroll?
  const box = await p.locator(".game-mode-resolution .game-mode-popup-card").boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + 40);
  const before = await p.evaluate(() => document.querySelector(".game-mode-resolution .game-mode-popup-card").scrollTop);
  await p.mouse.wheel(0, 600);
  await p.waitForTimeout(300);
  const after = await p.evaluate(() => document.querySelector(".game-mode-resolution .game-mode-popup-card").scrollTop);
  const screenshot = join(here, `resolution-crew-xp-${width}.png`);
  await p.screenshot({ path: screenshot, animations: "disabled" });
  rows.push({ width, height, ...info, wheelBefore: before, wheelAfter: after, wheelScrolls: after > before });
  await ctx.close();
}
await browser.close();
writeFileSync(join(here, "probe.json"), JSON.stringify(rows, null, 2) + "\n");
console.log(JSON.stringify(rows.map((r) => ({ w: r.width, pe: r.pointerEvents, cardClient: r.cardClient, cardScroll: r.cardScroll, wheel: r.wheelScrolls, visible: r.visible }))));
