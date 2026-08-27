// lifecycle — BROWSER-02 top-level journey 5/6 (spec §16 AR-005).
//
// Real lifecycle state transitions on a live sheet: stress driven to its
// settings-derived maximum (trauma-pending checkpoint), resolution through
// the pending-trauma picker (clears stress, marks out-of-action), the
// sanctioned end-score release, amount-based stress relief with the approved
// overindulgence path, end-downtime, undo, and — via the kept sub-flow —
// the section-local routed alert with scroll continuity evidence.
//
// Sub-checkpoint modules:
//   checkpoints/char03-continuity.mjs  stress continuity at scroll + gear
//                                      failure routed to its section alert

import * as char03 from "./checkpoints/char03-continuity.mjs";
import {
  composeCtx,
  runRouteThemeMatrix,
  unionCheckpoints,
  unionNoise,
} from "./lib.mjs";

export const id = "lifecycle";

export const expectedConsoleNoise = unionNoise(char03.expectedConsoleNoise);

export const checkpoints = unionCheckpoints(char03.checkpoints, [
  { id: "stress-maximum-trauma-pending", description: "stress at max flips the sheet into the pending-trauma state" },
  { id: "trauma-resolved-out-of-action", description: "Take trauma clears stress to 0 and marks out-of-action" },
  { id: "end-score-releases", description: "End score clears the out-of-action gate" },
  { id: "downtime-numeric-relief", description: "amount-based stress relief applied the chosen amount" },
  { id: "overindulged-notice-dismissable", description: "relief beyond remaining stress raises + dismisses OVERINDULGED" },
  { id: "end-downtime-ok", description: "End downtime committed (ops/end.downtime 200)" },
  { id: "undo-restores", description: "Undo last change restored the prior state" },
  { id: "matrix-entries", description: "character-detail matrix entries exercised (9 expected)" },
]);

const api = async (baseUrl, path, init) => {
  const response = await fetch(`${baseUrl}/api/${path}`, init);
  return { status: response.status, text: await response.text() };
};

async function createCharacter(page, baseUrl) {
  const res = await page.evaluate(async (url) => {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ gameStem: "blades-in-the-dark", playbook: "Cutter" }),
    });
    return r.json();
  }, new URL("/api/characters", baseUrl).href);
  if (!res?.character?.id) throw new Error(`character creation failed: ${JSON.stringify(res)}`);
  return res.character.id;
}

/** Current/max stress from the track's group label ("Stress: X of Y"). */
async function readStress(page) {
  const label = await page
    .locator('.stress-track[role="group"]')
    .first()
    .getAttribute("aria-label");
  const m = label?.match(/(\d+)\s*of\s*(\d+)/);
  if (!m) throw new Error(`cannot parse stress track label: ${JSON.stringify(label)}`);
  return { current: Number(m[1]), max: Number(m[2]) };
}

async function addStressUntil(page, target) {
  const plus = page.locator('button[title="Add 1 stress"]');
  for (let i = 0; i < 20; i++) {
    const { current } = await readStress(page);
    if (current >= target) return current;
    await plus.click();
    await page.waitForFunction(
      (prev) => {
        const el = document.querySelector('.stress-track[role="group"]');
        const m = el?.getAttribute("aria-label")?.match(/(\d+)\s*of\s*(\d+)/);
        return m && Number(m[1]) >= prev;
      },
      current + 1,
      { timeout: 15_000 },
    ).catch(() => {});
  }
  return (await readStress(page)).current;
}

