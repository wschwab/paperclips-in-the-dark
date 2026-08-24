import { describe, expect } from "vitest";
import { api, type HttpResponse } from "../../src/api.js";
import { firstPlaybook, gameSetting } from "../../src/game-data.js";
import type { CharacterDto } from "../../src/schemas.js";
import { testCase } from "../../src/test-case.js";

// ---------------------------------------------------------------------------
// SC-O6 lifecycle oracle — the 25 frozen LIFECYCLE-* cases of
// docs/pages/contract/wave0/lifecycle-matrix.mdx §10, frozen against the
// FROZEN Wave 2 contract (retire op, end-score optional body, trauma.add
// resolution semantics, typed attention token, OUT_OF_ACTION code).
//
// Decode-free by design: this suite reads raw response bodies so each case
// asserts its DOCUMENTED behavioral reason (matrix §11) directly.
//
// Status: all 25 cases are GREEN against the completed implementation
// (Waves 4-7) — the traumaPending/out-of-action flags and pending gates
// (STRESS-001/003/004, TRAUMA-001..003, ENDSCORE-001/002, INVARIANTS-001),
// the retire endpoint (RETIRE-001..009), the deadish cleanup (DEADISH-001),
// and the canUndo/historyCount projections (DERIVED-001) all landed. The
// GUARD cases (STRESS-002, ENDSCORE-003, DEADISH-002/003, DELETE-001) pin
// contract behavior that must stay green.
// ---------------------------------------------------------------------------

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

/** Reads the raw operation-result body without decoding the DTO. */
async function rawResult(response: HttpResponse): Promise<RawResult> {
  return response.body as RawResult;
}

/** Creates a character and returns the raw DTO (no schema decode). */
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
): Promise<RawResult> {
  const headers: Record<string, string> = revision === undefined ? {} : { "If-Match": String(revision) };
  return rawResult(await api.post(`characters/${encodeURIComponent(id)}/ops/${operation}`, body, headers));
}

