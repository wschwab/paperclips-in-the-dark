/**
 * /styleguide — F1 deliverable.
 * Renders every sheet-furniture component before any real sheet page exists.
 * F2 agents build sheets to match what appears here.
 */

import {
  actionDots,
  bladesHarmTable,
  clock,
  inkedCheckbox,
  stressTrack,
  traumaStamps,
} from "../components/index.js";
import { el, setChildren } from "../lib/dom.js";

const TRAUMAS = [
  "Cold",
  "Haunted",
  "Obsessed",
  "Paranoid",
  "Reckless",
  "Soft",
  "Unstable",
  "Vicious",
] as const;

const ACTIONS: Array<{ name: string; value: number }> = [
  { name: "Hunt", value: 1 },
  { name: "Study", value: 2 },
  { name: "Survey", value: 0 },
  { name: "Tinker", value: 3 },
  { name: "Finesse", value: 1 },
  { name: "Prowl", value: 2 },
  { name: "Skirmish", value: 4 },
  { name: "Wreck", value: 1 },
];

function section(id: string, title: string, ...body: Array<Node | string>): HTMLElement {
  return el(
    "section",
    { id, role: "region", "aria-labelledby": `${id}-h` },
    el("h2", { id: `${id}-h` }, title),
    ...body,
  );
}

function swatch(name: string, cssVar: string, hex: string): HTMLElement {
  const chip = el("div", { className: "swatch-chip" });
  chip.style.background = `var(${cssVar})`;
  return el(
    "div",
    { className: "swatch" },
    chip,
    el("span", { className: "lbl" }, name),
    el("span", { className: "swatch-hex" }, `${cssVar} · ${hex}`),
  );
}

function specimen(
  meta: string,
  className: string,
  sample: string,
  extraStyle?: string,
): HTMLElement {
  const body = el("div", { className }, sample);
  if (extraStyle) body.setAttribute("style", extraStyle);
  return el(
    "div",
    { className: "type-specimen" },
    el("div", { className: "specimen-meta" }, meta),
    body,
  );
}

/**
 * Mount the styleguide into `root`. Returns a disposer.
 */
