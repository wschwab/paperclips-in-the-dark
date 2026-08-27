// crew02-claims — CREW-02 intentional claim acquisition and removal journey.
//
// Creates an Assassins crew through the same-origin unvalidated create
// endpoint, opens its sheet, and drives the Claims map end to end:
//
//   1. acquire two claims — every acquisition must ask first (window.confirm),
//      so this journey registers a dialog handler that records each message
//      before accepting it;
//   2. reload the page and prove both acquisitions survived the round trip
//      (claimedClaimIds are server-persisted);
//   3. enter claim-edit mode and deliberately remove one acquired claim,
//      exercising the gated relinquish path with its own confirmation.
//
// Exports the BROWSER-01 journey contract { id, checkpoints, run }.

export const id = "crew02-claims";

export const checkpoints = [
  {
    id: "claims-map-visible",
    description: "1 when the Claims section renders on the crew sheet",
  },
  {
    id: "acquisition-confirmations",
    description: "dialog messages captured while acquiring two claims (2 expected)",
  },
  {
    id: "claims-acquired-count",
    description: "owned (non-lair) claim cells after acquiring two claims (2 expected)",
  },
  {
    id: "claims-after-reload-count",
    description: "owned claim cells after a full page reload (2 expected)",
  },
  {
    id: "claims-after-remove-count",
    description: "owned claim cells after deliberately removing one in edit mode (1 expected)",
  },
];

const ACQUIRED_NAMES = ["Training Rooms", "Vice Den"];

async function createCrew(page, baseUrl) {
  return page.evaluate(async (url) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ gameStem: "blades-in-the-dark", crewType: "Assassins" }),
    });
    return res.json();
  }, new URL("/api/crews", baseUrl).href);
}

function ownedCell(page, name) {
  return page
    .locator(".claims-grid button.claim-node.claim-owned", { hasText: name })
    .first();
}

async function ownedCount(page) {
  return page.locator(".claims-grid button.claim-node.claim-owned").count();
}

export async function run(page, ctx) {
  // Load the SPA first so the create fetch below is same-origin (the server
  // is no-CORS by design; a preflight from origin "null" would be refused).
  await ctx.goto("/");
  const created = await createCrew(page, ctx.baseUrl);
  if (!created?.crew?.id) {
    throw new Error(`crew creation failed: ${JSON.stringify(created?.error ?? created)}`);
  }
  const sheetPath = `/crew/${created.crew.id}`;

  // CREW-02 #1/#4: acquisitions AND relinquish go through window.confirm.
  // Playwright auto-dismisses unhandled dialogs (confirm() -> false), which
  // would silently veto every op — record each message, then accept it.
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

  await ctx.goto(sheetPath);
  await page.locator(".claims-grid").waitFor({ state: "visible", timeout: 10_000 });
  ctx.checkpoint("claims-map-visible", 1);

  // -- Acquire two claims, each behind its confirmation ----------------------
  const marker = { before: 0 };
  for (const name of ACQUIRED_NAMES) {
    marker.before = dialogMessages.length;
    await page
      .locator(".claims-grid button.claim-node", { hasText: name })
      .first()
      .click();
    await ownedCell(page, name).waitFor({ state: "visible", timeout: 10_000 });
    const msgs = dialogMessages.slice(marker.before);
    if (!msgs.some((m) => m.includes(name) && /acquire/i.test(m))) {
      throw new Error(
        `acquiring "${name}" did not ask a confirmation naming the claim; captured: ${JSON.stringify(msgs)}`,
      );
    }
  }
  ctx.checkpoint("acquisition-confirmations", dialogMessages.length);

  const afterAcquire = await ownedCount(page);
  if (afterAcquire !== ACQUIRED_NAMES.length) {
    throw new Error(`expected ${ACQUIRED_NAMES.length} owned claims after acquiring, found ${afterAcquire}`);
  }
  ctx.checkpoint("claims-acquired-count", afterAcquire);
  await ctx.screenshot("crew02-claims-acquired");

  // -- Reload: both acquisitions must survive ---------------------------------
  await ctx.goto(sheetPath);
  await page.locator(".claims-grid").waitFor({ state: "visible", timeout: 10_000 });
  for (const name of ACQUIRED_NAMES) {
    await ownedCell(page, name).waitFor({ state: "visible", timeout: 10_000 });
  }
  const afterReload = await ownedCount(page);
  ctx.checkpoint("claims-after-reload-count", afterReload);
  if (afterReload !== ACQUIRED_NAMES.length) {
    throw new Error(`expected ${ACQUIRED_NAMES.length} owned claims after reload, found ${afterReload}`);
  }
  await ctx.screenshot("crew02-claims-reloaded");

  // -- Deliberately remove one inside claim-edit mode -------------------------
  const EDIT_REMOVED = "Vice Den";
  const toggle = page.locator(".claims-edit-toggle");
  if ((await toggle.textContent())?.trim() !== "Edit claims") {
    throw new Error("claim-edit mode should start off after a fresh mount");
  }
  await toggle.click();
  await page
    .locator(".claims-edit-toggle", { hasText: "Done editing" })
    .waitFor({ state: "visible", timeout: 10_000 });

  const markBeforeRemove = dialogMessages.length;
  await page
    .locator(".active-claim-list li", { hasText: EDIT_REMOVED })
    .locator("button", { hasText: "Relinquish" })
    .click();
  await page
    .locator(".claims-grid button.claim-node:not(.claim-owned)", { hasText: EDIT_REMOVED })
    .first()
    .waitFor({ state: "visible", timeout: 10_000 });

  const relMsgs = dialogMessages.slice(markBeforeRemove);
  if (!relMsgs.some((m) => m.includes(EDIT_REMOVED) && /relinquish/i.test(m))) {
    throw new Error(
      `relinquishing "${EDIT_REMOVED}" did not confirm with wording naming the claim; captured: ${JSON.stringify(relMsgs)}`,
    );
  }

  const afterRemove = await ownedCount(page);
  ctx.checkpoint("claims-after-remove-count", afterRemove);
  if (afterRemove !== ACQUIRED_NAMES.length - 1) {
    throw new Error(`expected 1 owned claim after removing one, found ${afterRemove}`);
  }
  await ctx.screenshot("crew02-claim-removed");
}
