// char03-continuity — PERF-03/CHAR-03 journey.
//
// Exercises real character mutations at scrolled positions against the managed
// server and reads back the window.__paperclipsContinuity evidence that
// frontend/src/lib/mutation-continuity.ts records around each mutation:
//
// 1. stress add (+ button) at a genuinely scrolled position: the settled
//    record must carry op/outcome/outcomeStatus, initiator + focus rects, a
//    measured renderToStableMs, and preserved scroll position.
// 2. forced gear failure (POST /ops/gear.add answers 422 via route
//    interception): the record must settle as a failure whose alert is routed
//    into the initiating gear section and made visible.
//
// Exports the BROWSER-01 journey contract { id, checkpoints, run }.

export const id = "char03-continuity";

export const checkpoints = [
  {
    id: "stress-continuity-record",
    description: "settled onStressDelta success record with rects, renderToStableMs, and stable scroll",
  },
  {
    id: "gear-failure-alert-routed",
    description: "forced 422 gear.add settles as a visible alert routed to the initiating gear section",
  },
];

// The deliberately injected 422 (fault injection, below) makes Chromium log
// its standard "Failed to load resource" chrome noise for the intercepted
// request. The app handles the failure gracefully — declare the allowance so
// "zero console errors" keeps measuring the app, not this journey's own
// interception.
export const expectedConsoleNoise = [
  { urlPattern: "/ops/gear.add", text: "Failed to load resource" },
];

const STRESS_PLUS = 'button[title="Add 1 stress"]';

async function createCharacter(page, baseUrl) {
  return page.evaluate(async (url) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ gameStem: "blades-in-the-dark", playbook: "Hound" }),
    });
    return res.json();
  }, new URL("/api/characters", baseUrl).href);
}

/** Settle window for one continuity record lookup; quietMs is 80 by default,
 * force-finalize worst case 10s — poll within that envelope. `predSrc` is a
 * JS expression over one record variable r (passed as source, not a closure:
 * it must serialize across the browser boundary). */
