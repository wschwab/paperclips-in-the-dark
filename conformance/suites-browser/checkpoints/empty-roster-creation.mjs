// UI-CREATE-01: additive checkpoint, run independently with the managed
// launcher because BROWSER-02 deliberately freezes exactly six journeys.
// No seed and no data-directory writes: an empty campaign is a prerequisite.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runRouteThemeMatrix } from '../lib.mjs';

export const id = 'empty-roster-creation';
export const checkpoints = [
  { id: 'empty-roster', description: 'both collections start empty' },
  { id: 'empty-create-pc', description: 'visible scoundrel action invokes validated PC creation and lands on its sheet' },
  { id: 'empty-create-crew', description: 'visible crew action creates the first crew and lands on its sheet' },
  { id: 'populated-create-character', description: 'scoundrel action still reaches unvalidated creation on a populated roster' },
  { id: 'populated-create-crew', description: 'crew creation remains reachable on a populated roster' },
  { id: 'created-on-roster', description: 'all four created entities have visible roster links' },
  { id: 'creation-matrix', description: 'eight affected surfaces contain at all nine viewport/theme combinations with scoundrel UI wording' },
];

export async function run(page, ctx) {
  const roster = await (await page.request.get(ctx.baseUrl + '/api/campaign/roster')).json();
  assert.equal(roster.characters.length, 0, 'requires isolated empty character roster');
  assert.equal(roster.crews.length, 0, 'requires isolated empty crew roster');
  ctx.checkpoint('empty-roster', 1);
  const posts = [];
  const count = request => {
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && ['/api/characters', '/api/characters/pc', '/api/crews'].includes(path)) posts.push(path);
  };
  page.on('request', count);
  const matrix = (key, path, waitFor, landmarks) =>
    runRouteThemeMatrix(page, ctx, id, [{ key, path, waitFor, landmarks }]);
  let matrixEntries = await matrix('empty-roster', '/roster', '.roster', ['.roster', '.roster-characters', '.roster-crews', '.roster-heading-row', '.roster-create']);
  await ctx.goto('/roster');
  await page.locator('.roster').waitFor();
  for (const pager of await page.locator('.roster-more').all()) assert.equal(await pager.isVisible(), false, 'hidden pager must not render a blank button');
  await page.getByRole('link', { name: 'Create scoundrel', exact: true }).click();
  await page.locator('.pc-chargen-form').waitFor();
  matrixEntries.push(...await matrix('character-create', '/character/create', '.pc-chargen-form', ['.character-create', '.pc-chargen-form']));
  await page.locator('#pc-playbook').selectOption({ index: 1 });
  // Increment one unlocked action dot at a time, using rendered settings-
  // derived controls rather than embedding a game budget or action cap.
  while (Number(await page.locator('[data-chargen-unspent]').textContent()) > 0) {
    const next = page.locator('.chargen-dots button:not(:disabled)[aria-pressed="false"]').first();
    assert.equal(await next.count(), 1, 'remaining budget needs an unlocked action dot');
    await next.click();
  }
  await Promise.all([page.waitForURL(/\/character\/[0-9a-f-]{36}$/), page.locator('.pc-chargen-form button[type="submit"]').click()]);
  const pcPath = new URL(page.url()).pathname;
  await page.locator('.character-detail').waitFor();
  assert.deepEqual(posts, ['/api/characters/pc']);
  ctx.checkpoint('empty-create-pc', 1);

  await ctx.goto('/roster');
  await page.getByRole('link', { name: 'Create crew', exact: true }).click();
  await page.locator('.crew-create-form').waitFor();
  matrixEntries.push(...await matrix('crew-create', '/crew/create', '.crew-create-form', ['.crew-create', '.crew-create-form']));
  await page.locator('#crewType').selectOption({ index: 1 });
  await page.locator('#name').fill('First Lanterns');
  await Promise.all([page.waitForURL(/\/crew\/[0-9a-f-]{36}$/), page.locator('.crew-create-form button[type="submit"]').click()]);
  const crewPath = new URL(page.url()).pathname;
  await page.locator('.crew-detail').waitFor();
  assert.equal(posts.filter(p => p === '/api/crews').length, 1);
  ctx.checkpoint('empty-create-crew', 1);

  await ctx.goto('/roster');
  await page.getByRole('link', { name: 'Create scoundrel', exact: true }).click();
  await page.locator('details.create-unvalidated summary').click();
  await page.locator('#playbook').selectOption({ index: 1 });
  await page.locator('#name').fill('Second Sable');
  await Promise.all([page.waitForURL(/\/character\/[0-9a-f-]{36}$/), page.locator('.character-create-form button[type="submit"]').click()]);
  const characterPath = new URL(page.url()).pathname;
  await page.locator('.character-detail').waitFor();
  assert.equal(posts.filter(p => p === '/api/characters').length, 1);
  ctx.checkpoint('populated-create-character', 1);
  await ctx.goto('/roster');
  await page.getByRole('link', { name: 'Create crew', exact: true }).click();
  await page.locator('#crewType').selectOption({ index: 1 });
  await page.locator('#name').fill('Second Lanterns');
  await Promise.all([page.waitForURL(/\/crew\/[0-9a-f-]{36}$/), page.locator('.crew-create-form button[type="submit"]').click()]);
  const secondCrewPath = new URL(page.url()).pathname;
  await page.locator('.crew-detail').waitFor();
  assert.equal(posts.filter(p => p === '/api/crews').length, 2);
  ctx.checkpoint('populated-create-crew', 1);
  await ctx.goto('/roster');
  for (const path of [pcPath, crewPath, characterPath, secondCrewPath]) {
    await page.locator(`.roster li a[href="${path}"]`).waitFor({ state: 'visible' });
  }
  ctx.checkpoint('created-on-roster', 4);
  matrixEntries.push(...await matrix('populated-roster', '/roster', '.roster', ['.roster', '.roster-characters', '.roster-crews', '.roster-heading-row', '.roster-create']));
  matrixEntries.push(...await matrix('scoundrel-detail', pcPath, '.character-detail', ['.character-detail', '[data-section="stress"]', '[data-section="talents"]', '[data-section="high-impact"]']));
  matrixEntries.push(...await matrix('scoundrel-history', pcPath + '/history', '.character-history', ['.character-history']));
  matrixEntries.push(...await matrix('scoundrel-import', pcPath + '/import', '.import-page', ['.import-root', '.import-page']));
  matrixEntries.push(...await matrix('crew-detail', crewPath, '.crew-detail', ['.crew-detail']));
  ctx.checkpoint('creation-matrix', matrixEntries.length);
  page.off('request', count);
  return { posts, createdPaths: [pcPath, crewPath, characterPath, secondCrewPath], matrixEntries };
}

