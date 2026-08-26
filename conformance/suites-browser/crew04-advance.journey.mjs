// crew04-advance — CREW-04 ability and upgrade safety/layout journey.
//
// Locks the advancement contract on the managed server:
//   - normal mode acquires abilities/upgrades (take + mark stay available);
//   - removal/decrement controls do NOT exist until the explicit
//     advancement-edit mode is toggled on (and vanish again when off);
//   - a filled lair-chart box (an unmark in disguise) is inert in normal mode;
//   - the selected ability's description renders as a full-width block BELOW
//     the picker row (UX-010), updating on selection change;
//   - a full round trip: take ability -> mark upgrade -> edit mode ->
//     unmark box -> remove ability -> toggle off hides destructors.
//
// Exports the BROWSER-01 journey contract { id, checkpoints, run }.

export const id = "crew04-advance";

export const checkpoints = [
  {
    id: "advance-gated-in-normal-mode",
    description:
      "removal/unmark controls absent and filled chart boxes disabled while acquisition stays available",
  },
  {
    id: "description-below-picker",
    description:
      "selected ability's description renders as a full-width block below the picker row and follows selection",
  },
  { id: "ability-taken", description: "take posts ops/ability.take and renders the entry" },
  { id: "upgrade-marked", description: "chart-box click posts ops/upgrade.mark" },
  {
    id: "edit-mode-reveals-destructors",
    description: "toggling shows remove/unmark controls and enables filled boxes",
  },
  { id: "unmark-posts", description: "decrementing a box posts ops/upgrade.unmark in edit mode" },
  { id: "ability-removed", description: "remove posts ops/ability.remove and clears the entry" },
];

const TAKE_SELECT = 'select[aria-label="Take ability"]';
const TAKE_BTN = 'button[title="Take ability"]';
const ADVANCE_TOGGLE = "button.advancement-toggle";
const PICKER_ROW = ".ability-picker-row";

/** Snapshot of the playbook's gating-relevant state (browser-scoped only;
 * everything resolves through live DOM queries, no node-side constants). */
async function gatingState(page) {
  return page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const qa = (s) => Array.from(document.querySelectorAll(s));
    const removeBtns = qa('button[title^="Remove ability"]').map((b) => b.getAttribute("title"));
    const unmarkBtns = qa('button[title^="Unmark upgrade"]').map((b) => b.getAttribute("title"));
    const rows = qa(".lair-chart .chart-row").map((r) => ({
      name: r.getAttribute("data-upgrade"),
      boxes: Array.from(r.querySelectorAll(".chart-box")).map((b) => ({
        filled: b.getAttribute("data-stress") === "1",
        disabled: b.disabled,
      })),
    }));
    const toggle = q("button.advancement-toggle");
    const pickRow = q(".ability-picker-row");
    const desc = q(".ability-description");
    // First clickable empty chart box (acquisition path): row index + box data-index.
    let fillable = null;
    rows.forEach((r, ri) => {
      r.boxes.forEach((b, bi) => {
        if (!b.filled && !b.disabled && !fillable) fillable = { rowIndex: ri, dataIndex: bi + 1 };
      });
    });
    let filledEnabled = null;
    rows.forEach((r, ri) => {
      r.boxes.forEach((b, bi) => {
        if (b.filled && !b.disabled && !filledEnabled)
          filledEnabled = { rowIndex: ri, dataIndex: bi + 1 };
      });
    });
    return {
      removeCount: removeBtns.length,
      unmarkCount: unmarkBtns.length,
      rows,
      fillable,
      filledEnabled,
      markedCount: rows.reduce((n, r) => n + r.boxes.filter((b) => b.filled).length, 0),
      everyFilledDisabled: rows.every((r) =>
        r.boxes.filter((b) => b.filled).every((b) => b.disabled),
      ),
      toggleAriaPressed: toggle?.getAttribute("aria-pressed") ?? null,
      descPresent: !!desc,
      descHasSummary: !!desc?.querySelector("summary"),
      descBelowPicker: !!(pickRow && desc && pickRow.nextElementSibling === desc),
      descFullWidth: /width:\s*100%/.test(desc?.getAttribute("style") ?? ""),
      descText: desc?.textContent ?? "",
      takeOptionCount: (() => {
        const sel = q('select[aria-label="Take ability"]');
        return sel ? Array.from(sel.options).filter((o) => o.value !== "").length : 0;
      })(),
      takenEntries: qa(".ability-entry").length,
    };
  });
}

