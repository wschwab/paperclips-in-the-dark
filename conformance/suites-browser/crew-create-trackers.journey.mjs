// crew-create-trackers — BROWSER-02 top-level journey 3/6 (spec §16 AR-005).
//
// Crew creation through the real /crew/create form, member link (a character
// joins via the sheet's Crew membership control), Rep/Turf trackers, Tier +
// funds (coin/hold), the server-side tier clamp notice (P29/FV-029), undo +
// history entry points, and persistence across reload. The claim, cohort,
// and advancement sub-flows run as their own crews via the kept
// sub-checkpoint modules. Closes with the crew-detail matrix.
//
// Sub-checkpoint modules:
//   checkpoints/crew01-cohort-add.mjs  cohort conditional fields + add
//   checkpoints/crew02-claims.mjs      two claim acquisitions + removal
//   checkpoints/crew04-advance.mjs     ability/upgrade safety + edit mode

import * as crew01 from "./checkpoints/crew01-cohort-add.mjs";
import * as crew02 from "./checkpoints/crew02-claims.mjs";
import * as crew04 from "./checkpoints/crew04-advance.mjs";
import {
  composeCtx,
  runRouteThemeMatrix,
  unionCheckpoints,
  unionNoise,
} from "./lib.mjs";

export const id = "crew-create-trackers";

export const expectedConsoleNoise = unionNoise(
  crew01.expectedConsoleNoise,
  crew02.expectedConsoleNoise,
  crew04.expectedConsoleNoise,
);

export const checkpoints = unionCheckpoints(
  crew01.checkpoints,
  crew02.checkpoints,
  crew04.checkpoints,
  [
    { id: "crew-ui-create-navigated", description: "the /crew/create form navigated to the created crew sheet" },
    { id: "member-linked", description: "a character joined the crew (memberCount 1 on the crew)" },
    { id: "rep-turf-bumped", description: "rep and turf each accepted a +1 through their controls" },
    { id: "tier-funds-set", description: "tier +1, coin +1, hold Strong all committed" },
    { id: "tier-clamp-notice", description: "tier above the cap shows the clamped-to notice" },
    { id: "crew-undo-restored", description: "Undo last change restored the prior tracker value" },
    { id: "crew-history-page", description: "/crew/{id}/history renders the history page" },
    { id: "crew-reload-persisted", description: "tracker values survive a real reload" },
    { id: "matrix-entries", description: "crew-detail matrix entries exercised (9 expected)" },
  ],
);

const api = async (baseUrl, path, init) => {
  const response = await fetch(`${baseUrl}/api/${path}`, init);
  return { status: response.status, text: await response.text() };
};

/** GET /api/crews/{id} resolves to the raw crew DTO (not wrapped). */
async function crewState(page, baseUrl, crewId) {
  return page.evaluate(async (url) => {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    return res.json();
  }, new URL(`/api/crews/${crewId}`, baseUrl).href);
}

/** memberCount lives on the roster summary rows (GET /api/crews). The
 * payload is a source-string evaluate (browser-suite convention: payloads
 * are evaluated as expressions and closures do not cross the browser
 * boundary), so crewId is baked into the source. */
async function crewMemberCount(page, crewId) {
  return page.evaluate(`(async () => {
    const list = await (await fetch("/api/crews", { headers: { Accept: "application/json" } })).json();
    return list.find((c) => c.id === ${JSON.stringify(crewId)})?.memberCount ?? null;
  })()`);
}

