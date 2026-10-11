import { describe, expect, it } from "vitest";
import {
  ENTANGLEMENT_BANDS,
  ENTANGLEMENT_DESCRIPTIONS,
  ENTANGLEMENT_ROWS,
  ENTANGLEMENTS_SRD_URL,
  entanglementsInBand,
} from "./entanglements.js";

// Transcribed from https://bladesinthedark.com/entanglements (SRD, CC-BY).
describe("entanglement SRD data", () => {
  it("links to the SRD entanglements page", () => {
    expect(ENTANGLEMENTS_SRD_URL).toBe("https://bladesinthedark.com/entanglements");
  });

  it("transcribes the SRD heat columns (Heat 0-3, 4-5, 6) row by row", () => {
    const column = (band: string) => ENTANGLEMENT_ROWS.map((r) => `${r.result}: ${r.outcomes[band as "0–3"]}`);
    expect(column("0–3")).toEqual([
      "1–3: Gang Trouble or The Usual Suspects",
      "4–5: Rivals or Unquiet Dead",
      "6: Cooperation",
    ]);
    expect(column("4–5")).toEqual([
      "1–3: Gang Trouble or Questioning",
      "4–5: Reprisals or Unquiet Dead",
      "6: Show of Force",
    ]);
    expect(column("6+")).toEqual([
      "1–3: Flipped or Interrogation",
      "4–5: Demonic Notice or Show of Force",
      "6: Arrest",
    ]);
  });

  it("gives every heat column exactly five entanglements, each with its SRD description", () => {
    for (const band of ENTANGLEMENT_BANDS) {
      const names = entanglementsInBand(band.label);
      expect(names).toHaveLength(5);
      expect(new Set(names).size).toBe(5);
      for (const name of names) {
        expect(ENTANGLEMENT_DESCRIPTIONS[name], name).toBeTruthy();
      }
    }
  });

  it("carries all twelve SRD descriptions", () => {
    expect(Object.keys(ENTANGLEMENT_DESCRIPTIONS).sort()).toEqual([
      "Arrest",
      "Cooperation",
      "Demonic Notice",
      "Flipped",
      "Gang Trouble",
      "Interrogation",
      "Questioning",
      "Reprisals",
      "Rivals",
      "Show of Force",
      "The Usual Suspects",
      "Unquiet Dead",
    ]);
  });

  it("keeps the SRD wording for a sample entanglement", () => {
    expect(ENTANGLEMENT_DESCRIPTIONS["Reprisals"]).toBe(
      "An enemy faction makes a move against you (or a friend, contact, or vice purveyor). Pay them (1 rep and 1 coin) per Tier of the enemy as an apology, allow them to mess with you or yours, or fight back and show them who’s boss.",
    );
  });
});
