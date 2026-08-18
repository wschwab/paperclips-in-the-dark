import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { firstPlaybook } from "../../src/game-data.js";
import type { CharacterDto } from "../../src/schemas.js";
import { testCase } from "../../src/test-case.js";

// §5.1.3 stress overflow is advisory only — frozen Wave 2 semantics (see
// suites/lifecycle/lifecycle-state-machine.test.ts for the authoritative
// oracle): stress clamps at max and never auto-adds trauma; reaching max
// sets traumaPending with the typed attention token "stress full — trauma
// pending". trauma.add is a separate, explicit, resolution-only operation
// (requires pending). Helpers read raw response bodies, mirroring the oracle.

const BLADES = "blades-in-the-dark";
const STRESS_FULL_ATTENTION = "stress full — trauma pending";

interface RawError {
  code: string;
  message: string;
}

interface RawResult {
  ok: boolean;
  character?: CharacterDto;
  sideEffects?: string[];
  error?: RawError | null;
}

/** Creates a character and returns the raw DTO (no schema decode). */
async function newRawCharacter(): Promise<CharacterDto> {
  const response = await api.post("characters", { gameStem: BLADES, playbook: firstPlaybook(BLADES) });
  expect(response.status).toBe(200);
  const body = response.body as RawResult;
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
): Promise<RawResult> {
  const headers: Record<string, string> = revision === undefined ? {} : { "If-Match": String(revision) };
  return (await api.post(`characters/${encodeURIComponent(id)}/ops/${operation}`, body, headers)).body as RawResult;
}

/**
 * Stress.add to exactly max — the frozen-contract trigger that sets
 * traumaPending (sequence step 1).
 */
async function reachPending(character: CharacterDto): Promise<CharacterDto> {
  const result = await characterOpRaw(
    character.id,
    "stress.add",
    { delta: character.monitor.stress.max },
    character.revision,
  );
  expect(result.ok).toBe(true);
  if (!result.character) throw new Error("stress.add did not return a character");
  expect(result.character.monitor.stress.current).toBe(character.monitor.stress.max);
  expect(result.character.traumaPending).toBe(true);
  return result.character;
}

/**
 * Resolves the pending trauma via trauma.add — the frozen-contract
 * resolution that keeps stress full (sequence step 2).
 */
async function resolvePending(pending: CharacterDto, trauma: string): Promise<CharacterDto> {
  const result = await characterOpRaw(pending.id, "trauma.add", { trauma }, pending.revision);
  expect(result.ok).toBe(true);
  if (!result.character) throw new Error("trauma.add did not return a character");
  expect(result.character.monitor.trauma.traumas).toContain(trauma);
  return result.character;
}

describe("§5.1.3 stress overflow is advisory only", () => {
  testCase("SEMANTICS-STRESS-OVERFLOW-001", "full stress does not add trauma automatically", async () => {
    const character = await newRawCharacter();
    // Overflow in a single op clamps to max; it never auto-adds trauma.
    const result = await characterOpRaw(
      character.id,
      "stress.add",
      { delta: character.monitor.stress.max * 2 },
      character.revision,
    );
    expect(result.ok).toBe(true);
    // Frozen typed attention token + traumaPending flag (SC-C2 / Q42).
    expect(result.sideEffects).toContain(STRESS_FULL_ATTENTION);
    expect(result.character?.monitor.stress.current).toBe(character.monitor.stress.max);
    expect(result.character?.traumaPending).toBe(true);
    // No auto-trauma, no retirement.
    expect(result.character?.monitor.trauma.traumas).toEqual([]);
    expect(result.character?.isRetired).toBe(false);
  });

  testCase("SEMANTICS-STRESS-OVERFLOW-002", "trauma is a separate explicit resolution-only operation", async () => {
    const character = await newRawCharacter();
    // No pending: trauma.add is resolution-only -> VALIDATION (frozen).
    const direct = await characterOpRaw(character.id, "trauma.add", { trauma: "Haunted" }, character.revision);
    expect(direct.ok).toBe(false);
    expect(direct.error?.code).toBe("VALIDATION");
    // With pending, the explicit trauma.add resolves the trauma.
    const pending = await reachPending(character);
    const resolved = await resolvePending(pending, "Haunted");
    expect(resolved.monitor.trauma.traumas).toContain("Haunted");
  });
});
