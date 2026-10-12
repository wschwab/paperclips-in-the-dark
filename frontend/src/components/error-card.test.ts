// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { errorCard } from "./error-card.js";

// ERROR-SCREEN-01: the error card had no layout rules. The heading (h1, 2.2rem, uppercase, display
// register) overflowed into the header, the buttons sat unstyled against each other, and the
// <details> marker hung at the edge. The card is styled as one column with a bounded heading.
const css = readFileSync("src/styles/components.css", "utf8");

describe("error card layout (ERROR-SCREEN-01)", () => {
  it("renders the headline, actions and a folded technical detail", () => {
    const card = errorCard({ headline: "This scoundrel sheet could not be loaded.", onRetry: () => {}, detail: "boom" });
    expect(card.querySelector(".error-card-head")?.textContent).toBe("This scoundrel sheet could not be loaded.");
    expect(card.querySelector(".error-card-actions button")?.textContent).toBe("Retry");
    expect(card.querySelector(".error-card-actions a")?.textContent).toBe("Back to roster");
    expect(card.querySelector("details.error-card-detail summary")?.textContent).toBe("Technical detail");
  });

  it("styles the card as a bounded column with a wrapping heading", () => {
    const rule = css.match(/\.error-card\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/max-width:\s*\d+/);
    expect(rule).toMatch(/padding:/);
    const head = css.match(/\.error-card-head\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(head).toMatch(/font-size:\s*(clamp|min|1\.[0-9]+rem|[0-9.]+rem)/);
    expect(head).toMatch(/overflow-wrap:\s*anywhere/);
    expect(head).toMatch(/margin:\s*0;/);
  });

  it("lays the actions out as a wrapping row with a gap, so the buttons never butt together", () => {
    const actions = css.match(/\.error-card-actions\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(actions).toMatch(/display:\s*flex/);
    expect(actions).toMatch(/flex-wrap:\s*wrap/);
    expect(actions).toMatch(/gap:/);
  });

  it("keeps the disclosure marker inside the card with a gap from the text", () => {
    const detail = css.match(/\.error-card-detail\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(detail).toMatch(/padding-left:/);
  });
});
