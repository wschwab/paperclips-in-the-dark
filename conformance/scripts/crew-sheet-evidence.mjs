#!/usr/bin/env node
// CREW-SHEET-02: run under managed-browser-smoke.mjs, never a user server.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { resolveChromiumExecutable } from "./lib/chromium-resolve.mjs";

const baseUrl = process.env.BASE_URL;
assert(baseUrl && process.env.PITD_DATA_DIR, "Use the managed browser launcher");
const evidence = resolve(import.meta.dirname, "../../docs/public/evidence/crew-sheet-02");
await mkdir(evidence, { recursive: true });
const executablePath = await resolveChromiumExecutable();
const browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
const records = [];
const errors = [];
try {
  const page = await browser.newPage();
  page.on("pageerror", (error) => errors.push(String(error)));
  for (const crewTypeName of ["Assassins", "Smugglers"]) {
    const response = await fetch(`${baseUrl}/api/crews`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gameStem: "blades-in-the-dark", crewType: crewTypeName }) });
    const body = await response.text();
    assert.equal(response.status, 200, body);
    const { crew } = JSON.parse(body);
    assert.equal(crew.crewTypeName, crewTypeName, JSON.stringify(crew.crewTypeName));
    for (const [width, height] of [[1440, 1000], [768, 1024], [390, 844]]) {
      await page.setViewportSize({ width, height });
      for (const theme of ["light", "dark", "high"]) {
        await page.goto(`${baseUrl}/crew/${crew.id}`);
        await page.locator(".crew-profile").waitFor();
        await page.locator(`.theme-controls button[data-theme="${theme === "dark" ? "dark" : "light"}"]`).click();
        const contrast = page.locator('button[title="Toggle high contrast"]');
        if ((await contrast.getAttribute("aria-pressed") === "true") !== (theme === "high")) await contrast.click();
        const applied = await page.evaluate(() => ({
          theme: document.documentElement.getAttribute("data-theme"),
          contrast: document.documentElement.getAttribute("data-contrast"),
        }));
        assert.deepEqual(applied, { theme: theme === "dark" ? "dark" : "light", contrast: theme === "high" ? "high" : null });
        const cargo = crewTypeName === "Smugglers";
        const label = cargo ? "Cargo type" : "Favored operation";
        await page.locator(`button[title="Edit ${label}"]`).click();
        const field = page.getByLabel(label, { exact: true });
        if (cargo) await field.fill("Fine cloth and rare books");
        else await field.selectOption({ index: 1 });
        const chosen = await field.inputValue();
        const measure = () => {
          const selectors = [".crew-profile", ".crew-upgrades", ".lair-chart", ".crew-contacts-factions", ".field-editing", ".chart-row"];
          return {
            innerWidth: window.innerWidth, documentScrollWidth: document.documentElement.scrollWidth,
            containers: selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)).map((element) => {
              const rect = element.getBoundingClientRect();
              const css = getComputedStyle(element);
              return { selector, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, left: rect.left, right: rect.right, top: rect.top, width: rect.width, height: rect.height, overflowX: css.overflowX, minWidth: css.minWidth, display: css.display, grid: css.gridTemplateColumns, flex: css.flexDirection };
            })),
          };
        };
        const editingNumeric = await page.evaluate(measure);
        assert(editingNumeric.documentScrollWidth <= editingNumeric.innerWidth, JSON.stringify(editingNumeric));
        for (const container of editingNumeric.containers) assert(container.scrollWidth <= container.clientWidth + 1, JSON.stringify(container));
        const editingField = editingNumeric.containers.find((c) => c.selector === ".field-editing");
        assert(editingField, `editing container missing in ${crewTypeName}/${width}/${theme}`);
        await page.locator(`.field-editing[data-focus-key="profile-favoredOperation"]`).screenshot({ path: `${evidence}/${crewTypeName.toLowerCase()}-${width}-${theme}-editing.png` });
        await page.locator('.field-editing button[title="Save"]').click();
        await page.locator(`[data-focus-key="profile-favoredOperation"] .field-value`).filter({ hasText: chosen }).waitFor();
        await page.reload();
        await page.locator(".crew-profile").waitFor();
        assert.equal(await page.locator('[data-focus-key="profile-favoredOperation"] .field-value').textContent(), chosen);
        assert(await page.locator(".crew-starting-upgrades").isVisible());
        assert.equal(await page.locator('select[aria-label="Stock crew contact"]').count(), 0);
        assert(await page.getByLabel("Contact name", { exact: true }).isVisible());
        const rows = await page.locator(".chart-row").count();
        assert(rows > 0);
        assert.equal(await page.locator(".chart-row .upgrade-description").count(), rows);
        if (cargo) assert(await page.locator('.chart-row[data-upgrade="Vehicle"]').isVisible());
        const numeric = await page.evaluate(measure);
        assert(numeric.documentScrollWidth <= numeric.innerWidth, JSON.stringify(numeric));
        for (const container of numeric.containers) assert(container.scrollWidth <= container.clientWidth + 1, JSON.stringify(container));
        const key = `${crewTypeName.toLowerCase()}-${width}-${theme}`;
        for (const [surface, selector] of [["profile", ".crew-profile"], ["upgrades", ".lair-chart"], ["contacts", ".crew-contacts-factions"]]) {
          await page.locator(selector).scrollIntoViewIfNeeded();
          await page.locator(selector).screenshot({ path: `${evidence}/${key}-${surface}.png` });
        }
        records.push({ key, width, height, theme, chosen, upgradeRows: rows, numeric, editingNumeric });
      }
    }
  }
  assert.deepEqual(errors, []);
  await writeFile(`${evidence}/numeric.json`, JSON.stringify({ records, errors, passed: records.length }, null, 2) + "\n");
  console.log(`CREW-SHEET-02 Chromium PASS ${records.length}/18; ${evidence}`);
} finally {
  await browser.close();
}
