// character-contacts — CONTRACT-05 journey.
//
// Creates a character through the same-origin unvalidated create endpoint,
// opens the sheet, and drives the Contacts section end to end against the
// managed server: add (suggestions sourced from the playbook's BitS rolodex
// data), closeness cycle, and remove. The runner probes every visited route
// for decode-failure notices and horizontal overflow automatically.
//
// Exports the BROWSER-01 journey contract { id, checkpoints, run }.

export const id = "character-contacts";

export const checkpoints = [
  {
    id: "contacts-section-visible",
    description: "1 when the Contacts section renders on the character sheet",
  },
  {
    id: "contact-added-rows",
    description: "contact row count after contact.add (1 expected)",
  },
  {
    id: "contact-cycled-to-friend",
    description: "1 when the badge reads friend after one cycle from contact",
  },
  {
    id: "contact-removed-rows",
    description: "contact row count after contact.remove (0 expected)",
  },
];

const SECTION = ".character-contacts";
const INPUT = 'input[aria-label="New contact"]';
const ADD_BTN = 'button[title="Add contact"]';
const CONTACT_NAME = "Marlane, a pugilist"; // Cutter playbook rolodex name (game-settings data)
async function createCharacter(page, baseUrl) {
  return page.evaluate(async (url) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ gameStem: "blades-in-the-dark", playbook: "Cutter" }),
    });
    return res.json();
  }, new URL("/api/characters", baseUrl).href);
}

function rowLocator(page) {
  return page.locator(`${SECTION} .contact-entry`);
}

export async function run(page, ctx) {
  // Load the SPA first so the create fetch below is same-origin (the server
  // is no-CORS by design; a preflight from origin "null" would be refused).
  await ctx.goto("/");
  const created = await createCharacter(page, ctx.baseUrl);
  if (!created?.character?.id) {
    throw new Error(`character creation failed: ${JSON.stringify(created?.error ?? created)}`);
  }

  await ctx.goto(`/character/${created.character.id}`);
  await page.locator(SECTION).waitFor({ state: "visible", timeout: 10_000 });
  ctx.checkpoint("contacts-section-visible", 1);
  await ctx.screenshot("character-contacts-initial");

  // Add: suggestion list must carry the playbook's rolodex names.
  const suggestion = page.locator(
    `#contact-name-suggestions option[value="${CONTACT_NAME}"]`,
  );
  await suggestion.waitFor({ state: "attached", timeout: 10_000 });

  await page.locator(INPUT).fill(CONTACT_NAME);
  await page.locator(ADD_BTN).click();
  await rowLocator(page).first().waitFor({ state: "visible", timeout: 10_000 });
  const afterAdd = await rowLocator(page).count();
  if (afterAdd !== 1) {
    throw new Error(`expected 1 contact row after add, found ${afterAdd}`);
  }
  ctx.checkpoint("contact-added-rows", afterAdd);

  // Cycle closeness once: contact -> friend (badge text flips).
  const badge = rowLocator(page).locator("button").first();
  if ((await badge.textContent())?.trim() !== "contact") {
    throw new Error(`new contact should start at closeness "contact"`);
  }
  await badge.click();
  await page
    .locator(`${SECTION} .contact-entry button`, { hasText: "friend" })
    .first()
    .waitFor({ state: "visible", timeout: 10_000 });
  ctx.checkpoint("contact-cycled-to-friend", 1);
  await ctx.screenshot("character-contacts-cycled");

  // Remove: the row disappears.
  await rowLocator(page).locator('button[title^="Remove"]').click();
  await rowLocator(page).waitFor({ state: "detached", timeout: 10_000 });
  const afterRemove = await rowLocator(page).count();
  ctx.checkpoint("contact-removed-rows", afterRemove);
}
