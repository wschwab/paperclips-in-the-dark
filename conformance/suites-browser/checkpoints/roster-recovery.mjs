// roster-recovery — RECOVERY-01 journey.
//
// Exercises the degraded-row recovery path and the roster-level import IA on
// a live server: plants one repairable and one unreadable character (route
// identity is authoritative — the seeded directory id matches the body id),
// asserts visible classification (`data-recovery-class` + per-class copy),
// drives Repair (preview → confirm → apply) and Delete (confirm → re-fetch)
// to full recovery, proves no per-row Import anchors remain, and runs a
// create-or-replace import through the roster-level panel into a real
// preview-token / confirm / apply cycle.
//
// Deliberate backend failures are part of the flow: repair-preview answers
// 409 NORMALIZATION_REQUIRED (with a token) to confirm. Chromium logs those
// responses as "Failed to load resource"; they're declared, not suppressed,
// so zero-error accounting still measures the app.

/**
 * Route-scoped console-noise allowance (deliberate 409s drive both the
 * repair preview and possibly the replace-import preview).
 */
export const expectedConsoleNoise = [
  { urlPattern: "/repair-preview", text: "Failed to load resource" },
  { urlPattern: "/import", text: "Failed to load resource" },
];
import { createHash, randomUUID } from "node:crypto";
// The managed launcher exposes PITD_DATA_DIR; the backend reads stored bytes
// per request, so planting fixture files pre-navigation is sufficient.
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const id = "roster-recovery";

export const checkpoints = [
  {
    id: "classified-degraded-rows",
    description:
      "degraded rows carrying data-recovery-class repairable/unreadable counts (1 each expected)",
  },
  {
    id: "repair-recovers-row",
    description: "Repair preview→confirm→apply turns the row readable (1/0)",
  },
  {
    id: "unreadable-delete-recovers",
    description: "deleteToken delete removes the unreadable row after confirm (1/0)",
  },
  {
    id: "per-row-import-links",
    description: "per-row Import anchors rendered by the roster (0 expected)",
  },
  {
    id: "roster-import-panel-options",
    description: "target options in the characters import panel (placeholder + entries)",
  },
  {
    id: "roster-import-applies",
    description: "panel-driven replace import reached OperationResult success (1/0)",
  },
  {
    id: "console-errors",
    description: "console error count observed on the roster surfaces (0 expected)",
  },
];

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const GOLDEN_CHARACTER = join(repoRoot, "conformance/fixtures/golden-character.json");

/** The degraded-entity If-Match token: sha256:<lowercase hex> of the raw bytes. */
function sha256Token(text) {
  return `sha256:${createHash("sha256").update(text).digest("hex")}`;
}

/** Plant raw stored bytes at <dataDir>/characters/<id>/current.json. */
async function seedCharacterBytes(dataDir, idValue, bytes) {
  const dir = join(dataDir, "characters", idValue);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "current.json"), bytes);
}

const api = async (baseUrl, path, init) => {
  const response = await fetch(`${baseUrl}/api/${path}`, init);
  return { status: response.status, text: await response.text() };
};

