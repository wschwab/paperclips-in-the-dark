import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { GameStem } from "./common.js";

// Mirrors contract/schemas/character.json#/$properties/gameStem:
//   pattern ^[A-Za-z0-9À-ɏ-]+$  (ASCII alphanumerics, hyphens, Latin U+00C0–U+024F).
const isGameStem = (value: string) => Schema.is(GameStem)(value);

describe("GameStem decoder mirrors the contract pattern", () => {
  it("accepts the French edition stem with Latin accented letters", () => {
    expect(isGameStem("français-blades-in-the-dark")).toBe(true);
  });

  it("accepts the ASCII stem", () => {
    expect(isGameStem("blades-in-the-dark")).toBe(true);
  });

  it("rejects characters outside the contract pattern", () => {
    expect(isGameStem("blades in the dark")).toBe(false);
    expect(isGameStem("bl@des")).toBe(false);
    expect(isGameStem("")).toBe(false);
    expect(isGameStem("über_stem")).toBe(false);
    expect(isGameStem("漢字-blades")).toBe(false);
  });

  it("accepts the Latin range boundaries U+00C0 and U+024F, and rejects the adjacent code points", () => {
    expect(isGameStem("\u00C0")).toBe(true);
    expect(isGameStem("\u024F")).toBe(true);
    expect(isGameStem("\u00BF")).toBe(false);
    expect(isGameStem("\u0250")).toBe(false);
  });
});
