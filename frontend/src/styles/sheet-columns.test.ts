import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// PLAYTEST-UI-01 item 7: the torn seam hangs under the sheet masthead. In the
// two-column sheet the masthead reserves the seam depth plus the 18px column
// gap, and the card after it takes no extra top margin, so both columns start
// at the same offset beneath the seam (measured in Chromium).
const cssSource = readFileSync("src/styles/components.css", "utf8");

describe("two-column sheet: torn-seam clearance", () => {
  it("reserves seam depth plus the column gap under the masthead and zeroes the card after it", () => {
    expect(cssSource).toMatch(
      /@media \(min-width: 900px\) \{[\s\S]*?\.character-detail > \.character-header \{\s*margin-bottom: calc\(var\(--torn-depth-lg\) \+ 18px\);\s*\}\s*\.character-detail > \.character-header \+ \* \{\s*margin-top: 0;/,
    );
  });
});
