// Chromium 3x3 probe for CREW-REP-TURF-01 and CREW-CLAIMS-EDIT-01 (3 sizes x light/dark/high).
// Numeric overflow checks, Rep/Turf tracker text, manual and claim-driven turf, the confirm dialog for an
// unconnected claim, and an Edit claim save. Run under the managed launcher (see README in this folder).
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../../../..");
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
    const dialogs = [];
    let acceptNext = true;
    p.on("dialog", (d) => { dialogs.push(d.message()); if (acceptNext) d.accept(); else d.dismiss(); });
    await p.goto(new URL(`/crew/${crew.id}`, base).href);
    await p.waitForSelector(".crew-rep");
    await p.waitForSelector(".claims-grid");
    await p.evaluate((th) => {
      const root = document.documentElement;
      root.setAttribute("data-theme", th.theme);
      if (th.contrast) root.setAttribute("data-contrast", "high"); else root.removeAttribute("data-contrast");
    }, t);
    await p.waitForTimeout(150);

    const overflow = () => p.evaluate(() => {
      const pick = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { overflowX: el.scrollWidth - el.clientWidth, right: Math.round(r.right), viewport: window.innerWidth };
      };
      return {
        document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        rep: pick(".crew-rep"),
        turf: pick(".crew-turf"),
        claimsMap: pick(".claims-map"),
      };
    });
    const trackerText = () => p.evaluate(() => ({
      rep: document.querySelector(".crew-rep")?.textContent.replace(/\s+/g, " ").trim() ?? null,
      turf: document.querySelector(".turf-count")?.textContent ?? null,
      manual: document.querySelector(".manual-turf-count")?.textContent ?? null,
    }));

    const repTurf = { before: await trackerText(), overflowBefore: await overflow() };
    // Manual turf: "Add 1 turf" (disabled at the cap; record it either way).
    const addTurf = p.locator('button[title="Add 1 turf"]');
    repTurf.addTurfDisabled = await addTurf.isDisabled();
    if (!repTurf.addTurfDisabled) {
      await addTurf.click();
      await p.waitForFunction(() => /Other turf: 1/.test(document.querySelector(".manual-turf-count")?.textContent ?? ""), null, { timeout: 10000 }).catch(() => {});
      // The effective Turf count arrives from a separate caps refresh; wait for it so the read is settled.
      await p.waitForFunction(() => document.querySelector(".turf-count")?.textContent === "Turf: 1", null, { timeout: 10000 }).catch(() => {});
    }
    repTurf.afterManual = await trackerText();
    repTurf.overflowAfter = await overflow();
    await p.screenshot({ path: join(here, `rep-turf-${width}-${themeName}.png`), animations: "disabled" });

    // Claims: confirm dialog for an unconnected, unowned claim (dialog accepted), then Edit claim save.
    const claims = { dialogsBeforeAcquire: 0 };
    // Turf via claim: acquire a claim whose kind is Turf (+1 crew.turf) and record the Turf count around it.
    const turfClaim = p.locator('.claims-grid button:not(.claim-owned):has(> strong:text-is("Turf"))').first();
    claims.turfClaimAvailable = (await turfClaim.count()) > 0;
    if (claims.turfClaimAvailable) {
      claims.turfBeforeClaim = await trackerText();
      acceptNext = true;
      await turfClaim.click();
      await p.waitForFunction(() => document.querySelectorAll(".claims-grid .claim-owned").length >= 1, null, { timeout: 10000 }).catch(() => {});
      await p.waitForTimeout(400);
      claims.turfAfterClaimAcquire = await trackerText();
      claims.turfClaimMessage = dialogs.at(-1) ?? null;
    }
    const unconnected = p.locator(".claims-grid button:not(.claim-owned):not(.claim-connected)").first();
    const hasUnconnected = (await unconnected.count()) > 0;
    claims.hasUnconnected = hasUnconnected;
    if (hasUnconnected) {
      const ownedBefore = await p.locator(".claims-grid .claim-owned").count();
      acceptNext = false; // dismiss first to prove a cancelled acquisition changes nothing
      claims.dialogsBeforeAcquire = dialogs.length;
      await unconnected.click();
      await p.waitForTimeout(300);
      claims.ownedAfterDismiss = await p.locator(".claims-grid .claim-owned").count();
      claims.dismissedMessage = dialogs.at(-1) ?? null;
      acceptNext = true;
      await unconnected.click();
      await p.waitForFunction((n) => document.querySelectorAll(".claims-grid .claim-owned").length === n + 1, ownedBefore, { timeout: 10000 }).catch(() => {});
      claims.ownedAfterAccept = await p.locator(".claims-grid .claim-owned").count();
      claims.acceptedMessage = dialogs.at(-1) ?? null;
    }
    claims.turfAfterClaim = await trackerText();

    await p.locator(".claim-edit-start").click();
    await p.locator(".claims-grid .claim-owned").first().click();
    await p.waitForSelector(".claim-editor");
    await p.locator('.claim-editor input[aria-label="Claim name"]').fill(`Probe ${width}-${themeName}`);
    await p.locator(".claim-editor button[type=submit]").click();
    await p.waitForFunction(() => !document.querySelector(".claim-editor"), null, { timeout: 10000 }).catch(() => {});
    claims.activeListAfterEdit = await p.locator(".active-claim-list").textContent().catch(() => null);
    claims.overflowAfterEdit = await overflow();
    await p.screenshot({ path: join(here, `claims-${width}-${themeName}.png`), fullPage: true, animations: "disabled" });

    rows.push({ width, height, theme: themeName, crewId: crew.id, repTurf, claims, dialogs });
    await ctx.close();
  }
}
await browser.close();
writeFileSync(join(here, "probe.json"), JSON.stringify(rows, null, 2) + "\n");
console.log(JSON.stringify(rows.map((r) => ({
  w: r.width,
  t: r.theme,
  docX: r.repTurf.overflowBefore.document,
  repX: r.repTurf.overflowBefore.rep?.overflowX,
  turf: r.repTurf.afterManual.turf,
  manual: r.repTurf.afterManual.manual,
  claimsMapX: r.repTurf.overflowAfter.claimsMap?.overflowX,
  owned: [r.claims.ownedAfterDismiss, r.claims.ownedAfterAccept],
  active: (r.claims.activeListAfterEdit ?? "").includes(`Probe ${r.width}-${r.theme}`),
}))));
