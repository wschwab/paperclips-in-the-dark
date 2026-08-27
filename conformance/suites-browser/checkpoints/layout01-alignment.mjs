// layout01-alignment — LAYOUT-01 (UX-014) roster and sheet alignment journey.
//
// Covers the AUDIT-0 remediation card LAYOUT-01 across three true viewport
// widths (1440 / 768 / 390):
//   1. Roster masthead and Character/Crew plates share explicit grid starts
//      (side-by-side plates begin on the same grid row under the masthead).
//   2. The roster Create/import disclosure sits BESIDE its section heading,
//      not below it.
//   3. The character sheet has no dead vertical hole between section cards
//      caused by uneven pair heights (the former Traumas/Health hole).
//   4. Gear loadout rows form repeated-row grids: bulk text and remove
//      controls share identical left offsets on every row.
//
// Screenshots of the changed surfaces at each width are captured via
// ctx.screenshot() for independent review (models without vision cannot judge
// them directly, so alignment is asserted numerically here).

export const id = "layout01-alignment";

const WIDTHS = [1440, 768, 390];

/** Two-column sheet/roster mode engages at this CSS media breakpoint. */
const WIDE = 900;

export const checkpoints = [
  {
    id: "viewport-loop-completed",
    description: "number of viewports fully verified (3 expected)",
  },
  {
    id: "gear-alignment-recorded",
    description: "gear loadout alignment evidence recorded (1 expected)",
  },
  {
    id: "console-errors",
    description: "console error count observed on layout01 routes (0 expected)",
  },
];

// The seeded server answers GET /api/characters/{id}/capabilities with 400
// for this fixture (SC-F3 fallback path); Chromium logs its standard
// "Failed to load resource" chrome noise. Pre-existing app/server behavior,
// declared so "zero console errors" keeps measuring this journey's surface.
export const expectedConsoleNoise = [
  {
    urlPattern:
      "/api/characters/deadbeef-dead-4ead-8ead-deadbeefdead/capabilities",
    text: "Failed to load resource",
  },
];

const GEAR_ID = "deadbeef-dead-4ead-8ead-deadbeefdead";
/** Already in the seed's availableGear; committing it never breaches caps. */
const SPARE_ITEM = { name: "Fine cover identity", bulk: 0 };

function boxesOf(page) {
  return page.evaluate(() => {
    const box = (sel) => {
      const e = document.querySelector(sel);
      if (!e) return null;
      const b = e.getBoundingClientRect();
      return {
        t: Math.round(b.top + scrollY),
        b: Math.round(b.bottom + scrollY),
        l: Math.round(b.left),
        r: Math.round(b.right),
        h: Math.round(b.height),
      };
    };
    return {
      vw: innerWidth,
      scrollW: document.documentElement.scrollWidth,
      docH: document.documentElement.scrollHeight,
      header: box(".roster-header"),
      chars: box(".roster-characters"),
      crews: box(".roster-crews"),
      charHeading: box(".roster-characters h2"),
      charPanel: box(".roster-characters details"),
      cards: [...document.querySelectorAll("[data-section]")].map((e) => {
        const b = e.getBoundingClientRect();
        return {
          s: e.dataset.section,
          t: Math.round(b.top + scrollY),
          b: Math.round(b.bottom + scrollY),
          l: Math.round(b.left),
          r: Math.round(b.right),
        };
      }),
      gearRows: [...document.querySelectorAll(".gear-loadout-entry")].map(
        (e) => {
          const bulk = e.querySelector(".gear-item-bulk");
          const btn = e.querySelector("button");
          const bb = bulk?.getBoundingClientRect();
          const bt = btn?.getBoundingClientRect();
          return {
            n: e.dataset.gearItem,
            bulkL: bb ? Math.round(bb.left * 10) / 10 : null,
            btnL: bt ? Math.round(bt.left * 10) / 10 : null,
          };
        },
      ),
    };
  });
}

/**
 * Largest vertical hole between CONSECUTIVE cards of the same visual column
 * band (cards sorted by top edge, clustered by left edge). Any defect the
 * finding describes shows up exactly here: a short card's row-mate leaves
 * nothing beneath it in that column until the next packed card starts.
 * Cards in other columns or full-width bands are irrelevant to a column's
 * interior rhythm, and trailing whitespace below a column's last card is
 * normal raggedness, not an interior hole.
 */
function largestColumnHole(cards) {
  const buckets = new Map(); // left -> cards in that column band
  for (const c of cards) {
    let key = -1;
    for (const existing of buckets.keys()) {
      if (Math.abs(c.l - existing) < 60) key = existing;
    }
    if (key === -1) {
      key = c.l;
      buckets.set(key, []);
    }
    buckets.get(key).push(c);
  }
  let worst = 0;
  let culprit = null;
  for (const [, list] of buckets) {
    const ordered = [...list].sort((a, b) => a.t - b.t);
    for (let i = 0; i < ordered.length - 1; i++) {
      const hole = Math.max(0, ordered[i + 1].t - ordered[i].b);
      if (hole > worst) {
        worst = hole;
        culprit = `${ordered[i].s} -> ${ordered[i + 1].s}`;
      }
    }
  }
  return { worst, culprit };
}

async function setViewport(page, width) {
  await page.setViewportSize({ width, height: 1000 });
}

