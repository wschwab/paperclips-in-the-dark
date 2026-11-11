// SCOUNDREL-CREATE-02 — create a draft, allocate on its durable sheet, finish.
export const id = "pc-chargen";
export const checkpoints = [
  { id: "chargen-unspent-initial", description: "remaining settings-derived dots after playbook defaults on the saved draft" },
  { id: "chargen-unspent-at-submit", description: "zero unspent dots before explicit completion" },
  { id: "created-navigated", description: "navigation to the created sheet before allocation" },
];

export async function run(page, ctx) {
  await ctx.goto("/character/create");
  await page.locator("#pc-playbook").selectOption("Cutter");
  if (await page.locator(".pc-chargen-form .action-dots").count()) throw new Error("creation must not allocate dots");
  await Promise.all([
    page.waitForURL(/\/character\/[0-9a-f-]{36}$/, { timeout: 15_000 }),
    page.locator('.pc-chargen-form button[type="submit"]').click(),
  ]);
  ctx.checkpoint("created-navigated", 1);
  const path = new URL(page.url()).pathname;
  const settings = await (await page.request.get(ctx.baseUrl + "/api/games/blades-in-the-dark")).json();
  const defaults = settings.Playbooks.find(pb => pb.Name === "Cutter").DefaultActionPoints;
  const expected = settings.StartingActionDots - defaults.reduce((sum, a) => sum + a.Points, 0);
  await page.locator("[data-talent-allocation]").waitFor();
  const initial = Number(await page.locator("[data-talent-unspent]").textContent());
  if (initial !== expected) throw new Error(`expected ${expected} unspent dots, found ${initial}`);
  ctx.checkpoint("chargen-unspent-initial", initial);
  for (const action of defaults) {
    if (await page.locator(`.talent-action-row[data-action="${action.Action}"] button`).count()) throw new Error("playbook default is editable");
  }
  // Spend one dot at a time; each new response recalculates the remaining cap.
  while (Number(await page.locator("[data-talent-unspent]").textContent()) > 0) {
    const before = Number(await page.locator("[data-talent-unspent]").textContent());
    await page.locator('.talent-action-row button.action-dot[aria-pressed="false"]').first().click();
    await page.waitForFunction(previous => Number(document.querySelector('[data-talent-unspent]')?.textContent) < previous, before);
  }
  // A real refresh proves allocation is API-backed, not component-local state.
  await ctx.goto(path);
  await page.locator("[data-talent-allocation]").waitFor();
  const remaining = Number(await page.locator("[data-talent-unspent]").textContent());
  if (remaining !== 0) throw new Error("allocation did not survive refresh");
  ctx.checkpoint("chargen-unspent-at-submit", remaining);
  await page.getByRole("button", { name: "Finish Talent allocation", exact: true }).click();
  await page.locator("[data-talent-allocation]").waitFor({ state: "detached" });
  await ctx.goto(path);
  await page.locator(".character-detail").waitFor();
  if (await page.locator("[data-talent-allocation]").count()) throw new Error("completion did not survive refresh");
  const document = await (await page.request.get(ctx.baseUrl + path.replace('/character/', '/api/characters/'))).json();
  if (document.talent.allocationPending !== false) throw new Error("server did not complete allocation");
}
