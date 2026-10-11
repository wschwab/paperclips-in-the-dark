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
