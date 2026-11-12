#!/usr/bin/env node
// STALE-CLIENT-01: only run through managed-browser-smoke.mjs.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { resolveChromiumExecutable } from "./lib/chromium-resolve.mjs";

const baseUrl = process.env.BASE_URL;
assert(baseUrl && process.env.PITD_DATA_DIR, "Use the isolated managed browser launcher");
const evidence = resolve(import.meta.dirname, "../../docs/public/evidence/stale-client-01");
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ executablePath: await resolveChromiumExecutable(), headless: true, args: ["--no-sandbox"] });
const headline = "This page is out of date — refresh to load the latest version";
const records = [];
const errors = [];
try {
  const page = await browser.newPage();
  page.on("pageerror", error => errors.push(String(error)));
  const create = async (path, payload, key) => {
    const response = await fetch(`${baseUrl}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const text = await response.text();
    assert.equal(response.status, 200, text);
    return JSON.parse(text)[key];
  };
  const character = await create("/api/characters", { gameStem: "blades-in-the-dark", playbook: "Lurk" }, "character");
  const crew = await create("/api/crews", { gameStem: "blades-in-the-dark", crewType: "Smugglers" }, "crew");
  for (const [kind, entity, loaded] of [["character", character, ".character-detail"], ["crew", crew, ".crew-profile"]]) {
    const endpoint = `${baseUrl}/api/${kind === "character" ? "characters" : "crews"}/${entity.id}`;
    for (const [width, height] of [[1440, 1000], [768, 1024], [390, 844]]) {
      await page.setViewportSize({ width, height });
      for (const theme of ["light", "dark", "high"]) {
        await page.route(endpoint, route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...entity, futureSchemaField: true }) }));
        await page.goto(`${baseUrl}/${kind}/${entity.id}`);
        await page.getByRole("heading", { name: headline, exact: true }).waitFor();
        await page.locator(`.theme-controls button[data-theme="${theme === "dark" ? "dark" : "light"}"]`).click();
        const contrast = page.locator('button[title="Toggle high contrast"]');
        if (((await contrast.getAttribute("aria-pressed")) === "true") !== (theme === "high")) await contrast.click();
        assert(await page.getByRole("button", { name: "Reload", exact: true }).isVisible());
        assert(await page.getByRole("link", { name: "Back to roster", exact: true }).isVisible());
        const numeric = await page.evaluate(() => ({
          innerWidth: window.innerWidth,
          documentScrollWidth: document.documentElement.scrollWidth,
          theme: document.documentElement.getAttribute("data-theme"),
          contrast: document.documentElement.getAttribute("data-contrast"),
          containers: [".error-card", ".error-card-actions"].map(selector => {
            const element = document.querySelector(selector);
            const rect = element.getBoundingClientRect();
            const css = getComputedStyle(element);
            return { selector, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, left: rect.left, right: rect.right, width: rect.width, height: rect.height, overflowX: css.overflowX, minWidth: css.minWidth, display: css.display, grid: css.gridTemplateColumns, flex: css.flexDirection };
          }),
        }));
        assert.equal(numeric.theme, theme === "dark" ? "dark" : "light");
        assert.equal(numeric.contrast, theme === "high" ? "high" : null);
        assert(numeric.documentScrollWidth <= numeric.innerWidth, JSON.stringify(numeric));
        for (const container of numeric.containers) assert(container.scrollWidth <= container.clientWidth + 1, JSON.stringify(container));
        const key = `${kind}-${width}-${theme}`;
        await page.screenshot({ path: `${evidence}/${key}.png`, fullPage: true });
        await page.unroute(endpoint);
        // A new document, not a retry inside the old loaded JS, must recover.
        const navigation = page.waitForNavigation();
        await page.getByRole("button", { name: "Reload", exact: true }).click();
        await navigation;
        await page.locator(loaded).waitFor();
        assert.equal(await page.getByRole("heading", { name: headline, exact: true }).count(), 0);
        records.push({ key, width, height, theme, numeric, reloadRecovered: true });
      }
    }
  }
  assert.deepEqual(errors, []);
  await writeFile(`${evidence}/numeric.json`, JSON.stringify({ records, errors, passed: records.length }, null, 2) + "\n");
  console.log(`STALE-CLIENT-01 Chromium PASS ${records.length}/18; ${evidence}`);
} finally {
  await browser.close();
}
