import { describe, expect } from "vitest";
import { api, type HttpResponse } from "../../src/api.js";
import { firstPlaybook } from "../../src/game-data.js";
import type { CharacterDto } from "../../src/schemas.js";
import { testCase } from "../../src/test-case.js";

// ---------------------------------------------------------------------------
// CONTRACT-02 oracle (DEC-02 human ruling, 2026-08-24; normative page
// docs/pages/contract/contract-c2-vice-stress.mdx).
//
// Vice indulgence is amount-based: POST /characters/{id}/ops/stress.clear
// requires {amount >= 0} (quantity result family), clamps to the currently
// marked stress, and returns the typed sideEffect
//   "overindulged — indulgence exceeded remaining stress"
// when the requested amount exceeded the marked stress AND Stress lands at 0.
//
// Trauma resolution clears Stress: POST /characters/{id}/ops/trauma.add now
// ALSO sets monitor.stress.current to 0 in the same atomic apply.
//
// BREAKING CHANGE: the previously bodyless stress.clear op rejects requests
// without `amount` with 400 VALIDATION (documented, intentional).
//
// Decode-free by design, mirroring lifecycle-state-machine.test.ts: raw
// bodies so applied-family and sideEffect assertions target exact values.
// ---------------------------------------------------------------------------

const BLADES = "blades-in-the-dark";
export const OVERINDULGED_SIDEEFFECT =
  "overindulged — indulgence exceeded remaining stress";

interface RawError {
  code?: string;
}

interface RawOpResult {
  ok: boolean;
  character?: CharacterDto;
  applied?: { op: string; requested?: number; effective?: number };
  sideEffects?: string[];
  error?: RawError | null;
}

/** Reads the raw operation-result body without decoding the DTO. */
async function rawResult(response: HttpResponse): Promise<RawOpResult> {
  return response.body as RawOpResult;
}

/** Creates a fresh Blades character and returns the raw DTO (no decode). */
async function newRawCharacter(): Promise<CharacterDto> {
  const response = await api.post("characters", { gameStem: BLADES, playbook: firstPlaybook(BLADES) });
  expect(response.status).toBe(200);
  const body = await rawResult(response);
  expect(body.ok).toBe(true);
  if (!body.character) throw new Error("creation did not return a character");
  return body.character;
}

/** POSTs a character op and returns the raw result (no schema decode). */
async function characterOpRaw(
  id: string,
  operation: string,
  body: unknown,
  revision?: number,
): Promise<RawOpResult> {
  const headers: Record<string, string> = revision === undefined ? {} : { "If-Match": String(revision) };
  return rawResult(await api.post(`characters/${encodeURIComponent(id)}/ops/${operation}`, body, headers));
}

/** Raw character from GET /characters/{id} (no schema decode). */
async function readRawCharacter(id: string): Promise<CharacterDto> {
  const response = await api.get(`characters/${encodeURIComponent(id)}`);
  expect(response.status).toBe(200);
  return response.body as CharacterDto;
}

