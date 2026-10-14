import { readFileSync } from "node:fs";
import { Effect } from "effect";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiError, StaleRevisionError, characterGearSetLoadout } from "./client.js";
import { decodeCharacterEither } from "../schema/character.js";

const decoded = decodeCharacterEither(JSON.parse(readFileSync(
  new URL("../../../conformance/fixtures/golden-character.json", import.meta.url), "utf8",
)));
if (decoded._tag === "Left") throw new Error(String(decoded.left));
const before = decoded.right;
const selected = [{ name: "Rope", bulk: 1 }];
const after = {
  ...before,
  revision: before.revision + 1,
  gear: { ...before.gear, commitment: "normal", loadout: selected, availableGear: selected },
};
const success = { ok: true, applied: { op: "gear.set-loadout" }, sideEffects: [], error: null, character: after };

beforeEach(() => vi.restoreAllMocks());

describe("LOADOUT-ATOMIC-01 client", () => {
  it("sends the complete selection and If-Match to one atomic operation", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify(success) });
    const result = await Effect.runPromise(characterGearSetLoadout(before.id, "normal", ["Rope"], before.revision));
    expect(result.revision).toBe(before.revision + 1);
    expect(result.gear.loadout).toEqual(selected);
    expect(global.fetch).toHaveBeenCalledExactlyOnceWith(`/api/characters/${before.id}/ops/gear.set-loadout`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "If-Match": String(before.revision) },
      body: JSON.stringify({ commitment: "normal", items: ["Rope"] }),
    });
  });

  it("keeps a typed validation failure and never falls back to partial gear writes", async () => {
    const failure = {
      ok: false, applied: { op: "gear.set-loadout" }, sideEffects: [],
      error: { code: "VALIDATION", status: 400, message: "Invalid loadout", retryable: false,
        recovery: "Adjust the loadout and retry.", details: { issues: [{ pointer: "/items", message: "Too bulky" }] } },
    };
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => JSON.stringify(failure) });
    const result = await Effect.runPromise(Effect.either(characterGearSetLoadout(before.id, "normal", ["Rope"], before.revision)));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(ApiError);
      if (result.left instanceof ApiError) expect(result.left.status).toBe(400);
    }
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("preserves the existing stale-revision path rather than retrying an item chain", async () => {
    const failure = {
      ok: false, applied: { op: "gear.set-loadout" }, sideEffects: [],
      error: { code: "STALE_REVISION", status: 409, message: "Revision mismatch", retryable: true,
        recovery: "Refresh the sheet and retry.", details: { currentRevision: before.revision + 1 } },
    };
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 409, text: async () => JSON.stringify(failure) });
    const result = await Effect.runPromise(Effect.either(characterGearSetLoadout(before.id, "normal", ["Rope"], before.revision)));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") expect(result.left).toBeInstanceOf(StaleRevisionError);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
