// crew01-cohort-add — CREW-05 journey.
//
// Reproduces and locks the cohort conditional-validation behavior on the
// managed server: the add form shows ONLY the selected kind's type field
// (gang select for kind=gang, expert select — plus Custom free-text — for
// kind=expert), the contract-required field (cohortKind, the only field
// openapi requires on cohort.add) is marked, Add is not gated by invented
// requirements (a blank type is contract-legal), and a full gang-cohort add
// round-trips through ops/cohort.add.
//
// Exports the BROWSER-01 journey contract { id, checkpoints, run }.

export const id = "crew01-cohort-add";

export const checkpoints = [
  {
    id: "conditional-gang-only",
    description:
      "1 when kind=gang shows exactly one type field (the gang select) and hides the expert select",
  },
  {
    id: "conditional-expert-only",
    description:
      "1 when kind=expert shows exactly one type field (the expert select) and hides the gang select",
  },
  {
    id: "custom-reveals-text",
    description:
      "1 when choosing expert type Custom reveals the free-text input",
  },
  {
    id: "kind-required-marked",
    description:
      "1 when the Kind select carries aria-required=true with a visible marker",
  },
  {
    id: "add-not-overgated",
    description:
      "1 when Add stays enabled while no type/quality is filled (blank type is contract-legal)",
  },
  {
    id: "cohort-added-cards",
    description: "cohort card count after one successful gang add (1 expected)",
  },
];

const KIND = 'select[aria-label="Cohort kind"]';
const GANG_TYPE = 'select[aria-label="Cohort gang type"]';
const EXPERT_TYPE = 'select[aria-label="Cohort expert type"]';
const QUALITY = 'input[aria-label="Cohort quality"]';
const SCALE = 'input[aria-label="Cohort scale"]';
const ADD_BTN = 'button[title="Add cohort"]';

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

export async function run(page, ctx) {
  // Load the SPA first so the create fetch below is same-origin (the server
  // is no-CORS by design; a preflight from origin "null" would be refused).
  await ctx.goto("/");
  const created = await createCrew(page, ctx.baseUrl);
  if (!created?.crew?.id) {
    throw new Error(`crew creation failed: ${JSON.stringify(created?.error ?? created)}`);
  }

  await ctx.goto(`/crew/${created.crew.id}`);
  await page.locator(".crew-cohorts").waitFor({ state: "visible", timeout: 10_000 });

  const formState = () =>
    page.evaluate(() => {
      const q = (s) => document.querySelector(s);
      const shown = (control) => {
        if (!control) return false;
        const wrapper = control.closest(".cohort-field") ?? control;
        return !wrapper.hidden && wrapper.offsetParent !== null;
      };
      return {
        gangShown: shown(q('select[aria-label="Cohort gang type"]')),
        expertShown: shown(q('select[aria-label="Cohort expert type"]')),
        customShown: shown(q('input[aria-label="Cohort expert custom type"]')),
        kindAriaRequired:
          q('select[aria-label="Cohort kind"]')?.getAttribute("aria-required") ?? null,
        markerPresent:
          !!document.querySelector(".crew-cohorts .cohort-add .required-marker"),
        addDisabled: q('button[title="Add cohort"]')?.disabled ?? null,
      };
    });

  // Default kind=gang: gang select is THE type field; expert select hidden.
  let s = await formState();
  if (!(s.gangShown && !s.expertShown)) {
    throw new Error(`kind=gang should show gang type only: ${JSON.stringify(s)}`);
  }
  ctx.checkpoint("conditional-gang-only", 1);

  // CREW-05: cohortKind is the only openapi-required add-form field.
  if (s.kindAriaRequired !== "true" || !s.markerPresent) {
    throw new Error(`contract-required Kind field is not marked: ${JSON.stringify(s)}`);
  }
  ctx.checkpoint("kind-required-marked", 1);

  // Contract allows omitting the type (backend stores canonical empties), so
  // Add must NOT be disabled before any type is chosen (no invented gating).
  if (s.addDisabled !== false) {
    throw new Error(`Add over-gates on non-contract requirements: ${JSON.stringify(s)}`);
  }
  ctx.checkpoint("add-not-overgated", 1);

  // Switch to expert: expert select becomes THE type field; Custom reveals text.
  await page.selectOption(KIND, "expert");
  s = await formState();
  if (!(!s.gangShown && s.expertShown)) {
    throw new Error(`kind=expert should show expert type only: ${JSON.stringify(s)}`);
  }
  ctx.checkpoint("conditional-expert-only", 1);

  await page.selectOption(EXPERT_TYPE, "Custom");
  s = await formState();
  if (!s.customShown) {
    throw new Error(`expert Custom did not reveal the free-text input: ${JSON.stringify(s)}`);
  }
  ctx.checkpoint("custom-reveals-text", 1);
  await ctx.screenshot("crew01-cohort-conditional-fields");

  // Full round trip: add a gang cohort and see its card render.
  await page.selectOption(KIND, "gang");
  await page.selectOption(GANG_TYPE, "Skulls");
  await page.fill(QUALITY, "3");
  await page.fill(SCALE, "2");
  const addResponse = page.waitForResponse(
    (r) => r.url().includes("/ops/cohort.add") && r.status() === 200,
  );
  await page.locator(ADD_BTN).click();
  await addResponse;
  await page
    .locator('.cohort-entry[data-cohort-kind="gang"]')
    .first()
    .waitFor({ state: "visible", timeout: 10_000 });
  const cardCount = await page.locator(".cohort-entry").count();
  if (cardCount < 1) {
    throw new Error(`expected >=1 cohort card after add, found ${cardCount}`);
  }
  ctx.checkpoint("cohort-added-cards", cardCount);
  await ctx.screenshot("crew01-cohort-added");
}
