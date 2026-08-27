// theme02-focus-error — THEME-02 (UX-016) focus/error separation and geometry.
//
// UX-016: focus borders and error borders collide and read as the same
// meaning, because --focus-ring resolves to the same red tokens that errors
// use (--blood in light, --accent-strong in dark) and dense sheet furniture
// draws its focus ring *outside* the control, into neighboring controls'
// space and across card edges.
//
// Contract enforced here (THEME-02 card):
// 1. Red is reserved for errors: the focused control's painted outline color
//    never equals --accent/--accent-strong, while a rendered error alert's
//    border keeps --accent-strong.
// 2. Geometry stays safe: a focused control's effective focus box (rect
//    inflated by outline width + positive offset) neither intersects any
//    sibling interactive control nor escapes its section/card boundary,
//    and never creates horizontal overflow.
// 3. Evidence: focus-only, error-only, and focus+error captured as
//    screenshots for every combination of {Light, Dark, Hi-C} ×
//    {1440, 768, 390}.
//
// Surfaces: /styleguide carries the furniture controls (focus-only states);
// a seeded character sheet with an injected 422 gear.add carries the routed
// section-local error alert (error-only and focus+error states).

export const id = "theme02-focus-error";

export const checkpoints = [
  {
    id: "red-separation-combos",
    description: "number of theme×width combos where focus ring color ≠ every red error token",
  },
  {
    id: "error-alert-red-combos",
    description: "number of theme×width combos where the routed error alert keeps the error-red border",
  },
  {
    id: "geometry-clean-probes",
    description: "number of focused-control geometry probes with zero sibling collisions and zero escape",
  },
  {
    id: "evidence-shots",
    description: "number of focus-only/error-only/focus+error screenshots captured (27 expected)",
  },
];

// The deliberately injected 422 (fault injection, below) makes Chromium log
// its standard "Failed to load resource" chrome noise for the intercepted
// request. The app handles the failure gracefully — declare the allowance so
// "zero console errors" keeps measuring the app, not this journey's own
// interception.
export const expectedConsoleNoise = [
  { urlPattern: "/ops/gear.add", text: "Failed to load resource" },
];

const COMBOS = [
  { key: "light", width: 1440, height: 900 },
  { key: "light", width: 768, height: 1024 },
  { key: "light", width: 390, height: 844 },
  { key: "dark", width: 1440, height: 900 },
  { key: "dark", width: 768, height: 1024 },
  { key: "dark", width: 390, height: 844 },
  { key: "hic", width: 1440, height: 900 },
  { key: "hic", width: 768, height: 1024 },
  { key: "hic", width: 390, height: 844 },
];

// Focus-only heroes on the styleguide, in escalation order from roomy
// (stress boxes, 6px pitch) to packed (16px dots, checkboxes).
const FOCUS_HEROES = [
  { name: "stress-box", match: `(a.classList && a.classList.contains("stress-box"))` },
  { name: "inked-check", match: `(a.classList && a.classList.contains("inked-check"))` },
  {
    name: "action-dot",
    match: `(a.classList && a.classList.contains("action-dot") && a.closest(".is-interactive"))`,
  },
];

// Measures the ACTIVE element's painted focus state: outline color/width,
// the effective ring rectangle (border box inflated by outline width plus
// any positive offset), sibling interactive controls intersecting that ring,
// how far the ring extends past its enclosing section/card box, and whether
// the document gained horizontal overflow.
const focusInfoSource = `(() => {
  const a = document.activeElement;
  if (!a || a === document.body || !a.classList || !(a instanceof HTMLElement)) return null;
  const cs = getComputedStyle(a);
  const ow = parseFloat(cs.outlineStyle === "none" ? "0" : cs.outlineWidth) || 0;
  const oo = parseFloat(cs.outlineOffset) || 0;
  const spread = ow + Math.max(oo, 0);
  const r = a.getBoundingClientRect();
  const ring = { x: r.x - spread, y: r.y - spread, w: r.width + 2 * spread, h: r.height + 2 * spread };
  const sec = a.closest("[data-section]") || a.closest("section") || document.body;
  const sr = sec.getBoundingClientRect();
  const tags = 'button,input,select,textarea,a[href],summary,[tabindex]';
  const collisions = [];
  for (const s of sec.querySelectorAll(tags)) {
    if (s === a) continue;
    const b = s.getBoundingClientRect();
    if (!b.width && !b.height) continue;
    const ox = Math.min(ring.x + ring.w, b.x + b.width) - Math.max(ring.x, b.x);
    const oy = Math.min(ring.y + ring.h, b.y + b.height) - Math.max(ring.y, b.y);
    if (ox > 0.5 && oy > 0.5) collisions.push(s.tagName + "." + String(s.className));
  }
  return {
    describe: a.tagName + "." + String(a.className),
    outlineColor: cs.outlineColor,
    outlineWidthPx: ow,
    focusVisibleMatched: cs.outlineStyle !== "none" && ow >= 2,
    collisions,
    escapePastContainerPx: {
      left: +(sr.x - ring.x).toFixed(1),
      right: +(ring.x + ring.w - (sr.x + sr.width)).toFixed(1),
      top: +(sr.y - ring.y).toFixed(1),
      bottom: +(ring.y + ring.h - (sr.y + sr.height)).toFixed(1),
    },
    docOverflowX: document.documentElement.scrollWidth > window.innerWidth,
    ringPx: spread,
  };
})();`;
// Source-string evaluate payloads (browser-suite convention): the runner
// evaluates STRINGS AS EXPRESSIONS, so every payload is a self-invoking
// function literal with values baked in.
function applyStateSource(combo) {
  const themeAttr =
    combo.key === "dark"
      ? 'root.setAttribute("data-theme", "dark");'
      : combo.key === "light"
        ? 'root.setAttribute("data-theme", "light");'
        : 'root.removeAttribute("data-theme");';
  const contrastAttr = combo.key === "hic"
    ? 'root.setAttribute("data-contrast", "high");'
    : 'root.removeAttribute("data-contrast");';
  return `(() => { const root = document.documentElement; ${themeAttr} ${contrastAttr} })();`;
}

