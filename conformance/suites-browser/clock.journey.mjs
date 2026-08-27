// clock — BROWSER-02 top-level journey 6/6 (spec §16 AR-005).
//
// Clocks across their whole contract: bounded clocks clamp at full, rollover
// clocks carry overflow into the reset (progress/overflow), relationship
// links are cleaned up on unlink-by-delete (W4), a deleted owner reassigns
// its standalone clocks to campaign ownership (W5), a degraded clock row
// stays reachable in the total list and deletes by content token, and the UI
// create/delete controls round-trip. Closes with the character-detail matrix
// (the Projects surface lives on the sheet).
//
// Sub-checkpoint modules: none — this journey is all new coverage.

import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { composeCtx, runRouteThemeMatrix, unionCheckpoints } from "./lib.mjs";

export const id = "clock";

export const checkpoints = [
  { id: "bounded-clock-created", description: "bounded clock created through the Projects form" },
  { id: "bounded-progress-clamps", description: "progress past size clamps at full (segments == size)" },
  { id: "rollover-clock-created", description: "rollover clock created through the Projects form" },
  { id: "rollover-overflow-carried", description: "progress past size carries into rollover; reset re-applies it" },
  { id: "relationship-unlinked-on-delete", description: "deleting a linked clock removes it from relatedClockIds (W4)" },
  { id: "owner-deletion-reassigns", description: "deleting the owning crew reassigns its clock to campaign (W5)" },
  { id: "degraded-clock-deleted", description: "a degraded clock row deletes via its sha256 content token" },
  { id: "matrix-entries", description: "character-detail matrix entries exercised (9 expected)" },
];

function sha256Token(text) {
  return `sha256:${createHash("sha256").update(text).digest("hex")}`;
}

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