// Direct managed invocation is also a reproducible review/evidence entrypoint.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { chromium } = await import('playwright-core');
  const { resolveChromiumExecutable } = await import('../../scripts/lib/chromium-resolve.mjs');
  const artifactsDir = process.env.PITD_BROWSER_ARTIFACTS;
  assert.ok(artifactsDir, 'PITD_BROWSER_ARTIFACTS is required');
  assert.ok(process.env.BASE_URL, 'use managed-browser-smoke.mjs, never default campaign data');
  await mkdir(join(artifactsDir, 'screenshots'), { recursive: true });
  const browser = await chromium.launch({ executablePath: resolveChromiumExecutable(), headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const recorded = [];
  const errors = [];
  let faviconSuppressed = 0;
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    // Match and count exactly the incumbent BROWSER-02 chrome-noise policy.
    if (message.text().includes('Failed to load resource') &&
        message.location()?.url === new URL('/favicon.ico', process.env.BASE_URL).href) {
      faviconSuppressed++;
      return;
    }
    errors.push(message.text());
  });
  const ctx = {
    baseUrl: process.env.BASE_URL,
    goto: async path => { await page.goto(process.env.BASE_URL + path); },
    checkpoint: (id, value) => recorded.push({ id, value }),
    screenshot: async key => {
      const path = join(artifactsDir, 'screenshots', key + '.png');
      await page.screenshot({ path, fullPage: true });
      const containers = await page.evaluate(() => [...document.querySelectorAll('.roster,.roster-characters,.roster-crews,.roster-heading-row,.roster-create,.pc-chargen-form,.crew-create-form,.character-detail,.character-history,.import-page,.crew-detail')].map(el => {
        const b = el.getBoundingClientRect(); const s = getComputedStyle(el);
        return { selector: el.className, clientWidth: el.clientWidth, scrollWidth: el.scrollWidth, rect: { x: b.x, y: b.y, width: b.width, height: b.height }, display: s.display, overflowX: s.overflowX, minWidth: s.minWidth, flexWrap: s.flexWrap, color: s.color, background: s.backgroundColor, outlineColor: s.outlineColor };
      }));
      const wording = await page.evaluate(() => {
        const oldNoun = /\bcharacters?\b/i;
        const text = [...document.querySelectorAll('h1,h2,h3,button,summary,label,.empty,.notice,.roster-status,.character-high-impact')]
          .map(el => el.textContent?.trim()).filter(value => value && oldNoun.test(value));
        const attributes = [...document.querySelectorAll('[aria-label],[title],[placeholder]')]
          .flatMap(el => ['aria-label', 'title', 'placeholder'].map(key => el.getAttribute(key)))
          .filter(value => value && oldNoun.test(value));
        return { documentTitle: document.title, text, attributes };
      });
      assert.deepEqual(wording.text, [], 'app-owned surface wording must use scoundrel');
      assert.deepEqual(wording.attributes, [], 'accessible surface wording must use scoundrel');
      assert.equal(/\bcharacters?\b/i.test(wording.documentTitle), false, 'document titles must use scoundrel');
      for (const box of containers) assert.ok(box.scrollWidth <= box.clientWidth + 1, `container overflow: ${box.selector}`);
      const focus = [];
      const actionCount = await page.locator('.roster-create').count();
      for (let step = 0; step < 40 && focus.length < actionCount; step++) {
        await page.keyboard.press('Tab');
        const active = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el?.matches('.roster-create')) return null;
          const s = getComputedStyle(el); const b = el.getBoundingClientRect();
          const bandBackground = getComputedStyle(el.closest('.torn-foot')).backgroundColor;
          const luminance = color => {
            const channels = color.match(/[0-9.]+/g).slice(0, 3).map(Number).map(value => {
              value /= 255;
              return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
            });
            return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
          };
          const foreground = luminance(s.outlineColor);
          const background = luminance(bandBackground);
          const focusContrast = (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
          return { name: el.textContent, focusVisible: el.matches(':focus-visible'), outlineWidth: s.outlineWidth, outlineColor: s.outlineColor, bandBackground, focusContrast, width: b.width, height: b.height };
        });
        if (active && !focus.some(item => item.name === active.name)) {
          assert.equal(active.focusVisible, true);
          assert.ok(parseFloat(active.outlineWidth) > 0, 'creation action needs visible keyboard focus');
          assert.ok(active.focusContrast >= 3, 'creation focus ring must contrast with its band');
          assert.ok(active.width >= 44 && active.height >= 44, 'creation action needs a usable touch target');
          focus.push(active);
          await page.screenshot({ path: join(artifactsDir, 'screenshots', key + '-focus-' + focus.length + '.png'), fullPage: true });
        }
      }
      assert.equal(focus.length, actionCount, 'both creation actions must be keyboard reachable');
      await writeFile(join(artifactsDir, 'screenshots', key + '-containment.json'), JSON.stringify({ containers, focus, wording }, null, 2));
      return path;
    },
  };
  try {
    const result = await run(page, ctx);
    assert.deepEqual(errors, []);
    assert.deepEqual(recorded.map(c => c.id).sort(), checkpoints.map(c => c.id).sort());
    await writeFile(join(artifactsDir, 'creation-results.json'), JSON.stringify({ passed: true, baseUrl: ctx.baseUrl, dataDir: process.env.PITD_DATA_DIR, checkpoints: recorded, errors, faviconSuppressed, ...result }, null, 2));
    console.log('UI-CREATE-01 PASS: empty and populated creation, declared endpoints, 72 matrix entries and scoundrel wording');
  } catch (error) {
    await writeFile(join(artifactsDir, 'creation-results.json'), JSON.stringify({ passed: false, baseUrl: ctx.baseUrl, dataDir: process.env.PITD_DATA_DIR, checkpoints: recorded, errors, faviconSuppressed, failure: String(error) }, null, 2));
    throw error;
  } finally { await browser.close(); }
}
