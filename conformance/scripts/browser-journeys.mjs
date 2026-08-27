// Browser journey enumeration — extracted from browser-suite.mjs so tooling
// tests can exercise the real loader without triggering the suite's CLI
// entry (browser-suite.mjs runs its parent/child flow at import time under
// some runners).
//
// MUT-02 / M28 contract: the child executes EVERY *.journey.mjs module in
// conformance/suites-browser, and the loaded set must equal REQUIRED_IDS —
// a journey that silently fails to load (renamed off the filter, moved, or
// filtered out) fails the run here rather than being absent from
// journey-results.json unnoticed.

import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
export const suitesBrowserDir = join(scriptDir, "..", "suites-browser");

export async function loadJourneys() {
  let files;
  try {
    files = (await readdir(suitesBrowserDir)).filter((name) => name.endsWith(".journey.mjs")).sort();
  } catch (error) {
    throw new Error(`cannot read ${suitesBrowserDir}: ${error.message}`);
  }
  if (files.length === 0) {
    throw new Error(`no *.journey.mjs files found in ${suitesBrowserDir}`);
  }
  const journeys = [];
  const seenIds = new Set();
  for (const file of files) {
    const mod = await import(`${suitesBrowserDir}/${file}`);
    const { id, checkpoints, run, expectedConsoleNoise } = mod;
    if (typeof id !== "string" || id.length === 0) throw new Error(`${file}: must export a non-empty string id`);
    if (seenIds.has(id)) throw new Error(`${file}: duplicate journey id ${id}`);
    seenIds.add(id);
    if (!Array.isArray(checkpoints) || checkpoints.some((c) => typeof c?.id !== "string")) {
      throw new Error(`${file}: must export checkpoints: [{ id, description? }]`);
    }
    if (typeof run !== "function") throw new Error(`${file}: must export async run(page, ctx)`);
    if (expectedConsoleNoise !== undefined && !Array.isArray(expectedConsoleNoise)) {
      throw new Error(`${file}: expectedConsoleNoise must be an array of { urlPattern, text } when declared`);
    }
    journeys.push({ id, checkpoints, run, file, expectedConsoleNoise: expectedConsoleNoise ?? [] });
  }
  // BROWSER-02 (spec §16 AR-005): exactly these six top-level journeys.
  const REQUIRED_IDS = [
    "roster-recovery",
    "character-create-edit",
    "crew-create-trackers",
    "import-repair",
    "lifecycle",
    "clock",
  ];
  const ids = journeys.map((j) => j.id).sort();
  if (ids.length !== REQUIRED_IDS.length || ids.join(",") !== [...REQUIRED_IDS].sort().join(",")) {
    throw new Error(
      `expected exactly the six BROWSER-02 journeys ${JSON.stringify(REQUIRED_IDS)}, found ${JSON.stringify(ids)}`,
    );
  }
  return journeys;
}