export async function run(page, ctx) {
  const { baseUrl } = ctx;
  const wrapped = composeCtx(ctx);

  // -- 1. Continuity sub-flow: scrolled mutation + section-local alert -------
  await char03.run(page, wrapped);

  // -- 2. Stress maximum -> trauma-pending checkpoint --------------------------
  const characterId = await createCharacter(page, baseUrl);
  await ctx.goto(`/character/${characterId}`);
  await page.locator(".character-detail").waitFor({ state: "visible", timeout: 15_000 });

  const { max } = await readStress(page);
  await addStressUntil(page, max);
  const atMax = await readStress(page);
  if (atMax.current !== atMax.max) {
    throw new Error(`stress never reached max (${atMax.current}/${atMax.max})`);
  }
  await page.locator(".stress-trauma-picker").waitFor({ state: "visible", timeout: 10_000 });
  // End score / End downtime are window.confirm-guarded, which Playwright
  // would silently dismiss; record each message and accept it.
  const dialogMessages = [];
  page.on("dialog", async (dialog) => {
    try {
      dialogMessages.push(dialog.message());
      await dialog.accept();
    } catch {
      // A runner-level handler accepted it first — the recording above is
      // still valid evidence the dialog appeared.
    }
  });
  await page
    .locator(".character-lifecycle-banner")
    .getByText("A trauma is pending — resolve it before continuing.")
    .waitFor({ state: "visible", timeout: 10_000 });
  // Gameplay is blocked while pending: the end-score control explains why.
  await page
    .locator('[data-section="lifecycle"]')
    .getByText("A trauma is pending — resolve it before ending the score.")
    .waitFor({ state: "visible", timeout: 10_000 });
  ctx.checkpoint("stress-maximum-trauma-pending", 1);
  await ctx.screenshot("lifecycle-trauma-pending");

  // -- 3. Resolution: take a trauma -> stress 0 + out-of-action ---------------
  const picker = page.locator('select[aria-label="Trauma when stressed"]');
  const traumaCount = await picker.locator("option").evaluateAll(
    (options) => options.filter((o) => o.value !== "").length,
  );
  if (traumaCount === 0) throw new Error("pending-trauma picker has no traumas to take");
  await picker.selectOption({ index: 1 });
  await page
    .locator('button[title="Take trauma to resolve pending stress (clears stress)"]')
    .click();
  await page
    .locator("p.notice")
    .filter({ hasText: "This character is out of action" })
    .waitFor({ state: "visible", timeout: 15_000 });
  const afterTrauma = await readStress(page);
  if (afterTrauma.current !== 0) {
    throw new Error(`trauma resolution must clear stress to 0, saw ${afterTrauma.current}`);
  }
  ctx.checkpoint("trauma-resolved-out-of-action", 1);

  // -- 4. End score: the sanctioned release ------------------------------------
  const endScore = page.locator(".character-lifecycle-actions").getByRole("button", { name: "End score" });
  await endScore.click();
  await page
    .locator("p.notice")
    .filter({ hasText: "This character is out of action" })
    .waitFor({ state: "detached", timeout: 15_000 });
  ctx.checkpoint("end-score-releases", 1);

  // -- 5. Amount-based downtime relief + overindulgence (DEC-02) --------------
  await addStressUntil(page, Math.min(3, max));
  const beforeRelief = await readStress(page);
  const reliefAmount = 1;
  await page.locator('input[aria-label="Stress to clear"]').fill(String(reliefAmount));
  await page.locator('button[title^="Clear Stress"]').click();
  await page.waitForFunction(
    (prev) => {
      const el = document.querySelector('.stress-track[role="group"]');
      const m = el?.getAttribute("aria-label")?.match(/(\d+)\s*of\s*(\d+)/);
      return m && Number(m[1]) === prev - 1;
    },
    beforeRelief.current,
    { timeout: 15_000 },
  );
  ctx.checkpoint("downtime-numeric-relief", 1);

  // Relief beyond the remaining stress is the approved overindulgence path:
  // the server clamps to the marked stress and the page raises the frozen
  // OVERINDULGED notice, dismissable with its ✕ control.
  const remaining = (await readStress(page)).current;
  await page.locator('input[aria-label="Stress to clear"]').fill(String(remaining + 5));
  await page.locator('button[title^="Clear Stress"]').click();
  await page
    .locator("p.notice")
    .filter({ hasText: "OVERINDULGED" })
    .waitFor({ state: "visible", timeout: 15_000 });
  await page.locator('button[title="Dismiss the overindulged notice"]').click();
  await page
    .locator("p.notice")
    .filter({ hasText: "OVERINDULGED" })
    .waitFor({ state: "detached", timeout: 10_000 });
  ctx.checkpoint("overindulged-notice-dismissable", 1);
  await ctx.screenshot("lifecycle-overindulged-dismissed");

  // -- 6. End downtime ----------------------------------------------------------
  const downtimeResponse = page.waitForResponse(
    (r) => r.url().includes("/end-downtime") && r.status() === 200,
    { timeout: 15_000 },
  );
  await page.locator('button[title^="End downtime"]').click();
  await downtimeResponse;
  ctx.checkpoint("end-downtime-ok", 1);

  // -- 7. Undo restores ----------------------------------------------------------
  await page.locator('button[title="Undo last change"]').click();
  await page
    .locator("p.notice")
    .filter({ hasText: /restored|Undid|previous state/i })
    .first()
    .waitFor({ state: "visible", timeout: 15_000 });
  ctx.checkpoint("undo-restores", 1);
  await ctx.screenshot("lifecycle-undo-restored");

  // -- 8. Route/theme matrix: the character-detail surface ----------------------
  const entries = await runRouteThemeMatrix(page, ctx, id, [
    {
      key: "character-detail",
      path: `/character/${characterId}`,
      waitFor: ".character-detail",
      landmarks: [".character-detail", '[data-section="stress"]', '[data-section="lifecycle"]'],
    },
  ]);
  ctx.checkpoint("matrix-entries", entries.length);
  if (entries.length !== 9) throw new Error(`lifecycle matrix expected 9 entries, got ${entries.length}`);
}