export async function run(page, ctx) {
  let verified = 0;

  for (const width of WIDTHS) {
    await setViewport(page, width);

    // ── Roster ────────────────────────────────────────────────────────────
    await ctx.goto("/roster");
    await page.locator(".roster-characters").waitFor({ timeout: 10_000 });
    const roster = await boxesOf(page);

    if (roster.scrollW > roster.vw) {
      throw new Error(
        `[layout01] ${width}px: horizontal overflow on /roster (scrollWidth ${roster.scrollW} > ${roster.vw})`,
      );
    }

    if (width >= WIDE) {
      // Explicit shared grid starts: masthead shares the sections' column
      // start, and both plates begin on the same grid row.
      if (!roster.header || !roster.chars || !roster.crews) {
        throw new Error(`[layout01] ${width}px: roster regions missing`);
      }
      if (roster.header.l !== roster.chars.l) {
        throw new Error(
          `[layout01] ${width}px: roster masthead left (${roster.header.l}) != character plate left (${roster.chars.l})`,
        );
      }
      if (
        Math.abs(roster.crews.t - roster.chars.t) > 2 ||
        roster.crews.r <= roster.chars.l
      ) {
        throw new Error(
          `[layout01] ${width}px: Character/Crew plates not side-by-side sharing one row start (chars top ${roster.chars.t}, crews top ${roster.crews.t})`,
        );
      }
    }

    // Create/import disclosure sits beside the section heading, not below.
    if (roster.charHeading && roster.charPanel) {
      if (Math.abs(roster.charPanel.t - roster.charHeading.t) > 24) {
        throw new Error(
          `[layout01] ${width}px: Create panel top (${roster.charPanel.t}) not aligned with Characters heading top (${roster.charHeading.t})`,
        );
      }
    }

    await ctx.screenshot(`layout01-roster-${width}`);

    // ── Character sheet ───────────────────────────────────────────────────
    await ctx.goto(`/character/${GEAR_ID}`);
    await page.locator(".character-detail").waitFor({ timeout: 10_000 });
    const sheet = await boxesOf(page);

    if (sheet.scrollW > sheet.vw) {
      throw new Error(
        `[layout01] ${width}px: horizontal overflow on character sheet (scrollWidth ${sheet.scrollW} > ${sheet.vw})`,
      );
    }

    // No dead vertical gap: worst same-column interior hole bounded.
    const hole = largestColumnHole(sheet.cards);
    const TOLERANCE = 48; // normal inter-card breathing room
    if (hole.worst > TOLERANCE) {
      throw new Error(
        `[layout01] ${width}px: dead vertical gap of ${hole.worst}px between ${hole.culprit} (> ${TOLERANCE}px)`,
      );
    }

    await ctx.screenshot(`layout01-sheet-${width}`);
    verified++;
  }

  ctx.checkpoint("viewport-loop-completed", verified);

  // ── Gear remove-control alignment ───────────────────────────────────────
  // Seeds carry exactly one loadout item ("Armor") but already have the spare
  // item in availableGear. Drive the same contract op the UI issues
  // (POST /ops/gear.commit moves it into the loadout), reload, and assert
  // that bulk text and remove buttons share left offsets across rows.
  // Restore seed state via gear.uncommit afterwards.
  await setViewport(page, 1440);

  const committed = await page.evaluate(
    async ({ id, name }) => {
      const rev = Number(
        (
          await fetch(`/api/characters/${id}`, {
            headers: { Accept: "application/json" },
          }).then((r) => r.json())
        ).revision,
      );
      const res = await fetch(`/api/characters/${id}/ops/gear.commit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "If-Match": String(rev),
        },
        body: JSON.stringify({ name }),
      });
      return res.status;
    },
    { id: GEAR_ID, name: SPARE_ITEM.name },
  );
  if (committed !== 200) {
    throw new Error(`[layout01] gear.commit failed: status ${committed}`);
  }

  await ctx.goto(`/character/${GEAR_ID}`);
  await page.waitForFunction(
    () => document.querySelectorAll(".gear-loadout-entry").length >= 2,
    undefined,
    { timeout: 10_000 },
  );

  const rows = (await boxesOf(page)).gearRows.filter((r) => r.n);
  if (rows.length < 2) {
    throw new Error(
      `[layout01] expected >=2 gear rows after add, found ${rows.length}`,
    );
  }
  const [a, b] = rows;
  const JITTER = 2;
  if (
    a.bulkL == null ||
    b.bulkL == null ||
    Math.abs(a.bulkL - b.bulkL) > JITTER ||
    a.btnL == null ||
    b.btnL == null ||
    Math.abs(a.btnL - b.btnL) > JITTER
  ) {
    throw new Error(
      `[layout01] gear columns unstable: bulkL ${a.bulkL}/${b.bulkL}, btnL ${a.btnL}/${b.btnL}`,
    );
  }
  ctx.checkpoint("gear-alignment-recorded", 1);
  await ctx.screenshot("layout01-gear-two-rows");

  // Restore seed state: uncommit returns the item to available-only.
  await page.evaluate(
    async ({ id, name }) => {
      const rev = Number(
        (
          await fetch(`/api/characters/${id}`, {
            headers: { Accept: "application/json" },
          }).then((r) => r.json())
        ).revision,
      );
      await fetch(`/api/characters/${id}/ops/gear.uncommit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "If-Match": String(rev),
        },
        body: JSON.stringify({ name }),
      });
    },
    { id: GEAR_ID, name: SPARE_ITEM.name },
  );
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(
    () => document.querySelectorAll(".gear-loadout-entry").length <= 1,
    undefined,
    { timeout: 10_000 },
  );

  ctx.checkpoint("console-errors", ctx.consoleErrors().length);
}
