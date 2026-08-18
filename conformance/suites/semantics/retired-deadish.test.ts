import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { firstPlaybook, gameSetting } from "../../src/game-data.js";
import type { CharacterDto } from "../../src/schemas.js";
import { testCase } from "../../src/test-case.js";

// §5.1.9 retirement and deadish flags are distinct — frozen Wave 2 semantics
// (see suites/lifecycle/lifecycle-state-machine.test.ts for the authoritative
// oracle): trauma.add is resolution-only (requires traumaPending), the max-th
// resolution runs the shared retirement cleanup, and retired characters keep
// an allow-list of writes (dossier/notes/notebook) while gameplay mutations
// return RETIRED. Helpers read raw response bodies, mirroring the oracle.

const BLADES = "blades-in-the-dark";

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

/** POSTs a direct entity endpoint (retire/end-score/...) raw. */
async function entityPostRaw(id: string, suffix: string, body: unknown, revision?: number): Promise<RawResult> {
  const headers: Record<string, string> = revision === undefined ? {} : { "If-Match": String(revision) };
  return (await api.post(`characters/${encodeURIComponent(id)}/${suffix}`, body, headers)).body as RawResult;
}

async function retireRaw(id: string, confirm: boolean, revision: number): Promise<RawResult> {
  return entityPostRaw(id, "retire", { confirm }, revision);
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

/**
 * Drives the frozen final-trauma path: TraumaMax resolved traumas across
 * scores (end-score releases between resolutions), the max-th resolution
 * running the shared retirement cleanup in the same transition.
 */
async function retireViaFinalTrauma(): Promise<CharacterDto> {
  let latest = await newRawCharacter();
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
  return latest;
}

describe("§5.1.9 retirement and deadish flags are distinct", () => {
  testCase("SEMANTICS-RETIRED-DEADISH-001", "the final trauma retires the character and exposes both flags", async () => {
    const retired = await retireViaFinalTrauma();
    // The max-th trauma resolution runs the shared retirement cleanup.
    expect(retired.isRetired).toBe(true);
    expect(typeof retired.isDeadish).toBe("boolean");
    // Cleanup (§ 7.1): stress cleared, harm cleared.
    expect(retired.monitor.stress.current).toBe(0);
    expect(retired.monitor.harm.lesser).toEqual([]);
    expect(retired.monitor.harm.moderate).toEqual([]);
    expect(retired.monitor.harm.severe).toEqual([]);
    expect(retired.monitor.harm.fatal).toEqual([]);
    expect(retired.monitor.harm.healingClock.segments).toBe(0);
    expect(retired.monitor.harm.healingClock.rollover).toBe(0);
    // Trauma history is preserved verbatim (§ 7.1): exactly TraumaMax.
    expect(retired.monitor.trauma.traumas).toHaveLength(gameSetting(BLADES).TraumaMax);
    expect(retired.isDeadish).toBe(false);
  });

  testCase("SEMANTICS-RETIRED-DEADISH-002", "retired reads and allow-list writes work; gameplay mutations return RETIRED", async () => {
    const character = await newRawCharacter();
    const retired = await retireRaw(character.id, true, character.revision);
    expect(retired.ok).toBe(true);
    // Reads keep working after retirement.
    const read = await readRawCharacter(character.id);
    expect(read.isRetired).toBe(true);
    // Retired allow-list: dossier/notes/notebook edits remain allowed.
    let revision = retired.character?.revision;
    const dossier = await characterOpRaw(character.id, "dossier.update", { name: "Mira", alias: "Ash" }, revision);
    expect(dossier.ok).toBe(true);
    revision = dossier.character?.revision ?? revision;
    const note = await characterOpRaw(character.id, "note.add", { text: "Still writing" }, revision);
    expect(note.ok).toBe(true);
    revision = note.character?.revision ?? revision;
    const notebook = await characterOpRaw(character.id, "notebook.set", { text: "Sketchbook" }, revision);
    expect(notebook.ok).toBe(true);
    // Gameplay mutations return RETIRED.
    revision = notebook.character?.revision ?? revision;
    const stressed = await characterOpRaw(character.id, "stress.add", { delta: 1 }, revision);
    expect(stressed.ok).toBe(false);
    expect(stressed.error?.code).toBe("RETIRED");
    const trauma = await characterOpRaw(character.id, "trauma.add", { trauma: "Broken" }, revision);
    expect(trauma.ok).toBe(false);
    expect(trauma.error?.code).toBe("RETIRED");
  });
});