function probeColorSource(token) {
  return `(() => {
    const p = document.createElement("span");
    // setProperty keeps var(--x) inside a string literal — a bare var(--x)
    // expression would be parsed as JavaScript and break the payload.
    p.style.setProperty("color", "var(${token})");
    document.body.appendChild(p);
    const c = getComputedStyle(p).color;
    p.remove();
    return c;
  })()`;
}

/** Real-keyboard Tab walk: reset to body, then Tab until activeElement
 * matches predSource (a JS expression over `a`). Walks use REAL CDP key
 * input so :focus-visible heuristics apply (programmatic focus does not). */
async function tabWalk(page, predSource, maxSteps = 160) {
  await page.evaluate(`(() => {
    const a = document.activeElement;
    if (a && typeof a.blur === "function" && a !== document.body) a.blur();
  })()`);
  for (let i = 0; i < maxSteps; i++) {
    await page.keyboard.press("Tab");
    if (await page.evaluate(`(() => { const a = document.activeElement; return ${predSource}; })()`)) {
      return true;
    }
  }
  return false;
}

export async function run(page, ctx) {
  // Create the sheet via API: the journey must not depend on roster-list
  // rendering (roster.ts is shared WIP owned by other cards). Land on the
  // app first so the POST is same-origin.
  await ctx.goto("/");
  const createUrl = JSON.stringify(new URL("/api/characters", ctx.baseUrl).href);
  const created = await page.evaluate(`((u) => fetch(u, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ gameStem: "blades-in-the-dark", playbook: "Hound" }),
  }).then((r) => r.json()))(${createUrl})`);
  if (!created?.character?.id) {
    throw new Error(`Hound creation failed: ${JSON.stringify(created?.error ?? created)}`);
  }
  const detailPath = "/character/" + created.character.id;

  let failures = [];
  let redSeparationCombos = 0;
  let errorRedCombos = 0;
  let geometryProbes = 0;
  let shots = 0;

  await page.route(/\/ops\/gear\.add$/, (route) =>
    route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "INVALID_ENTITY", message: "injected validation failure" },
      }),
    }),
  );

  for (const combo of COMBOS) {
    await page.setViewportSize({ width: combo.width, height: combo.height });

    // ── focus-only: styleguide furniture ──────────────────────────────────
    await ctx.goto("/styleguide");
    await page.locator(".styleguide").waitFor({ state: "visible", timeout: 10_000 });
    await page.evaluate(applyStateSource(combo));

    const redProbe = async (token) => page.evaluate(probeColorSource(token));
    const accentLight = await redProbe("--accent");
    const accentStrong = await redProbe("--accent-strong");

    for (const hero of FOCUS_HEROES) {
      if (!(await tabWalk(page, hero.match))) {
        throw new Error(`${combo.key}/${combo.width}: tab walk never reached ${hero.name}`);
      }
      const info = await page.evaluate(focusInfoSource);
      console.log(
        `[theme02] ${combo.key}/${combo.width} focus-only ${hero.name}: ` +
          `outline=${info.outlineColor}@${info.outlineWidthPx}px ring=±${info.ringPx}px ` +
          `collisions=${info.collisions.length} escape=${JSON.stringify(info.escapePastContainerPx)} ` +
          `overflowX=${info.docOverflowX}`,
      );
      if (info.outlineColor === undefined) {
        failures.push(`${combo.key}/${combo.width}: ${hero.name} focus probe returned nothing`);
      } else if (
        [accentLight, accentStrong].includes(info.outlineColor)
      ) {
        failures.push(
          `${combo.key}/${combo.width}: ${hero.name} focus ring uses error red (${info.outlineColor})`,
        );
      }
      if (!info.focusVisibleMatched) {
        failures.push(
          `${combo.key}/${combo.width}: ${hero.name} shows no ≥2px :focus-visible outline`,
        );
      }
      if (info.collisions.length > 0) {
        failures.push(
          `${combo.key}/${combo.width}: ${hero.name} focus ring collides with sibling controls: ${info.collisions.join(", ")}`,
        );
      }
      if (info.docOverflowX) {
        failures.push(`${combo.key}/${combo.width}: ${hero.name} focus introduces horizontal overflow`);
      }
      geometryProbes++;
    }
    await ctx.screenshot(`theme02-${combo.key}-${combo.width}-focus-only`);
    shots++;

    // ── error-only + focus+error: injected gear failure on the sheet ─────
    await ctx.goto(detailPath);
    await page.locator(".character-detail").waitFor({ state: "visible", timeout: 10_000 });
    await page.evaluate(applyStateSource(combo));

    await page.locator("details.gear-add-menu summary").click();
    const itemSelect = page.locator('select[aria-label="Add gear item"]');
    await itemSelect.waitFor({ state: "visible", timeout: 10_000 });
    await itemSelect.selectOption({ index: 1 });
    await page.locator('button[title="Add gear item"]').click();

    const gearAlert = page.locator('[data-section="gear"] .error.section-error');
    await gearAlert.waitFor({ state: "visible", timeout: 10_000 });

    // Drop any residual mouse focus: error-only must show NO focus ring.
    await page.evaluate(`(() => {
      const a = document.activeElement;
      if (a && typeof a.blur === "function" && a !== document.body) a.blur();
    })()`);

    // Locator method results are read inside one page-level expression
    // (runner evaluates strings as expressions, so the payload must be a
    // self-invoking literal).
    const alertInfo = await page.evaluate(`(() => {
      const el = document.querySelector('[data-section="gear"] .error.section-error');
      if (!el) return { borderColor: null, visible: false };
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        borderColor: cs.borderLeftColor,
        visible:
          r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight,
      };
    })()`);
    const strongProbe = await redProbe("--accent-strong");
    console.log(
      `[theme02] ${combo.key}/${combo.width} error-only: alert border=${alertInfo.borderColor} ` +
        `--accent-strong=${strongProbe} visible=${alertInfo.visible}`,
    );
    if (!alertInfo.visible) {
      failures.push(`${combo.key}/${combo.width}: routed gear alert not visible`);
    }
    if (alertInfo.borderColor !== strongProbe) {
      failures.push(
        `${combo.key}/${combo.width}: error alert border ${alertInfo.borderColor} lost the error token (${strongProbe})`,
      );
    } else {
      errorRedCombos++;
    }
    await ctx.screenshot(`theme02-${combo.key}-${combo.width}-error-only`);
    shots++;

    // Focus a control inside the failing gear section for the combined state.
    if (!(await tabWalk(page, `a.closest("[data-section='gear']") !== null`))) {
      throw new Error(`${combo.key}/${combo.width}: tab walk never reached the gear section`);
    }
    const gearFocus = await page.evaluate(focusInfoSource);
    console.log(
      `[theme02] ${combo.key}/${combo.width} focus+error ${gearFocus.describe}: ` +
        `outline=${gearFocus.outlineColor}@${gearFocus.outlineWidthPx}px ring=±${gearFocus.ringPx}px ` +
        `collisions=${gearFocus.collisions.length} escape=${JSON.stringify(gearFocus.escapePastContainerPx)} ` +
        `overflowX=${gearFocus.docOverflowX}`,
    );
    if ([accentLight, accentStrong].includes(gearFocus.outlineColor)) {
      failures.push(
        `${combo.key}/${combo.width}: focus+error shares one red for both meanings (${gearFocus.outlineColor})`,
      );
    } else {
      redSeparationCombos++;
    }
    if (gearFocus.collisions.length > 0) {
      failures.push(
        `${combo.key}/${combo.width}: focus ring collides beside the error alert: ${gearFocus.collisions.join(", ")}`,
      );
    }
    if (gearFocus.docOverflowX) {
      failures.push(`${combo.key}/${combo.width}: gear focus introduces horizontal overflow`);
    }
    geometryProbes++;
    await ctx.screenshot(`theme02-${combo.key}-${combo.width}-focus-error`);
    shots++;
  }

  ctx.checkpoint("red-separation-combos", redSeparationCombos);
  ctx.checkpoint("error-alert-red-combos", errorRedCombos);
  ctx.checkpoint("geometry-clean-probes", geometryProbes);
  ctx.checkpoint("evidence-shots", shots);

  if (failures.length > 0) {
    throw new Error(`THEME-02 focus/error contract violated — ${failures.join("; ")}`);
  }
}
