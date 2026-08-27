// pc-chargen — CONTRACT-01 stage 3 journey.
//
// Walks the validated PC chargen flow against the managed server: playbook
// selection, dot allocation within the settings-derived budget (7 dots, per-
// action max 2), submit, and navigation to the created character sheet.
//
// Exports the BROWSER-01 journey contract { id, checkpoints, run }.

export const id = "pc-chargen";

export const checkpoints = [
  {
    id: "chargen-unspent-initial",
    description: "unspent Talent dots shown before allocation (7 expected from Blades settings)",
  },
  {
    id: "chargen-unspent-at-submit",
    description: "unspent Talent dots at submit time (0 expected)",
  },
  {
    id: "created-navigated",
    description: "1 when navigation to the created /character/{id} sheet occurred",
  },
];

const UNSPENT = "[data-chargen-unspent]";
const PLAYBOOK = "#pc-playbook";

async function clickDot(page, action, index) {
  const btn = page.locator(`.pc-chargen-form button[aria-label="${action} ${index}"]`);
  await btn.waitFor({ state: "visible", timeout: 10_000 });
  await btn.click();
}

async function unspentValue(page) {
  return Number(await page.locator(UNSPENT).textContent());
}

export async function run(page, ctx) {
  await ctx.goto("/character/create");

  // The chargen form only renders when game settings publish a budget; the
  // seeded Blades settings do (StartingActionDots 7, StartingActionDotMax 2).
  await page.locator(".pc-chargen-form").waitFor({ state: "visible", timeout: 10_000 });

  const initial = await unspentValue(page);
  if (initial !== 7) {
    throw new Error(`expected initial unspent dots of 7 from settings, found ${initial}`);
  }
  ctx.checkpoint("chargen-unspent-initial", initial);

  await page.locator(PLAYBOOK).selectOption("Cutter");
  // Blades settings give Cutter DefaultActionPoints {Skirmish: 2, Command: 1}
  // — prefilled, LOCKED, and counted against the same 7-dot budget (DEC-01).
  // Allocate only the remaining 4 dots without exceeding the per-action cap:
  // Hunt 2 + Study 2 = 4.
  await clickDot(page, "Hunt", 2);
  await clickDot(page, "Study", 2);

  const atSubmit = await unspentValue(page);
  ctx.checkpoint("chargen-unspent-at-submit", atSubmit);

  const submit = page.locator('.pc-chargen-form button[type="submit"]');
  if (await submit.isDisabled()) {
    throw new Error("submit stayed disabled with a complete allocation");
  }

  await Promise.all([
    page.waitForURL(/\/character\/[0-9a-f-]{36}$/, { timeout: 15_000 }),
    submit.click(),
  ]);
  ctx.checkpoint("created-navigated", 1);

  await page
    .locator(".pc-completion-cues, .character-detail")
    .first()
    .waitFor({ state: "visible", timeout: 10_000 });
}
