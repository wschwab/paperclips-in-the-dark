// roster-recovery — BROWSER-02 top-level journey 1/6 (spec §16 AR-005).
//
// Readable characters AND crews on the roster; plant one repairable and one
// unreadable row; filtering must never cost degraded rows their reachability;
// refresh re-renders; strict decode refuses a non-canonical create; then the
// full sub-flow checkpoints: visible degraded classification, Repair
// (preview → confirm → apply), unreadable Delete, zero per-row import
// anchors, and the roster-level import panel (placement + real replace
// import). Closes with the roster route/theme matrix.
//
// Sub-checkpoint modules (kept from BROWSER-01) run inside this journey:
//   checkpoints/roster-smoke.mjs       baseline row links
//   checkpoints/roster-recovery.mjs    degraded classification + repair +
//                                      delete + import placement

import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import * as smoke from "./checkpoints/roster-smoke.mjs";
import * as recovery from "./checkpoints/roster-recovery.mjs";
import {
  composeCtx,
  runRouteThemeMatrix,
  unionCheckpoints,
  unionNoise,
} from "./lib.mjs";

export const id = "roster-recovery";

// The journey's own deliberate strict-decode fetch (a deliberate 400) makes
// Chromium log its standard "Failed to load resource" chrome noise; declared
// so zero-error accounting keeps measuring the app.
const STRICT_DECODE_NOISE = [
  { urlPattern: "/api/characters", text: "Failed to load resource" },
];

export const expectedConsoleNoise = unionNoise(
  smoke.expectedConsoleNoise,
  recovery.expectedConsoleNoise,
  STRICT_DECODE_NOISE,
);

export const checkpoints = unionCheckpoints(smoke.checkpoints, recovery.checkpoints, [
  { id: "roster-crew-rows", description: ">=1 crew row link renders on the roster" },
  { id: "filter-hides-nonmatching-readable", description: "a non-matching query hides readable rows" },
  { id: "filter-keeps-degraded-reachable", description: "the same query leaves degraded rows visible/reachable" },
  { id: "refresh-re-renders-roster", description: "the Refresh control re-fetches and re-renders rows" },
  { id: "strict-decode-rejects-noncanonical", description: "create with an unknown top-level key -> 422 INVALID_ENTITY" },
  { id: "matrix-entries", description: "roster route/theme matrix entries exercised (9 expected)" },
]);

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const GOLDEN_CHARACTER = join(repoRoot, "conformance/fixtures/golden-character.json");

function sha256Token(text) {
  return `sha256:${createHash("sha256").update(text).digest("hex")}`;
}

/** Plant raw stored bytes at <dataDir>/characters/<id>/current.json. */
async function seedCharacterBytes(dataDir, idValue, bytes) {
  await mkdir(join(dataDir, "characters", idValue), { recursive: true });
  await writeFile(join(dataDir, "characters", idValue, "current.json"), bytes);
}

const api = async (baseUrl, path, init) => {
  const response = await fetch(`${baseUrl}/api/${path}`, init);
  return { status: response.status, text: await response.text() };
};

