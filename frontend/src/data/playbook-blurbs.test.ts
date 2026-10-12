import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// PLAYBOOK-BLURBS-01: the picker descriptions come from the game data's own Hook lines.
// These guards pin that every playbook (and every crew type) in each edition carries a Hook,
// that the Hook is one line, and that the Whisper typo is gone.
const load = (file: string) => JSON.parse(readFileSync(`../data/games/${file}`, "utf8").replace(/^\uFEFF/, ""));

const EDITIONS = ["blades-in-the-dark.json", "français-blades-in-the-dark.json", "rus-blades-in-the-dark.json", "scum-and-villainy.json"];

describe("playbook and crew hooks in game data (PLAYBOOK-BLURBS-01)", () => {
  for (const file of EDITIONS) {
    it(`${file}: every playbook has a one-line Hook`, () => {
      const playbooks = load(file).Playbooks as Array<{ Name: string; Hook?: unknown }>;
      expect(playbooks.length).toBeGreaterThan(0);
      for (const pb of playbooks) {
        expect(typeof pb.Hook, pb.Name).toBe("string");
        expect((pb.Hook as string).trim().length, pb.Name).toBeGreaterThan(0);
        expect((pb.Hook as string).includes("\n"), pb.Name).toBe(false);
      }
    });
  }

  it("the Whisper hook reads 'Play a Whisper' (typo fixed)", () => {
    const whisper = (load("blades-in-the-dark.json").Playbooks as Array<{ Name: string; Hook: string }>).find((p) => p.Name === "Whisper");
    expect(whisper?.Hook).toContain("Play a Whisper if you want to meddle with arcane powers.");
    expect(whisper?.Hook).not.toContain("Play whisper a Whisper");
  });

  it("no playbook hook anywhere in the editions carries the typo", () => {
    for (const file of EDITIONS) {
      const text = readFileSync(`../data/games/${file}`, "utf8");
      expect(text, file).not.toContain("Play whisper a Whisper");
    }
  });

  it("every Blades crew type has a Hook", () => {
    const crews = load("blades-in-the-dark-crews.json").CrewTypes as Array<{ Name: string; Hook?: unknown }>;
    expect(crews.length).toBe(6);
    for (const c of crews) expect(typeof c.Hook, c.Name).toBe("string");
  });
});
