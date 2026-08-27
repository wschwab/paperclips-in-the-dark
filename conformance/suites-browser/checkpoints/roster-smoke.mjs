// roster-smoke — BROWSER-01 trivial smoke journey.
//
// Loads /roster on the seeded managed server and asserts the two BROWSER-01
// checkpoint expectations: at least one character row detail link renders
// (E11 total collections keep degraded rows visible too, but the seeded data
// is readable, so real links are expected) and zero console errors occurred.
//
// A journey module exports { id, checkpoints, run }:
//   id          stable string used in journey-results.json
//   checkpoints declared expectations; run() must record each exactly once via
//               ctx.checkpoint(id, numericValue)
//   run         drives the page; ctx supplies baseUrl, goto(path) (which also
//               runs the suite-wide overflow + decode-notice probes),
//               consoleErrors(), screenshot(name), visitedRoutes.

export const id = "roster-smoke";

export const checkpoints = [
  {
    id: "character-row-links",
    description: "count of rendered character row detail links on /roster (>=1 expected)",
  },
  {
    id: "console-errors",
    description: "console error count observed on /roster (0 expected)",
  },
];

// Selector note: each readable character row is li[data-character-id] with a
// detail link href="/character/{id}" plus a separate .roster-import link;
// degraded rows render neither detail link nor .roster-import anchor.
const CHARACTER_ROW_LINK = 'li[data-character-id] a[href]:not(.roster-import)';

export async function run(page, ctx) {
  await ctx.goto("/roster");

  const links = page.locator(CHARACTER_ROW_LINK);
  await links.first().waitFor({ state: "visible", timeout: 10_000 });
  const count = await links.count();
  if (count < 1) {
    throw new Error(`expected >=1 character row link on /roster, found ${count}`);
  }
  ctx.checkpoint("character-row-links", count);

  ctx.checkpoint("console-errors", ctx.consoleErrors().length);
}
