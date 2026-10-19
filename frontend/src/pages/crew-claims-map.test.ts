// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderCrewClaimsSection } from "./crew-sections/claims.js";
import type { RenderState } from "./crew-detail.js";

const css = readFileSync("src/styles/components.css", "utf8");

describe("CREW-CLAIMS-MAP-01", () => {
  it("makes the claims section span both wide crew columns", () => {
    expect(css).toMatch(/@media \(min-width: 900px\) \{[\s\S]*?\.crew-detail > \.crew-claims\s*\{[^}]*column-span:\s*all\s*;/);
  });

  it("uses the map's available width and lets long cell text wrap instead of widening the grid", () => {
    const grid = css.match(/\.claims-grid\s*\{([^}]*)\}/)?.[1] ?? "";
    const cell = css.match(/\.claim-cell\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(grid).toMatch(/(?:^|;)\s*width:\s*100%\s*;/);
    expect(cell).toMatch(/(?:^|;)\s*min-width:\s*0\s*;/);
    expect(cell).toMatch(/(?:^|;)\s*overflow-wrap:\s*anywhere\s*;/);
  });

  it("keeps settings-defined graph columns shrinkable rather than using their text's minimum width", () => {
    const state = {
      c: { crewTypeName: "Test", claimedClaimIds: [], claimOverrides: [] },
      crewTypeData: { Claims: { Columns: 3, Rows: 1, Nodes: [
        { Id: "left", Name: "A long claim name", Description: "A benefit", Kind: "claim", Column: 1, Row: 1 },
        { Id: "lair", Name: "Lair", Description: "", Kind: "lair", Column: 2, Row: 1 },
        { Id: "right", Name: "Another claim", Description: "Another benefit", Kind: "claim", Column: 3, Row: 1 },
      ], Edges: [] } },
      crewTypesData: null,
    } as unknown as RenderState;
    const root = renderCrewClaimsSection(state);
    expect(root.querySelector<HTMLElement>(".claims-grid")?.style.gridTemplateColumns).toMatch(/repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
    expect(root.querySelectorAll(".claim-node")).toHaveLength(3);
  });
});
