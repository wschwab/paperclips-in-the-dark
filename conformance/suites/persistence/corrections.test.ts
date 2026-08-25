import { describe, expect } from "vitest";
import { api, type HttpResponse } from "../../src/api.js";
import { firstPlaybook } from "../../src/game-data.js";
import { decode, Schemas, type CharacterDto } from "../../src/schemas.js";
import { testCase } from "../../src/test-case.js";

// ---------------------------------------------------------------------------
// CONTRACT-03 oracle (DEC-03 human ruling, 2026-08-24; normative page
// docs/pages/contract/contract-c3-corrections.mdx).
//
// Gated clerical-error corrections: POST /characters/{id}/ops/stress.fix
// takes {value >= 0} (absolute-setter family) setting monitor.stress.current
// directly, clamped into [0, StressMax]. The op id contains "fix" and appears
// in history as itself ("stress.fix"). A correction records state, never
// plays: no traumaPending raise, no sideEffects.
//
// Snapshot-worthy (x-snapshot true): undo restores the exact pre-fix state.
//
// Decode-free by design, mirroring lifecycle/vice-amount.test.ts: raw bodies
// so applied-family and sideEffect assertions target exact values.
// ---------------------------------------------------------------------------

const BLADES = "blades-in-the-dark";

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

describe("CONTRACT-03 gated clerical-error corrections (stress.fix)", () => {
  testCase("CORRECTIONS-FIX-001", "fix sets stress directly: 5 marked via play op, fixed to 0, persisted", async () => {
    const character = await newRawCharacter();
    const seeded = await characterOpRaw(character.id, "stress.add", { delta: 5 }, character.revision);
    expect(seeded.ok).toBe(true);
    expect(seeded.character?.monitor.stress.current).toBe(5);

    const result = await characterOpRaw(character.id, "stress.fix", { value: 0 }, seeded.character!.revision);
    expect(result.ok).toBe(true);
    // Absolute-setter family: requested is the target, effective the stored target.
    expect(result.applied?.op).toBe("stress.fix");
    expect(result.applied?.requested).toBe(0);
    expect(result.applied?.effective).toBe(0);
    expect(result.character?.monitor.stress.current).toBe(0);

    // Persisted, not just echoed.
    const reloaded = await readRawCharacter(character.id);
    expect(reloaded.monitor.stress.current).toBe(0);
  });

  testCase("CORRECTIONS-FIX-002", "fix above StressMax clamps to max WITHOUT lifecycle side effects", async () => {
    const character = await newRawCharacter();
    const seeded = await characterOpRaw(character.id, "stress.add", { delta: 5 }, character.revision);
    expect(seeded.ok).toBe(true);
    const max = seeded.character!.monitor.stress.max;

    // Request past the settings-derived maximum (9 on Blades) — never embed it.
    const result = await characterOpRaw(
      character.id,
      "stress.fix",
      { value: seeded.character!.monitor.stress.max + 3 },
      seeded.character!.revision,
    );
    expect(result.ok).toBe(true);
    expect(result.applied?.requested).toBe(seeded.character!.monitor.stress.max + 3);
    expect(result.applied?.effective).toBe(max); // clamped stored target
    expect(result.character?.monitor.stress.current).toBe(max);

    // A correction records state; it never plays (LIFECYCLE-STRESS-001 does
    // not fire) — no pending flag, no attention sideEffects.
    expect(result.character?.traumaPending).toBe(false);
    expect(result.sideEffects ?? []).toEqual([]);

    const reloaded = await readRawCharacter(character.id);
    expect(reloaded.monitor.stress.current).toBe(max);
    expect(reloaded.traumaPending).toBe(false);
  });

  testCase("CORRECTIONS-FIX-003", "a negative value is rejected with VALIDATION", async () => {
    const character = await newRawCharacter();
    const result = await characterOpRaw(character.id, "stress.fix", { value: -1 }, character.revision);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("VALIDATION");
  });

  testCase("CORRECTIONS-FIX-004", "a non-integer value is rejected with VALIDATION", async () => {
    const character = await newRawCharacter();
    const result = await characterOpRaw(character.id, "stress.fix", { value: 1.5 }, character.revision);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("VALIDATION");
  });

  testCase("CORRECTIONS-FIX-005", "missing value is rejected with VALIDATION and nothing mutates", async () => {
    const character = await newRawCharacter();
    const seeded = await characterOpRaw(character.id, "stress.add", { delta: 5 }, character.revision);
    expect(seeded.ok).toBe(true);

    const emptyBody = await characterOpRaw(character.id, "stress.fix", {}, seeded.character!.revision);
    expect(emptyBody.ok).toBe(false);
    expect(emptyBody.error?.code).toBe("VALIDATION");

    const noBody = await characterOpRaw(character.id, "stress.fix", undefined, seeded.character!.revision);
    expect(noBody.ok).toBe(false);
    expect(noBody.error?.code).toBe("VALIDATION");

    // Nothing was mutated by either rejected request.
    const reloaded = await readRawCharacter(character.id);
    expect(reloaded.monitor.stress.current).toBe(5);
  });

  testCase("CORRECTIONS-FIX-006", "history records the op id \"stress.fix\"", async () => {
    const character = await newRawCharacter();
    const seeded = await characterOpRaw(character.id, "stress.add", { delta: 5 }, character.revision);
    expect(seeded.ok).toBe(true);

    const result = await characterOpRaw(character.id, "stress.fix", { value: 2 }, seeded.character!.revision);
    expect(result.ok).toBe(true);
    expect(result.character?.monitor.stress.current).toBe(2);

    // The newest history entry is the correction itself, labelled "stress.fix"
    // (the FIX_ family is self-labeling in audit — CONTRACT-03 rationale).
    const historyResponse = await api.get(`characters/${character.id}/history`);
    expect(historyResponse.status).toBe(200);
    const history = await decode(Schemas.History, historyResponse.body);
    expect(history.length).toBeGreaterThan(0);
    expect(history[0]?.op).toBe("stress.fix");
  });

  testCase("CORRECTIONS-FIX-007", "undo after fix restores the pre-fix state and consumes the snapshot", async () => {
    const character = await newRawCharacter();
    const seeded = await characterOpRaw(character.id, "stress.add", { delta: 5 }, character.revision);
    expect(seeded.ok).toBe(true);
    expect(seeded.character?.monitor.stress.current).toBe(5);

    const fixed = await characterOpRaw(character.id, "stress.fix", { value: 1 }, seeded.character!.revision);
    expect(fixed.ok).toBe(true);
    expect(fixed.character?.monitor.stress.current).toBe(1);

    // Undo requires If-Match and restores the newest snapshot (taken before
    // the fix: stress 5), consuming it.
    const undone = await api.post(
      `characters/${character.id}/undo`,
      undefined,
      { "If-Match": String(fixed.character!.revision) },
    );
    expect(undone.status).toBe(200);
    const undoResult = await rawResult(undone);
    expect(undoResult.ok).toBe(true);
    expect(undoResult.character?.monitor.stress.current).toBe(5);
    // The consumed pre-fix snapshot is gone; the earlier play-op snapshot
    // (stress.add) remains.
    const history = await api.get(`characters/${character.id}/history`);
    const remaining = await decode(Schemas.History, history.body);
    expect(remaining.length).toBe(1);
    expect(remaining[0]?.op).toBe("stress.add");
  });
});
