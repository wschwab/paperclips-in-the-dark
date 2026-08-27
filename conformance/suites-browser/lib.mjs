// lib.mjs — shared helpers for the six BROWSER-02 top-level journeys.
//
// NOT a journey module (no `id` export picked up by the runner's loader,
// and the filename does not match *.journey.mjs). Provides:
//
//   unionCheckpoints(...)   merge sub-checkpoint module checkpoint lists
//   unionNoise(...)         merge sub-checkpoint module console-noise allowances
//   composeCtx(ctx)         wrapper that tolerates duplicate checkpoint ids
//                           (sub-modules each recording `console-errors`)
//   runRouteThemeMatrix()   the BROWSER-02 route/theme matrix: for the routes
//                           a journey affects, exercise 1440x1000, 768x1024,
//                           390x844 in light / dark / high contrast, capture a
//                           screenshot plus a numeric summary JSON per matrix
//                           entry, and throw on any horizontal overflow.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

/** Merge checkpoint declarations from several sub-checkpoint modules,
 * deduping by id (several modules declare `console-errors`). */
export function unionCheckpoints(...groups) {
  const byId = new Map();
  for (const group of groups) {
    for (const c of group ?? []) {
      if (!byId.has(c.id)) byId.set(c.id, c);
    }
  }
  return [...byId.values()];
}

