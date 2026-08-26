// char02-option-editors — CHAR-02 journey.
//
// Creates a Hound through the same-origin unvalidated create endpoint and
// drives every live game-data option editor on the sheet against the managed
// server: playbook ability select (+ live description preview) → take,
// heritage / background / vice canonical-option saves each followed by a real
// page.reload() to prove server-side persistence, including the vice
// free-text purveyor description. The runner probes every visited route for
// decode-failure notices and horizontal overflow automatically.
//
// Exports the BROWSER-01 journey contract { id, checkpoints, run }.

export const id = "char02-option-editors";

export const checkpoints = [
  {
    id: "hound-sheet-visible",
    description: "1 when the Hound character sheet renders",
  },
  {
    id: "ability-preview-description",
    description: "1 when the ability <details> preview shows the selected option's name + game-data description",
  },
  {
    id: "ability-taken-entry",
    description: "row count of taken Ghost Hunter entries after ability.take (1 expected)",
  },
  {
    id: "heritage-saved-reloaded",
    description: "1 when the saved canonical heritage survives a page reload",
  },
  {
    id: "background-saved-reloaded",
    description: "1 when the saved canonical background survives a page reload",
  },
  {
    id: "vice-saved-reloaded",
    description: "1 when the saved canonical vice + purveyor survive a page reload",
  },
];

const ABILITY_SELECT = 'select[aria-label="Take ability"]';
const ABILITY_DETAILS = "details.ability-description";
const ABILITY_NAME = "Ghost Hunter";

async function createCharacter(page, baseUrl) {
  return page.evaluate(async (url) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ gameStem: "blades-in-the-dark", playbook: "Hound" }),
    });
    return res.json();
  }, new URL("/api/characters", baseUrl).href);
}

async function saveOpenEditor(page, scope) {
  await page.locator(`${scope} button[title="Save"]`).click();
}

export async function run(page, ctx) {
  // Load the SPA first so the create fetch below is same-origin (the server
  // is no-CORS by design; a preflight from origin "null" would be refused).
  await ctx.goto("/");
  const created = await createCharacter(page, ctx.baseUrl);
  if (!created?.character?.id) {
    throw new Error(`Hound creation failed: ${JSON.stringify(created?.error ?? created)}`);
  }

  await ctx.goto(`/character/${created.character.id}`);
  await page.locator(".character-detail").waitFor({ state: "visible", timeout: 10_000 });
  await page.locator(ABILITY_SELECT).waitFor({ state: "visible", timeout: 10_000 });
  ctx.checkpoint("hound-sheet-visible", 1);
  await ctx.screenshot("char02-hound-initial");

  // -- 1. Playbook ability select: live name + description preview ----------
  await page.locator(ABILITY_SELECT).selectOption(ABILITY_NAME);
  const summary = page.locator(`${ABILITY_DETAILS} summary`);
  await summary.waitFor({ state: "visible", timeout: 10_000 });
  if ((await summary.textContent())?.trim() !== ABILITY_NAME) {
    throw new Error(`ability preview summary should read ${ABILITY_NAME}`);
  }
  const previewBody = (await page.locator(`${ABILITY_DETAILS} p`).textContent()) ?? "";
  // Real Hound game-data description (game-settings served): spirit-mad pet.
  if (!/spirit/i.test(previewBody)) {
    throw new Error(`ability preview body should show the game-data description, got: ${previewBody}`);
  }
  ctx.checkpoint("ability-preview-description", 1);

  // Take the selected ability: an entry renders with name + description.
  await page.locator('button[title="Take ability"]').click();
  const entry = page.locator(`.ability-entry[data-ability="${ABILITY_NAME}"]`);
  await entry.waitFor({ state: "visible", timeout: 10_000 });
  if (((await entry.locator("p").textContent()) ?? "").length === 0) {
    throw new Error("taken ability entry should render a description");
  }
  ctx.checkpoint("ability-taken-entry", await entry.count());

  // -- 2. Heritage editor: canonical option → save → reload -----------------
  await page.locator('button[title="Edit Heritage"]').click();
  await page.locator('select[aria-label="Heritage (choose)"]').selectOption("Skovlan");
  await saveOpenEditor(page, ".field-editing");
  await page
    .locator(".character-personal")
    .getByText("Skovlan")
    .waitFor({ state: "visible", timeout: 10_000 });

  await page.reload();
  await page.locator(".character-detail").waitFor({ state: "visible", timeout: 10_000 });
  await page
    .locator(".character-personal")
    .getByText(/conquered island nation/)
    .waitFor({ state: "visible", timeout: 10_000 });
  ctx.checkpoint("heritage-saved-reloaded", 1);

  // -- 3. Background editor: same pattern ------------------------------------
  await page.locator('button[title="Edit Background"]').click();
  await page.locator('select[aria-label="Background (choose)"]').selectOption("Trade");
  await saveOpenEditor(page, ".field-editing");
  await page
    .locator(".character-personal")
    .getByText("Trade")
    .waitFor({ state: "visible", timeout: 10_000 });

  await page.reload();
  await page.locator(".character-detail").waitFor({ state: "visible", timeout: 10_000 });
  await page
    .locator(".character-personal")
    .getByText(/skilled crafts-person/)
    .waitFor({ state: "visible", timeout: 10_000 });
  ctx.checkpoint("background-saved-reloaded", 1);

  // -- 4. Vice editor: canonical type + purveyor from Sources + free-text ----
  await page.locator('button[title="Edit Vice"]').click();
  await page.locator('select[aria-label="Vice (choose)"]').selectOption("Gambling");
  // Re-query after the re-render: the purveyor menu fills from Vices[].Sources.
  const purveyorSelect = page.locator('select[aria-label="Vice purveyor (choose)"]');
  await purveyorSelect.waitFor({ state: "visible", timeout: 10_000 });
  const purveyorValue = await purveyorSelect
    .locator("option")
    .nth(1)
    .getAttribute("value");
  await purveyorSelect.selectOption(purveyorValue);
  await page
    .locator('input[aria-label="Vice purveyor description"]')
    .fill("Backroom tables; she waters the drinks.");
  await saveOpenEditor(page, ".vice-editor");

  const viceBlock = page.locator(".character-vice");
  await viceBlock.getByText("Gambling").waitFor({ state: "visible", timeout: 10_000 });
  await viceBlock.getByText(purveyorValue).waitFor({ state: "visible", timeout: 10_000 });
  await ctx.screenshot("char02-vice-saved");

  await page.reload();
  await page.locator(".character-detail").waitFor({ state: "visible", timeout: 10_000 });
  await page
    .locator(".character-vice")
    .getByText(purveyorValue)
    .waitFor({ state: "visible", timeout: 10_000 });
  await page
    .locator(".character-vice")
    .getByText("Backroom tables; she waters the drinks.")
    .waitFor({ state: "visible", timeout: 10_000 });
  ctx.checkpoint("vice-saved-reloaded", 1);
}
