// theme01-identity-contrast — THEME-01 (UX-015) dark-theme identity text
// contrast.
//
// The sheet mastheads (.character-header.torn-foot) are inked-band plates
// whose text resolves through --band-text/--band-ink. The playbook/game
// kicker and the alias override their ink to --text-muted, an ink-on-PAPER
// token: correct on paper cards, but dark-on-dark on the band — the audit's
// "nearly invisible" finding.
//
// This journey drives a real seeded character sheet, flips the theme
// attributes exactly as frontend/src/lib/theme.ts does (data-theme /
// data-contrast on <html>), measures the ACTUAL computed foreground vs the
// effective (alpha-composited ancestor chain) background for the kicker and
// the alias in Dark, Dark+Hi-C, Hi-C, and Light, and asserts >=4.5:1 (WCAG
// AA normal text) for every measurement. Computed colors and ratios are
// logged as browser evidence and recorded as one numeric checkpoint per
// measurement.
//
// Note the coverage asymmetry this encodes: the audit brief mandates Dark
// and Hi-C, but the failing pair lives where the band appears over light
// themes too; all four states are asserted so either regression lands red.

export const id = "theme01-identity-contrast";

export const checkpoints = [
  { id: "dark-kicker-ratio", description: "kicker fg/bg contrast ratio, dark theme (>=4.5 expected)" },
  { id: "dark-alias-ratio", description: "alias fg/bg contrast ratio, dark theme (>=4.5 expected)" },
  { id: "dark-hic-kicker-ratio", description: "kicker fg/bg contrast ratio, dark + high contrast (>=4.5 expected)" },
  { id: "dark-hic-alias-ratio", description: "alias fg/bg contrast ratio, dark + high contrast (>=4.5 expected)" },
  { id: "hic-kicker-ratio", description: "kicker fg/bg contrast ratio, OS theme + high contrast (>=4.5 expected)" },
  { id: "hic-alias-ratio", description: "alias fg/bg contrast ratio, OS theme + high contrast (>=4.5 expected)" },
  { id: "light-kicker-ratio", description: "kicker fg/bg contrast ratio, light theme on the inked band (>=4.5 expected)" },
  { id: "light-alias-ratio", description: "alias fg/bg contrast ratio, light theme on the inked band (>=4.5 expected)" },
];

// The four audited states, applied exactly like frontend/src/lib/theme.ts:
// data-theme="light|dark" (absent = OS pref) and data-contrast="high".
const STATES = [
  { key: "dark", theme: "dark", contrast: false },
  { key: "dark-hic", theme: "dark", contrast: true },
  { key: "hic", theme: null, contrast: true },
  { key: "light", theme: "light", contrast: false },
];

// Source-string evaluate payloads (browser-suite convention: values are
// embedded into the source; the runner evaluates STRINGS AS EXPRESSIONS, so
// every payload is a self-invoking function literal with values baked in).
const applyStateSource = (state) => `(() => {
  const root = document.documentElement;
  ${
    state.theme
      ? `root.setAttribute("data-theme", ${JSON.stringify(state.theme)});`
      : 'root.removeAttribute("data-theme");'
  }
  ${state.contrast ? 'root.setAttribute("data-contrast", "high");' : 'root.removeAttribute("data-contrast");'}
})();`;

const MEASURE_SOURCE = `(() => {
  const targets = [
    { name: "kicker", selector: ".character-header.torn-foot .character-kicker" },
    { name: "alias", selector: ".character-header.torn-foot .alias" },
  ];
  const parse = (s) => {
    const m = s.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return { r: 0, g: 0, b: 0, a: 1 };
    const parts = m[1].split(",").map((p) => parseFloat(p.trim()));
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  };
  const channel = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const luminance = (c) => 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
  const contrast = (fg, bg) => {
    const l1 = luminance(fg);
    const l2 = luminance(bg);
    const hi = Math.max(l1, l2);
    const lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  };
  // Composite translucent layers onto the nearest opaque ancestor backdrop.
  const effectiveBackground = (start) => {
    let layers = [];
    let node = start;
    while (node && node.nodeType === 1) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c.a >= 1) {
        let backdrop = c;
        for (let i = layers.length - 1; i >= 0; i--) {
          const t = layers[i];
          backdrop = {
            r: t.r * t.a + backdrop.r * (1 - t.a),
            g: t.g * t.a + backdrop.g * (1 - t.a),
            b: t.b * t.a + backdrop.b * (1 - t.a),
            a: 1,
          };
        }
        return backdrop;
      }
      if (c.a > 0) layers.push(c);
      node = node.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 }; // default canvas
  };
  return targets.map(({ name, selector }) => {
    const el = document.querySelector(selector);
    if (!el) throw new Error("missing element for " + selector);
    const style = getComputedStyle(el);
    const fg = parse(style.color);
    const bg = effectiveBackground(el);
    const ratio = Math.round(contrast(fg, bg) * 100) / 100;
    const hex = (c) =>
      "#" + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
    return { name, selector, color: hex(fg), background: hex(bg), fontSizePx: style.fontSize, ratio };
  });
})();`;

export async function run(page, ctx) {
  // Land on a real seeded character sheet — the masthead (kicker + alias +
  // h1 on the torn inked band) is the audited surface.
  await ctx.goto("/roster");
  const firstLink = page.locator('li[data-character-id] a[href^="/character/"]').first();
  await firstLink.waitFor({ state: "visible", timeout: 10_000 });
  const detailPath = await firstLink.getAttribute("href");
  if (!detailPath || !detailPath.startsWith("/character/")) {
    throw new Error(`no character detail link on seeded roster (got ${JSON.stringify(detailPath)})`);
  }
  await ctx.goto(detailPath);
  await page.locator(".character-detail").waitFor({ state: "visible", timeout: 10_000 });

  const failures = [];
  for (const state of STATES) {
    await page.evaluate(applyStateSource(state));
    const samples = await page.evaluate(MEASURE_SOURCE);
    for (const sample of samples) {
      console.log(
        `[theme01] ${state.key} ${sample.name}: fg=${sample.color} bg=${sample.background} ` +
          `fontSize=${sample.fontSizePx} ratio=${sample.ratio}:1 (${sample.selector})`,
      );
      ctx.checkpoint(`${state.key}-${sample.name}-ratio`, sample.ratio);
      if (sample.ratio < 4.5) {
        failures.push(
          `${state.key} ${sample.name} ${sample.ratio}:1 < 4.5:1 ` +
            `(fg=${sample.color} bg=${sample.background} on ${sample.selector})`,
        );
      }
    }
    await ctx.screenshot(`theme01-${state.key}`);
  }

  if (failures.length > 0) {
    throw new Error(`THEME-01 identity contrast below 4.5:1 — ${failures.join("; ")}`);
  }
}