describe("CONTRACT-02 vice amount + trauma clears stress", () => {
  testCase("VICE-AMOUNT-001", "indulge with amount below marked stress clears exactly that much (partial clear)", async () => {
    const character = await newRawCharacter();
    const seeded = await characterOpRaw(character.id, "stress.add", { delta: 5 }, character.revision);
    expect(seeded.ok).toBe(true);
    expect(seeded.character?.monitor.stress.current).toBe(5);

    const result = await characterOpRaw(character.id, "stress.clear", { amount: 3 }, seeded.character!.revision);
    expect(result.ok).toBe(true);
    // Quantity family: requested = asked amount, effective = amount cleared.
    expect(result.applied?.op).toBe("stress.clear");
    expect(result.applied?.requested).toBe(3);
    expect(result.applied?.effective).toBe(3);
    expect(result.character?.monitor.stress.current).toBe(2);
    expect(result.sideEffects ?? []).not.toContain(OVERINDULGED_SIDEEFFECT);

    // Persisted, not just echoed.
    const reloaded = await readRawCharacter(character.id);
    expect(reloaded.monitor.stress.current).toBe(2);
  });

  testCase("VICE-AMOUNT-002", "amount exceeding marked stress clamps to zero and carries the overindulged signal", async () => {
    const character = await newRawCharacter();
    const seeded = await characterOpRaw(character.id, "stress.add", { delta: 5 }, character.revision);
    expect(seeded.ok).toBe(true);

    // Request the settings-derived maximum (9 on Blades) against 5 marked:
    // the DEC-02 ruling's "request 9 on 5" case without embedding a maximum.
    const result = await characterOpRaw(
      character.id,
      "stress.clear",
      { amount: seeded.character!.monitor.stress.max },
      seeded.character!.revision,
    );
    expect(result.ok).toBe(true);
    expect(result.applied?.requested).toBe(seeded.character!.monitor.stress.max);
    expect(result.applied?.effective).toBe(5); // clamped to what was marked
    expect(result.character?.monitor.stress.current).toBe(0);
    expect(result.sideEffects).toContain(OVERINDULGED_SIDEEFFECT);

    const reloaded = await readRawCharacter(character.id);
    expect(reloaded.monitor.stress.current).toBe(0);
  });

  testCase("VICE-AMOUNT-003", "an exact-amount clear lands at zero WITHOUT the overindulged signal", async () => {
    const character = await newRawCharacter();
    const seeded = await characterOpRaw(character.id, "stress.add", { delta: 5 }, character.revision);
    const result = await characterOpRaw(character.id, "stress.clear", { amount: 5 }, seeded.character!.revision);
    expect(result.ok).toBe(true);
    expect(result.applied?.requested).toBe(5);
    expect(result.applied?.effective).toBe(5);
    expect(result.character?.monitor.stress.current).toBe(0);
    expect(result.sideEffects ?? []).not.toContain(OVERINDULGED_SIDEEFFECT);
  });

  testCase("VICE-AMOUNT-004", "amount 0 is a no-op success", async () => {
    const character = await newRawCharacter();
    const seeded = await characterOpRaw(character.id, "stress.add", { delta: 5 }, character.revision);
    const result = await characterOpRaw(character.id, "stress.clear", { amount: 0 }, seeded.character!.revision);
    expect(result.ok).toBe(true);
    expect(result.applied?.requested).toBe(0);
    expect(result.applied?.effective).toBe(0);
    expect(result.character?.monitor.stress.current).toBe(5);
    expect(result.sideEffects ?? []).not.toContain(OVERINDULGED_SIDEEFFECT);
  });

  testCase("VICE-AMOUNT-005", "a negative amount is rejected with VALIDATION", async () => {
    const character = await newRawCharacter();
    const result = await characterOpRaw(character.id, "stress.clear", { amount: -1 }, character.revision);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("VALIDATION");
  });

  testCase("VICE-AMOUNT-006", "a non-integer amount is rejected with VALIDATION", async () => {
    const character = await newRawCharacter();
    const result = await characterOpRaw(character.id, "stress.clear", { amount: 1.5 }, character.revision);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("VALIDATION");
  });

  testCase("VICE-AMOUNT-007", "missing amount is rejected with VALIDATION (new required field; breaking change)", async () => {
    const character = await newRawCharacter();
    const emptyBody = await characterOpRaw(character.id, "stress.clear", {}, character.revision);
    expect(emptyBody.ok).toBe(false);
    expect(emptyBody.error?.code).toBe("VALIDATION");

    // Breaking change guard: the OLD bodyless call shape must fail loudly.
    const noBody = await characterOpRaw(character.id, "stress.clear", undefined, character.revision);
    expect(noBody.ok).toBe(false);
    expect(noBody.error?.code).toBe("VALIDATION");

    // Nothing was mutated by either rejected request.
    const reloaded = await readRawCharacter(character.id);
    expect(reloaded.monitor.stress.current).toBe(0);
  });
  testCase("VICE-AMOUNT-008", "resolving pending trauma sets stress to 0 in the returned character AND after reload", async () => {
    const character = await newRawCharacter();
    const pending = await characterOpRaw(
      character.id,
      "stress.add",
      { delta: character.monitor.stress.max },
      character.revision,
    );
    expect(pending.ok).toBe(true);
    expect(pending.character?.traumaPending).toBe(true);
    expect(pending.character?.monitor.stress.current).toBe(character.monitor.stress.max);

    const resolved = await characterOpRaw(character.id, "trauma.add", { trauma: "Broken" }, pending.character!.revision);
    expect(resolved.ok).toBe(true);
    expect(resolved.character?.monitor.trauma.traumas).toContain("Broken");
    // CONTRACT-02: resolution clears stress to 0 in the same atomic apply.
    expect(resolved.character?.monitor.stress.current).toBe(0);
    expect(resolved.character?.isOutOfAction).toBe(true);
    expect(resolved.character?.stressClearPending).toBe(true);

    // Persisted: visible after a plain reload.
    const reloaded = await readRawCharacter(character.id);
    expect(reloaded.monitor.stress.current).toBe(0);
  });
});