async function waitForRecord(page, predSrc, timeoutMs = 15_000) {
  const hasMatch = await page.waitForFunction(
    `(window.__paperclipsContinuity?.records() ?? []).some((r) => (${predSrc}))`,
    null,
    { timeout: timeoutMs, polling: 250 },
  );
  if (!hasMatch) return null;
  return page.evaluate(
    `(window.__paperclipsContinuity?.records() ?? []).find((r) => (${predSrc})) ?? null`,
  );
}
export async function run(page, ctx) {
  await ctx.goto("/");
  const created = await createCharacter(page, ctx.baseUrl);
  if (!created?.character?.id) {
    throw new Error(`Hound creation failed: ${JSON.stringify(created?.error ?? created)}`);
  }

  await ctx.goto(`/character/${created.character.id}`);
  await page.locator(".character-detail").waitFor({ state: "visible", timeout: 10_000 });
  if (!(await page.evaluate(() => Boolean(window.__paperclipsContinuity)))) {
    throw new Error("mutation continuity recorder missing on the sheet");
  }

  // -- 1. Stress add at a scrolled position ----------------------------------
  // Park the viewport partway down so the click itself scrolls only locally;
  // budgets below allow that in-view adjustment but forbid wholesale jumps.
  await page.evaluate(() => {
    const h = document.documentElement.scrollHeight;
    window.scrollTo(0, Math.floor(h * 0.25));
  });
  const preClickScrollY = await page.evaluate(() => Math.round(window.scrollY));
  if (preClickScrollY <= 0) {
    throw new Error(`sheet did not scroll before the mutation (scrollY=${preClickScrollY})`);
  }

  await page.locator(STRESS_PLUS).click();

  const stressRecord = await waitForRecord(
    page,
    `r.op === "onStressDelta" && r.stabilized === true`,
  );
  if (!stressRecord) throw new Error("no stabilized onStressDelta continuity record");

  if (stressRecord.outcome !== "success" || stressRecord.outcomeStatus !== 200) {
    throw new Error(
      `stress record outcome ${stressRecord.outcome}/${stressRecord.outcomeStatus}, wanted success/200`,
    );
  }
  if (!stressRecord.initiatorRect || !stressRecord.initiatorDescriptor?.endsWith("@stress")) {
    throw new Error(
      `initiator attribution broken: ${stressRecord.initiatorDescriptor} rect=${JSON.stringify(stressRecord.initiatorRect)}`,
    );
  }
  if (!stressRecord.focusBefore || !stressRecord.focusAfter) {
    throw new Error("focus snapshots missing from the stress record");
  }
  if (typeof stressRecord.renderToStableMs !== "number" || stressRecord.renderToStableMs < 0) {
    throw new Error(`renderToStableMs not measured: ${stressRecord.renderToStableMs}`);
  }
  if (typeof stressRecord.operationMs !== "number") {
    throw new Error("operationMs not measured");
  }
  if (stressRecord.preScrollY === null || stressRecord.postScrollY === null) {
    throw new Error("scroll telemetry missing");
  }
  // Approved budget (see tasks/metrics/frontend/PERF-03.json): the re-render
  // must not relocate the reader. Local scrollIntoView adjustments are bounded
  // at ±220px; anything approaching a full-page jump fails here.
  const drift = Math.abs(stressRecord.postScrollY - stressRecord.preScrollY);
  if (drift > 220) {
    throw new Error(
      `scroll budget blown across the mutation: ${stressRecord.preScrollY} -> ${stressRecord.postScrollY}`,
    );
  }
  ctx.checkpoint("stress-continuity-record", 1);
  await ctx.screenshot("char03-stress-scrolled");

  // -- 2. Forced gear failure routes its alert to the initiating section -----
  let injected422 = false;
  await page.route(/\/ops\/gear\.add$/, (route) => {
    injected422 = true;
    return route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "INVALID_ENTITY", message: "injected validation failure" },
      }),
    });
  });
  try {
    // Open the gear add menu (a <details>) and fire the op through real UI.
    await page.locator("details.gear-add-menu summary").click();
    const itemSelect = page.locator('select[aria-label="Add gear item"]');
    await itemSelect.waitFor({ state: "visible", timeout: 10_000 });
    const optionCount = await itemSelect.locator("option").count();
    if (optionCount < 2) {
      throw new Error(`gear menu has no items to add (${optionCount} options)`);
    }
    await itemSelect.selectOption({ index: 1 });
    await page.locator('button[title="Add gear item"]').click();

    if (!injected422) {
      throw new Error("intercepted /ops/gear.add was never called");
    }

    const gearRecord = await waitForRecord(
      page,
      `r.op === "onGearAdd" && r.stabilized === true && r.outcomeStatus === 422`,
    );
    if (!gearRecord) throw new Error("no stabilized onGearAdd failure record");
    if (gearRecord.outcome !== "failure") {
      throw new Error(`gear record outcome ${gearRecord.outcome}, wanted failure`);
    }
    if (gearRecord.initiatorDescriptor && !gearRecord.initiatorDescriptor.endsWith("@gear")) {
      throw new Error(`gear initiator misattributed: ${gearRecord.initiatorDescriptor}`);
    }

    // The alert lives inside the initiating section, names the failure, and
    // was made visible (ensureSectionAlertVisible scrolled to it).
    const gearAlert = page.locator('[data-section="gear"] .error.section-error');
    await gearAlert.waitFor({ state: "visible", timeout: 10_000 });
    if ((await gearAlert.textContent()) === "") {
      throw new Error("routed gear alert renders empty text");
    }
    const routedVisible = await gearAlert.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 &&
        r.bottom > 0 && r.top < window.innerHeight;
    });
    if (!routedVisible || gearRecord.anyAlertVisible !== true) {
      throw new Error(
        `routed gear alert visibility: dom=${routedVisible} record=${gearRecord.anyAlertVisible}`,
      );
    }
    if (!gearRecord.alerts.some((a) => a.visible)) {
      throw new Error("no visible alert snapshot recorded for the gear failure");
    }
    ctx.checkpoint("gear-failure-alert-routed", 1);
    await ctx.screenshot("char03-gear-failure-routed");
  } finally {
    await page.unroute(/\/ops\/gear\.add$/);
  }
}
