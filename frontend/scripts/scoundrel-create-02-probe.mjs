import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolveChromiumExecutable } from "../../conformance/scripts/lib/chromium-resolve.mjs";
const require = createRequire(new URL("../../conformance/package.json", import.meta.url));
const { chromium } = require("playwright-core");
const base = process.env.BASE_URL;
assert(base, "Use managed-browser-smoke.mjs with isolated temporary campaign data");
const out = process.env.SCOUNDREL_EVIDENCE_OUT ?? new URL("../../docs/public/evidence/scoundrel-create-02/", import.meta.url).pathname;
await mkdir(out, { recursive: true });
const game = await (await fetch(`${base}/api/games/blades-in-the-dark`)).json();
const playbook = game.Playbooks.find(value => value.Name === "Cutter");
assert(playbook);
const defaults = new Map(playbook.DefaultActionPoints.map(value => [value.Action, value.Points]));
const actions = game.Attributes.flatMap(attribute => attribute.Actions.map(action => ({ attribute: attribute.Name, ...action })));
const browser = await chromium.launch({ executablePath: resolveChromiumExecutable(), headless: true });
const entries = [], interactions = [];
async function character(id) {
  const response = await fetch(`${base}/api/characters/${id}`);
  assert.equal(response.status, 200);
  const result = await response.json();
  for (const attribute of result.talent.attributes) {
    assert.equal(attribute.rating, attribute.actions.filter(action => action.rating > 0).length, `${attribute.name}: computed rating`);
  }
  return result;
}
function total(c) { return c.talent.attributes.flatMap(attribute => attribute.actions).reduce((sum, action) => sum + action.rating, 0); }
try {
  for (const [width, height] of [[1440, 1000], [768, 1024], [390, 844]]) for (const theme of ["light", "dark", "high"]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: width === 390 });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(String(error)));
    await page.goto(`${base}/character/create`);
    await page.locator("#pc-playbook").waitFor();
    await page.locator(`.theme-controls button[data-theme="${theme === "dark" ? "dark" : "light"}"]`).click();
    const contrast = page.locator('.theme-controls button[title="Toggle high contrast"]');
    if ((await contrast.getAttribute("aria-pressed") === "true") !== (theme === "high")) await contrast.click();
    assert.equal(await page.locator(".pc-chargen-form .action-dot").count(), 0, "creation must not assign action dots");
    assert.equal(await page.locator(".pc-chargen-form [data-action-help]").count(), 0);
    await page.locator("#pc-playbook").selectOption(playbook.Name);
    async function capture(state, selector) {
      // Sheets re-render on every mutation; scroll via the DOM instead of a
      // locator action so a rerender between query and scroll cannot detach it.
      await page.waitForFunction(selector => Boolean(document.querySelector(selector)), selector);
      await page.evaluate(selector => document.querySelector(selector).scrollIntoView({ block: "start" }), selector);
      const numeric = await page.evaluate(selector => {
        const box = element => { const rect = element.getBoundingClientRect(), style = getComputedStyle(element); return { left: rect.left, right: rect.right, width: rect.width, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, overflowX: style.overflowX, minWidth: style.minWidth, display: style.display, fontSize: style.fontSize, lineHeight: style.lineHeight, color: style.color, backgroundColor: style.backgroundColor }; };
        const container = document.querySelector(selector);
        return { innerWidth, documentWidth: document.documentElement.scrollWidth, container: box(container), hints: [...container.querySelectorAll("[data-action-help]")].map(element => ({ action: element.dataset.actionHelp, ...box(element) })), headings: [...container.querySelectorAll("[data-attribute-rating]")].map(element => ({ attribute: element.dataset.attributeRating, text: element.textContent, ...box(element.closest("h3") ?? element) })), actionLabels: [...container.querySelectorAll(".action-name")].map(box) };
      }, selector);
      assert(numeric.documentWidth <= width, `${state}: document overflow`);
      assert(numeric.container.scrollWidth <= numeric.container.clientWidth + 1, `${state}: container overflow`);
      for (const hint of numeric.hints) {
        assert(hint.scrollWidth <= hint.clientWidth + 1, `${state}/${hint.action}: text overflow`);
        assert(hint.left >= -1 && hint.right <= width + 1, `${state}/${hint.action}: outside viewport`);
      }
      for (const heading of numeric.headings) assert(parseFloat(heading.fontSize) > parseFloat(numeric.actionLabels[0].fontSize), "attribute heading must be larger than action labels");
      const screenshot = `${width}-${theme}-${state}.png`;
      await page.screenshot({ path: `${out}/${screenshot}`, fullPage: true });
      entries.push({ width, height, theme, state, screenshot, ...numeric, errors: [...errors] });
      assert.deepEqual(errors, []);
    }
    await capture("creation", ".pc-chargen-form");
    const createResponse = page.waitForResponse(response => response.url().endsWith("/api/characters/pc") && response.request().method() === "POST");
    await page.locator('.pc-chargen-form button[type="submit"]').click();
    const created = await createResponse;
    assert.equal(created.status(), 200, await created.text());
    assert.equal(Object.hasOwn(created.request().postDataJSON(), "actionRatings"), false);
    const { character: initial } = await created.json(), id = initial.id;
    await page.waitForURL(new RegExp(`/character/${id}$`));
    await page.locator("[data-talent-allocation]").waitFor();
    let c = await character(id);
    assert.equal(c.talent.allocationPending, true);
    assert.equal(total(c), [...defaults.values()].reduce((sum, value) => sum + value, 0));
    assert.equal(Number(await page.locator("[data-talent-unspent]").textContent()), game.StartingActionDots - total(c));
    assert(await page.locator("[data-talent-allocation-complete]").isDisabled());
    for (const action of actions) {
      const hint = page.locator(`[data-action-help="${action.Name}"]`);
      assert.equal(await hint.textContent(), action.ShortDescription);
      await hint.evaluate(element => element.scrollIntoView({ block: "center" }));
      assert(await hint.isVisible(), `${action.Name}: help must not require hover`);
      if (defaults.has(action.Name)) assert.equal(await page.locator(`.talent-action-row[data-action="${action.Name}"] button.action-dot`).count(), 0, "default dots stay locked");
    }
    await capture("sheet-pending", '[data-section="talents"]');
    async function setAction(name, rating) {
      const response = page.waitForResponse(result => result.url().endsWith("/ops/action.set-rating") && result.request().method() === "POST");
      await page.locator(`.talent-action-row[data-action="${name}"] button[aria-label="${name} ${rating}"]`).click();
      const result = await response;
      assert.equal(result.status(), 200, await result.text());
      const body = await result.json();
      assert.equal(body.ok, true, JSON.stringify(body));
      await page.waitForFunction(({ name, rating }) => document.querySelector(`.talent-action-row[data-action="${name}"] [role="group"]`)?.getAttribute("aria-label")?.includes(`rating ${rating} of`), { name, rating });
      return character(id);
    }
    let remaining = game.StartingActionDots - total(c);
    for (const action of actions) {
      if (remaining === 0) break;
      if (defaults.has(action.Name)) continue;
      const value = Math.min(game.StartingActionDotMax, remaining);
      c = await setAction(action.Name, value);
      remaining = game.StartingActionDots - total(c);
      const attribute = c.talent.attributes.find(value => value.name === action.attribute);
      await page.waitForFunction(({ name, rating }) => document.querySelector(`[data-attribute-rating="${name}"]`)?.textContent?.includes(String(rating)), { name: attribute.name, rating: attribute.rating });
    }
    assert.equal(remaining, 0);
    await page.reload();
    await page.locator("[data-talent-allocation-complete]").waitFor();
    assert.equal((await character(id)).talent.allocationPending, true, "draft persists until explicitly completed");
    assert.equal(Number(await page.locator("[data-talent-unspent]").textContent()), 0);
    assert(await page.locator("[data-talent-allocation-complete]").isEnabled());
    const completedResponse = page.waitForResponse(response => response.url().endsWith("/ops/talent.allocation.complete"));
    await page.locator("[data-talent-allocation-complete]").click();
    const completed = await completedResponse;
    assert.equal(completed.status(), 200, await completed.text());
    assert.equal((await completed.json()).ok, true);
    await page.locator("[data-talent-allocation]").waitFor({ state: "detached" });
    c = await character(id);
    assert.equal(c.talent.allocationPending, false);
    for (const attribute of c.talent.attributes) assert.equal(attribute.rating, attribute.actions.filter(action => action.rating > 0).length);
    assert(await page.locator(`.talent-action-row[data-action="${playbook.DefaultActionPoints[0].Action}"] button.action-dot`).count() > 0, "default locks end with creation");
    // SCOUNDREL-CREATE-02 review fix: finishing allocation must show the
    // server's ordinary caps immediately, without a manual reload.
    const capabilities = await (await fetch(`${base}/api/characters/${id}/capabilities`)).json();
    const caps = new Map(capabilities.effectiveActionCaps.map(cap => [cap.action, cap.effectiveMax]));
    const renderedCaps = [];
    for (const action of actions) {
      const buttons = await page.locator(`.talent-action-row[data-action="${action.Name}"] button.action-dot`).count();
      assert.equal(buttons, caps.get(action.Name), `${action.Name}: rendered dots must match the server effective cap without a reload`);
      renderedCaps.push({ action: action.Name, rendered: buttons, effectiveMax: caps.get(action.Name) });
    }
    assert(renderedCaps.some(cap => cap.effectiveMax > game.StartingActionDotMax), "expected an ordinary cap above the creation cap after completion");
    await capture("sheet-complete", '[data-section="talents"]');
    interactions.push({ width, height, theme, id, total: total(c), pending: c.talent.allocationPending, attributes: c.talent.attributes.map(({ name, rating }) => ({ name, rating })), renderedCaps });
    await context.close();
  }
} finally {
  await writeFile(`${out}/numeric.json`, JSON.stringify({ entries, interactions }, null, 2) + "\n");
  await browser.close();
}
console.log(`PASS: ${entries.length} surface/viewport/theme cases; ${interactions.length} sheet-first allocation journeys`);