export function mountStyleguidePage(root: HTMLElement): () => void {
  const page = el(
    "div",
    { className: "styleguide" },

    el(
      "header",
      { className: "sg-header" },
      el("p", { className: "epigraph" },
        "“The lamps are going out all over Doskvol; we shall not see them lit again in our lifetime.”",
      ),
      el("h1", {}, "Style Guide"),
      el(
        "p",
        { className: "serif" },
        "Paperclips in the Dark — sheet furniture, type, and palette per PAPERCLIPS §12. ",
        "Components here are the contract F2 sheets import. Toggle theme from the app bar.",
      ),
    ),

    // ── Palette ──────────────────────────────────────────────
    section(
      "palette",
      "Palette",
      el(
        "p",
        { className: "serif" },
        "Near-black ink, aged paper, blood accent. Dark mode is lamplit-dark. ",
        "Semantic tokens in ",
        el("code", {}, "theme.css"),
        " — components never hardcode hex.",
      ),
      el(
        "div",
        { className: "sg-grid", "data-specimen": "palette" },
        swatch("Ink", "--ink", "#1a1a1a"),
        swatch("Paper", "--paper", "#e8e0d0"),
        swatch("Blood", "--blood", "#a02c2c"),
        swatch("Lamplit", "--lamplit", "#141210"),
        swatch("Surface", "--surface", "theme"),
        swatch("Text", "--text", "theme"),
        swatch("Accent", "--accent", "theme"),
        swatch("Rule heavy", "--rule-heavy", "theme"),
      ),
    ),

    // ── Type ─────────────────────────────────────────────────
    section(
      "type",
      "Type",
      el(
        "p",
        { className: "serif" },
        "All faces self-hosted under ",
        el("code", {}, "/fonts/"),
        ". Stacks declare system fallbacks. Subsets: latin + latin-ext; ",
        "cyrillic for Oswald & Alegreya Sans.",
      ),
      specimen(
        "League Gothic — headers / sheet titles",
        "",
        "CREW SHEET · SCROUNDRELS",
        "font-family: var(--font-head); font-size: 2.4rem; text-transform: uppercase; line-height: 1;",
      ),
      specimen(
        "Oswald 600 — labels / small-caps furniture",
        "lbl",
        "Action · Stress · Trauma · Harm · Armor · Load",
        "font-size: 1rem; color: var(--text);",
      ),
      specimen(
        "Alegreya Sans — body / UI text",
        "",
        "A scoundrel in Doskvol scrapes by on coin, stress, and borrowed time. The sheet tracks the paperwork; the table decides the rest.",
        "font-family: var(--font-body); font-size: 1.05rem;",
      ),
      specimen(
        "Alegreya — long-form notes (serif sibling)",
        "serif",
        "Found tucked behind a false brick in the old rail vault: a ledger page damp with black water, names crossed in red.",
        "font-size: 1.1rem; font-style: italic;",
      ),
      specimen(
        "Special Elite — flavor / typewriter accents (trauma stamps)",
        "typewriter",
        "COLD  ·  HAUNTED  ·  OBSESSED  ·  PARANOID",
        "font-size: 1.05rem;",
      ),
      specimen(
        "IM Fell English — aged-print epigraphs only",
        "epigraph",
        "We are all in the gutter, but some of us are looking at the lamps.",
        "font-size: 1.25rem;",
      ),
      el(
        "div",
        { className: "type-specimen" },
        el("div", { className: "specimen-meta" }, "Cyrillic coverage — Oswald / Alegreya Sans"),
        el(
          "p",
          { className: "lbl", style: "font-size:1rem;color:var(--text)" },
          "ОХОТА · УЧЁБА · РАЗВЕДКА · ВОЗНЯ",
        ),
        el(
          "p",
          { style: "font-family:var(--font-body);font-size:1.05rem" },
          "Разбойник в Доскволе живёт на монетах, стрессе и одолженном времени.",
        ),
      ),
    ),

    // ── Action dots ──────────────────────────────────────────
    section(
      "action-dots",
      "Action dots",
      el(
        "p",
        { className: "serif" },
        "Inked circles for action ratings. Click a dot to set; click the filled terminal to clear.",
      ),
      el(
        "div",
        { className: "sg-cols", "data-specimen": "action-dots" },
        el(
          "div",
          {},
          ...ACTIONS.slice(0, 4).map((a) =>
            actionDots({
              name: a.name,
              value: a.value,
              max: 4,
              onChange: () => {
                /* demo interactive */
              },
            }),
          ),
        ),
        el(
          "div",
          {},
          ...ACTIONS.slice(4).map((a) =>
            actionDots({
              name: a.name,
              value: a.value,
              max: 4,
              onChange: () => {
                /* demo interactive */
              },
            }),
          ),
        ),
      ),
    ),

    // ── Stress track ─────────────────────────────────────────
    section(
      "stress-track",
      "Stress track",
      el(
        "p",
        { className: "serif" },
        "Row of heavy boxes. Capacity is a parameter (never a hardcoded maximum).",
      ),
      el(
        "div",
        { className: "sg-grid", "data-specimen": "stress-track" },
        stressTrack({
          value: 3,
          max: 9,
          label: "Stress · 9",
          onChange: () => {
            /* demo */
          },
        }),
        stressTrack({
          value: 5,
          max: 6,
          label: "Vampire drain · 6",
          onChange: () => {
            /* demo */
          },
        }),
      ),
    ),

    // ── Trauma stamps ────────────────────────────────────────
    section(
      "trauma-stamps",
      "Trauma stamps",
      el(
        "p",
        { className: "serif" },
        "Rubber-stamped labels. Typewriter face, slight tilt, blood ink when stamped.",
      ),
      traumaStamps({
        items: TRAUMAS,
        stamped: ["Cold", "Obsessed"],
        onToggle: () => {
          /* demo */
        },
      }),
    ),

    // ── Harm table ───────────────────────────────────────────
    section(
      "harm-table",
      "Harm table",
      el(
        "p",
        { className: "serif" },
        "Lined table, level rows. Fatal level inverts to blood for urgency.",
      ),
      bladesHarmTable({
        lesser: ["Battered"],
        moderate: ["Stabbed", ""],
        severe: ["Broken leg"],
        fatal: [],
      }),
    ),

    // ── Clocks ───────────────────────────────────────────────
    section(
      "clocks",
      "SVG clocks",
      el(
        "p",
        { className: "serif" },
        "Inked segment dials — 4 / 6 / 8 shown; any segment count accepted. ",
        "Click a segment to fill through it.",
      ),
      el(
        "div",
        { className: "sg-clocks", "data-specimen": "clocks" },
        clock({
          segments: 4,
          value: 1,
          label: "Lockbox",
          onChange: () => {
            /* demo */
          },
        }),
        clock({
          segments: 6,
          value: 3,
          label: "Conspiracy",
          onChange: () => {
            /* demo */
          },
        }),
        clock({
          segments: 8,
          value: 5,
          label: "War",
          onChange: () => {
            /* demo */
          },
        }),
      ),
    ),

    // ── Checkboxes ───────────────────────────────────────────
    section(
      "checkboxes",
      "Inked checkboxes",
      el(
        "p",
        { className: "serif" },
        "Square form stock for armor, loadout, and cohort flags.",
      ),
      el(
        "div",
        {
          className: "sg-grid",
          "data-specimen": "checkboxes",
          style: "align-items:center",
        },
        inkedCheckbox({ label: "Armor", checked: true }),
        inkedCheckbox({ label: "Heavy", checked: false }),
        inkedCheckbox({ label: "Special", checked: true }),
        inkedCheckbox({ label: "Load: Normal", checked: false }),
      ),
    ),

    // ── Focus / a11y note ────────────────────────────────────
    section(
      "a11y",
      "Accessibility",
      el(
        "ul",
        { className: "serif" },
        el("li", {}, "Visible :focus-visible ring in blood accent on every control."),
        el("li", {}, "prefers-reduced-motion kills transitions and the page fade."),
        el("li", {}, "High-contrast variant via the Hi-C toggle (data-contrast=high)."),
        el("li", {}, "Manual light/dark override; Auto defers to prefers-color-scheme."),
        el("li", {}, "Clock segments are keyboard-activable (Enter / Space)."),
      ),
      el(
        "p",
        {},
        el("a", { href: "#palette" }, "Jump to palette"),
        " · ",
        el("button", { type: "button" }, "Sample button for focus"),
      ),
    ),
  );

  setChildren(root, page);
  return () => {
    setChildren(root);
  };
}
