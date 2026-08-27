// character-create-edit — BROWSER-02 top-level journey 2/6 (spec §16 AR-005).
//
// Canonical PC creation through the validated chargen (approved behavior:
// settings-derived budget, per-action caps, locked playbook defaults), the
// created sheet landing on the roster, the phase-two (naming) failure path
// with its entity-retaining "Retry naming" recovery — the create endpoint is
// never POSTed twice — then the live dossier editors: playbook ability select
// with description preview, Heritage, Background, Vice + purveyor, each
// proven across a real reload. Closes with the character-detail matrix.
//
// Sub-checkpoint modules:
//   checkpoints/pc-chargen.mjs             validated chargen + navigation
//   checkpoints/char02-option-editors.mjs  dossier option editors + reloads

import * as chargen from "./checkpoints/pc-chargen.mjs";
import * as char02 from "./checkpoints/char02-option-editors.mjs";
import {
  composeCtx,
  runRouteThemeMatrix,
  unionCheckpoints,
  unionNoise,
} from "./lib.mjs";

export const id = "character-create-edit";

export const expectedConsoleNoise = unionNoise(
  chargen.expectedConsoleNoise,
  char02.expectedConsoleNoise,
  // The phase-two retry test deliberately injects a naming-op failure; the
  // browser logs its standard "Failed to load resource" chrome noise for it.
  [{ urlPattern: "/ops/dossier.update", text: "Failed to load resource" }],
);

export const checkpoints = unionCheckpoints(chargen.checkpoints, char02.checkpoints, [
  { id: "created-on-roster", description: "the created character's row link appears on /roster" },
  { id: "phase-two-kept-entity", description: "exactly one create POST fired before the naming failure" },
  { id: "phase-two-recovery-shown", description: "the .create-phase-two-recovery card renders with Retry naming" },
  { id: "phase-two-retry-recovers", description: "Retry naming completes ONLY the naming op and lands on the sheet" },
  { id: "matrix-entries", description: "character-detail matrix entries exercised (9 expected)" },
]);

export async function run(page, ctx) {
  const { baseUrl } = ctx;
  const wrapped = composeCtx(ctx);

  // -- 1. Validated PC chargen (canonical create, approved behavior) ---------
  await chargen.run(page, wrapped);

  // The chargen landed us on the created sheet; keep its id for the matrix.
  const charAPath = new URL(page.url()).pathname;
  if (!/^\/character\/[0-9a-f-]{36}$/.test(charAPath)) {
    throw new Error(`chargen did not land on a character sheet (at ${charAPath})`);
  }
  const charAId = charAPath.split("/")[2];

  // -- 2. Roster visibility of the created character -------------------------
  await ctx.goto("/roster");
  const rowLink = page.locator(`li[data-character-id="${charAId}"] a[href="${charAPath}"]`);
  const visible = (await rowLink.count()) > 0 && (await rowLink.first().isVisible());
  ctx.checkpoint("created-on-roster", visible ? 1 : 0);
  if (!visible) throw new Error(`created character ${charAId} has no roster row link`);

  // -- 3. Second-phase (naming) retry ----------------------------------------
  // The unvalidated path creates the entity in phase one, then names it via
  // ops/dossier.update in phase two (FV-017). Inject a naming failure: the
  // entity must be retained, the recovery card offered, and "Retry naming"
  // must resume ONLY the naming op.
  await ctx.goto("/character/create");
  await page.locator(".pc-chargen-form, details.create-unvalidated").first().waitFor({ state: "visible", timeout: 15_000 });
  await page.locator("details.create-unvalidated summary").click();
  await page.locator("#name").fill("Second Phase Sable");
  await page.locator("#playbook").selectOption("Cutter");

  let createPostCount = 0;
  const countCreate = (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/characters") {
      createPostCount += 1;
    }
  };
  page.on("request", countCreate);
  await page.route(/\/ops\/dossier\.update$/, (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "INJECTED_NAMING_OUTAGE" } }),
    }),
  );
  try {
    await page.locator('form.character-create-form button[type="submit"]').click();
    const recoveryCard = page.locator(".create-phase-two-recovery");
    await recoveryCard.waitFor({ state: "visible", timeout: 15_000 });
    const cardText = (await recoveryCard.textContent()) ?? "";
    if (!cardText.includes("Retry naming") || !cardText.includes("Open character sheet")) {
      throw new Error(`phase-two recovery lacks its actions: "${cardText.slice(0, 160)}"`);
    }
    if (!cardText.includes("kept on the roster without a name")) {
      throw new Error(`phase-two recovery does not explain retention: "${cardText.slice(0, 200)}"`);
    }
    ctx.checkpoint("phase-two-recovery-shown", 1);
    if (createPostCount !== 1) {
      throw new Error(`expected exactly 1 create POST before the naming failure, saw ${createPostCount}`);
    }
    ctx.checkpoint("phase-two-kept-entity", createPostCount);

    // Retry: the outage is over; ONLY the naming op re-fires.
    await page.unroute(/\/ops\/dossier\.update$/);
    await Promise.all([
      page.waitForURL(/\/character\/[0-9a-f-]{36}$/, { timeout: 15_000 }),
      recoveryCard.getByRole("button", { name: "Retry naming" }).click(),
    ]);
    await page
      .locator(".character-header")
      .getByText("Second Phase Sable")
      .waitFor({ state: "visible", timeout: 10_000 });
    if (createPostCount !== 1) {
      throw new Error(`retry re-POSTed create (${createPostCount} total) — phase two must resume naming only`);
    }
    ctx.checkpoint("phase-two-retry-recovers", 1);
    await ctx.screenshot("character-create-phase-two-recovered");
  } finally {
    page.unroute(/\/ops\/dossier\.update$/).catch(() => {});
    page.off("request", countCreate);
  }

  // -- 4. Dossier editors: Hound ability, Heritage, Background, Vice ---------
  await char02.run(page, wrapped);

  // -- 5. Route/theme matrix: the character-detail surface -------------------
  const entries = await runRouteThemeMatrix(page, ctx, id, [
    {
      key: "character-detail",
      path: charAPath,
      waitFor: ".character-detail",
      landmarks: [".character-detail", '[data-section="stress"]', '[data-section="projects"]'],
    },
  ]);
  ctx.checkpoint("matrix-entries", entries.length);
  if (entries.length !== 9) throw new Error(`character matrix expected 9 entries, got ${entries.length}`);
}
