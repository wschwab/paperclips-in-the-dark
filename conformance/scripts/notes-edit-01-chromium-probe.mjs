import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = process.env.BASE_URL;
assert(base, 'managed launcher BASE_URL required');
const out = process.env.EVIDENCE_OUT;
assert(out, 'EVIDENCE_OUT required');
await mkdir(out, { recursive: true });

const viewports = [
  { name: '1440x1000', width: 1440, height: 1000 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '390x844', width: 390, height: 844 },
];
const themes = [
  { name: 'light', theme: 'light', contrast: false },
  { name: 'dark', theme: 'dark', contrast: false },
  { name: 'high-contrast', theme: 'light', contrast: true },
];

async function api(path, body, revision) {
  const r = await fetch(`${base}/api/${path}`, body === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(revision === undefined ? {} : { 'If-Match': String(revision) }) },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function setTheme(page, theme) {
  await page.locator(`.theme-controls button[data-theme="${theme.theme}"]`).click();
  const high = await page.evaluate(() => document.documentElement.getAttribute('data-contrast') === 'high');
  if (high !== theme.contrast) await page.locator('button[title="Toggle high contrast"]').click();
}

async function assertTouchTarget(locator, label) {
  const box = await locator.boundingBox();
  assert(box, `${label} has no box`);
  assert(box.width >= 44 && box.height >= 44, `${label} is ${box.width}x${box.height}, need >= 44x44`);
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true });
try {
  let c = (await api('characters', { gameStem: 'blades-in-the-dark', playbook: 'Hound' })).character;
  c = (await api(`characters/${c.id}/ops/note.add`, { text: 'First note' }, c.revision)).character;
  c = (await api(`characters/${c.id}/ops/note.add`, { text: 'Second note' }, c.revision)).character;
  let crew = (await api('crews', { gameStem: 'blades-in-the-dark', crewType: 'Assassins' })).crew;
  crew = (await api(`crews/${crew.id}/ops/note.add`, { text: 'First note' }, crew.revision)).crew;
  crew = (await api(`crews/${crew.id}/ops/note.add`, { text: 'Second note' }, crew.revision)).crew;

  for (const vp of viewports) {
    for (const theme of themes) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));

      await page.goto(`${base}/character/${c.id}`);
      await page.locator('.character-notes').waitFor();
      await setTheme(page, theme);
      const tag = `${vp.name}-${theme.name}`;
      await page.locator('button[title="Edit note 2"]').click();
      const area = page.locator('.character-notes textarea[aria-label="Edit note 2"]');
      await area.waitFor();
      await area.fill('Edited second note');
      await assertTouchTarget(page.locator('button[title="Save note 2"]'), `character Save ${tag}`);
      await assertTouchTarget(page.locator('button[title="Cancel note 2 edit"]'), `character Cancel ${tag}`);
      await page.screenshot({ path: `${out}/character-edit-${tag}.png`, fullPage: true });
      await page.locator('button[title="Save note 2"]').click();
      await page.locator('.character-notes', { hasText: 'Edited second note' }).waitFor();
      await assertTouchTarget(page.locator('button[title="Edit note 2"]'), `character Edit ${tag}`);
      await page.screenshot({ path: `${out}/character-saved-${tag}.png`, fullPage: true });

      await page.goto(`${base}/crew/${crew.id}`);
      await page.locator('.crew-notes').waitFor();
      await setTheme(page, theme);
      await assertTouchTarget(page.locator('button[title="Edit note 1"]'), `crew Edit ${tag}`);
      await page.locator('button[title="Edit note 1"]').click();
      await page.locator('.crew-notes textarea[aria-label="Edit note 1"]').waitFor();
      await page.locator('.crew-notes textarea[aria-label="Edit note 1"]').fill('Edited crew note');
      await assertTouchTarget(page.locator('button[title="Save note 1"]'), `crew Save ${tag}`);
      await page.screenshot({ path: `${out}/crew-edit-${tag}.png`, fullPage: true });
      await assertTouchTarget(page.locator('button[title="Cancel note 1 edit"]'), `crew Cancel ${tag}`);
      await page.locator('button[title="Cancel note 1 edit"]').click();
      await page.locator('.crew-notes textarea[aria-label="Edit note 1"]').waitFor({ state: 'detached' });
      await page.screenshot({ path: `${out}/crew-cancelled-${tag}.png`, fullPage: true });

      assert.equal(errors.length, 0, errors.join('\n'));
      await context.close();
    }
  }
  console.log(JSON.stringify({ ok: true, viewports: viewports.length, themes: themes.length }));
} finally {
  await browser.close();
}
