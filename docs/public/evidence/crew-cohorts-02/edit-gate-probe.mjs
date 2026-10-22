// CREW-COHORTS-02 probe: the cohort EDIT form enforces an equal number of edges and flaws.
// 3 sizes x light/dark/high. For each: add a gang cohort (1 edge, 1 flaw) through the add form,
// open its edit form, add a second edge (mismatch) and record Save state, warning text, overflow;
// add a flaw (match) and record Save state again. Screenshots are written next to this file.
// Run under the managed launcher (BASE_URL). Writes edit-gate.json.
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../../..");
const { resolveChromiumExecutable } = await import(pathToFileURL(join(repo, "conformance/scripts/lib/chromium-resolve.mjs")).href);
const { chromium } = await import(pathToFileURL(join(repo, "conformance/node_modules/playwright-core/index.mjs")).href);
const base = process.env.BASE_URL;
const post = (p, b) => fetch(new URL(p, base), { method: "POST", headers: { "content-type": "application/json", Accept: "application/json" }, body: JSON.stringify(b) }).then((r) => r.json());

const THEMES = {
  light: { theme: "light", contrast: false },
  dark: { theme: "dark", contrast: false },
  high: { theme: "light", contrast: true },
};
const SIZES = [[1440, 1000], [768, 1024], [390, 844]];

const browser = await chromium.launch({ executablePath: resolveChromiumExecutable(), headless: true, ...(process.getuid?.() === 0 ? { args: ["--no-sandbox"] } : {}) });
const rows = [];
for (const [width, height] of SIZES) {
  for (const [themeName, t] of Object.entries(THEMES)) {
    const crew = (await post("/api/crews", { gameStem: "blades-in-the-dark", crewType: "Assassins" })).crew;
    const ctx = await browser.newContext({ viewport: { width, height } });
    const p = await ctx.newPage();
    await p.goto(new URL(`/crew/${crew.id}`, base).href);
    await p.waitForSelector(".cohort-add");
    await p.evaluate((th) => {
      const root = document.documentElement;
      root.setAttribute("data-theme", th.theme);
      if (th.contrast) root.setAttribute("data-contrast", "high"); else root.removeAttribute("data-contrast");
    }, t);
    await p.waitForTimeout(150);

    // Pick a trait and press its Add button inside the given scope ("page" or a selector).
    const pickIn = (scope, aria, index, addTitle) => p.evaluate(({ scope, aria, index, addTitle }) => {
      const root = scope === "page" ? document : document.querySelector(scope);
      const select = root.querySelector(`select[aria-label="${aria}"]`);
      select.value = select.options[index].value;
      select.dispatchEvent(new Event("change"));
      root.querySelector(`button[title="${addTitle}"]`).click();
      return select.value;
    }, { scope, aria, index, addTitle });

    // Add a cohort with one edge and one flaw (the add form starts at 0/0).
    await pickIn("page", "Cohort edge", 1, "Add edge");
    await pickIn("page", "Cohort flaw", 1, "Add flaw");
    await p.click('.cohort-add button[title="Add cohort"]');
    await p.waitForSelector(".cohort-entry");

    // Open the edit form for the new cohort.
    await p.click('.cohort-entry button[title^="Edit cohort"]');
    await p.waitForSelector(".cohort-entry.editing");
    const editState = () => p.evaluate(() => {
      const editing = document.querySelector(".cohort-entry.editing");
      const save = editing.querySelector('button[title^="Save"]');
      const warning = editing.querySelector(".cohort-count-mismatch");
      const chips = (list) => [...editing.querySelectorAll(`.cohort-trait-list[data-list="${list}"] [data-value]`)].map((c) => c.getAttribute("data-value"));
      return {
        edges: chips("edges"),
        flaws: chips("flaws"),
        saveDisabled: save.disabled,
        warningPresent: warning !== null,
        warningHidden: warning ? warning.hidden : null,
        warningText: warning ? warning.textContent : null,
        docOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        // Diagnostic: the edit form's direct children, in order.
        childClasses: [...editing.children].map((c) => c.className || c.tagName),
      };
    });
    const initial = await editState();

    // Mismatch: add a second edge only.
    await pickIn(".cohort-entry.editing", "Edit edge", 2, "Add edge");
    const mismatch = await editState();
    const shot = `edit-${width}-${themeName}-mismatch.png`;
    await p.locator(".cohort-entry.editing").screenshot({ path: join(here, shot) });

    // Match: add a second flaw.
    await pickIn(".cohort-entry.editing", "Edit flaw", 2, "Add flaw");
    const matched = await editState();

    rows.push({ width, height, theme: themeName, initial, mismatch, matched, screenshot: shot });
    await ctx.close();
  }
}
await browser.close();
writeFileSync(join(here, "edit-gate.json"), JSON.stringify({ rows }, null, 2) + "\n");
const failures = rows.filter((r) =>
  !r.mismatch.warningPresent ||
  !r.mismatch.saveDisabled ||
  r.mismatch.warningHidden ||
  !/equal number of edges and flaws/.test(r.mismatch.warningText ?? "") ||
  r.matched.saveDisabled ||
  !r.matched.warningHidden ||
  r.mismatch.docOverflowX !== 0,
);
console.log(`cohort edit gate: ${rows.length} rows, ${failures.length} failures`);
if (failures.length > 0) process.exit(1);
