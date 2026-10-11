import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Sol 6.1 F5: the game-mode helper buttons (btn-secondary) fell to 3.58:1 on hover in light
// high-contrast (--link #d10000 on --surface-sunk). The game-mode CSS must keep hover text
// at the ink token so the hover pairing stays above 4.5:1.
const css = readFileSync("src/styles/game-mode.css", "utf8");

describe("game-mode helper hover contrast (F5)", () => {
  it("restores ink-coloured text on hover for game-mode secondary buttons in high contrast", () => {
    expect(css).toMatch(/:root\[data-contrast="high"\]\s+\.game-mode-popup\s+\.btn-secondary:hover[\s\S]*?color:\s*var\(--text\)/);
    expect(css).toMatch(/:root\[data-contrast="high"\]\s+\.mode-panel\s+\.btn-secondary:hover[\s\S]*?color:\s*var\(--text\)/);
    expect(css).toMatch(/\[data-section="committed-loadout"\]\s+\.btn-secondary:hover[\s\S]*?color:\s*var\(--text\)/);
  });
});

// Sol 6.1 F1: on narrow screens the Resolution card covered the fixed mode footer, so the
// switcher could not be reached during Resolution. The footer must stack above the overlay.
describe("mode switch stays reachable during Resolution (F1)", () => {
  it("keeps the narrow Resolution overlay clear of the fixed mode footer strip", () => {
    // The narrow overlay sits after the base overlay rules and stops above the footer strip.
    const narrowResolution = css.match(/@media \(max-width: 1099px\)\s*\{\s*\.game-mode-resolution\s*\{([^}]*)\}/);
    expect(narrowResolution, "narrow Resolution overlay rule").not.toBeNull();
    expect(narrowResolution![1], "overlay ends at the footer strip").toMatch(/inset:\s*0\s+0\s+40vh\s+0/);
  });
});

// Sol 6.1 round 2: R2-01 selected choice state, R2-07 equal three-choice mode strip.
describe("round 2 visual states (R2-01, R2-07)", () => {
  it("R2-01: pressed planning/load choices render a filled selected state", () => {
    expect(css).toMatch(/\.game-mode-popup button\[aria-pressed="true"\][\s\S]*?background:\s*var\(--fill\)/);
  });
  it("R2-07: the mode switch is one row of three equal choices at wide widths", () => {
    expect(css).toMatch(/\.mode-switch\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  });
});

// Sol 6.1 round 3 (R3-02): one Downtime budget per layout, and a two-column activity menu on narrow.
describe("narrow Downtime card layout (R3-02)", () => {
  it("hides the panel budget on narrow and the sheet budget on wide", () => {
    // Each rule must sit inside the media block that governs its layout (the nearest preceding @media).
    const governing = (selector: string) => {
      const at = css.search(new RegExp(`${selector}\\s*\\{\\s*display:\\s*none`));
      expect(at, selector).toBeGreaterThan(-1);
      return css.slice(0, at).lastIndexOf("@media");
    };
    expect(css.slice(governing("\\.game-mode-budget-panel"), governing("\\.game-mode-budget-panel") + 40)).toContain("max-width: 1099px");
    expect(css.slice(governing("\\.game-mode-budget-sheet"), governing("\\.game-mode-budget-sheet") + 40)).toContain("min-width: 1100px");
  });
  it("lays the sheet activity menu out as two columns with Other spanning the row", () => {
    expect(css).toMatch(/\.game-mode-activities-sheet \.activity-menu\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    expect(css).toMatch(/\.game-mode-activities-sheet \.activity-menu button:last-child\s*\{[^}]*grid-column:\s*1 \/ -1/);
  });
});