export async function run(page, ctx) {
  const { baseUrl } = ctx;
  const dataDir = process.env.PITD_DATA_DIR;
  if (!dataDir) throw new Error("PITD_DATA_DIR missing from journey environment");

  // A readable character to keep the plate realistic and serve as an import
  // target later.
  const playbooksRes = await api(baseUrl, "games/blades-in-the-dark/playbooks");
  if (playbooksRes.status !== 200) throw new Error(`playbook list → ${playbooksRes.status}`);
  const playbookEntry = JSON.parse(playbooksRes.text)[0];
  // The list endpoint returns playbook objects (name + hook list), not names.
  const playbook = typeof playbookEntry === "string" ? playbookEntry : playbookEntry.name ?? playbookEntry.Name;
  if (!playbook) throw new Error(`no usable playbook in ${playbooksRes.text.slice(0, 120)}`);
  const created = await api(baseUrl, "characters", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ gameStem: "blades-in-the-dark", playbook }),
  });
  if (created.status !== 200) throw new Error(`character create → ${created.status}: ${created.text.slice(0, 200)}`);
  const characterId = JSON.parse(created.text).character.id;

  // Degraded fixtures derived from the golden character so each row carries
  // exactly one defect class:
  //   repairable — unknown nested key (D6): displayed-removal repair, no input
  //   unreadable — truncated JSON (D10): unparseable bytes, delete-only
  const golden = JSON.parse(readFileSync(GOLDEN_CHARACTER, "utf8"));
  const repairableId = randomUUID();
  const repairableBytes = JSON.stringify({
    ...golden,
    id: repairableId,
    dossier: { ...golden.dossier, favoriteColor: "red" },
  });
  const unreadableId = randomUUID();
  const unreadableBytes = '{ "kind": "character", "name": "trunc';
  await seedCharacterBytes(dataDir, repairableId, repairableBytes);
  await seedCharacterBytes(dataDir, unreadableId, unreadableBytes);
  const unreadableDeleteToken = await sha256Token(unreadableBytes);

  // ---- Classification ------------------------------------------------------
  await ctx.goto("/roster");

  const repairableRow = page.locator(
    `li[data-degraded][data-recovery-class="repairable"][data-character-id="${repairableId}"]`,
  );
  await repairableRow.waitFor({ state: "visible", timeout: 10_000 });
  await page
    .locator(`li[data-degraded][data-recovery-class="unreadable"][data-character-id="${unreadableId}"]`)
    .waitFor({ state: "visible", timeout: 10_000 });

  const visibleCopy = (await repairableRow.textContent()) ?? "";
  if (!visibleCopy.includes("Repairable character") || !visibleCopy.includes("normalized")) {
    throw new Error(`repairable row copy not classified visibly: "${visibleCopy.slice(0, 120)}"`);
  }
  const unreadableRowText =
    (await page
      .locator(`li[data-degraded][data-recovery-class="unreadable"]`)
      .first()
      .textContent()) ?? "";
  if (!unreadableRowText.includes("Unreadable character") || !unreadableRowText.includes("re-import")) {
    throw new Error(`unreadable row copy lacks recovery guidance: "${unreadableRowText.slice(0, 120)}"`);
  }

  await ctx.screenshot("recovery01-classification");

  // ---- Repair: preview → confirm → apply -----------------------------------
  await repairableRow.getByRole("button", { name: "Repair" }).click();
  await page.locator(".norm-preview").waitFor({ state: "visible", timeout: 10_000 });
  const readableLink = page.locator(`li[data-character-id="${repairableId}"] > a`);
  // Seeded fixture trees may add further degraded rows; RECOVERY-01 requires
  // at least one row of each class to render and classify.
  const repairableCount = await page.locator('li[data-degraded][data-recovery-class="repairable"]').count();
  const unreadableCount = await page.locator('li[data-degraded][data-recovery-class="unreadable"]').count();
  ctx.checkpoint("classified-degraded-rows", Math.min(repairableCount, 1) + Math.min(unreadableCount, 1));
  if (repairableCount < 1 || unreadableCount < 1) {
    throw new Error(`degraded classification incomplete: repairable=${repairableCount} unreadable=${unreadableCount}`);
  }
  // The preview answered NORMALIZATION_REQUIRED (409) carrying a preview
  // token; confirming applies the previewed canonical result.
  await page
    .locator(".norm-preview")
    .getByRole("button", { name: "Confirm repair" })
    .click({ timeout: 10_000 });
  let repaired = true;
  try {
    await readableLink.waitFor({ state: "visible", timeout: 15_000 });
  } catch {
    repaired = false;
  }
  ctx.checkpoint("repair-recovers-row", repaired ? 1 : 0);
  if (!repaired) throw new Error("repair did not turn the row readable after confirm");

  // ---- Unreadable: delete via content token --------------------------------
  const unreadableRow = page.locator(
    `li[data-degraded][data-recovery-class="unreadable"][data-character-id="${unreadableId}"]`,
  );
  await unreadableRow.getByRole("button", { name: "Delete" }).click();
  await page.locator(".degraded-delete-confirm").waitFor({ state: "visible", timeout: 10_000 });
  // Second click is the confirmation inside .degraded-delete-confirm.
  await page.locator(".degraded-delete-confirm").getByRole("button", { name: "Delete" }).click();

  let deleted = true;
  try {
    await page
      .locator(`li[data-character-id="${unreadableId}"]`)
      .waitFor({ state: "detached", timeout: 15_000 });
  } catch {
    deleted = false;
  }
  ctx.checkpoint("unreadable-delete-recovers", deleted ? 1 : 0);
  if (!deleted) throw new Error("unreadable row survived its confirmed delete");
  await ctx.screenshot("recovery01-after-repair-and-delete");

  // ---- Roster-level general import IA ---------------------------------------
  const perRowImports = await page.locator("a.roster-import").count();
  ctx.checkpoint("per-row-import-links", perRowImports);
  if (perRowImports !== 0) throw new Error(`${perRowImports} per-row Import anchors remain`);
  const charPanelDetails = page.locator(".roster-characters details.roster-import-panel");
  await charPanelDetails.locator("summary").click(); // open → options build lazily
  // Options are rebuilt by the panel's toggle handler; wait for the fresh set.
  const targetOption = charPanelDetails.locator(
    `select.import-target option[value="${characterId}"]`,
  );
  try {
    await targetOption.waitFor({ state: "attached", timeout: 10_000 });
  } catch {
    const seen = await charPanelDetails
      .locator("select.import-target option")
      .evaluateAll((options) => options.map((o) => o.value));
    throw new Error(`readable character ${characterId} missing from replace targets; saw ${JSON.stringify(seen)}`);
  }
  const optionValues = await charPanelDetails.locator("select.import-target option").evaluateAll((options) =>
    options.map((o) => o.value),
  );
  if (!optionValues.includes(characterId)) throw new Error("readable character missing from replace targets");
  ctx.checkpoint("roster-import-panel-options", optionValues.length);

  // Replace flow against the freshly repaired character: partial doc,
  // preview token, confirm, apply — through the shared import page module.
  await charPanelDetails.locator("select.import-target").selectOption(characterId);
  await charPanelDetails.getByRole("button", { name: "Open import" }).click();
  await page.locator("#import-doc").waitFor({ state: "visible", timeout: 10_000 });
  await page.locator("#import-doc").fill('{ "dossier": { "alias": "Recovery Import" } }');
  await page.locator("#import-preview-btn").click();

  // Either a canonical 200 or a NORMALIZATION_REQUIRED 409 renders a Confirm
  // control with a preview token; both are valid confirm/apply cycles.
  await page.locator(".norm-preview").getByRole("button", { name: "Confirm import" }).click({ timeout: 15_000 });

  let imported = true;
  try {
    await page.locator(".import-success").waitFor({ state: "visible", timeout: 15_000 });
  } catch {
    imported = false;
  }
  ctx.checkpoint("roster-import-applies", imported ? 1 : 0);
  if (!imported) throw new Error("roster-panel replace import did not reach OperationResult success");
  await ctx.screenshot("recovery01-roster-import");

  ctx.checkpoint("console-errors", ctx.consoleErrors().length);
}
