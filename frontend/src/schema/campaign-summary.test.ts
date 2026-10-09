import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { CharacterSummary } from "./campaign.js";

// GAME-MODE contract (campaign.json#/$defs/characterSummary): readable rows carry
// the character's stored mode; degraded rows omit it. mode is therefore optional
// in the summary and must be one of the three enum values when present.
const readableRow = {
  kind: "character",
  id: "d3adbeef-d3ad-4ead-8ead-d3adbeef0001",
  name: "Brenda Hilton",
  alias: "Webweaver",
  playbook: "Cutter",
  gameStem: "blades-in-the-dark",
  crewId: "",
  stress: 0,
  traumas: [],
  isRetired: false,
  isDeadish: false,
  revision: 3,
  isReadable: true,
  isRepairable: true,
  isComplete: true,
  deleteToken: "",
  canUndo: false,
  historyCount: 0,
};

const decode = (value: unknown) => Schema.decodeUnknownEither(CharacterSummary)(value);

describe("CharacterSummary mode (GAME-MODE contract)", () => {
  it("decodes a readable row that carries the stored mode", () => {
    const result = decode({ ...readableRow, mode: "score" });
    expect(result._tag).toBe("Right");
    if (result._tag === "Right") expect(result.right.mode).toBe("score");
  });

  it("decodes a degraded row that omits mode", () => {
    expect(decode({ ...readableRow, isReadable: false, isComplete: false, deleteToken: "" })._tag).toBe("Right");
  });

  it("rejects a mode outside the contract enum", () => {
    expect(decode({ ...readableRow, mode: "campaign" })._tag).toBe("Left");
  });
});