/** Click a chart box by position (name-free selectors: game-data names carry
 * colons/spaces that naive CSS attribute quoting would mangle). */
function chartBoxLocator(page, rowIndex, dataIndex) {
  return page.locator(".lair-chart .chart-row").nth(rowIndex).locator(`.chart-box[data-index="${dataIndex}"]`);
}

export async function run(page, ctx) {
  // Load the SPA first so the create fetch below is same-origin (the server
  // is no-CORS by design; a preflight from origin "null" would be refused).
  await ctx.goto("/");
  const created = await createCrew(page, ctx.baseUrl);
  if (!created?.crew?.id) {
    throw new Error(`crew creation failed: ${JSON.stringify(created?.error ?? created)}`);
  }

  await ctx.goto(`/crew/${created.crew.id}`);
  await page.locator(".crew-playbook").waitFor({ state: "visible", timeout: 10_000 });

  // -- Description layout (UX-010) --------------------------------------------
  let s = await gatingState(page);
  if (!s.descPresent || s.descHasSummary || !s.descBelowPicker || !s.descFullWidth || !s.descText) {
    throw new Error(`description layout wrong: ${JSON.stringify({ ...s, descText: !!s.descText })}`);
  }

  // Follows selection change (when more than one option exists).
  if (s.takeOptionCount >= 2) {
    const secondValue = await page.$eval(
      TAKE_SELECT,
      (sel) => sel.options[2]?.value ?? sel.options[1].value,
    );
    await page.selectOption(TAKE_SELECT, secondValue);
    const changed = await page.$eval(".ability-description", (el) => el.textContent);
    if (!changed || changed === s.descText) {
      throw new Error("description did not follow selection");
    }
  }
  ctx.checkpoint("description-below-picker", 1);

  // -- Normal mode: acquisition available, destruction gated ------------------
  s = await gatingState(page);
  if (
    !(await page.locator(TAKE_BTN).isEnabled()) ||
    s.takeOptionCount === 0 ||
    s.removeCount !== 0 ||
    s.unmarkCount !== 0 ||
    !s.everyFilledDisabled ||
    !s.fillable
  ) {
    throw new Error(`gating state wrong in normal mode: ${JSON.stringify(s)}`);
  }
  ctx.checkpoint("advance-gated-in-normal-mode", 1);

  // -- Acquire: take an ability ------------------------------------------------
  const takeName = await page.$eval(TAKE_SELECT, (sel) => {
    const first = Array.from(sel.options).find((o) => o.value !== "");
    return first ? first.value : null;
  });
  const takeResponse = page.waitForResponse(
    (r) => r.url().includes("/ops/ability.take") && r.status() === 200,
  );
  await page.selectOption(TAKE_SELECT, takeName);
  await page.locator(TAKE_BTN).click();
  await takeResponse;
  await page
    .locator(".ability-entry")
    .first()
    .waitFor({ state: "visible", timeout: 10_000 });
  const takenCount = await page.locator(".ability-entry").count();
  if (takenCount < 1) throw new Error("no ability entry after take");
  ctx.checkpoint("ability-taken", takenCount);

  // -- Acquire: mark one upgrade box from the lair chart -----------------------
  const beforeMarked = s.markedCount;
  const fillable = s.fillable;
  const markResponse = page.waitForResponse(
    (r) => r.url().includes("/ops/upgrade.mark") && r.status() === 200,
  );
  await chartBoxLocator(page, fillable.rowIndex, fillable.dataIndex).click();
  await markResponse;
  // The op replies before the page's refetch+re-render lands; wait for the
  // DOM to reflect the new filled box before counting.
  await page
    .locator(".lair-chart .chart-row")
    .nth(fillable.rowIndex)
    .locator(`.chart-box[data-index="${fillable.dataIndex}"][data-stress="1"]`)
    .waitFor({ state: "visible", timeout: 10_000 });
  const afterMark = await gatingState(page);
  if (afterMark.markedCount !== beforeMarked + 1) {
    throw new Error(`upgrade mark did not land: ${beforeMarked} -> ${afterMark.markedCount}`);
  }
  ctx.checkpoint("upgrade-marked", afterMark.markedCount);

  // -- Edit mode reveals destructors -------------------------------------------
  await page.locator(ADVANCE_TOGGLE).click();
  await page.waitForFunction(
    () =>
      document.querySelector("button.advancement-toggle")?.getAttribute("aria-pressed") === "true",
  );
  s = await gatingState(page);
  if (
    s.toggleAriaPressed !== "true" ||
    s.removeCount === 0 ||
    s.unmarkCount === 0 ||
    !s.filledEnabled
  ) {
    throw new Error(`edit mode did not reveal destructor controls: ${JSON.stringify({
      ...s, rows: undefined,
    })}`);
  }
  ctx.checkpoint("edit-mode-reveals-destructors", s.removeCount + s.unmarkCount);
  await ctx.screenshot("crew04-advance-edit-mode");

  // -- Decrement: click the box we just marked (filled -> inert off-edit only) --
  const beforeUnmarked = afterMark.markedCount;
  const unmarkResponse = page.waitForResponse(
    (r) => r.url().includes("/ops/upgrade.unmark") && r.status() === 200,
  );
  await chartBoxLocator(page, fillable.rowIndex, fillable.dataIndex).click();
  const unmarkResponseResult = await unmarkResponse;
  // Same refetch race as the mark path above: the op replies before the
  // page's refetch+re-render lands, so wait for the box to visibly unfill
  // BEFORE snapshotting the counts.
  await page
    .locator(".lair-chart .chart-row")
    .nth(fillable.rowIndex)
    .locator(`.chart-box[data-index="${fillable.dataIndex}"][data-stress="0"]`)
    .waitFor({ state: "visible", timeout: 10_000 });
  const afterUnmark = await gatingState(page);
  if (afterUnmark.markedCount !== beforeUnmarked - 1) {
    const body = await unmarkResponseResult.json().catch(() => null);
    throw new Error(
      `unmark did not land: ${beforeUnmarked} -> ${afterUnmark.markedCount} | ` +
      `rows=${JSON.stringify(afterUnmark.rows)} | response=${JSON.stringify(body?.error ?? body?.applied ?? body)}`,
    );
  }
  ctx.checkpoint("unmark-posts", 1);

  // -- Remove the taken ability --------------------------------------------------
  const removeResponse = page.waitForResponse(
    (r) => r.url().includes("/ops/ability.remove") && r.status() === 200,
  );
  await page.locator(".ability-entry").first().locator("button").click();
  await removeResponse;
  await page
    .locator(".ability-entry")
    .waitFor({ state: "hidden", timeout: 10_000 })
    .catch(() => {});
  const removedCount = await page.locator(".ability-entry").count();
  if (removedCount !== 0) throw new Error(`ability entry still present after remove`);
  ctx.checkpoint("ability-removed", 1);

  // Toggling edit mode back off hides destructors again.
  await page.locator(ADVANCE_TOGGLE).click();
  await page.waitForFunction(
    () =>
      document.querySelector("button.advancement-toggle")?.getAttribute("aria-pressed") === "false",
  );
  s = await gatingState(page);
  if (s.removeCount !== 0 || s.unmarkCount !== 0) {
    throw new Error("destructors persisted after leaving edit mode");
  }
}

async function createCrew(page, baseUrl) {
  return page.evaluate(async (url) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ gameStem: "blades-in-the-dark", crewType: "Bravos" }),
    });
    return res.json();
  }, new URL("/api/crews", baseUrl).href);
}
