import { describe, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { api } from "../../src/api.js";
import { firstPlaybook } from "../../src/game-data.js";
import { testCase } from "../../src/test-case.js";
import { BLADES, SCUM, firstActionFor, newCrew } from "../../src/suite-helpers.js";

/**
 * SC-O4 limits oracle (frozen Wave 2 contract, "Limits and capabilities").
 *
 * Every server-enforced client-relevant bound is published through the
 * appropriate source: game-domain maxima live in game-settings JSON
 * (data/games/*.json, validated by game-settings-schema.json), derived limits
 * are server-computed capability projections, request bounds live in OpenAPI,
 * and service limits are service capabilities. Conformance expectations never
 * embed a game-specific maximum — every value below is read from the frozen
 * settings files (BLADES and SCUM) or the frozen OpenAPI/schemas.
 *
 * NOTE on raw parsing: the current Ada runtime still emits the pre-Wave-2
 * character DTO (no traumaPending/isOutOfAction/stressClearPending), so the
 * frozen Character decoder rejects every character response. Character
 * creation/ops are therefore parsed from the raw body here; the frozen-shape
 * assertions (capabilities, error union, applied families) are exactly where
 * the reds live. Crew responses decode cleanly and use api.crewOp (the
 * OperationResult decoder) for applied-family assertions.
 *
 * Red cases pin the SC-R4 gap list:
 *   - LIMIT-CAP-001/CHAR-002/CREW-003/STALE-015: capability endpoints do not
 *     exist yet (SC-A5 pending) — GET /api/capabilities,
 *     /api/characters/{id}/capabilities, /api/crews/{id}/capabilities 404.
 *   - LIMIT-RATING-004: FV-022 — attribute.levelup checks the raw max
 *     (ActionPointMaximum; Rating_Max captured at pitd_callback.adb:1531)
 *     while action.set-rating checks the Mastery-derived Rating_Cap
 *     (pitd_callback.adb:1521), so the two ops disagree at cap+1 for
 *     crewless/non-Mastery characters.
 *   - LIMIT-UPGRADE-005: FV-005 — upgrade.mark increments boxesMarked without
 *     checking TotalBoxes (pitd_callback.adb:1850) despite OpenAPI promising
 *     UPGRADE_MAXED.
 *   - LIMIT-LOAD-011: per-commitment max bulk (LoadMaxima.CommitmentMaxBulk)
 *     is never enforced; gear.commit only checks the flat LoadMaxima.MaxBulk.
 *   - LIMIT-SESSION-012: the Ada creation template hardcodes session max 3
 *     (pitd_callback.adb:1079) while the frozen settings say
 *     SessionExpressionMax 2 (C# reference Session.MaxExpressions = 2).
 *   - LIMIT-IDEMPOTENCY-013: Idempotency-Key maxLength 128 is documented in
 *     OpenAPI only; the server uses the header verbatim.
 *   - LIMIT-IMPORT-014: import validates against the storage schema only, so
 *     trackers can be set above the settings maxima (R4 gap #4). The case
 *     runs the contract apply sequence (preview → confirming apply with the
 *     full envelope + If-Match); today it fails at the preview (no preview
 *     machinery — the contract-shaped envelope is rejected with 400
 *     VALIDATION), and the maxima assertion is reached only when the preview
 *     lands.
 *   - LIMIT-SERVICE-016: the 1 MiB cap is enforced (413 status) but the error
 *     code is VALIDATION instead of the frozen PAYLOAD_TOO_LARGE. The
 *     just-under-cap guard runs the full preview→apply contract sequence and
 *     is red today at the preview (no preview machinery — the {entity}
 *     envelope is rejected with 400 VALIDATION); it turns green when the
 *     full flow works.
 *
 * Guards: XP/attribute/crew track lengths, stress, trauma, harm capacities,
 * fund caps + StashToCoinRate conversion, and the 413 status are already
 * enforced by the current server with values matching the frozen settings.
 */

/** Frozen game-settings maxima (data/games/<stem>.json). */
interface GameSettings {
  RecoveryClockSize: number;
  ActionPointMaximum: number;
  StressMax: number;
  TraumaMax: number;
  HarmCapacities: { Lesser: number; Moderate: number; Severe: number; Fatal: number };
  XpTrackMaxima: { Playbook: number; Attribute: number; Crew: number };
  FundMaxima: { SatchelMax: number; StashMax: number; StashToCoinRate: number };
  CrewTrackerMaxima: { HeatMax: number; WantedMax: number; RepMax: number };
  LoadMaxima: {
    MaxBulk: number;
    CommitmentMaxBulk: { Light: number; Normal: number; Heavy: number; Encumbered: number };
  };
  ActionCap: { Base: number; Mastery: number };
  SessionExpressionMax: number;
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

interface CrewTypeSettings {
  Name: string;
  Upgrades: Array<{ Name: string; TotalBoxes: number }>;
  SpecialAbilities: Array<{ Name: string; TimesTakeable: number }>;
}
interface CrewSettingsFile {
  CrewTypes: CrewTypeSettings[];
}
const crewSettingsCache = new Map<string, CrewSettingsFile>();
function crewSettings(stem: string): CrewSettingsFile {
  let settings = crewSettingsCache.get(stem);
  if (settings === undefined) {
    settings = JSON.parse(readFileSync(resolve(gamesDir, `${stem}-crews.json`), "utf8")) as CrewSettingsFile;
    crewSettingsCache.set(stem, settings);
  }
  return settings;
}

/** TotalBoxes of the named upgrade for a crew type (data/games/<stem>-crews.json). */
function upgradeBoxes(stem: string, crewType: string, upgrade: string): number {
  const found = crewSettings(stem).CrewTypes.find((c) => c.Name === crewType)?.Upgrades.find((u) => u.Name === upgrade);
  if (!found) throw new Error(`crew settings ${stem}/${crewType}: upgrade ${upgrade} not found`);
  return found.TotalBoxes;
}

/** TimesTakeable of the named special ability for a crew type. */
function abilityTakes(stem: string, crewType: string, ability: string): number {
  const found = crewSettings(stem).CrewTypes.find((c) => c.Name === crewType)?.SpecialAbilities.find(
    (a) => a.Name === ability,
  );
  if (!found) throw new Error(`crew settings ${stem}/${crewType}: ability ${ability} not found`);
  return found.TimesTakeable;
}

interface RawCharacter {
  id: string;
  revision: number;
  session: { max: number; playbookExpressions: number; characterExpressions: number; struggleExpressions: number };
  monitor: {
    stress: { current: number; max: number };
    trauma: { traumas: string[]; max: number };
    harm: {
      lesser: string[];
      moderate: string[];
      severe: string[];
      fatal: string[];
      healingClock: { segments: number; size: number; rollover: number };
    };
  };
  playbook: { experience: { points: number; max: number } };
  talent: {
    attributes: Array<{
      name: string;
      experience: { points: number; max: number };
      actions: Array<{ name: string; rating: number; maxRating: number }>;
    }>;
  };
  fund: { satchel: { coins: number; max: number }; stash: { coins: number; max: number } };
  gear: { loadout: Array<{ name: string; bulk: number }> };
}

interface RawError {
  code?: string;
  status?: number;
  retryable?: unknown;
  recovery?: unknown;
  details?: { limit?: number; current?: number };
}

interface RawOpResult {
  status: number;
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
  body: Record<string, unknown>;
}

/** Create a character and return the raw DTO (the frozen decoder rejects the
 *  lagging server DTO, so setup must not decode). */
async function rawCreateCharacter(stem: string): Promise<RawCharacter> {
  const response = await api.post("characters", { gameStem: stem, playbook: firstPlaybook(stem) });
  const body = JSON.parse(response.rawBody) as { character: RawCharacter };
  return body.character;
}

async function rawGetCharacter(id: string): Promise<RawCharacter> {
  const response = await api.get(`characters/${encodeURIComponent(id)}`);
  return JSON.parse(response.rawBody) as RawCharacter;
}

/** Post a character op and parse the raw body: the current server's character
 *  DTO and error shape do not decode against the frozen schemas, so
 *  error-asserting and character-returning cases inspect the raw response. */
async function rawCharacterOp(id: string, op: string, body?: unknown): Promise<RawOpResult> {
  const response = await api.post(`characters/${encodeURIComponent(id)}/ops/${op}`, body);
  const parsed = JSON.parse(response.rawBody) as Omit<RawOpResult, "status" | "body">;
  return { status: response.status, ...parsed, body: parsed as Record<string, unknown> };
}

/** Post a crew op and parse the raw body (for error-asserting cases). */
async function rawCrewOp(id: string, op: string, body?: unknown): Promise<RawOpResult> {
  const response = await api.post(`crews/${encodeURIComponent(id)}/ops/${op}`, body);
  const parsed = JSON.parse(response.rawBody) as Omit<RawOpResult, "status" | "body">;
  return { status: response.status, ...parsed, body: parsed as Record<string, unknown> };
}

describe("§ published limits (SC-O4)", () => {
  testCase(
    "LIMIT-CAP-001",
    "service capabilities expose maxPayloadBytes 1048576, maxHistorySnapshots 50, maxBatchOperations 50",
    async () => {
      const response = await api.get("capabilities");
      expect(response.status).toBe(200); // RED: no /api/capabilities endpoint (SC-A5 pending)
      const body = JSON.parse(response.rawBody) as {
        maxPayloadBytes?: number;
        maxHistorySnapshots?: number;
        maxBatchOperations?: number;
      };
      expect(body.maxPayloadBytes).toBe(1048576);
      expect(body.maxHistorySnapshots).toBe(50);
      expect(body.maxBatchOperations).toBe(50);
    },
  );

  testCase(
    "LIMIT-CHAR-002",
    "character capabilities expose effective action caps from settings + Mastery derivation for crewless and Mastery characters",
    async () => {
      // Crewless BLADES: raw max ActionPointMaximum, effective cap ActionCap.Base.
      const blades = await rawCreateCharacter(BLADES);
      const bladesAction = firstActionFor(BLADES).action;
      const bladesSettings = gameSettings(BLADES);
      const bladesCaps = await api.get(`characters/${blades.id}/capabilities`);
      expect(bladesCaps.status).toBe(200); // RED: no character capability endpoint (FV-021)
      const bladesBody = JSON.parse(bladesCaps.rawBody) as {
        effectiveActionCaps?: Array<{
          action: string;
          maxRating: number;
          effectiveMax: number;
          masteryTotalBoxes: number;
          masteryMarkedBoxes: number;
        }>;
      };
      const bladesCap = bladesBody.effectiveActionCaps?.find((c) => c.action === bladesAction);
      expect(bladesCap?.maxRating).toBe(bladesSettings.ActionPointMaximum);
      expect(bladesCap?.effectiveMax).toBe(bladesSettings.ActionCap.Base);
      expect(bladesCap?.masteryTotalBoxes).toBe(0);
      expect(bladesCap?.masteryMarkedBoxes).toBe(0);

      // Crewless SCUM: raw max and effective cap differ from BLADES.
      const scum = await rawCreateCharacter(SCUM);
      const scumAction = firstActionFor(SCUM).action;
      const scumSettings = gameSettings(SCUM);
      const scumCaps = await api.get(`characters/${scum.id}/capabilities`);
      expect(scumCaps.status).toBe(200);
      const scumBody = JSON.parse(scumCaps.rawBody) as {
        effectiveActionCaps?: Array<{ action: string; maxRating: number; effectiveMax: number }>;
      };
      const scumCap = scumBody.effectiveActionCaps?.find((c) => c.action === scumAction);
      expect(scumCap?.maxRating).toBe(scumSettings.ActionPointMaximum);
      expect(scumCap?.effectiveMax).toBe(scumSettings.ActionCap.Base);

      // BLADES with a full-Mastery crew: effective cap ActionCap.Mastery.
      const crew = await newCrew(BLADES, "Assassins");
      const masteryBoxes = upgradeBoxes(BLADES, "Assassins", "Mastery");
      for (let i = 0; i < masteryBoxes; i++) await api.crewOp(crew.id, "upgrade.mark", { name: "Mastery" });
      const member = await rawCreateCharacter(BLADES);
      await rawCharacterOp(member.id, "dossier.update", { crewId: crew.id });
      const masteryCaps = await api.get(`characters/${member.id}/capabilities`);
      expect(masteryCaps.status).toBe(200);
      const masteryBody = JSON.parse(masteryCaps.rawBody) as {
        effectiveActionCaps?: Array<{
          action: string;
          effectiveMax: number;
          masteryTotalBoxes: number;
          masteryMarkedBoxes: number;
        }>;
      };
      const masteryCap = masteryBody.effectiveActionCaps?.find((c) => c.action === bladesAction);
      expect(masteryCap?.effectiveMax).toBe(bladesSettings.ActionCap.Mastery);
      expect(masteryCap?.masteryTotalBoxes).toBe(masteryBoxes);
      expect(masteryCap?.masteryMarkedBoxes).toBe(masteryBoxes);
    },
  );

  testCase(
    "LIMIT-CREW-003",
    "crew capabilities expose the full upgrade catalog with totalBoxes/marked/remaining and abilities with maxTakes/taken",
    async () => {
      const crew = await newCrew(BLADES, "Assassins");
      const response = await api.get(`crews/${crew.id}/capabilities`);
      expect(response.status).toBe(200); // RED: no crew capability endpoint (SC-A5 pending)
      const body = JSON.parse(response.rawBody) as {
        upgrades?: Array<{ name: string; totalBoxes: number; marked: number; remaining: number }>;
        abilities?: Array<{ name: string; maxTakes: number; taken: number; remaining: number }>;
      };
      const mastery = body.upgrades?.find((u) => u.name === "Mastery");
      const masteryBoxes = upgradeBoxes(BLADES, "Assassins", "Mastery");
      expect(mastery?.totalBoxes).toBe(masteryBoxes);
      expect(mastery?.marked).toBe(0);
      expect(mastery?.remaining).toBe(masteryBoxes);
      const predator = body.abilities?.find((a) => a.name === "Predators");
      const predatorTakes = abilityTakes(BLADES, "Assassins", "Predators");
      expect(predator?.maxTakes).toBe(predatorTakes);
      expect(predator?.taken).toBe(0);
      expect(predator?.remaining).toBe(predatorTakes);
    },
  );

  testCase(
    "LIMIT-RATING-004",
    "action.set-rating and attribute.levelup enforce the same effective cap for crewless, non-Mastery, and Mastery characters",
    async () => {
      const bladesSettings = gameSettings(BLADES);
      const scumSettings = gameSettings(SCUM);
      // SCUM crewless: raw max = ActionPointMaximum = effective cap
      // (ActionCap.Base) — both ops reject cap+1 (guard).
      const scum = await rawCreateCharacter(SCUM);
      const scumFirst = firstActionFor(SCUM);
      const scumSet = await rawCharacterOp(scum.id, "action.set-rating", {
        action: scumFirst.action,
        rating: scumSettings.ActionPointMaximum + 1,
      });
      expect(scumSet.ok).toBe(false);
      expect(scumSet.error?.code).toBe("RATING_MAXED");
      await rawCharacterOp(scum.id, "action.set-rating", { action: scumFirst.action, rating: scumSettings.ActionCap.Base });
      await rawCharacterOp(scum.id, "attribute-xp.add", { attribute: scumFirst.attribute, delta: 6 });
      const scumLevelup = await rawCharacterOp(scum.id, "attribute.levelup", {
        attribute: scumFirst.attribute,
        action: scumFirst.action,
      });
      expect(scumLevelup.ok).toBe(false);
      expect(scumLevelup.error?.code).toBe("RATING_MAXED");

      // BLADES with a full-Mastery crew: effective cap ActionCap.Mastery —
      // both ops allow it (guard).
      const masteryCrew = await newCrew(BLADES, "Bravos");
      const masteryBoxes = upgradeBoxes(BLADES, "Bravos", "Mastery");
      for (let i = 0; i < masteryBoxes; i++) await api.crewOp(masteryCrew.id, "upgrade.mark", { name: "Mastery" });
      const master = await rawCreateCharacter(BLADES);
      const bladesFirst = firstActionFor(BLADES);
      await rawCharacterOp(master.id, "dossier.update", { crewId: masteryCrew.id });
      const masterSet3 = await rawCharacterOp(master.id, "action.set-rating", {
        action: bladesFirst.action,
        rating: bladesSettings.ActionCap.Base,
      });
      expect(masterSet3.ok).toBe(true);
      await rawCharacterOp(master.id, "attribute-xp.add", { attribute: bladesFirst.attribute, delta: 6 });
      const masterLevelup = await rawCharacterOp(master.id, "attribute.levelup", {
        attribute: bladesFirst.attribute,
        action: bladesFirst.action,
      });
      expect(masterLevelup.ok).toBe(true);
      const masterSet4 = await rawCharacterOp(master.id, "action.set-rating", {
        action: bladesFirst.action,
        rating: bladesSettings.ActionCap.Mastery,
      });
      expect(masterSet4.ok).toBe(true);

      // BLADES with a non-Mastery crew: effective cap ActionCap.Base —
      // levelup must reject ActionPointMaximum exactly like set-rating
      // (RED: FV-022 — levelup checks the raw max only).
      const crew = await newCrew(BLADES, "Assassins");
      const member = await rawCreateCharacter(BLADES);
      await rawCharacterOp(member.id, "dossier.update", { crewId: crew.id });
      const memberSet4 = await rawCharacterOp(member.id, "action.set-rating", {
        action: bladesFirst.action,
        rating: bladesSettings.ActionPointMaximum,
      });
      expect(memberSet4.ok).toBe(false);
      expect(memberSet4.error?.code).toBe("RATING_MAXED");
      await rawCharacterOp(member.id, "action.set-rating", { action: bladesFirst.action, rating: bladesSettings.ActionCap.Base });
      await rawCharacterOp(member.id, "attribute-xp.add", { attribute: bladesFirst.attribute, delta: 6 });
      const memberLevelup = await rawCharacterOp(member.id, "attribute.levelup", {
        attribute: bladesFirst.attribute,
        action: bladesFirst.action,
      });
      expect(memberLevelup.ok).toBe(false); // RED: server levels up Base → Base+1
      expect(memberLevelup.error?.code).toBe("RATING_MAXED");

      // Crewless BLADES: same mismatch (ActionCap.Base vs ActionPointMaximum).
      const solo = await rawCreateCharacter(BLADES);
      const soloSet4 = await rawCharacterOp(solo.id, "action.set-rating", {
        action: bladesFirst.action,
        rating: bladesSettings.ActionPointMaximum,
      });
      expect(soloSet4.ok).toBe(false);
      expect(soloSet4.error?.code).toBe("RATING_MAXED");
      await rawCharacterOp(solo.id, "action.set-rating", { action: bladesFirst.action, rating: bladesSettings.ActionCap.Base });
      await rawCharacterOp(solo.id, "attribute-xp.add", { attribute: bladesFirst.attribute, delta: 6 });
      const soloLevelup = await rawCharacterOp(solo.id, "attribute.levelup", {
        attribute: bladesFirst.attribute,
        action: bladesFirst.action,
      });
      expect(soloLevelup.ok).toBe(false); // RED: server levels up Base → Base+1
      expect(soloLevelup.error?.code).toBe("RATING_MAXED");
    },
  );

  testCase(
    "LIMIT-UPGRADE-005",
    "upgrade.mark enforces TotalBoxes with UPGRADE_MAXED at cap+1 and boxes stay at the settings cap for two crew types",
    async () => {
      for (const crewType of ["Assassins", "Bravos"]) {
        const crew = await newCrew(BLADES, crewType);
        const boxes = upgradeBoxes(BLADES, crewType, "Mastery");
        for (let i = 0; i < boxes; i++) {
          const mark = await api.crewOp(crew.id, "upgrade.mark", { name: "Mastery" });
          expect(mark.ok).toBe(true);
        }
        const fifth = await rawCrewOp(crew.id, "upgrade.mark", { name: "Mastery" });
        expect(fifth.ok).toBe(false); // RED: FV-005 — server increments past TotalBoxes
        expect(fifth.error?.code).toBe("UPGRADE_MAXED");
        const after = await api.crew(crew.id);
        expect(after.upgrades.find((u) => u.name === "Mastery")?.boxesMarked).toBe(boxes);
      }
    },
  );

  testCase(
    "LIMIT-XP-006",
    "XP tracks clamp at the settings-published lengths",
    async () => {
      for (const stem of [BLADES, SCUM]) {
        const character = await rawCreateCharacter(stem);
        const xpMaxima = gameSettings(stem).XpTrackMaxima;
        expect(character.playbook.experience.max).toBe(xpMaxima.Playbook); // XpTrackMaxima.Playbook
        const attribute = character.talent.attributes[0];
        expect(attribute.experience.max).toBe(xpMaxima.Attribute); // XpTrackMaxima.Attribute
        const add = await rawCharacterOp(character.id, "playbook-xp.add", { delta: 20 });
        expect(add.applied?.requested).toBe(20);
        expect(add.applied?.effective).toBe(xpMaxima.Playbook);
        expect(add.character?.playbook.experience.points).toBe(xpMaxima.Playbook);
      }
      const crew = await newCrew(BLADES, "Assassins");
      expect(crew.experience.max).toBe(gameSettings(BLADES).XpTrackMaxima.Crew); // XpTrackMaxima.Crew
      const crewAdd = await api.crewOp(crew.id, "xp.add", { delta: 20 });
      expect(crewAdd.applied?.requested).toBe(20);
      expect(crewAdd.applied?.effective).toBe(gameSettings(BLADES).XpTrackMaxima.Crew);
      expect(crewAdd.crew?.experience.points).toBe(gameSettings(BLADES).XpTrackMaxima.Crew);
    },
  );

  testCase(
    "LIMIT-STRESS-007",
    "stress clamps at the settings StressMax for both games",
    async () => {
      for (const stem of [BLADES, SCUM]) {
        const character = await rawCreateCharacter(stem);
        const stressMax = gameSettings(stem).StressMax;
        expect(character.monitor.stress.max).toBe(stressMax); // StressMax
        const add = await rawCharacterOp(character.id, "stress.add", { delta: 20 });
        expect(add.applied?.requested).toBe(20);
        expect(add.applied?.effective).toBe(stressMax);
        expect(add.character?.monitor.stress.current).toBe(stressMax);
      }
    },
  );

  testCase(
    "LIMIT-TRAUMA-008",
    "trauma max matches the settings TraumaMax for both games",
    async () => {
      for (const stem of [BLADES, SCUM]) {
        const character = await rawCreateCharacter(stem);
        expect(character.monitor.trauma.max).toBe(gameSettings(stem).TraumaMax); // TraumaMax
      }
    },
  );

  testCase(
    "LIMIT-HARM-009",
    "harm slots hold the settings capacities with upward spillover for both games",
    async () => {
      for (const stem of [BLADES, SCUM]) {
        const character = await rawCreateCharacter(stem);
        const caps = gameSettings(stem).HarmCapacities;
        const add = (intensity: string, description: string) =>
          rawCharacterOp(character.id, "harm.add", { intensity, description });
        // fill lesser to capacity; the next lesser spills up to moderate
        for (let i = 0; i < caps.Lesser; i++) await add("lesser", `l${i}`);
        const spill = await add("lesser", "x");
        expect(spill.applied?.landedIntensity).toBe("moderate");
        expect(spill.sideEffects).toContain("harm spilled to moderate");
        // moderate already holds the spill: fill to capacity, next spills to severe
        for (let i = 1; i < caps.Moderate; i++) await add("moderate", `m${i}`);
        const spill2 = await add("moderate", "y");
        expect(spill2.applied?.landedIntensity).toBe("severe");
        // severe already holds the spill: fill to capacity, next spills to fatal
        for (let i = 1; i < caps.Severe; i++) await add("severe", `s${i}`);
        const spill3 = await add("severe", "z");
        expect(spill3.applied?.landedIntensity).toBe("fatal");
        // fatal already holds the spill: fill to capacity, next is full
        for (let i = 1; i < caps.Fatal; i++) await add("fatal", `f${i}`);
        const full = await add("fatal", "w");
        expect(full.ok).toBe(false);
        expect(full.error?.code).toBe("SLOT_FULL_FATAL");
        const after = await rawGetCharacter(character.id);
        expect(after.monitor.harm.lesser).toHaveLength(caps.Lesser);
        expect(after.monitor.harm.moderate).toHaveLength(caps.Moderate);
        expect(after.monitor.harm.severe).toHaveLength(caps.Severe);
        expect(after.monitor.harm.fatal).toHaveLength(caps.Fatal);
      }
    },
  );

  testCase(
    "LIMIT-FUND-010",
    "satchel/stash caps and the stash-to-coin conversion match the settings FundMaxima",
    async () => {
      for (const stem of [BLADES, SCUM]) {
        const character = await rawCreateCharacter(stem);
        const maxima = gameSettings(stem).FundMaxima;
        expect(character.fund.satchel.max).toBe(maxima.SatchelMax); // FundMaxima.SatchelMax
        expect(character.fund.stash.max).toBe(maxima.StashMax); // FundMaxima.StashMax
        const gain = await rawCharacterOp(character.id, "fund.gain", { coins: 6 });
        expect(gain.applied?.requested).toBe(6);
        expect(gain.applied?.effective).toBe(6);
        expect(gain.character?.fund.satchel.coins).toBe(maxima.SatchelMax);
        expect(gain.character?.fund.stash.coins).toBe((6 - maxima.SatchelMax) * maxima.StashToCoinRate);
        const spend = await rawCharacterOp(character.id, "fund.spend", { coins: 2 });
        expect(spend.character?.fund.satchel.coins).toBe(maxima.SatchelMax - 2);
        expect(spend.character?.fund.stash.coins).toBe((6 - maxima.SatchelMax) * maxima.StashToCoinRate);
        const liquidate = await rawCharacterOp(character.id, "fund.liquidate", { coins: 1 });
        expect(liquidate.applied?.requested).toBe(1);
        expect(liquidate.applied?.effective).toBe(1);
        expect(liquidate.character?.fund.satchel.coins).toBe(maxima.SatchelMax - 1);
        expect(liquidate.character?.fund.stash.coins).toBe(
          (6 - maxima.SatchelMax) * maxima.StashToCoinRate - maxima.StashToCoinRate,
        ); // StashToCoinRate stash -> 1 coin
      }
    },
  );

  testCase(
    "LIMIT-LOAD-011",
    "per-commitment max bulk is enforced from the settings LoadMaxima",
    async () => {
      const character = await rawCreateCharacter(BLADES);
      const loadMaxima = gameSettings(BLADES).LoadMaxima;
      await rawCharacterOp(character.id, "gear.add", { name: "crate", bulk: loadMaxima.CommitmentMaxBulk.Light + 1 });
      await rawCharacterOp(character.id, "gear.set-commitment", { commitment: "light" });
      const commit = await rawCharacterOp(character.id, "gear.commit", { name: "crate" });
      expect(commit.ok).toBe(false); // RED: per-commitment max bulk is never enforced — server only checks the flat MaxBulk
      expect(commit.error?.code).toBe("OVER_BULK");
      const after = await rawGetCharacter(character.id);
      expect(after.gear.loadout).toHaveLength(0);
    },
  );

  testCase(
    "LIMIT-SESSION-012",
    "session expressions clamp at the settings SessionExpressionMax",
    async () => {
      for (const stem of [BLADES, SCUM]) {
        const character = await rawCreateCharacter(stem);
        const sessionMax = gameSettings(stem).SessionExpressionMax;
        expect(character.session.max).toBe(sessionMax); // RED: Ada template hardcodes 3, settings say 2
        const set = await rawCharacterOp(character.id, "session.set", { playbookExpressions: sessionMax + 3 });
        expect(set.applied?.effective).toBe(sessionMax);
        expect(set.character?.session.playbookExpressions).toBe(sessionMax);
      }
    },
  );

  testCase(
    "LIMIT-IDEMPOTENCY-013",
    "an Idempotency-Key longer than 128 chars is rejected with VALIDATION",
    async () => {
      const character = await rawCreateCharacter(BLADES);
      const longKey = "k".repeat(129);
      const response = await api.post(
        `characters/${character.id}/ops/note.add`,
        { text: "x" },
        { "Idempotency-Key": longKey },
      );
      expect(response.status).toBe(400); // RED: maxLength 128 documented only; server uses the header verbatim
      const body = JSON.parse(response.rawBody) as { error?: { code?: string } };
      expect(body.error?.code).toBe("VALIDATION");
    },
  );

  testCase(
    "LIMIT-IMPORT-014",
    "import cannot set trackers above the settings maxima",
    async () => {
      const character = await rawCreateCharacter(BLADES);
      const inflated = JSON.parse(JSON.stringify(character)) as { monitor: { stress: { max: number } } };
      inflated.monitor.stress.max = 99;
      // Contract apply sequence: preview first (raw), then the confirming
      // apply with the full envelope {entity, previewToken, confirm: true} +
      // If-Match. The inflated document is schema-valid (boundedInteger.max
      // declares no maximum — the settings bound is a separate gate), so the
      // frozen preview classifies it canonical → 200 with the preview token;
      // the settings-maxima rejection is an APPLY-time gate.
      // RED today: no preview machinery — the contract-shaped envelope is
      // rejected with 400 VALIDATION at the preview (NORMALIZATION_REQUIRED
      // 409 is absent too), so the flow stops here; the maxima assertion
      // below is reached only when the preview lands.
      const preview = await api.post(`characters/${character.id}/import?preview=1`, { entity: inflated });
      expect(preview.status).toBe(200);
      const previewBody = JSON.parse(preview.rawBody) as {
        previewToken?: string;
        error?: { token?: string; details?: { previewToken?: string } };
      };
      const previewToken = previewBody.previewToken ?? previewBody.error?.token ?? previewBody.error?.details?.previewToken;
      expect(previewToken).toBeTruthy();
      const response = await api.post(
        `characters/${character.id}/import`,
        { entity: inflated, previewToken: previewToken ?? "preview-token", confirm: true },
        { "If-Match": String(character.revision) },
      );
      // The apply must refuse (>= 400): trackers above the settings maxima
      // must never be stored. RED (R4 gap #4) the moment envelope support
      // lands: import then validates against the storage schema only, so the
      // apply would succeed without maxima clamping.
      expect(response.status).toBeGreaterThanOrEqual(400);
      const after = await rawGetCharacter(character.id);
      expect(after.monitor.stress.max).toBe(gameSettings(BLADES).StressMax);
    },
  );

  testCase(
    "LIMIT-STALE-015",
    "capability responses are advisory and a mutation after a state change returns a typed maxed failure",
    async () => {
      const crew = await newCrew(BLADES, "Assassins");
      const caps = await api.get(`crews/${crew.id}/capabilities`);
      expect(caps.status).toBe(200); // RED: no capability endpoint (fails until backend)
      const body = JSON.parse(caps.rawBody) as { upgrades?: Array<{ name: string; remaining: number }> };
      const mastery = body.upgrades?.find((u) => u.name === "Mastery");
      const boxes = upgradeBoxes(BLADES, "Assassins", "Mastery");
      expect(mastery?.remaining).toBe(boxes);
      // State changes between projection and mutation: the mutation stays
      // authoritative and returns the typed maxed failure.
      for (let i = 0; i < boxes; i++) await api.crewOp(crew.id, "upgrade.mark", { name: "Mastery" });
      const fifth = await rawCrewOp(crew.id, "upgrade.mark", { name: "Mastery" });
      expect(fifth.ok).toBe(false);
      expect(fifth.error?.code).toBe("UPGRADE_MAXED");
    },
  );

  testCase(
    "LIMIT-SERVICE-016",
    "a payload just over 1 MiB is rejected with 413 PAYLOAD_TOO_LARGE and just under is accepted",
    async () => {
      const character = await rawCreateCharacter(BLADES);
      // Just under the cap: the full contract flow (preview → confirming
      // apply with the full envelope {entity, previewToken, confirm: true} +
      // If-Match) must succeed. The document is schema-valid, so the frozen
      // preview classifies it canonical → 200 with the preview token.
      // RED today: no preview machinery — the contract-shaped envelope is
      // rejected with 400 VALIDATION at the preview, so the flow stops here;
      // the guard turns green only when the full preview→apply flow works.
      const under = JSON.parse(JSON.stringify(character)) as { notebook: string };
      under.notebook = "y".repeat(900_000);
      const underPreview = await api.post(`characters/${character.id}/import?preview=1`, { entity: under });
      expect(underPreview.status).toBe(200);
      const underBody = JSON.parse(underPreview.rawBody) as {
        previewToken?: string;
        error?: { token?: string; details?: { previewToken?: string } };
      };
      const underToken = underBody.previewToken ?? underBody.error?.token ?? underBody.error?.details?.previewToken;
      expect(underToken).toBeTruthy();
      const underResponse = await api.post(
        `characters/${character.id}/import`,
        { entity: under, previewToken: underToken ?? "preview-token", confirm: true },
        { "If-Match": String(character.revision) },
      );
      expect(underResponse.status).toBe(200);
      // Just over the cap: the request-level payload bound fires before
      // preview semantics — the preview request itself is rejected with 413
      // PAYLOAD_TOO_LARGE. Status is a guard (the server already refuses the
      // oversized body); the typed code is RED (the server emits VALIDATION
      // instead of the frozen PAYLOAD_TOO_LARGE).
      const over = JSON.parse(JSON.stringify(character)) as { notebook: string };
      over.notebook = "x".repeat(1_100_000);
      const overPreview = await api.post(`characters/${character.id}/import?preview=1`, { entity: over });
      expect(overPreview.status).toBe(413);
      const overBody = JSON.parse(overPreview.rawBody) as { error?: { code?: string } };
      expect(overBody.error?.code).toBe("PAYLOAD_TOO_LARGE");
    },
  );
});