async function createClockApi(baseUrl, body) {
  const res = await api(baseUrl, "clocks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status !== 200) throw new Error(`clock create -> ${res.status}: ${res.text.slice(0, 200)}`);
  return JSON.parse(res.text);
}

async function getClockApi(baseUrl, clockId) {
  const res = await api(baseUrl, `clocks/${clockId}`);
  return { status: res.status, body: res.status === 200 ? JSON.parse(res.text) : null };
}

async function clockProgressText(page, clockId) {
  return page.locator(`.project-clock[data-clock-id="${clockId}"] .project-clock-progress`).textContent();
}

export async function run(page, ctx) {
  const { baseUrl } = ctx;
  const dataDir = process.env.PITD_DATA_DIR;
  if (!dataDir) throw new Error("PITD_DATA_DIR missing from journey environment");
  const wrapped = composeCtx(ctx);
  // Load the SPA first so the create fetch below is same-origin (the server
  // is no-CORS by design; a preflight from origin "null" would be refused).
  await ctx.goto("/");
  const characterId = await createCharacter(page, baseUrl);
  await ctx.goto(`/character/${characterId}`);
  await page.locator('[data-section="projects"]').waitFor({ state: "visible", timeout: 15_000 });

  // -- 1. Bounded clock: create, progress, clamp at full ----------------------
  await page.locator('input[aria-label="Clock name"]').fill("Hunt Ledger");
  await page.locator('select[aria-label="Clock kind"]').selectOption("bounded");
  await page.locator('input[aria-label="Clock size"]').fill("3");
  await page.locator('button[title="Create clock"]').click();
  const boundedClock = page.locator('.project-clock[data-clock-kind="project"]', { hasText: "Hunt Ledger" });
  await boundedClock.waitFor({ state: "visible", timeout: 15_000 });
  const boundedId = await boundedClock.getAttribute("data-clock-id");
  ctx.checkpoint("bounded-clock-created", 1);

  const plus = boundedClock.locator('button[title="Add 1 segment: Hunt Ledger"]');
  for (let i = 0; i < 5; i++) await plus.click();
  await page.waitForFunction(
    (cid) => document.querySelector(`.project-clock[data-clock-id="${cid}"] .project-clock-progress`)?.textContent?.trim() === "3 / 3",
    boundedId,
    { timeout: 15_000 },
  );
  const clamped = await getClockApi(baseUrl, boundedId);
  if (clamped.body?.segments !== 3 || clamped.body?.rollover !== 0) {
    throw new Error(`bounded clock did not clamp at full: ${JSON.stringify(clamped.body)}`);
  }
  ctx.checkpoint("bounded-progress-clamps", 1);
  await ctx.screenshot("clock-bounded-clamped");

  // -- 2. Rollover clock: overflow carries, reset re-applies ------------------
  await page.locator('input[aria-label="Clock name"]').fill("Manhunt");
  await page.locator('select[aria-label="Clock kind"]').selectOption("rollover");
  await page.locator('input[aria-label="Clock size"]').fill("2");
  await page.locator('button[title="Create clock"]').click();
  const rolloverClock = page.locator('.project-clock[data-clock-kind="rollover"]', { hasText: "Manhunt" });
  await rolloverClock.waitFor({ state: "visible", timeout: 15_000 });
  const rolloverId = await rolloverClock.getAttribute("data-clock-id");
  ctx.checkpoint("rollover-clock-created", 1);

  const rPlus = rolloverClock.locator('button[title="Add 1 segment: Manhunt"]');
  for (let i = 0; i < 3; i++) await rPlus.click();
  await page.waitForFunction(
    (cid) => document.querySelector(`.project-clock[data-clock-id="${cid}"] .project-clock-progress`)?.textContent?.includes("rollover 1"),
    rolloverId,
    { timeout: 15_000 },
  );
  // Reset: carried overflow re-applies after zeroing (1 / 2).
  await rolloverClock.locator('button[title="Reset clock: Manhunt"]').click();
  await page.waitForFunction(
    (cid) => document.querySelector(`.project-clock[data-clock-id="${cid}"] .project-clock-progress`)?.textContent?.trim().startsWith("1 / 2"),
    rolloverId,
    { timeout: 15_000 },
  );
  ctx.checkpoint("rollover-overflow-carried", 1);
  await ctx.screenshot("clock-rollover-reset-reapplied");

  // -- 3. Relationship unlink on delete (W4) -----------------------------------
  const linkDoc = await createClockApi(baseUrl, {
    name: "Linked Omen",
    ownerKind: "campaign",
    ownerId: "",
    purpose: "linked",
    behavior: "bounded",
    size: 4,
    relatedClockIds: [boundedId],
  });
  const linkId = linkDoc.id ?? linkDoc.clock?.id;
  if (!linkId) throw new Error(`linked clock create returned no id: ${JSON.stringify(linkDoc).slice(0, 200)}`);
  let linkedCheck = await getClockApi(baseUrl, linkId);
  if (!(linkedCheck.body?.relatedClockIds ?? []).includes(boundedId)) {
    throw new Error("relatedClockIds missing the linked clock after create");
  }
  // Deleting the OTHER clock must unlink it from every survivor (W4).
  const delLinked = await api(baseUrl, `clocks/${linkId}/delete`, {
    method: "POST",
    headers: { "content-type": "application/json", "if-match": String(linkedCheck.body.revision) },
    body: JSON.stringify({ confirm: true }),
  });
  if (delLinked.status !== 200) throw new Error(`linked clock delete -> ${delLinked.status}: ${delLinked.text.slice(0, 160)}`);
  linkedCheck = await getClockApi(baseUrl, boundedId);
  if ((linkedCheck.body?.relatedClockIds ?? []).includes(linkId)) {
    throw new Error("delete left a dangling relatedClockIds entry — W4 unlink failed");
  }
  ctx.checkpoint("relationship-unlinked-on-delete", 1);

  // -- 4. Owner deletion reassignment (W5) --------------------------------------
  const crewRes = await api(baseUrl, "crews", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ gameStem: "blades-in-the-dark", crewType: "Bravos" }),
  });
  if (crewRes.status !== 200) throw new Error(`owner crew create -> ${crewRes.status}`);
  const ownerCrewId = JSON.parse(crewRes.text).crew.id;
  const ownedClock = await createClockApi(baseUrl, {
    name: "Crew Vengeance",
    ownerKind: "crew",
    ownerId: ownerCrewId,
    purpose: "danger",
    behavior: "bounded",
    size: 6,
  });
  const ownedId = ownedClock.id ?? ownedClock.clock?.id;
  const ownerCrew = await api(baseUrl, `crews/${ownerCrewId}`);
  if (ownerCrew.status !== 200) throw new Error(`owner crew read -> ${ownerCrew.status}`);
  const ownerCrewRevision = String(JSON.parse(ownerCrew.text).revision);
  const deleteCrewRes = await api(baseUrl, `crews/${ownerCrewId}/delete`, {
    method: "POST",
    headers: { "content-type": "application/json", "if-match": ownerCrewRevision },
    body: JSON.stringify({ confirm: true }),
  });
  if (deleteCrewRes.status !== 200) {
    throw new Error(`owner crew delete -> ${deleteCrewRes.status}: ${deleteCrewRes.text.slice(0, 200)}`);
  }
  const deleteBody = JSON.parse(deleteCrewRes.text);
  const sideEffects = JSON.stringify(deleteBody?.sideEffects ?? deleteBody ?? {});
  const reassigned = await getClockApi(baseUrl, ownedId);
  if (reassigned.status !== 200 || reassigned.body?.ownerKind !== "campaign") {
    throw new Error(`clock not reassigned to campaign after owner deletion: ${JSON.stringify(reassigned.body)}`);
  }
  if (!sideEffects.includes("reassigned")) {
    throw new Error(`crew delete result does not report the reassignment: ${sideEffects.slice(0, 200)}`);
  }
  ctx.checkpoint("owner-deletion-reassigns", 1);

  // -- 5. Degraded clock: reachable in the total list, deleted by token -------
  const degradedId = randomUUID();
  const degradedBytes = '{ "kind": "clock", "id": "trunc';
  await mkdir(join(dataDir, "clocks", degradedId), { recursive: true });
  await writeFile(join(dataDir, "clocks", degradedId, "current.json"), degradedBytes);
  await page.reload({ waitUntil: "load" });
  await page.locator('[data-section="projects"]').waitFor({ state: "visible", timeout: 15_000 });
  // E11: the unreadable clock still renders as a row (total collection), via
  // the projects list the sheet fetched. Prove reachability server-side too.
  const listRes = await api(baseUrl, "clocks");
  const list = JSON.parse(listRes.text);
  const degradedRow = list.find((c) => c.id === degradedId);
  if (!degradedRow || degradedRow.isReadable !== false || !degradedRow.deleteToken) {
    throw new Error(`degraded clock missing/unreachable in list: ${JSON.stringify(degradedRow)}`);
  }
  if (degradedRow.deleteToken !== sha256Token(degradedBytes)) {
    throw new Error("degraded clock deleteToken is not the sha256 content token");
  }
  const degradedDel = await api(baseUrl, `clocks/${degradedId}/delete`, {
    method: "POST",
    headers: { "content-type": "application/json", "if-match": degradedRow.deleteToken },
    body: JSON.stringify({ confirm: true }),
  });
  if (degradedDel.status !== 200) {
    throw new Error(`degraded clock delete -> ${degradedDel.status}: ${degradedDel.text.slice(0, 200)}`);
  }
  const afterDelete = await getClockApi(baseUrl, degradedId);
  if (afterDelete.status !== 404) {
    throw new Error(`degraded clock survived its token delete (GET -> ${afterDelete.status})`);
  }
  ctx.checkpoint("degraded-clock-deleted", 1);

  // -- 6. UI delete round trip: remove the bounded clock from the sheet --------
  await page.reload({ waitUntil: "load" });
  await page.locator('[data-section="projects"]').waitFor({ state: "visible", timeout: 15_000 });
  const boundedAfter = page.locator(`.project-clock[data-clock-id="${boundedId}"]`);
  if ((await boundedAfter.count()) > 0) {
    await boundedAfter.locator(`button[title="Delete clock: Hunt Ledger"]`).click();
    await boundedAfter.waitFor({ state: "detached", timeout: 15_000 });
  }
  if ((await getClockApi(baseUrl, boundedId)).status !== 404) {
    throw new Error("bounded clock survived its UI delete");
  }

  // -- 7. Route/theme matrix: the character-detail surface (Projects lives here)
  const entries = await runRouteThemeMatrix(page, ctx, id, [
    {
      key: "character-detail",
      path: `/character/${characterId}`,
      waitFor: ".character-detail",
      landmarks: [".character-detail", '[data-section="projects"]', ".clock-create-form"],
    },
  ]);
  ctx.checkpoint("matrix-entries", entries.length);
  if (entries.length !== 9) throw new Error(`clock matrix expected 9 entries, got ${entries.length}`);
}
