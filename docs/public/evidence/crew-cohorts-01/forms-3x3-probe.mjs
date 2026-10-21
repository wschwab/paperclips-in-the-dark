// CREW-COHORTS-01 forms probe: 3 sizes x light/dark/high. For each cohort kind (gang default, then expert):
// computed display/visibility of every add-form field, Add-button alignment, and the edge/flaw "+" position
// relative to its select. Also records the Rep track row count and width (CREW-REP-TURF-01 layout).
// Run under the managed launcher (BASE_URL). Writes forms-3x3.json and screenshots next to this file.
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

    const fieldState = () => p.evaluate(() => {
      const add = document.querySelector(".cohort-add");
      return [...add.querySelectorAll(":scope > .cohort-field, :scope > label.cohort-field")].map((f) => {
        const cs = getComputedStyle(f);
        const ctl = f.querySelector("select, input, textarea, button, span.cohort-quality-derived, span.cohort-scale-derived");
        return {
          label: f.querySelector(".lbl")?.textContent ?? "",
          hiddenAttr: f.hidden,
          display: cs.display,
          visibility: cs.visibility,
          visible: cs.display !== "none" && cs.visibility !== "hidden",
          control: ctl ? (ctl.getAttribute("aria-label") ?? ctl.tagName.toLowerCase()) : null,
        };
      });
    });
    const layout = () => p.evaluate(() => {
      const add = document.querySelector(".cohort-add");
      const addBtn = add.querySelector('button[title="Add cohort"]');
      const addR = addBtn.getBoundingClientRect();
      const boxR = add.getBoundingClientRect();
      const visibleFields = [...add.querySelectorAll(":scope > .cohort-field")].filter((f) => getComputedStyle(f).display !== "none");
      const lastFieldBottom = Math.max(...visibleFields.map((f) => f.getBoundingClientRect().bottom));
      const pickers = [...add.querySelectorAll(".cohort-trait-picker")].map((pk) => {
        const sel = pk.querySelector("select");
        const plus = pk.querySelector('button[title^="Add "]');
        const sR = sel.getBoundingClientRect();
        const pR = plus.getBoundingClientRect();
        return {
          kind: sel.getAttribute("aria-label"),
          plusSameRowAsSelect: Math.abs(pR.top - sR.top) < sR.height / 2,
          plusRightOfSelect: pR.left >= sR.right - 1,
          plusInsidePicker: pR.right <= pk.getBoundingClientRect().right + 1,
        };
      });
      const track = document.querySelector(".crew-rep .stress-track");
      const tiles = track ? [...track.querySelectorAll(".stress-box")] : [];
      const rowTops = new Set(tiles.map((b) => Math.round(b.getBoundingClientRect().top)));
      return {
        addButtonRightGap: Math.round(boxR.right - addR.right),
        addButtonTopBelowLastFieldBottom: Math.round(addR.top - lastFieldBottom),
        pickers,
        docOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        addOverflowX: add.scrollWidth - add.clientWidth,
        repBoxes: tiles.length,
        repRows: rowTops.size,
        repTrackWidth: track ? Math.round(track.getBoundingClientRect().width) : null,
        repCardWidth: document.querySelector(".crew-rep")?.getBoundingClientRect().width ?? null,
      };
    });

    const gangState = await fieldState();
    const gangLayout = await layout();
    await p.locator(".cohort-add").screenshot({ path: join(here, `add-gang-${width}-${themeName}.png`), animations: "disabled" });

    // Switch the kind to expert the way a user does: change the select, then read it back.
    await p.locator('select[aria-label="Cohort kind"]').selectOption("expert");
    await p.waitForTimeout(100);
    const expertState = await fieldState();
    const expertLayout = await layout();
    await p.locator(".cohort-add").screenshot({ path: join(here, `add-expert-${width}-${themeName}.png`), animations: "disabled" });

    rows.push({ width, height, theme: themeName, gang: { fields: gangState, layout: gangLayout }, expert: { fields: expertState, layout: expertLayout } });
    await ctx.close();
  }
}
await browser.close();
writeFileSync(join(here, "forms-3x3.json"), JSON.stringify(rows, null, 2) + "\n");
console.log(JSON.stringify(rows.map((r) => ({
  w: r.width, t: r.theme,
  gangVisible: r.gang.fields.filter((f) => f.visible).map((f) => f.label),
  expertVisible: r.expert.fields.filter((f) => f.visible).map((f) => f.label),
  gangRep: [r.gang.layout.repRows, r.gang.layout.repBoxes, r.gang.layout.repTrackWidth],
  addGap: r.expert.layout.addButtonRightGap,
  plusOk: r.expert.layout.pickers.every((k) => k.plusSameRowAsSelect && k.plusInsidePicker),
  docX: r.gang.layout.docOverflowX,
})), null, 1));