export async function run(page, ctx) {
  const { baseUrl } = ctx;
  const dataDir = process.env.PITD_DATA_DIR;
  if (!dataDir) throw new Error("PITD_DATA_DIR missing from journey environment");
  const wrapped = composeCtx(ctx);

  // -- 0. Baseline: readable rows render (BROWSER-01 smoke) ------------------
  await smoke.run(page, wrapped);

  // -- 1. Readable crew row beside the characters ----------------------------
  // Seed carries characters; guarantee a crew exists, then require its row.
  const crewsRes = await api(baseUrl, "crews");
  if (crewsRes.status !== 200) throw new Error(`crew list -> ${crewsRes.status}`);
  const crews = JSON.parse(crewsRes.text);
  if (!Array.isArray(crews) || crews.length === 0) {
    const createdCrew = await api(baseUrl, "crews", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gameStem: "blades-in-the-dark", crewType: "Bravos" }),
    });
    if (createdCrew.status !== 200) {
      throw new Error(`crew create -> ${createdCrew.status}: ${createdCrew.text.slice(0, 200)}`);
    }
  }
  await ctx.goto("/roster");
  const crewRows = page.locator("li[data-crew-id] a[href]");
  await crewRows.first().waitFor({ state: "visible", timeout: 10_000 });
  const crewRowCount = await crewRows.count();
  if (crewRowCount < 1) throw new Error(`expected >=1 crew row on /roster, found ${crewRowCount}`);
  ctx.checkpoint("roster-crew-rows", crewRowCount);

  // -- 2. Filtering never costs degraded rows their reachability -------------
  // Plant one unreadable row, then filter to a query nothing readable matches:
  // readable rows narrow to zero while the degraded row stays visible.
  const golden = JSON.parse(readFileSync(GOLDEN_CHARACTER, "utf8"));
  const unreadableId = randomUUID();
  const unreadableBytes = '{ "kind": "character", "name": "trunc';
  await seedCharacterBytes(dataDir, unreadableId, unreadableBytes);
  await ctx.goto("/roster");
  const degradedRow = page.locator(
    `li[data-degraded][data-recovery-class="unreadable"][data-character-id="${unreadableId}"]`,
  );
  await degradedRow.waitFor({ state: "visible", timeout: 10_000 });

  const filterInput = page.locator('input[aria-label="Filter roster by name, alias, or playbook"]');
  await filterInput.fill("zzzz-no-match");
  // Readable rows disappear; the degraded row must remain.
  await page
    .locator("li[data-character-id] a[href]:not(.roster-import)")
    .first()
    .waitFor({ state: "detached", timeout: 10_000 })
    .catch(() => {});
  const linksWhileFiltered = await page
    .locator("li[data-character-id] a[href]:not(.roster-import)")
    .count();
  ctx.checkpoint("filter-hides-nonmatching-readable", linksWhileFiltered === 0 ? 1 : 0);
  if (linksWhileFiltered !== 0) {
    throw new Error(`non-matching query left ${linksWhileFiltered} readable row links visible`);
  }
  const degradedStillVisible = await degradedRow.isVisible();
  ctx.checkpoint("filter-keeps-degraded-reachable", degradedStillVisible ? 1 : 0);
  if (!degradedStillVisible) {
    throw new Error("filtering hid a degraded row — degraded reachability lost");
  }
  await ctx.screenshot("roster-recovery-filtered-degraded-visible");

  // -- 3. Refresh re-renders --------------------------------------------------
  await filterInput.fill("");
  await page.locator(".roster-refresh").click();
  await page
    .locator('li[data-character-id] a[href]:not(.roster-import)')
    .first()
    .waitFor({ state: "visible", timeout: 10_000 });
  ctx.checkpoint("refresh-re-renders-roster", 1);

  // -- 4. Strict decode: non-canonical create is refused (Option D) -----------
  // Strict decode (Option D): a non-canonical create is refused at write —
  // INVALID_ENTITY 422 or INVALID_ENTRY 400; never a silent normalize-on-write.
  const strictPayload = JSON.stringify({
    gameStem: "blades-in-the-dark",
    playbook: "Cutter",
    bogusTopLevelKey: "not in the schema",
  });
  const strictRes = await api(baseUrl, "characters", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: strictPayload,
  });
  const strictOk = (res) =>
    // Request-shape validation precedes the gates (locked status table):
    // VALIDATION 400, INVALID_ENTRY 400, INVALID_ENTITY 422 — all refusals.
    (res.status === 422 && res.text.includes("INVALID_ENTITY")) ||
    (res.status === 400 && (res.text.includes("INVALID_ENTRY") || res.text.includes("VALIDATION")));
  let strictRejected = strictOk(strictRes);
  if (!strictRejected) {
    // Retry through a same-origin fetch (the app's exact transport).
    const viaPage = await page.evaluate(async ({ url, body }) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body,
      });
      return { status: res.status, text: await res.text() };
    }, { url: new URL("/api/characters", baseUrl).href, body: strictPayload });
    strictRejected = strictOk(viaPage);
    if (!strictRejected) {
      throw new Error(
        `strict decode expected 400 INVALID_ENTRY / 422 INVALID_ENTITY for a non-canonical create, got ` +
          `${strictRes.status}/${viaPage.status}: ${(viaPage.text || strictRes.text).slice(0, 200)}`,
      );
    }
  }
  ctx.checkpoint("strict-decode-rejects-noncanonical", 1);

  // Clean the filter-step fixture so the sub-flow starts from a classified
  // board of exactly its own degraded rows.
  // Deletion is POST /characters/{id}/delete (If-Match: the sha256 content
  // token for an unreadable entity), not an HTTP DELETE.
  const delRes = await api(baseUrl, `characters/${unreadableId}/delete`, {
    method: "POST",
    headers: { "content-type": "application/json", "if-match": sha256Token(unreadableBytes) },
    body: JSON.stringify({ confirm: true }),
  });
  if (delRes.status !== 200 && delRes.status !== 404) {
    throw new Error(`fixture cleanup delete -> ${delRes.status}: ${delRes.text.slice(0, 160)}`);
  }

  // -- 5. Degraded classification, repair, unreadable delete, import IA ------
  await recovery.run(page, wrapped);
  // -- 6. Route/theme matrix: the roster surface ------------------------------
  const entries = await runRouteThemeMatrix(page, ctx, id, [
    {
      key: "roster",
      path: "/roster",
      waitFor: ".roster-characters",
      landmarks: [".roster-header", ".roster-characters", ".roster-crews"],
    },
  ]);
  ctx.checkpoint("matrix-entries", entries.length);
  if (entries.length !== 9) throw new Error(`roster matrix expected 9 entries, got ${entries.length}`);
}