/** POSTs a direct entity endpoint (retire/end-score/undo/...) raw. */
async function entityPostRaw(id: string, suffix: string, body: unknown, revision?: number): Promise<RawResult> {
  const headers: Record<string, string> = revision === undefined ? {} : { "If-Match": String(revision) };
  return rawResult(await api.post(`characters/${encodeURIComponent(id)}/${suffix}`, body, headers));
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

async function historyCount(id: string): Promise<number> {
  const response = await api.get(`characters/${encodeURIComponent(id)}/history`);
  expect(response.status).toBe(200);
  const body = response.body as unknown[];
  expect(Array.isArray(body)).toBe(true);
  return body.length;
}

async function rosterRow(id: string): Promise<Record<string, unknown>> {
  const response = await api.get("campaign/roster");
  expect(response.status).toBe(200);
  const body = response.body as { characters: Array<Record<string, unknown>> };
  const row = body.characters.find((c) => c.id === id);
  expect(row).toBeDefined();
  return row!;
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
 * Resolves the pending trauma via trauma.add — the CONTRACT-02 resolution
 * that clears stress to 0 and sets isOutOfAction + stressClearPending
 * (sequence step 2).
 */
async function resolvePending(pending: CharacterDto, trauma: string): Promise<CharacterDto> {
  const result = await characterOpRaw(pending.id, "trauma.add", { trauma }, pending.revision);
  expect(result.ok).toBe(true);
  if (!result.character) throw new Error("trauma.add did not return a character");
  expect(result.character.monitor.trauma.traumas).toContain(trauma);
  return result.character;
}

describe("lifecycle state machine (SC-O6 oracle)", () => {
  // -------------------------------------------------------------------------
  // Stress → pending (sequence step 1)
  // -------------------------------------------------------------------------

  testCase("LIFECYCLE-STRESS-001", "stress reaching max sets traumaPending and returns typed attention", async () => {
    const character = await newRawCharacter();
    const result = await characterOpRaw(
      character.id,
      "stress.add",
      { delta: character.monitor.stress.max },
      character.revision,
    );
    expect(result.ok).toBe(true);
    // Frozen typed attention token (SC-C2), emitted since Wave 4.
    expect(result.sideEffects).toContain(STRESS_FULL_ATTENTION);
    expect(result.character?.monitor.stress.current).toBe(character.monitor.stress.max);
    expect(result.character?.traumaPending).toBe(true);
  });

  testCase("LIFECYCLE-STRESS-002", "stress overflow never auto-adds trauma", async () => {
    const character = await newRawCharacter();
    const result = await characterOpRaw(
      character.id,
      "stress.add",
      { delta: character.monitor.stress.max * 2 },
      character.revision,
    );
    expect(result.ok).toBe(true);
    // Clamp semantics: current lands exactly at max, never above.
    expect(result.character?.monitor.stress.current).toBe(character.monitor.stress.max);
    // Guard: no-auto-trauma is current behavior already (clamp + separate
    // explicit trauma op, pre-oracle SEMANTICS-STRESS-OVERFLOW-002).
    expect(result.character?.monitor.trauma.traumas).toEqual([]);
    expect(result.character?.isRetired).toBe(false);
  });

  testCase("LIFECYCLE-STRESS-003", "stress.add while trauma pending is rejected with TRAUMA_REQUIRED", async () => {
    const character = await newRawCharacter();
    const pending = await reachPending(character);
    const blocked = await characterOpRaw(pending.id, "stress.add", { delta: 1 }, pending.revision);
    expect(blocked.ok).toBe(false);
    expect(blocked.error?.code).toBe("TRAUMA_REQUIRED");
  });

  testCase("LIFECYCLE-STRESS-004", "stress.add and stress.clear while out of action are rejected with OUT_OF_ACTION", async () => {
    const character = await newRawCharacter();
    const pending = await reachPending(character);
    const resolved = await resolvePending(pending, "Broken");
    expect(resolved.isOutOfAction).toBe(true);
    const add = await characterOpRaw(resolved.id, "stress.add", { delta: 1 }, resolved.revision);
    expect(add.ok).toBe(false);
    expect(add.error?.code).toBe("OUT_OF_ACTION");
    const clear = await characterOpRaw(resolved.id, "stress.clear", { amount: 1 }, resolved.revision);
    expect(clear.ok).toBe(false);
    expect(clear.error?.code).toBe("OUT_OF_ACTION");
  });

  // -------------------------------------------------------------------------
  // Trauma resolution (sequence step 2; Q42)
  // -------------------------------------------------------------------------

  testCase("LIFECYCLE-TRAUMA-001", "trauma resolution records the trauma, clears stress to 0, clears pending, marks out-of-action and stressClearPending", async () => {
    const character = await newRawCharacter();
    const pending = await reachPending(character);
    const resolved = await resolvePending(pending, "Broken");
    // CONTRACT-02 (DEC-02 ruling 2026-08-24): resolution clears Stress to 0
    // in the same atomic apply (previously it stayed full until end-score).
    expect(resolved.monitor.stress.current).toBe(0);
    expect(resolved.traumaPending).toBe(false);
    expect(resolved.isOutOfAction).toBe(true);
    expect(resolved.stressClearPending).toBe(true);
  });

  testCase("LIFECYCLE-TRAUMA-002", "trauma.add without pending trauma is rejected with VALIDATION", async () => {
    const character = await newRawCharacter();
    // No pending: resolution-only semantics forbid a free-toggle trauma.add.
    const result = await characterOpRaw(character.id, "trauma.add", { trauma: "Broken" }, character.revision);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("VALIDATION");
  });

  testCase("LIFECYCLE-TRAUMA-003", "duplicate trauma is rejected with DUPLICATE", async () => {
    const character = await newRawCharacter();
    const pending = await reachPending(character);
    const resolved = await resolvePending(pending, "Broken");
    // Resolution clears traumaPending (Q42), so a duplicate add right after
    // would hit the pending gate (VALIDATION, LIFECYCLE-TRAUMA-002) instead
    // of the duplicate check. Re-establish the pending state first: end-score
    // is the only sanctioned release from out-of-action (it clears stress to
    // 0 and resets both flags — LIFECYCLE-ENDSCORE-002), then stress.add
    // back to max sets traumaPending again (sequence step 1). The duplicate
    // add then runs the pending-gated DUPLICATE path.
    const ended = await entityPostRaw(resolved.id, "end-score", { resetLoadoutCommitment: true }, resolved.revision);
    expect(ended.ok).toBe(true);
    if (!ended.character) throw new Error("end-score did not return a character");
    const repending = await reachPending(ended.character);
    const duplicate = await characterOpRaw(repending.id, "trauma.add", { trauma: "Broken" }, repending.revision);
    expect(duplicate.ok).toBe(false);
    expect(duplicate.error?.code).toBe("DUPLICATE");
  });

  // -------------------------------------------------------------------------
  // End-score (frozen rules 1-6)
  // -------------------------------------------------------------------------

  testCase("LIFECYCLE-ENDSCORE-001", "end-score while trauma pending is rejected with TRAUMA_REQUIRED", async () => {
    const character = await newRawCharacter();
    const pending = await reachPending(character);
    const result = await entityPostRaw(pending.id, "end-score", { clearArmorUsed: false }, pending.revision);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("TRAUMA_REQUIRED");
  });

  testCase("LIFECYCLE-ENDSCORE-002", "end-score clears stress to zero and resets both out-of-action flags", async () => {
    const character = await newRawCharacter();
    const stressed = await characterOpRaw(character.id, "stress.add", { delta: 4 }, character.revision);
    expect(stressed.ok).toBe(true);
    expect(stressed.character?.monitor.stress.current).toBe(4);
    // Body optional (W15): an empty body must be a valid end-score that
    // still performs the inherent cleanup.
    const result = await entityPostRaw(character.id, "end-score", {}, stressed.character?.revision);
    expect(result.ok).toBe(true);
    expect(result.character?.monitor.stress.current).toBe(0);
    expect(result.character?.isOutOfAction).toBe(false);
    expect(result.character?.stressClearPending).toBe(false);
  });

  testCase("LIFECYCLE-ENDSCORE-003", "end-score performs all selected cleanup in exactly one snapshot (one history entry; undo restores prior state)", async () => {
    const character = await newRawCharacter();
    // gear.set-commitment is x-snapshot: false, so the history count below
    // isolates the end-score snapshot exactly.
    const committed = await characterOpRaw(character.id, "gear.set-commitment", { commitment: "light" }, character.revision);
    expect(committed.ok).toBe(true);
    expect(committed.character?.gear.commitment).toBe("light");
    const before = await historyCount(character.id);
    const ended = await entityPostRaw(
      character.id,
      "end-score",
      { resetLoadoutCommitment: true },
      committed.character?.revision,
    );
    expect(ended.ok).toBe(true);
    expect(ended.character?.gear.loadout).toEqual([]);
    expect(ended.character?.gear.commitment).toBe("none");
    // Guard: the flag-selected composite lands in exactly one snapshot; the
    // inherent cleanup is ENDSCORE-002's domain.
    expect(await historyCount(character.id)).toBe(before + 1);
    const undone = await entityPostRaw(character.id, "undo", {}, ended.character?.revision);
    expect(undone.ok).toBe(true);
    expect(undone.character?.gear.commitment).toBe("light");
    expect(await historyCount(character.id)).toBe(before);
  });

  // -------------------------------------------------------------------------
  // Retirement — explicit (Q33) and final-trauma; shared cleanup (§ 7.1)
  // -------------------------------------------------------------------------

  testCase("LIFECYCLE-RETIRE-001", "explicit retirement requires confirm:true (CONFIRM_REQUIRED otherwise)", async () => {
    const character = await newRawCharacter();
    const result = await retireRaw(character.id, false, character.revision);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("CONFIRM_REQUIRED");
  });

  testCase("LIFECYCLE-RETIRE-002", "explicit retirement succeeds below maximum trauma", async () => {
    const character = await newRawCharacter();
    expect(character.monitor.trauma.traumas.length).toBeLessThan(character.monitor.trauma.max);
    const result = await retireRaw(character.id, true, character.revision);
    expect(result.ok).toBe(true);
    expect(result.character?.isRetired).toBe(true);
  });

  testCase("LIFECYCLE-RETIRE-003", "retirement cleanup clears stress, harm, healing clock, armor and preserves dossier/playbook/trauma history/notes/gear/fund", async () => {
    const character = await newRawCharacter();
    let latest = character;
    for (const [op, body] of [
      ["stress.add", { delta: 6 }],
      ["harm.add", { intensity: "lesser", description: "Black eye" }],
      ["gear.add", { name: "Riot gear", bulk: 3 }],
      ["gear.set-commitment", { commitment: "light" }],
      ["fund.gain", { coins: 3 }],
      ["note.add", { text: "Memento" }],
      ["notebook.set", { text: "Sketches" }],
    ] as const) {
      const result = await characterOpRaw(latest.id, op, body, latest.revision);
      expect(result.ok).toBe(true);
      if (!result.character) throw new Error(`${op} did not return a character`);
      latest = result.character;
    }
    const dossier = await characterOpRaw(latest.id, "dossier.update", { name: "Mira", alias: "Ash" }, latest.revision);
    expect(dossier.ok).toBe(true);
    if (!dossier.character) throw new Error("dossier.update did not return a character");
    latest = dossier.character;

    const retired = await retireRaw(latest.id, true, latest.revision);
    expect(retired.ok).toBe(true);
    const c = retired.character;
    expect(c).toBeDefined();
    // Cleanup effects (§ 7.1).
    expect(c!.isRetired).toBe(true);
    expect(c!.monitor.stress.current).toBe(0);
    expect(c!.traumaPending).toBe(false);
    expect(c!.isOutOfAction).toBe(false);
    expect(c!.stressClearPending).toBe(false);
    expect(c!.monitor.harm.lesser).toEqual([]);
    expect(c!.monitor.harm.moderate).toEqual([]);
    expect(c!.monitor.harm.severe).toEqual([]);
    expect(c!.monitor.harm.fatal).toEqual([]);
    expect(c!.monitor.harm.healingClock.segments).toBe(0);
    expect(c!.monitor.harm.healingClock.rollover).toBe(0);
    expect(c!.monitor.armor.standardUsed).toBe(false);
    expect(c!.monitor.armor.heavyUsed).toBe(false);
    expect(c!.monitor.armor.specialUsed).toBe(false);
    expect(c!.isDeadish).toBe(false);
    // Preserved verbatim (§ 7.1).
    expect(c!.dossier.name).toBe("Mira");
    expect(c!.dossier.alias).toBe("Ash");
    expect(c!.monitor.trauma.traumas).toEqual([]);
    expect(c!.dossier.notes).toContain("Memento");
    expect(c!.notebook).toBe("Sketches");
    expect(c!.gear.commitment).toBe("light");
    // fund.gain 3 on a fresh character (satchel 2): satchel caps at the
    // settings maximum, the remainder overflows to stash — preserved verbatim.
    expect(c!.fund.satchel.coins).toBe(gameSetting(BLADES).FundMaxima.SatchelMax);
    expect(c!.fund.stash.coins).toBe(1);
  });

  testCase("LIFECYCLE-RETIRE-004", "voluntary and final-trauma retirement produce identical post-cleanup state (shared cleanup)", async () => {
    // Path A: explicit retirement on a fresh character (0 traumas).
    const voluntary = await newRawCharacter();
    const retiredA = await retireRaw(voluntary.id, true, voluntary.revision);
    expect(retiredA.ok).toBe(true);

    // Path B: final-trauma retirement — TraumaMax−1 resolved traumas across
    // scores, then the max-th resolution runs the shared cleanup in the
    // same transition (locked rule; matrix § 3). The count and the names
    // come from the game settings (data/games/blades-in-the-dark.json),
    // never a literal.
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
    expect(latest.isRetired).toBe(true);

    const a = retiredA.character;
    expect(a).toBeDefined();
    // Observable post-cleanup equality modulo the preserved trauma history.
    expect(latest.monitor.stress.current).toBe(a!.monitor.stress.current);
    expect(latest.isRetired).toBe(a!.isRetired);
    expect(latest.traumaPending).toBe(a!.traumaPending);
    expect(latest.isOutOfAction).toBe(a!.isOutOfAction);
    expect(latest.stressClearPending).toBe(a!.stressClearPending);
    expect(latest.monitor.harm).toEqual(a!.monitor.harm);
    expect(latest.monitor.armor).toEqual(a!.monitor.armor);
    expect(latest.isDeadish).toBe(a!.isDeadish);
    expect(a!.monitor.trauma.traumas).toEqual([]);
    expect(latest.monitor.trauma.traumas).toEqual(traumas);
  });

  testCase("LIFECYCLE-RETIRE-005", "retired characters remain readable and deletable", async () => {
    const character = await newRawCharacter();
    const retired = await retireRaw(character.id, true, character.revision);
    expect(retired.ok).toBe(true);
    const read = await readRawCharacter(character.id);
    expect(read.isRetired).toBe(true);
    const deleted = await api.post(
      `characters/${encodeURIComponent(character.id)}/delete`,
      { confirm: true },
      { "If-Match": String(retired.character?.revision) },
    );
    expect(deleted.status).toBe(200);
    const gone = await api.get(`characters/${encodeURIComponent(character.id)}`);
    expect(gone.status).toBe(404);
    const historyGone = await api.get(`characters/${encodeURIComponent(character.id)}/history`);
    expect(historyGone.status).toBe(404);
  });

  testCase("LIFECYCLE-RETIRE-006", "retired dossier, name, note and notebook edits remain allowed", async () => {
    const character = await newRawCharacter();
    const retired = await retireRaw(character.id, true, character.revision);
    expect(retired.ok).toBe(true);
    const revision = retired.character?.revision;
    const dossier = await characterOpRaw(character.id, "dossier.update", { name: "Mira", alias: "Ash" }, revision);
    expect(dossier.ok).toBe(true);
    const note = await characterOpRaw(character.id, "note.add", { text: "Still writing" }, dossier.character?.revision);
    expect(note.ok).toBe(true);
    const notebook = await characterOpRaw(character.id, "notebook.set", { text: "Sketchbook" }, note.character?.revision);
    expect(notebook.ok).toBe(true);
  });

  testCase("LIFECYCLE-RETIRE-007", "retired gameplay mutations return RETIRED", async () => {
    const character = await newRawCharacter();
    const retired = await retireRaw(character.id, true, character.revision);
    expect(retired.ok).toBe(true);
    let revision = retired.character?.revision;
    for (const [op, body] of [
      ["stress.add", { delta: 1 }],
      ["trauma.add", { trauma: "Broken" }],
      ["harm.add", { intensity: "lesser", description: "Black eye" }],
      ["gear.add", { name: "Pistol", bulk: 1 }],
    ] as const) {
      const result = await characterOpRaw(character.id, op, body, revision);
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("RETIRED");
      revision = result.character?.revision ?? revision;
    }
  });

  testCase("LIFECYCLE-RETIRE-008", "trauma.remove after retirement does not clear isRetired", async () => {
    const character = await newRawCharacter();
    const pending = await reachPending(character);
    const resolved = await resolvePending(pending, "Broken");
    const retired = await retireRaw(resolved.id, true, resolved.revision);
    expect(retired.ok).toBe(true);
    const removed = await characterOpRaw(
      retired.character!.id,
      "trauma.remove",
      { trauma: "Broken" },
      retired.character?.revision,
    );
    expect(removed.ok).toBe(true);
    expect(removed.character?.monitor.trauma.traumas).toEqual([]);
    // The trauma-history correction path never recomputes isRetired.
    expect(removed.character?.isRetired).toBe(true);
  });

  testCase("LIFECYCLE-RETIRE-009", "undo restores the complete pre-retirement state (isRetired false again)", async () => {
    const character = await newRawCharacter();
    const stressed = await characterOpRaw(character.id, "stress.add", { delta: 4 }, character.revision);
    expect(stressed.ok).toBe(true);
    const harmed = await characterOpRaw(character.id, "harm.add", { intensity: "lesser", description: "Black eye" }, stressed.character?.revision);
    expect(harmed.ok).toBe(true);
    if (!harmed.character) throw new Error("harm.add did not return a character");
    const retired = await retireRaw(character.id, true, harmed.character.revision);
    expect(retired.ok).toBe(true);
    expect(retired.character?.isRetired).toBe(true);
    const undone = await entityPostRaw(character.id, "undo", {}, retired.character?.revision);
    expect(undone.ok).toBe(true);
    expect(undone.character?.isRetired).toBe(false);
    expect(undone.character?.monitor.stress.current).toBe(4);
    expect(undone.character?.monitor.harm.lesser).toContain("Black eye");
  });

  // -------------------------------------------------------------------------
  // Deadish (§ 5) — fatal harm only; write-time derived; recovery
  // -------------------------------------------------------------------------

  testCase("LIFECYCLE-DEADISH-001", "fatal harm triggers deadish cleanup: clears stress and pending state, preserves all harm", async () => {
    const character = await newRawCharacter();
    const stressed = await characterOpRaw(character.id, "stress.add", { delta: 6 }, character.revision);
    expect(stressed.ok).toBe(true);
    expect(stressed.character?.monitor.stress.current).toBe(6);
    const fatal = await characterOpRaw(
      character.id,
      "harm.add",
      { intensity: "fatal", description: "Gut wound" },
      stressed.character?.revision,
    );
    expect(fatal.ok).toBe(true);
    expect(fatal.character?.isDeadish).toBe(true);
    // All harm preserved, including the fatal harm just added (§ 7.2).
    expect(fatal.character?.monitor.harm.fatal).toContain("Gut wound");
    // Deadish cleanup (§ 7.2): stress cleared + pending state cleared.
    expect(fatal.character?.monitor.stress.current).toBe(0);
    expect(fatal.character?.traumaPending).toBe(false);
    expect(fatal.character?.isOutOfAction).toBe(false);
    expect(fatal.character?.stressClearPending).toBe(false);
  });

  testCase("LIFECYCLE-DEADISH-002", "deadish is caused only by fatal harm (no free-standing toggle; isDeadish derived from fatal array)", async () => {
    const character = await newRawCharacter();
    const lesser = await characterOpRaw(character.id, "harm.add", { intensity: "lesser", description: "Black eye" }, character.revision);
    expect(lesser.ok).toBe(true);
    expect(lesser.character?.isDeadish).toBe(false);
    const fatal = await characterOpRaw(character.id, "harm.add", { intensity: "fatal", description: "Gut wound" }, lesser.character?.revision);
    expect(fatal.ok).toBe(true);
    expect(fatal.character?.isDeadish).toBe(true);
    // No free-standing toggle: no operation accepts isDeadish as input —
    // the frozen request schemas reject unknown fields (as does the server).
    const toggled = await characterOpRaw(character.id, "stress.add", { delta: 1, isDeadish: true }, fatal.character?.revision);
    expect(toggled.ok).toBe(false);
    expect(toggled.error?.code).toBe("VALIDATION");
    // Derived, not a latch: while fatal harm stays present, non-harm ops
    // leave isDeadish untouched.
    const extraHarm = await characterOpRaw(character.id, "harm.add", { intensity: "moderate", description: "Broken rib" }, fatal.character?.revision);
    expect(extraHarm.ok).toBe(true);
    expect(extraHarm.character?.isDeadish).toBe(true);
  });

  testCase("LIFECYCLE-DEADISH-003", "removing the fatal harm ends deadish (recovery)", async () => {
    const character = await newRawCharacter();
    const fatal = await characterOpRaw(character.id, "harm.add", { intensity: "fatal", description: "Gut wound" }, character.revision);
    expect(fatal.ok).toBe(true);
    expect(fatal.character?.isDeadish).toBe(true);
    // Guard: exact-intensity fatal removal already recomputes isDeadish.
    const removed = await characterOpRaw(
      character.id,
      "harm.remove",
      { intensity: "fatal", description: "Gut wound" },
      fatal.character?.revision,
    );
    expect(removed.ok).toBe(true);
    expect(removed.character?.monitor.harm.fatal).toEqual([]);
    expect(removed.character?.isDeadish).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Deletion (confirm-guarded; removes entity + history; not undoable)
  // -------------------------------------------------------------------------

  testCase("LIFECYCLE-DELETE-001", "deletion requires confirmation and removes entity and history", async () => {
    const character = await newRawCharacter();
    const stressed = await characterOpRaw(character.id, "stress.add", { delta: 2 }, character.revision);
    expect(stressed.ok).toBe(true);
    expect(await historyCount(character.id)).toBeGreaterThan(0);
    const rejected = await api.post(
      `characters/${encodeURIComponent(character.id)}/delete`,
      { confirm: false },
      { "If-Match": String(stressed.character?.revision) }, // If-Match is required on delete; the missing-header rejection is pinned by CONC-IFMATCH-002
    );
    expect(rejected.status).toBe(200);
    const rejectedBody = await rawResult(rejected);
    expect(rejectedBody.ok).toBe(false);
    expect(rejectedBody.error?.code).toBe("CONFIRM_REQUIRED");
    const deleted = await api.post(
      `characters/${encodeURIComponent(character.id)}/delete`,
      { confirm: true },
      { "If-Match": String(stressed.character?.revision) },
    );
    expect(deleted.status).toBe(200);
    const gone = await api.get(`characters/${encodeURIComponent(character.id)}`);
    expect(gone.status).toBe(404);
    const historyGone = await api.get(`characters/${encodeURIComponent(character.id)}/history`);
    expect(historyGone.status).toBe(404);
    // Not undoable: the entity (and its history) no longer exists.
    const undoGone = await api.post(`characters/${encodeURIComponent(character.id)}/undo`, {});
    expect(undoGone.status).toBe(404);
  });

  // -------------------------------------------------------------------------
  // Derived projections (§ 9) — canUndo / historyCount, never persisted
  // -------------------------------------------------------------------------

  testCase("LIFECYCLE-DERIVED-001", "canUndo and historyCount are derived response-time fields that track snapshot consumption and are never persisted", async () => {
    const character = await newRawCharacter();
    // Fresh entity: no snapshots.
    const fresh = await rosterRow(character.id);
    expect(fresh.canUndo).toBe(false);
    expect(fresh.historyCount).toBe(0);
    // Snapshot-worthy op -> exactly one history entry.
    const stressed = await characterOpRaw(character.id, "stress.add", { delta: 2 }, character.revision);
    expect(stressed.ok).toBe(true);
    const afterOp = await rosterRow(character.id);
    expect(afterOp.canUndo).toBe(true);
    expect(afterOp.historyCount).toBe(1);
    // Undo consumes the snapshot.
    const undone = await entityPostRaw(character.id, "undo", {}, stressed.character?.revision);
    expect(undone.ok).toBe(true);
    const afterUndo = await rosterRow(character.id);
    expect(afterUndo.canUndo).toBe(false);
    expect(afterUndo.historyCount).toBe(0);
    // Never persisted: the full character DTO carries no derived fields.
    const full = await api.get(`characters/${encodeURIComponent(character.id)}`);
    expect(full.status).toBe(200);
    expect((full.body as Record<string, unknown>).canUndo).toBeUndefined();
    expect((full.body as Record<string, unknown>).historyCount).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Flag invariants (§ 2.2)
  // -------------------------------------------------------------------------

  testCase("LIFECYCLE-INVARIANTS-001", "no reachable state has traumaPending and isOutOfAction both true; stressClearPending equals isOutOfAction", async () => {
    const character = await newRawCharacter();
    const pending = await reachPending(character);
    // Pending: out-of-action flags are both false.
    expect(pending.isOutOfAction).toBe(false);
    expect(pending.stressClearPending).toBe(false);
    expect(pending.stressClearPending).toBe(pending.isOutOfAction);
    // Resolved: pending cleared, both out-of-action flags set together.
    const resolved = await resolvePending(pending, "Broken");
    expect(typeof resolved.traumaPending).toBe("boolean");
    expect(typeof resolved.isOutOfAction).toBe("boolean");
    expect(typeof resolved.stressClearPending).toBe("boolean");
    expect(resolved.traumaPending === true && resolved.isOutOfAction === true).toBe(false);
    expect(resolved.stressClearPending).toBe(resolved.isOutOfAction);
    // End-score releases: both out-of-action flags clear together.
    const ended = await entityPostRaw(resolved.id, "end-score", {}, resolved.revision);
    expect(ended.ok).toBe(true);
    expect(ended.character?.isOutOfAction).toBe(false);
    expect(ended.character?.stressClearPending).toBe(false);
  });
});
