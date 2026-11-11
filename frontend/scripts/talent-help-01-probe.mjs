import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolveChromiumExecutable } from "../../conformance/scripts/lib/chromium-resolve.mjs";
const require = createRequire(new URL("../../conformance/package.json", import.meta.url));
const { chromium } = require("playwright-core");
const base = process.env.BASE_URL;
assert(base, "Run through managed-browser-smoke.mjs; never use the default dev server");
const out = new URL("../../docs/public/evidence/talent-help-01/", import.meta.url).pathname;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: resolveChromiumExecutable(), headless: true });
const entries = [];
try {
  const game = await (await fetch(`${base}/api/games/blades-in-the-dark`)).json();
  const descriptions = game.Attributes.flatMap(attribute => attribute.Actions.map(action => ({ name: action.Name, description: action.ShortDescription })));
  const response = await fetch(`${base}/api/characters`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gameStem: "blades-in-the-dark", playbook: "Cutter" }) });
  assert.equal(response.status, 200);
  const { character } = await response.json();
  for (const [width, height] of [[1440, 1000], [768, 1024], [390, 844]]) {
    for (const theme of ["light", "dark", "high"]) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: width === 390 });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(String(error)));
      for (const [surface, route, selector] of [["creation", "/character/create", ".pc-chargen-form"], ["sheet", `/character/${character.id}`, '[data-section="talents"]']]) {
        await page.goto(`${base}${route}`);
        await page.locator(selector).waitFor();
        await page.locator(`.theme-controls button[data-theme="${theme === "dark" ? "dark" : "light"}"]`).click();
        const contrast = page.locator('.theme-controls button[title="Toggle high contrast"]');
        if ((await contrast.getAttribute("aria-pressed") === "true") !== (theme === "high")) await contrast.click();
        for (const { name, description } of descriptions) {
          const hint = page.locator(`${selector} [data-action-help="${name}"]`);
          assert.equal(await hint.textContent(), description);
          await hint.scrollIntoViewIfNeeded();
          assert(await hint.isVisible(), `${surface}/${name}: help not visible without hover`);
        }
        if (surface === "creation") {
          await page.locator("#pc-playbook").selectOption("Cutter");
          assert.equal(await page.locator('[data-action-help="Hunt"]').textContent(), descriptions.find(action => action.name === "Hunt").description);
        }
        await page.locator(selector).scrollIntoViewIfNeeded();
        const numeric = await page.evaluate(selector => {
          const box = element => {
            const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
            return { width: rect.width, left: rect.left, right: rect.right, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, overflowX: style.overflowX, minWidth: style.minWidth, display: style.display, flexWrap: style.flexWrap, color: style.color, backgroundColor: style.backgroundColor };
          };
          const container = document.querySelector(selector);
          return { innerWidth, documentWidth: document.documentElement.scrollWidth, container: box(container), hints: [...container.querySelectorAll("[data-action-help]")].map(element => ({ action: element.dataset.actionHelp, ...box(element) })) };
        }, selector);
        assert(numeric.documentWidth <= width, `${surface}: document overflow`);
        assert(numeric.container.scrollWidth <= numeric.container.clientWidth + 1, `${surface}: container overflow`);
        for (const hint of numeric.hints) {
          assert(hint.scrollWidth <= hint.clientWidth + 1, `${surface}/${hint.action}: hint overflow`);
          assert(hint.left >= -1 && hint.right <= width + 1, `${surface}/${hint.action}: hint outside viewport`);
        }
        const screenshot = `${width}-${theme}-${surface}.png`;
        await page.screenshot({ path: `${out}/${screenshot}`, fullPage: true });
        entries.push({ width, height, theme, surface, screenshot, ...numeric, errors: [...errors] });
        assert.deepEqual(errors, []);
      }
      await context.close();
    }
  }
} finally {
  await writeFile(`${out}/numeric.json`, JSON.stringify({ entries }, null, 2) + "\n");
  await browser.close();
}
console.log(`PASS: ${entries.length} surface/viewport/theme cases; all action help visible without hover, zero horizontal overflow`);
