import { describe, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { api } from "../../src/api.js";
import { firstPlaybook } from "../../src/game-data.js";
import { testCase } from "../../src/test-case.js";
import { BLADES, SCUM, firstActionFor, newCrew } from "../../src/suite-helpers.js";

/**
 * SC-O4 numeric-families oracle (frozen Wave 2 contract, "Numeric operation
 * results"). OpenAPI declares exactly one family per numeric operation:
 *
 *   - signed delta:  requested = signed requested change; effective = signed
 *                     actual change (negative deltas reduce, clamp at zero);
 *   - absolute setter: requested = requested target; effective = stored target;
 *   - quantity:       requested = requested amount; effective = amount processed;
 *   - clock progress: requested = requested progress; effective = all accepted
 *                     progress incl. rollover; visibleApplied/overflowAdded
 *                     report the split when nonzero.
 *
 * Non-numeric operations omit numeric fields; a failed operation never claims
 * a value was applied and its typed error carries current/limit data; when
 * requested ≠ effective both clients must be able to detect the clamp.
 *
 * NOTE on raw parsing: the current Ada runtime still emits the pre-Wave-2
 * character DTO (no traumaPending/isOutOfAction/stressClearPending), so the
 * frozen Character decoder rejects every character response. Character
 * creation/ops are therefore parsed from the raw body here; the frozen-shape
 * assertions (applied families, error union) are exactly where the reds live.
 * Crew responses decode cleanly and use api.crewOp (the OperationResult
 * decoder) for applied-family assertions.
 *
 * Red cases pin the SC-R4 gap list:
 *   - NUM-SIGNED-001: FV-011 — playbook-xp.add / attribute-xp.add / xp.add
 *     clamp negative deltas to 0 before adding (pitd_callback.adb:1517,1523,
 *     1665), so -1 is a no-op instead of reducing the track.
 *   - NUM-CLOCK-004: FV-007 — harm.healing-clock (and clock.progress) return
 *     applied = {op} only; the visibleApplied/overflowAdded split is absent.
 *   - NUM-FAIL-006: the server error object carries only code/message; the
 *     frozen whole-error union requires status/retryable/recovery/details.
 *
 * Guards: absolute setters (session.set), quantity ops (coin.add/heat.add,
 * harm.add landedIntensity), non-numeric ops, and clamp detection already
 * report the frozen applied shapes.
 *
 * Every clamp target below is read from the frozen game settings
 * (data/games/*.json) — conformance never embeds a game-specific maximum
 * (per-game differences: BLADES RecoveryClockSize 4 vs SCUM 6).
 */

/** Frozen game-settings maxima (data/games/<stem>.json). */
interface GameSettings {
  RecoveryClockSize: number;
  StressMax: number;
  FundMaxima: { SatchelMax: number; StashMax: number };
  CrewTrackerMaxima: { HeatMax: number };
}

const gamesDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../data/games");
const gameSettingsCache = new Map<string, GameSettings>();
function gameSettings(stem: string): GameSettings {
  let settings = gameSettingsCache.get(stem);
  if (settings === undefined) {
    settings = JSON.parse(readFileSync(resolve(gamesDir, `${stem}.json`), "utf8")) as GameSettings;
    gameSettingsCache.set(stem, settings);
  }
  return settings;
}

interface RawCharacter {
  id: string;
  session: { max: number; playbookExpressions: number; characterExpressions: number; struggleExpressions: number };
  monitor: {
    stress: { current: number; max: number };
    harm: { healingClock: { segments: number; size: number; rollover: number } };
  };
  playbook: { experience: { points: number; max: number } };
}

interface RawError {
  code?: string;
  status?: number;
  retryable?: unknown;
  recovery?: unknown;
  details?: { limit?: number; current?: number };
}

interface RawOpResult {
  ok: boolean;
  applied?: {
    op: string;
    requested?: number;
    effective?: number;
    visibleApplied?: number;
    overflowAdded?: number;
    landedIntensity?: string;
  };
  character?: RawCharacter;
  sideEffects?: string[];
  error: RawError | null;
}

/** Create a character and return the raw DTO (the frozen decoder rejects the
 *  lagging server DTO, so setup must not decode). */
async function rawCreateCharacter(stem: string): Promise<RawCharacter> {
  const response = await api.post("characters", { gameStem: stem, playbook: firstPlaybook(stem) });
  const body = JSON.parse(response.rawBody) as { character: RawCharacter };
  return body.character;
}

/** Post a character op and parse the raw body: the current server's character
 *  DTO and error shape do not decode against the frozen schemas, so
 *  error-asserting and character-returning cases inspect the raw response. */
async function rawCharacterOp(id: string, op: string, body?: unknown): Promise<RawOpResult> {
  const response = await api.post(`characters/${encodeURIComponent(id)}/ops/${op}`, body);
  return JSON.parse(response.rawBody) as RawOpResult;
}

describe("§ numeric operation families (SC-O4)", () => {
  testCase(
    "NUM-SIGNED-001",
    "XP signed deltas accept -1 above zero, clamp at zero, and leave positives unchanged",
    async () => {
      for (const stem of [BLADES, SCUM]) {
        const character = await rawCreateCharacter(stem);
        const positive = await rawCharacterOp(character.id, "playbook-xp.add", { delta: 3 });
        expect(positive.applied?.requested).toBe(3);
        expect(positive.applied?.effective).toBe(3);
        expect(positive.character?.playbook.experience.points).toBe(3);

        const minusOne = await rawCharacterOp(character.id, "playbook-xp.add", { delta: -1 });
        expect(minusOne.applied?.requested).toBe(-1);
        expect(minusOne.applied?.effective).toBe(-1); // RED: FV-011 — server no-ops negatives (effective 0)
        expect(minusOne.character?.playbook.experience.points).toBe(2);

        const clamp = await rawCharacterOp(character.id, "playbook-xp.add", { delta: -5 });
        expect(clamp.applied?.requested).toBe(-5);
        expect(clamp.applied?.effective).toBe(-2); // RED: clamps at zero, never negative
        expect(clamp.character?.playbook.experience.points).toBe(0);
      }
      const crew = await newCrew(BLADES, "Assassins");
      const crewPositive = await api.crewOp(crew.id, "xp.add", { delta: 2 });
      expect(crewPositive.applied?.effective).toBe(2);
      const crewMinus = await api.crewOp(crew.id, "xp.add", { delta: -1 });
      expect(crewMinus.applied?.requested).toBe(-1);
      expect(crewMinus.applied?.effective).toBe(-1); // RED: same no-op negative
      expect(crewMinus.crew?.experience.points).toBe(1);
    },
  );

  testCase(
    "NUM-ABS-002",
    "absolute setters report requested = target and effective = stored target",
    async () => {
      const character = await rawCreateCharacter(BLADES);
      const set = await rawCharacterOp(character.id, "session.set", { playbookExpressions: 2 });
      expect(set.applied?.requested).toBe(2);
      expect(set.applied?.effective).toBe(2);
      expect(set.character?.session.playbookExpressions).toBe(2);
      // Clamped absolute set: requested stays the target, effective is the
      // stored (clamped) value — the clamp is detectable from the result.
      const clamped = await rawCharacterOp(character.id, "session.set", { characterExpressions: 5 });
      expect(clamped.applied?.requested).toBe(5);
      expect(clamped.applied?.effective).toBe(clamped.character?.session.characterExpressions);
      expect(clamped.character?.session.characterExpressions).toBe(character.session.max);
    },
  );

  testCase(
    "NUM-QTY-003",
    "quantity family: fund.gain reports requested amount and processed effective with clamps; the dropped remainder surfaces in sideEffects, never silently",
    async () => {
      // Quantity family per openapi (fund ops: requested = amount,
      // effective = amount processed/stored; partial gains surface the
      // remainder as a sideEffect, never silently drop coin — §5.1.8).
      // coin.add/heat.add are declared signed-delta family — their signed
      // coverage lives in NUM-SIGNED-001. Every bound below is
      // settings-derived. Fresh character: satchel 2 / SatchelMax 4, stash 0.
      const character = await rawCreateCharacter(BLADES);
      const satchelMax = gameSettings(BLADES).FundMaxima.SatchelMax;
      const stashMax = gameSettings(BLADES).FundMaxima.StashMax;

      const gain = await api.characterOp(character.id, "fund.gain", { coins: 5 });
      expect(gain.applied?.requested).toBe(5);
      expect(gain.applied?.effective).toBe(5);
      expect(gain.character?.fund.satchel.coins).toBe(satchelMax); // 2+2, capped
      expect(gain.character?.fund.stash.coins).toBe(3); // overflow into stash

      // Overflow past satchel+stash room: the dropped remainder is reported,
      // never silently lost. Held: satchel 4 + stash 3; room = StashMax - 3.
      const room = stashMax - 3;
      const overflow = await api.characterOp(character.id, "fund.gain", { coins: satchelMax + stashMax + 2 });
      expect(overflow.applied?.effective).toBe(room);
      expect(overflow.character?.fund.stash.coins).toBe(stashMax);
      expect(overflow.character?.fund.satchel.coins).toBe(satchelMax);
      expect(overflow.sideEffects.some((effect) => effect.includes("could not be stored"))).toBe(true);

      // harm.add reports the landing intensity and the spillover sideEffect.
      await rawCharacterOp(character.id, "harm.add", { intensity: "lesser", description: "a" });
      await rawCharacterOp(character.id, "harm.add", { intensity: "lesser", description: "b" });
      const spill = await rawCharacterOp(character.id, "harm.add", { intensity: "lesser", description: "c" });
      expect(spill.applied?.landedIntensity).toBe("moderate");
      expect(spill.sideEffects).toContain("harm spilled to moderate");
    },
  );

  testCase(
    "NUM-CLOCK-004",
    "clock progress reports requested/effective with the visibleApplied/overflowAdded split when nonzero",
    async () => {
      // Healing clock is a clock-progress op (FV-007). Per-game sizes differ
      // (RecoveryClockSize: BLADES 4, SCUM 6), so every expectation is
      // derived from the settings.
      const blades = await rawCreateCharacter(BLADES);
      const bladesSize = gameSettings(BLADES).RecoveryClockSize;
      const bladesHeal = await rawCharacterOp(blades.id, "harm.healing-clock", { segments: 5 });
      expect(bladesHeal.applied?.requested).toBe(5);
      expect(bladesHeal.applied?.effective).toBe(5);
      expect(bladesHeal.applied?.visibleApplied).toBe(bladesSize); // RED: FV-007 — field names absent
      expect(bladesHeal.applied?.overflowAdded).toBe(5 - bladesSize);
      expect(bladesHeal.character?.monitor.harm.healingClock.segments).toBe(bladesSize);
      expect(bladesHeal.character?.monitor.harm.healingClock.rollover).toBe(5 - bladesSize);

      const scum = await rawCreateCharacter(SCUM);
      const scumSize = gameSettings(SCUM).RecoveryClockSize;
      const scumHeal = await rawCharacterOp(scum.id, "harm.healing-clock", { segments: 5 });
      expect(scumHeal.applied?.requested).toBe(5);
      expect(scumHeal.applied?.effective).toBe(5);
      expect(scumHeal.applied?.visibleApplied).toBe(Math.min(5, scumSize)); // RED: no overflow on SCUM (size 6)
      expect(scumHeal.applied?.overflowAdded).toBe(Math.max(0, 5 - scumSize));
      expect(scumHeal.character?.monitor.harm.healingClock.segments).toBe(Math.min(5, scumSize));
      expect(scumHeal.character?.monitor.harm.healingClock.rollover).toBe(Math.max(0, 5 - scumSize));
    },
  );

  testCase(
    "NUM-NONUM-005",
    "non-numeric operations omit the numeric applied fields",
    async () => {
      const character = await rawCreateCharacter(BLADES);
      const note = await rawCharacterOp(character.id, "note.add", { text: "hello" });
      expect(note.applied?.op).toBe("note.add");
      expect(note.applied?.requested).toBeUndefined();
      expect(note.applied?.effective).toBeUndefined();
      expect(note.applied?.visibleApplied).toBeUndefined();
      expect(note.applied?.overflowAdded).toBeUndefined();

      const clear = await rawCharacterOp(character.id, "stress.clear");
      expect(clear.applied?.op).toBe("stress.clear");
      expect(clear.applied?.requested).toBeUndefined();
      expect(clear.applied?.effective).toBeUndefined();

      const crew = await newCrew(BLADES, "Assassins");
      const hold = await api.crewOp(crew.id, "hold.set", { hold: "strong" });
      expect(hold.applied?.op).toBe("hold.set");
      expect(hold.applied?.requested).toBeUndefined();
      expect(hold.applied?.effective).toBeUndefined();
      expect(hold.crew?.hold).toBe("strong");
    },
  );

  testCase(
    "NUM-FAIL-006",
    "a failed operation never claims applied and its typed error carries current/limit data",
    async () => {
      const character = await rawCreateCharacter(BLADES);
      const { action } = firstActionFor(BLADES);
      const response = await api.post(`characters/${character.id}/ops/action.set-rating`, {
        action,
        rating: 9,
      });
      const body = JSON.parse(response.rawBody) as {
        ok: boolean;
        applied: { op: string };
        error: RawError;
      };
      expect(body.ok).toBe(false);
      expect(body.applied).toEqual({ op: "action.set-rating" }); // never claims a value was applied
      expect(body.error.code).toBe("RATING_MAXED");
      expect(body.error.status).toBe(200); // RED: error union absent — server omits status/retryable/recovery/details
      expect(typeof body.error.retryable).toBe("boolean");
      expect(typeof body.error.recovery).toBe("string");
      expect(typeof body.error.details?.limit).toBe("number");
      expect(typeof body.error.details?.current).toBe("number");
    },
  );

  testCase(
    "NUM-CLAMP-007",
    "requested ≠ effective is detectable from the result when a clamp occurs",
    async () => {
      const character = await rawCreateCharacter(BLADES);
      const stress = await rawCharacterOp(character.id, "stress.add", { delta: 20 });
      expect(stress.applied?.requested).toBe(20);
      expect(stress.applied?.effective).toBe(gameSettings(BLADES).StressMax);
      expect(stress.applied?.requested).not.toBe(stress.applied?.effective);
      expect(stress.character?.monitor.stress.current).toBe(gameSettings(BLADES).StressMax);

      const crew = await newCrew(BLADES, "Assassins");
      const heat = await api.crewOp(crew.id, "heat.add", { delta: 20 });
      expect(heat.applied?.requested).toBe(20);
      expect(heat.applied?.effective).toBe(gameSettings(BLADES).CrewTrackerMaxima.HeatMax);
      expect(heat.applied?.requested).not.toBe(heat.applied?.effective);
      expect(heat.crew?.heat.current).toBe(gameSettings(BLADES).CrewTrackerMaxima.HeatMax);
    },
  );
});