export function unionNoise(...groups) {
  const seen = new Set();
  const out = [];
  for (const group of groups) {
    for (const n of group ?? []) {
      const key = `${n.urlPattern}\u0000${n.text}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(n);
      }
    }
  }
  return out;
}

/** Wrap the runner ctx so sub-checkpoint modules may each record the same
 * checkpoint id (typically `console-errors`); the first recording wins and
 * later duplicates are folded away instead of failing the journey. */
export function composeCtx(ctx) {
  const seen = new Set();
  return {
    ...ctx,
    checkpoint(id, value) {
      if (seen.has(id)) return;
      seen.add(id);
      ctx.checkpoint(id, value);
    },
  };
}

// ---------------------------------------------------------------------------
// Route/theme matrix (BROWSER-02)
// ---------------------------------------------------------------------------

const MATRIX_VIEWPORTS = [
  { key: "1440x1000", width: 1440, height: 1000 },
  { key: "768x1024", width: 768, height: 1024 },
  { key: "390x844", width: 390, height: 844 },
];

// Light / dark / high contrast, applied through the REAL app-bar theme
// switcher (same controls a human uses; writes localStorage +
// data-theme/data-contrast exactly like frontend/src/lib/theme.ts). Hi-C is
// pinned on the light theme so headless OS preference cannot perturb it.
const MATRIX_THEMES = [
  { key: "light", theme: "light", contrast: false },
  { key: "dark", theme: "dark", contrast: false },
  { key: "hic", theme: "light", contrast: true },
];

const READ_ATTRS_SOURCE = `(() => ({
  theme: document.documentElement.getAttribute("data-theme"),
  contrast: document.documentElement.getAttribute("data-contrast"),
}))()`;

async function applyThemeState(page, state) {
  await page
    .locator(`.theme-controls button[data-theme="${state.theme ?? "auto"}"]`)
    .click();
  const contrastBtn = page.locator('.theme-controls button[title="Toggle high contrast"]');
  const pressed = (await contrastBtn.getAttribute("aria-pressed")) === "true";
  if (pressed !== state.contrast) await contrastBtn.click();
  const attrs = await page.evaluate(READ_ATTRS_SOURCE);
  const expectedTheme = state.theme ?? null;
  const expectedContrast = state.contrast ? "high" : null;
  if (attrs.theme !== expectedTheme || attrs.contrast !== expectedContrast) {
    throw new Error(
      `theme switcher did not apply ${state.key}: got data-theme=${JSON.stringify(attrs.theme)} ` +
        `data-contrast=${JSON.stringify(attrs.contrast)}, expected ${JSON.stringify(expectedTheme)}/${JSON.stringify(expectedContrast)}`,
    );
  }
}

// One numeric evidence payload per matrix entry: viewport + document overflow,
// landmark container boxes and computed layout, interactive-target sizes,
// focus state (after a real-keyboard Tab walk), and alert/live-region copy.
const MEASURE_SOURCE = `(() => {
  const landmarks = ${"__LANDMARKS__"};
  const box = (el) => {
    const b = el.getBoundingClientRect();
    return {
      x: Math.round(b.left), y: Math.round(b.top),
      width: Math.round(b.width * 10) / 10, height: Math.round(b.height * 10) / 10,
    };
  };
  const layoutOf = (el) => {
    const s = getComputedStyle(el);
    return {
      overflowX: s.overflowX, minWidth: s.minWidth,
      display: s.display,
      gridTemplateColumns: s.display.includes("grid") ? s.gridTemplateColumns : null,
      flexDirection: s.display.includes("flex") ? s.flexDirection : null,
    };
  };
  const landmarkEvidence = landmarks.map((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { selector: sel, present: false };
    return { selector: sel, present: true, box: box(el), layout: layoutOf(el) };
  });
  // Interactive target sizes + accessible names/states.
  const controls = [...document.querySelectorAll("button, a[href], select, input, summary")]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      const wrap = el.closest("[hidden]");
      return r.width > 0 && r.height > 0 && !wrap;
    })
    .slice(0, 80)
    .map((el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase(),
        name: el.getAttribute("aria-label") ?? el.getAttribute("title")
          ?? (el.tagName === "INPUT" ? el.labels?.[0]?.textContent?.trim() ?? null : null)
          ?? el.textContent?.trim().slice(0, 60) ?? null,
        role: el.getAttribute("role"),
        width: Math.round(r.width * 10) / 10,
        height: Math.round(r.height * 10) / 10,
        ariaPressed: el.getAttribute("aria-pressed"),
        ariaExpanded: el.getAttribute("aria-expanded"),
        ariaRequired: el.getAttribute("aria-required"),
        disabled: el.disabled ?? undefined,
      };
    });
  // Alert / live-region announcements currently mounted.
  const alerts = [...document.querySelectorAll("[aria-live], [role='alert'], .error.section-error, .error-card")]
    .map((el) => ({
      selector: el.tagName.toLowerCase()
        + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\\s+/).join(".") : ""),
      role: el.getAttribute("role"),
      ariaLive: el.getAttribute("aria-live"),
      text: (el.textContent ?? "").trim().slice(0, 200),
      visible: el.getBoundingClientRect().width > 0,
    }));
  return {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    docScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body ? document.body.scrollWidth : -1,
    landmarks: landmarkEvidence,
    controls,
    alerts,
  };
})();`;

/** Real-keyboard Tab walk (programmatic focus does not paint :focus-visible);
 * returns focus evidence for the numeric file. */
async function focusEvidence(page, maxSteps = 12) {
  await page.keyboard.press("Tab").catch(() => {});
  let active = null;
  for (let i = 0; i < maxSteps; i++) {
    active = await page.evaluate(`(() => {
      const a = document.activeElement;
      if (!a || a === document.body) return null;
      const s = getComputedStyle(a);
      const b = a.getBoundingClientRect();
      return {
        tag: a.tagName.toLowerCase(),
        name: a.getAttribute("aria-label") ?? a.getAttribute("title") ?? a.textContent?.trim().slice(0, 60) ?? null,
        box: { width: Math.round(b.width * 10) / 10, height: Math.round(b.height * 10) / 10 },
        outlineWidth: s.outlineWidth, outlineColor: s.outlineColor, outlineOffset: s.outlineOffset,
        focusVisible: a.matches(":focus-visible"),
      };
    })()`);
    if (active) break;
    await page.keyboard.press("Tab");
  }
  return { steps: maxSteps, firstFocusable: active };
}

/**
 * Exercise the route/theme matrix for the routes this journey affects.
 *
 * routes: [{ key, path, waitFor, landmarks: [selector, ...] }]
 * For each route x viewport x theme (9 entries per route) this captures:
 *   - screenshots/<journey>-matrix-<route>-<viewport>-<theme>.png
 *   - matrix-numeric/<journey>-matrix-<route>-<viewport>-<theme>.json
 * and throws on any horizontal overflow. Returns the entry list (also
 * recorded as journey checkpoint values by the caller).
 */
export async function runRouteThemeMatrix(page, ctx, journeyId, routes) {
  const artifactsDir = process.env.PITD_BROWSER_ARTIFACTS;
  if (!artifactsDir) throw new Error("PITD_BROWSER_ARTIFACTS missing; matrix requires the managed runner");
  const numericDir = join(artifactsDir, "matrix-numeric");
  await mkdir(numericDir, { recursive: true });

  const entries = [];
  for (const route of routes) {
    for (const vp of MATRIX_VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await ctx.goto(route.path);
      await page.locator(route.waitFor).first().waitFor({ state: "visible", timeout: 15_000 });
      for (const theme of MATRIX_THEMES) {
        await applyThemeState(page, theme);
        const measureSource = MEASURE_SOURCE.replace(
          "__LANDMARKS__",
          JSON.stringify([...route.landmarks, ".theme-controls"]),
        );
        const metrics = await page.evaluate(measureSource);
        if (metrics.docScrollWidth > metrics.innerWidth || metrics.bodyScrollWidth > metrics.innerWidth) {
          throw new Error(
            `matrix horizontal overflow on ${route.key} ${vp.key} ${theme.key}: ` +
              `innerWidth=${metrics.innerWidth} docScrollWidth=${metrics.docScrollWidth} bodyScrollWidth=${metrics.bodyScrollWidth}`,
          );
        }
        metrics.focus = await focusEvidence(page);
        // Blur the walked focus so the screenshot shows the resting surface.
        await page.evaluate(`(() => { document.activeElement?.blur?.(); })()`);

        const entryKey = `${journeyId}-matrix-${route.key}-${vp.key}-${theme.key}`;
        const shotPath = await ctx.screenshot(entryKey);
        const numericPath = join(numericDir, `${entryKey}.json`);
        await writeFile(
          numericPath,
          JSON.stringify({ journey: journeyId, route: route.key, path: route.path, viewport: vp.key, theme: theme.key, screenshot: shotPath, ...metrics }, null, 2) + "\n",
        );
        entries.push({ route: route.key, viewport: vp.key, theme: theme.key, screenshot: shotPath, numeric: numericPath });
      }
    }
  }
  return entries;
}
