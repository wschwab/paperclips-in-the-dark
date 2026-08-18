import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { firstPlaybook, gameSetting } from "../../src/game-data.js";
import type { CharacterDto } from "../../src/schemas.js";
import { testCase } from "../../src/test-case.js";
import { newCharacter, revisionHeader } from "../../src/suite-helpers.js";

// Lifecycle retirement — frozen Wave 2 semantics (see
// suites/lifecycle/lifecycle-state-machine.test.ts for the authoritative
// oracle): trauma.add is resolution-only (requires traumaPending), the max-th
// resolution runs the shared retirement cleanup, and retired characters
// remain readable and deletable (delete needs If-Match + confirm).

const BLADES = "blades-in-the-dark";

interface RawResult {
  ok: boolean;
  character?: CharacterDto;
  sideEffects?: string[];
  error?: { code: string; message: string } | null;
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

/** POSTs a direct entity endpoint (end-score/...) raw. */
async function entityPostRaw(id: string, suffix: string, body: unknown, revision?: number): Promise<RawResult> {
  const headers: Record<string, string> = revision === undefined ? {} : { "If-Match": String(revision) };
  return (await api.post(`characters/${encodeURIComponent(id)}/${suffix}`, body, headers)).body as RawResult;
}

/** Raw character from GET /characters/{id} (no schema decode). */
async function readRawCharacter(id: string): Promise<CharacterDto> {
  const response = await api.get(`characters/${encodeURIComponent(id)}`);
  expect(response.status).toBe(200);
  return response.body as CharacterDto;
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

describe("lifecycle retirement", () => {
  testCase("LIFECYCLE-RETIREMENT-001", "a retired character remains readable and deletable", async () => {
    // Frozen final-trauma path: stress.add to max -> traumaPending, resolve
    // via trauma.add; end-score releases between scores; the max-th
    // resolution runs the shared retirement cleanup in the same transition.
    const character = await newRawCharacter();
    let latest = character;
    const traumaMax = gameSetting(BLADES).TraumaMax;
    const traumas = gameSetting(BLADES).Traumas.slice(0, traumaMax);
    for (const [index, trauma] of traumas.entries()) {
      const pending = await reachPending(latest);
      const resolved = await resolvePending(pending, trauma);
      latest = resolved;
      if (index < traumas.length - 1) {
        const ended = await entityPostRaw(latest.id, "end-score", {}, latest.revision);
        expect(ended.ok).toBe(true);
        if (!ended.character) throw new Error("end-score did not return a character");
        latest = ended.character;
      }
    }
    expect(latest.isRetired).toBe(true);
    // Retired characters remain readable.
    const read = await readRawCharacter(character.id);
    expect(read.isRetired).toBe(true);
    // And deletable — with If-Match + confirm.
    const deleted = await api.post(
      `characters/${encodeURIComponent(character.id)}/delete`,
      { confirm: true },
      { "If-Match": String(latest.revision) },
    );
    expect(deleted.status).toBe(200);
    const gone = await api.get(`characters/${encodeURIComponent(character.id)}`);
    expect(gone.status).toBe(404);
  });

  testCase("LIFECYCLE-RETIREMENT-002", "character deletion requires confirmation", async () => {
    const character = await newCharacter();
    const rejected = await api.post(`characters/${character.id}/delete`, { confirm: false }, revisionHeader(character.revision));
    expect(rejected.status).toBe(200);
    const rejectedResult = await api.operation(rejected);
    expect(rejectedResult.ok).toBe(false);
    expect(rejectedResult.error?.code).toBe("CONFIRM_REQUIRED");
    const deleted = await api.post(`characters/${character.id}/delete`, { confirm: true }, revisionHeader(character.revision));
    expect(deleted.status).toBe(200);
  });
});
