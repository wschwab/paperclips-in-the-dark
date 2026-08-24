import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import type { Character } from "../schema/character.js";
import { decodeCharacter } from "../schema/character.js";
import { completionCues } from "./completion-cues.js";

/**
 * Fixture base: the golden character DTO (fully complete), decoded through
 * the frozen schema so every variant below is a valid canonical document.
 */
const goldenRaw = JSON.parse(
  readFileSync(new URL("../../../conformance/fixtures/golden-character.json", import.meta.url), "utf8"),
) as Record<string, unknown>;

function character(mutate: (draft: Record<string, unknown>) => void): Character {
  const draft = structuredClone(goldenRaw);
  mutate(draft);
  return decodeCharacter(draft);
}

/** The freshly-created shape: blank identity, no abilities, no crew. */
function freshCharacter(): Character {
  return character((d) => {
    d.dossier = {
      name: "",
      crewId: "",
      alias: "",
      look: "",
      notes: [],
      background: { name: "", description: "" },
      heritage: { name: "", description: "" },
      vice: { name: "", description: "", purveyor: { name: "", description: "" } },
    };
    d.playbook = {
      name: (d.playbook as Record<string, unknown>).name,
      experience: (d.playbook as Record<string, unknown>).experience,
      abilities: [],
    };
  });
}

describe("completionCues", () => {
  it("derives the full prompt set for a fresh PC DTO", () => {
    expect(completionCues(freshCharacter()).map((c) => c.key)).toEqual([
      "name",
      "alias",
      "heritage",
      "background",
      "look",
      "vice",
      "ability",
      "crew",
    ]);
  });

  it("shows nothing for a complete character", () => {
    expect(completionCues(character(() => {}))).toEqual([]);
  });

  it("treats whitespace-only values as unset (nonBlankString vocabulary)", () => {
    const c = character((d) => {
      d.dossier = { ...(d.dossier as Record<string, unknown>), name: "   ", alias: "\t" };
    });
    const keys = completionCues(c).map((cue) => cue.key);
    expect(keys).toContain("name");
    expect(keys).toContain("alias");
  });

  const partialCases: Array<[string, (d: Record<string, unknown>) => void, string[]]> = [
    [
      "a missing purveyor alone cues the vice section",
      (d) => {
        const dossier = d.dossier as Record<string, unknown>;
        const vice = structuredClone(dossier.vice) as Record<string, unknown>;
        vice.purveyor = { name: "", description: "" };
        dossier.vice = vice;
      },
      ["vice"],
    ],
    [
      "a missing vice description alone cues the vice section",
      (d) => {
        const dossier = d.dossier as Record<string, unknown>;
        dossier.vice = { ...(dossier.vice as Record<string, unknown>), description: "" };
      },
      ["vice"],
    ],
    [
      "zero abilities cue a playbook ability without touching dossier cues",
      (d) => {
        d.playbook = {
          name: (d.playbook as Record<string, unknown>).name,
          experience: (d.playbook as Record<string, unknown>).experience,
          abilities: [],
        };
      },
      ["ability"],
    ],
    [
      "a blank crew link alone cues the crew section",
      (d) => {
        d.dossier = { ...(d.dossier as Record<string, unknown>), crewId: "" };
      },
      ["crew"],
    ],
  ];
  it.each(partialCases)("%s", (_name, mutate, wantKeys) => {
    expect(completionCues(character(mutate)).map((cue) => cue.key)).toEqual(wantKeys);
  });
});