export async function run(page, ctx) {
  const { baseUrl } = ctx;
  const wrapped = composeCtx(ctx);

  // -- 1. Create through the real form ---------------------------------------
  await ctx.goto("/crew/create");
  await page.locator(".crew-create-form").waitFor({ state: "visible", timeout: 15_000 });
  await page.locator("#name").fill("Ironworks Crew");
  await page.locator("#crewType").selectOption("Bravos");
  await Promise.all([
    page.waitForURL(/\/crew\/[0-9a-f-]{36}$/, { timeout: 15_000 }),
    page.locator('.crew-create-form button[type="submit"]').click(),
  ]);
  ctx.checkpoint("crew-ui-create-navigated", 1);
  const crewPath = new URL(page.url()).pathname;
  const crewId = crewPath.split("/")[2];

  // -- 2. Rep / Turf / Tier / funds / hold ------------------------------------
  await page.locator(".crew-rep").waitFor({ state: "visible", timeout: 10_000 });
  await page.locator('button[title="Add 1 rep"]').click();
  await page
    .locator('.crew-rep button[aria-pressed="true"]')
    .first()
    .waitFor({ state: "visible", timeout: 10_000 });
  await page.locator('button[title="Add 1 turf"]').click();
  await page
    .locator('.turf-track .turf-slot[data-stress="1"]')
    .first()
    .waitFor({ state: "visible", timeout: 10_000 });
  ctx.checkpoint("rep-turf-bumped", 1);

  await page.locator('button[title="Add 1 tier"]').click();
  await page.locator('button[title="Add 1 coin"]').click();
  await page.locator('.hold-option[data-hold="strong"]').click();
  // Wait until the wire ops landed: hold pressed + coin row updated.
  await page
    .locator('.hold-option[data-hold="strong"][aria-pressed="true"]')
    .waitFor({ state: "visible", timeout: 10_000 });
  let crew = await crewState(page, baseUrl, crewId);
  if (crew?.tier !== 1 || !(crew?.coin >= 1) || crew?.hold !== "strong") {
    throw new Error(`tier/funds/hold did not commit: ${JSON.stringify(crew)}`);
  }
  ctx.checkpoint("tier-funds-set", 1);

  // -- 3. Tier clamp notice (P29/FV-029): the server clamps above the cap ----
  // The + control is intentionally not disabled at the cap; the server clamps
  // and the page reports "Tier clamped to <effective> (requested <requested>)".
  let clampSeen = false;
  for (let i = 0; i < 12 && !clampSeen; i++) {
    await page.locator('button[title="Add 1 tier"]').click();
    try {
      await page
        .locator(".crew-notices .notice")
        .filter({ hasText: /clamped to/i })
        .waitFor({ state: "visible", timeout: 4_000 });
      clampSeen = true;
    } catch {
      // not yet at the cap — keep clicking
    }
  }
  ctx.checkpoint("tier-clamp-notice", clampSeen ? 1 : 0);
  if (!clampSeen) throw new Error("no tier clamp notice after repeated +1 (cap never reached?)");
  await ctx.screenshot("crew-create-tier-clamped");

  // -- 4. Member link: a character joins this crew ----------------------------
  const createdChar = await api(baseUrl, "characters", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ gameStem: "blades-in-the-dark", playbook: "Cutter" }),
  });
  if (createdChar.status !== 200) throw new Error(`member character create -> ${createdChar.status}`);
  const memberId = JSON.parse(createdChar.text).character.id;
  await ctx.goto(`/character/${memberId}`);
  const crewSelect = page.locator('select[aria-label="Join crew"]');
  await crewSelect.waitFor({ state: "visible", timeout: 15_000 });
  await crewSelect.selectOption(crewId);
  await page.locator('button[title="Join crew"]').click();
  await page
    .locator(".crew-membership")
    .getByText("Leave")
    .waitFor({ state: "visible", timeout: 15_000 });
  const memberCount = await crewMemberCount(page, crewId);
  if (memberCount !== 1) {
    throw new Error(`join did not link the member: memberCount=${memberCount}`);
  }
  ctx.checkpoint("member-linked", 1);

  // -- 5. Undo + history -------------------------------------------------------
  await ctx.goto(crewPath);
  await page.locator('.crew-rep button[aria-pressed="true"]').first().waitFor({ state: "visible", timeout: 10_000 });
  // Make a known op the MOST RECENT change, so undo's effect on the server
  // state is predictable (undo pops the last snapshot, whatever it is).
  const repBeforeBump = (await crewState(page, baseUrl, crewId))?.rep?.current;
  await page.locator('button[title="Add 1 rep"]').click();
  await page.waitForFunction(
    (prev) => {
      const el = document.querySelector(".crew-rep[role='group'], .crew-rep");
      return Number(el?.getAttribute("aria-label")?.match(/(\d+) of/)?.[1]) === prev + 1;
    },
    repBeforeBump,
    { timeout: 15_000 },
  ).catch(() => {});
  const repAtUndo = (await crewState(page, baseUrl, crewId))?.rep?.current;
  await page.locator('button[title="Undo last change"]').click();
  await page
    .locator(".crew-notices .notice")
    .filter({ hasText: /restored|rep to|undone/i })
    .waitFor({ state: "visible", timeout: 15_000 });
  const repAfterUndo = (await crewState(page, baseUrl, crewId))?.rep?.current;
  if (repAfterUndo !== repBeforeBump) {
    throw new Error(`undo did not restore rep (${repAtUndo} -> ${repAfterUndo}, wanted ${repBeforeBump})`);
  }
  ctx.checkpoint("crew-undo-restored", 1);
  await page
    .locator("p.lbl")
    .filter({ hasText: /snapshotted change/ })
    .waitFor({ state: "visible", timeout: 10_000 });

  await ctx.goto(`/crew/${crewId}/history`);
  await page.locator(".crew-history").waitFor({ state: "visible", timeout: 10_000 });
  ctx.checkpoint("crew-history-page", 1);

  // -- 6. Reload persistence ---------------------------------------------------
  await ctx.goto(crewPath);
  await page
    .locator('.hold-option[data-hold="strong"][aria-pressed="true"]')
    .waitFor({ state: "visible", timeout: 10_000 });
  ctx.checkpoint("crew-reload-persisted", 1);

  // -- 7. Claims, cohorts, advancement (own crews, kept sub-flows) ------------
  await crew02.run(page, wrapped);
  await crew01.run(page, wrapped);
  await crew04.run(page, wrapped);

  // -- 8. Route/theme matrix: the crew-detail surface -------------------------
  const entries = await runRouteThemeMatrix(page, ctx, id, [
    {
      key: "crew-detail",
      path: crewPath,
      waitFor: ".claims-grid",
      landmarks: [".crew-playbook", ".crew-notes", ".claims-grid"],
    },
  ]);
  ctx.checkpoint("matrix-entries", entries.length);
  if (entries.length !== 9) throw new Error(`crew matrix expected 9 entries, got ${entries.length}`);
}
