import { Effect, Schema } from "effect";
import { type Health, Health as HealthSchema, type Roster, Roster as RosterSchema, type HistoryEntry, HistoryEntry as HistoryEntrySchema } from "../schema/campaign.js";
import { type Character, Character as CharacterSchema } from "../schema/character.js";
import { type Crew, Crew as CrewSchema } from "../schema/crew.js";
import { type CrewSummary, CrewSummary as CrewSummarySchema } from "../schema/campaign.js";
import { OperationResult as OperationResultSchema } from "../schema/operation-result.js";
import { type Clock, Clock as ClockSchema } from "../schema/clock.js";

/**
 * Same-origin API client. Always uses relative `/api/*` paths so the
 * production backend can serve static + API from one port, and Vite's
 * dev proxy can forward `/api` → localhost:9657.
 */
export class ApiError extends Error {
  readonly _tag = "ApiError";
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`API ${status}: ${body}`);
    this.name = "ApiError";
  }
}

export class DecodeError extends Error {
  readonly _tag = "DecodeError";
  constructor(readonly cause: unknown) {
    super(
      cause instanceof Error
        ? `decode failed: ${cause.message}`
        : "decode failed",
    );
    this.name = "DecodeError";
  }
}

export class StaleRevisionError extends Error {
  readonly _tag = "StaleRevisionError";
  constructor(readonly currentRevision: number) {
    super(`Stale revision: server has revision ${currentRevision}`);
    this.name = "StaleRevisionError";
  }
}

export function fetchJson(
  path: string,
  init?: RequestInit,
): Effect.Effect<unknown, ApiError> {
  return Effect.tryPromise({
    try: async () => {
      const res = await fetch(path, {
        ...init,
        headers: {
          Accept: "application/json",
          ...(init?.headers ?? {}),
        },
      });
      const text = await res.text();
      if (!res.ok) {
        throw new ApiError(res.status, text);
      }
      if (text.length === 0) return null;
      return JSON.parse(text) as unknown;
    },
    catch: (e) =>
      e instanceof ApiError
        ? e
        : new ApiError(0, e instanceof Error ? e.message : String(e)),
  });
}

export function getHealth(): Effect.Effect<Health, ApiError | DecodeError> {
  return Effect.gen(function* () {
    const raw = yield* fetchJson("/api/health");
    return yield* Effect.try({
      try: () => Schema.decodeUnknownSync(HealthSchema)(raw),
      catch: (cause) => new DecodeError(cause),
    });
  });
}

export function getRoster(): Effect.Effect<Roster, ApiError | DecodeError> {
  return Effect.gen(function* () {
    const raw = yield* fetchJson("/api/campaign/roster");
    return yield* Effect.try({
      try: () => Schema.decodeUnknownSync(RosterSchema)(raw),
      catch: (cause) => new DecodeError(cause),
    });
  });
}

export function getCharacter(id: string): Effect.Effect<Character, ApiError | DecodeError> {
  return Effect.gen(function* () {
    const raw = yield* fetchJson(`/api/characters/${id}`);
    return yield* Effect.try({
      try: () => Schema.decodeUnknownSync(CharacterSchema)(raw),
      catch: (cause) => new DecodeError(cause),
    });
  });
}

export function listCrews(): Effect.Effect<readonly CrewSummary[], ApiError | DecodeError> {
  return Effect.gen(function* () {
    const raw = yield* fetchJson("/api/crews");
    return yield* Effect.try({
      try: () => Schema.decodeUnknownSync(Schema.Array(CrewSummarySchema))(raw),
      catch: (cause) => new DecodeError(cause),
    });
  });
}

export function getCrew(id: string): Effect.Effect<Crew, ApiError | DecodeError> {
  return Effect.gen(function* () {
    const raw = yield* fetchJson(`/api/crews/${id}`);
    return yield* Effect.try({
      try: () => Schema.decodeUnknownSync(CrewSchema)(raw),
      catch: (cause) => new DecodeError(cause),
    });
  });
}

export function getCharacterHistory(id: string): Effect.Effect<readonly HistoryEntry[], ApiError | DecodeError> {
  return Effect.gen(function* () {
    const raw = yield* fetchJson(`/api/characters/${id}/history`);
    return yield* Effect.try({
      try: () => Schema.decodeUnknownSync(Schema.Array(HistoryEntrySchema))(raw),
      catch: (cause) => new DecodeError(cause),
    });
  });
}

export function getPlaybookList(gameStem: string): Effect.Effect<readonly string[], ApiError | DecodeError> {
  return Effect.gen(function* () {
    const raw = yield* fetchJson(`/api/games/${gameStem}/playbooks`);
    return yield* Effect.try({
      try: () => {
        if (!Array.isArray(raw)) {
          throw new Error("Expected playbooks array");
        }
        return raw.map((pb: unknown) => {
          if (typeof pb === "object" && pb !== null && "Name" in pb) {
            const name = (pb as { Name?: unknown }).Name;
            if (typeof name === "string") {
              return name;
            }
          }
          throw new Error("Invalid playbook structure");
        });
      },
      catch: (cause) => new DecodeError(cause),
    });
  });
}

export function createCharacter(gameStem: string, playbook: string): Effect.Effect<Character, ApiError | DecodeError> {
  return Effect.gen(function* () {
    const raw = yield* fetchJson("/api/characters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameStem, playbook }),
    });
    return yield* Effect.try({
      try: () => {
        const opResult = Schema.decodeUnknownSync(OperationResultSchema)(raw);
        if (!opResult.character) {
          throw new Error("Missing character in OperationResult");
        }
        return opResult.character;
      },
      catch: (cause) => new DecodeError(cause),
    });
  });
}

export function getCrewHistory(id: string): Effect.Effect<readonly HistoryEntry[], ApiError | DecodeError> {
  return Effect.gen(function* () {
    const raw = yield* fetchJson(`/api/crews/${id}/history`);
    return yield* Effect.try({
      try: () => Schema.decodeUnknownSync(Schema.Array(HistoryEntrySchema))(raw),
      catch: (cause) => new DecodeError(cause),
    });
  });
}

export function getCrewTypeList(gameStem: string): Effect.Effect<readonly string[], ApiError | DecodeError> {
  return Effect.gen(function* () {
    const raw = yield* fetchJson(`/api/games/${gameStem}/crews`);
    return yield* Effect.try({
      try: () => {
        if (typeof raw !== "object" || raw === null || !("CrewTypes" in raw)) {
          throw new Error("Expected crews object with CrewTypes array");
        }
        const crewTypes = (raw as { CrewTypes?: unknown }).CrewTypes;
        if (!Array.isArray(crewTypes)) {
          throw new Error("CrewTypes is not an array");
        }
        return crewTypes.map((ct: unknown) => {
          if (typeof ct === "object" && ct !== null && "Name" in ct) {
            const name = (ct as { Name?: unknown }).Name;
            if (typeof name === "string") {
              return name;
            }
          }
          throw new Error("Invalid crew type structure");
        });
      },
      catch: (cause) => new DecodeError(cause),
    });
  });
}

export function undoCharacter(id: string): Effect.Effect<Character, ApiError | DecodeError | StaleRevisionError> {
  return Effect.gen(function* () {
    const res = yield* Effect.tryPromise({
      try: async () => {
        const response = await fetch(`/api/characters/${id}/undo`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });
        const text = await response.text();
        return { response, text };
      },
      catch: (e) => new ApiError(0, e instanceof Error ? e.message : String(e)),
    });

    if (!res.response.ok) {
      if (res.response.status === 409) {
        try {
          const parsed = JSON.parse(res.text);
          const opResult = Schema.decodeUnknownSync(OperationResultSchema)(parsed);
          if (opResult.error?.code === "STALE_REVISION") {
            const currentRevision = opResult.error.details?.currentRevision;
            if (typeof currentRevision === "number") {
              yield* Effect.fail(new StaleRevisionError(currentRevision));
            }
            yield* Effect.fail(new StaleRevisionError(0));
          }
        } catch {
          // Malformed 409 body: fall through to ApiError
        }
      }
      yield* Effect.fail(new ApiError(res.response.status, res.text));
    }

    return yield* Effect.try({
      try: () => {
        const opResult = Schema.decodeUnknownSync(OperationResultSchema)(JSON.parse(res.text));
        if (!opResult.ok) {
          if (opResult.error) {
            throw new ApiError(res.response.status, opResult.error.code + ": " + opResult.error.message);
          }
          throw new ApiError(res.response.status, "Operation failed");
        }
        if (!opResult.character) {
          throw new Error("Missing character in OperationResult");
        }
        return opResult.character;
      },
      catch: (cause) => {
        if (cause instanceof ApiError) return cause;
        return new DecodeError(cause);
      },
    });
  });
}

export function undoCrew(id: string): Effect.Effect<Crew, ApiError | DecodeError | StaleRevisionError> {
  return Effect.gen(function* () {
    const res = yield* Effect.tryPromise({
      try: async () => {
        const response = await fetch(`/api/crews/${id}/undo`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });
        const text = await response.text();
        return { response, text };
      },
      catch: (e) => new ApiError(0, e instanceof Error ? e.message : String(e)),
    });

    if (!res.response.ok) {
      if (res.response.status === 409) {
        try {
          const parsed = JSON.parse(res.text);
          const opResult = Schema.decodeUnknownSync(OperationResultSchema)(parsed);
          if (opResult.error?.code === "STALE_REVISION") {
            const currentRevision = opResult.error.details?.currentRevision;
            if (typeof currentRevision === "number") {
              yield* Effect.fail(new StaleRevisionError(currentRevision));
            }
            yield* Effect.fail(new StaleRevisionError(0));
          }
        } catch {
          // Malformed 409 body: fall through to ApiError
        }
      }
      yield* Effect.fail(new ApiError(res.response.status, res.text));
    }

    return yield* Effect.try({
      try: () => {
        const opResult = Schema.decodeUnknownSync(OperationResultSchema)(JSON.parse(res.text));
        if (!opResult.ok) {
          if (opResult.error) {
            throw new ApiError(res.response.status, opResult.error.code + ": " + opResult.error.message);
          }
          throw new ApiError(res.response.status, "Operation failed");
        }
        if (!opResult.crew) {
          throw new Error("Missing crew in OperationResult");
        }
        return opResult.crew;
      },
      catch: (cause) => {
        if (cause instanceof ApiError) return cause;
        return new DecodeError(cause);
      },
    });
  });
}

export function createCrew(gameStem: string, crewType: string): Effect.Effect<Crew, ApiError | DecodeError> {
  return Effect.gen(function* () {
    const raw = yield* fetchJson("/api/crews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameStem,
        crewType,
      }),
    });
    return yield* Effect.try({
      try: () => {
        const opResult = Schema.decodeUnknownSync(OperationResultSchema)(raw);
        if (!opResult.crew) {
          throw new Error("Missing crew in OperationResult");
        }
        return opResult.crew;
      },
      catch: (cause) => new DecodeError(cause),
    });
  });
}

// ---------------------------------------------------------------------------
// F2m operations — dossierUpdate, stressClear, traumaAdd, traumaRemove, getGame
// ---------------------------------------------------------------------------

/** Generic mutator helper: POST to /ops/{op}, parse OperationResult, extract character. */
function characterMutate(
  id: string,
  op: string,
  revision: number,
  body: unknown = {},
): Effect.Effect<Character, ApiError | DecodeError | StaleRevisionError> {
  return Effect.gen(function* () {
    const res = yield* Effect.tryPromise({
      try: async () => {
        const response = await fetch(`/api/characters/${id}/ops/${op}`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "If-Match": String(revision),
          },
          body: JSON.stringify(body),
        });
        const text = await response.text();
        return { response, text };
      },
      catch: (e) => new ApiError(0, e instanceof Error ? e.message : String(e)),
    });

    if (!res.response.ok) {
      if (res.response.status === 409) {
        try {
          const parsed = JSON.parse(res.text);
          const opResult = Schema.decodeUnknownSync(OperationResultSchema)(parsed);
          if (opResult.error?.code === "STALE_REVISION") {
            const currentRevision = opResult.error.details?.currentRevision;
            if (typeof currentRevision === "number") {
              yield* Effect.fail(new StaleRevisionError(currentRevision));
            }
            yield* Effect.fail(new StaleRevisionError(0));
          }
        } catch {
          // Malformed 409 body: fall through to ApiError
        }
      }
      yield* Effect.fail(new ApiError(res.response.status, res.text));
    }

    return yield* Effect.try({
      try: () => {
        const opResult = Schema.decodeUnknownSync(OperationResultSchema)(JSON.parse(res.text));
        if (!opResult.ok) {
          if (opResult.error) {
            throw new ApiError(res.response.status, opResult.error.code + ": " + opResult.error.message);
          }
          throw new ApiError(res.response.status, "Operation failed");
        }
        if (!opResult.character) {
          throw new Error("Missing character in OperationResult");
        }
        return opResult.character;
      },
      catch: (cause) => {
        if (cause instanceof ApiError) return cause;
        return new DecodeError(cause);
      },
    });
  });
}

export function dossierUpdate(
  id: string,
  fields: Record<string, unknown>,
  revision: number,
): Effect.Effect<Character, ApiError | DecodeError | StaleRevisionError> {
  return characterMutate(id, "dossier.update", revision, fields);
}

export function stressClear(
  id: string,
  revision: number,
): Effect.Effect<Character, ApiError | DecodeError | StaleRevisionError> {
  return characterMutate(id, "stress.clear", revision);
}

export function traumaAdd(
  id: string,
  trauma: string,
  revision: number,
): Effect.Effect<Character, ApiError | DecodeError | StaleRevisionError> {
  return characterMutate(id, "trauma.add", revision, { trauma });
}

export function traumaRemove(
  id: string,
  trauma: string,
  revision: number,
): Effect.Effect<Character, ApiError | DecodeError | StaleRevisionError> {
  return characterMutate(id, "trauma.remove", revision, { trauma });
}

// ---------------------------------------------------------------------------
// F2n operations — harmAdd, harmHeal, harmRemove, harmHealingClock, armorSet
// ---------------------------------------------------------------------------

/** Result of harmAdd: includes character and optional landedIntensity for spillover notice. */
export interface HarmAddResult {
  character: Character;
  landedIntensity: string | null;
}

export function harmAdd(
  id: string,
  description: string,
  intensity: string,
  revision: number,
): Effect.Effect<HarmAddResult, ApiError | DecodeError | StaleRevisionError> {
  return Effect.gen(function* () {
    const res = yield* Effect.tryPromise({
      try: async () => {
        const response = await fetch(`/api/characters/${id}/ops/harm.add`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "If-Match": String(revision),
          },
          body: JSON.stringify({ description, intensity }),
        });
        const text = await response.text();
        return { response, text };
      },
      catch: (e) => new ApiError(0, e instanceof Error ? e.message : String(e)),
    });

    if (!res.response.ok) {
      if (res.response.status === 409) {
        try {
          const parsed = JSON.parse(res.text);
          const opResult = Schema.decodeUnknownSync(OperationResultSchema)(parsed);
          if (opResult.error?.code === "STALE_REVISION") {
            const currentRevision = opResult.error.details?.currentRevision;
            if (typeof currentRevision === "number") {
              yield* Effect.fail(new StaleRevisionError(currentRevision));
            }
            yield* Effect.fail(new StaleRevisionError(0));
          }
        } catch {
          // Malformed 409 body: fall through to ApiError
        }
      }
      yield* Effect.fail(new ApiError(res.response.status, res.text));
    }

    return yield* Effect.try({
      try: () => {
        const opResult = Schema.decodeUnknownSync(OperationResultSchema)(JSON.parse(res.text));
        if (!opResult.character) {
          throw new Error("Missing character in OperationResult");
        }
        const landedIntensity = opResult.applied.landedIntensity ?? null;
        return { character: opResult.character, landedIntensity };
      },
      catch: (cause) => new DecodeError(cause),
    });
  });
}

export function harmHeal(
  id: string,
  intensity: string,
  description: string,
  revision: number,
): Effect.Effect<Character, ApiError | DecodeError | StaleRevisionError> {
  // C4 playtest change (2026-08-09): healing means picking a specific
  // currently-active harm; the clock is consumed and exactly that harm is
  // removed (NOT_FOUND when absent, CANNOT_HEAL when the clock isn't full).
  return characterMutate(id, "harm.heal", revision, { intensity, description });
}

export function harmRemove(
  id: string,
  description: string,
  intensity: string,
  revision: number,
): Effect.Effect<Character, ApiError | DecodeError | StaleRevisionError> {
  return characterMutate(id, "harm.remove", revision, { description, intensity });
}

export function harmHealingClock(
  id: string,
  segments: number,
  revision: number,
): Effect.Effect<Character, ApiError | DecodeError | StaleRevisionError> {
  return characterMutate(id, "harm.healing-clock", revision, { segments });
}

export function armorSet(
  id: string,
  armor: string,
  used: boolean,
  revision: number,
): Effect.Effect<Character, ApiError | DecodeError | StaleRevisionError> {
  return characterMutate(id, "armor.set", revision, { armor, used });
}

export function getGame(gameStem: string): Effect.Effect<Record<string, unknown>, ApiError> {
  return Effect.gen(function* () {
    const raw = yield* fetchJson(`/api/games/${gameStem}`);
    if (typeof raw !== "object" || raw === null) {
      yield* Effect.fail(new ApiError(0, "Expected object"));
    }
    return raw as Record<string, unknown>;
  });
}

export function stressAdd(id: string, delta: number, revision: number): Effect.Effect<Character, ApiError | DecodeError | StaleRevisionError> {
  return Effect.gen(function* () {
    const res = yield* Effect.tryPromise({
      try: async () => {
        const response = await fetch(`/api/characters/${id}/ops/stress.add`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "If-Match": String(revision),
          },
          body: JSON.stringify({ delta }),
        });
        const text = await response.text();
        return { response, text };
      },
      catch: (e) => new ApiError(0, e instanceof Error ? e.message : String(e)),
    });

    if (!res.response.ok) {
      if (res.response.status === 409) {
        try {
          const parsed = JSON.parse(res.text);
          const opResult = Schema.decodeUnknownSync(OperationResultSchema)(parsed);
          if (opResult.error?.code === "STALE_REVISION") {
            const currentRevision = opResult.error.details?.currentRevision;
            if (typeof currentRevision === "number") {
              yield* Effect.fail(new StaleRevisionError(currentRevision));
            }
            yield* Effect.fail(new StaleRevisionError(0));
          }
        } catch {
          // Malformed 409 body: fall through to ApiError
        }
      }
      yield* Effect.fail(new ApiError(res.response.status, res.text));
    }

    return yield* Effect.try({
      try: () => {
        const opResult = Schema.decodeUnknownSync(OperationResultSchema)(JSON.parse(res.text));
        if (!opResult.character) {
          throw new Error("Missing character in OperationResult");
        }
        return opResult.character;
      },
      catch: (cause) => new DecodeError(cause),
    });
  });
}

// ---------------------------------------------------------------------------
// F2ab operations — noteAdd, noteRemove (C4: dossier.notes is a list)
// ---------------------------------------------------------------------------

export function noteAdd(
  id: string,
  text: string,
  revision: number,
): Effect.Effect<Character, ApiError | DecodeError | StaleRevisionError> {
  return characterMutate(id, "note.add", revision, { text });
}

export function noteRemove(
  id: string,
  index: number,
  revision: number,
): Effect.Effect<Character, ApiError | DecodeError | StaleRevisionError> {
  return characterMutate(id, "note.remove", revision, { index });
}

// ---------------------------------------------------------------------------
// F2y operations — crewContactAdd, crewContactRemove, factionSetStatus, factionRemove
// ---------------------------------------------------------------------------

/** Generic crew mutator helper: POST to /ops/{op}, parse OperationResult, extract crew. */
function crewMutate(
  id: string,
  op: string,
  revision: number,
  body: unknown = {},
): Effect.Effect<Crew, ApiError | DecodeError | StaleRevisionError> {
  return Effect.gen(function* () {
    const res = yield* Effect.tryPromise({
      try: async () => {
        const response = await fetch(`/api/crews/${id}/ops/${op}`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "If-Match": String(revision),
          },
          body: JSON.stringify(body),
        });
        const text = await response.text();
        return { response, text };
      },
      catch: (e) => new ApiError(0, e instanceof Error ? e.message : String(e)),
    });

    if (!res.response.ok) {
      if (res.response.status === 409) {
        try {
          const parsed = JSON.parse(res.text);
          const opResult = Schema.decodeUnknownSync(OperationResultSchema)(parsed);
          if (opResult.error?.code === "STALE_REVISION") {
            const currentRevision = opResult.error.details?.currentRevision;
            if (typeof currentRevision === "number") {
              yield* Effect.fail(new StaleRevisionError(currentRevision));
            }
            yield* Effect.fail(new StaleRevisionError(0));
          }
        } catch {
          // Malformed 409 body: fall through to ApiError
        }
      }
      yield* Effect.fail(new ApiError(res.response.status, res.text));
    }

    return yield* Effect.try({
      try: () => {
        const opResult = Schema.decodeUnknownSync(OperationResultSchema)(JSON.parse(res.text));
        if (!opResult.ok) {
          if (opResult.error) {
            throw new ApiError(res.response.status, opResult.error.code + ": " + opResult.error.message);
          }
          throw new ApiError(res.response.status, "Operation failed");
        }
        if (!opResult.crew) {
          throw new Error("Missing crew in OperationResult");
        }
        return opResult.crew;
      },
      catch: (cause) => {
        if (cause instanceof ApiError) return cause;
        return new DecodeError(cause);
      },
    });
  });
}

export function crewContactAdd(
  id: string,
  name: string,
  profession: string,
  revision: number,
): Effect.Effect<Crew, ApiError | DecodeError | StaleRevisionError> {
  return crewMutate(id, "contact.add", revision, { name, profession });
}

export function crewContactRemove(
  id: string,
  name: string,
  revision: number,
): Effect.Effect<Crew, ApiError | DecodeError | StaleRevisionError> {
  return crewMutate(id, "contact.remove", revision, { name });
}

/** Result of factionSetStatus: includes the updated crew and the server-reported applied requested/effective status (clamp). */
export interface FactionSetStatusResult {
  crew: Crew;
  requested: number;
  effective: number;
}

export function factionSetStatus(
  id: string,
  name: string,
  status: number,
  revision: number,
): Effect.Effect<FactionSetStatusResult, ApiError | DecodeError | StaleRevisionError> {
  return Effect.gen(function* () {
    const res = yield* Effect.tryPromise({
      try: async () => {
        const response = await fetch(`/api/crews/${id}/ops/faction.set-status`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "If-Match": String(revision),
          },
          body: JSON.stringify({ name, status }),
        });
        const text = await response.text();
        return { response, text };
      },
      catch: (e) => new ApiError(0, e instanceof Error ? e.message : String(e)),
    });

    if (!res.response.ok) {
      if (res.response.status === 409) {
        try {
          const parsed = JSON.parse(res.text);
          const opResult = Schema.decodeUnknownSync(OperationResultSchema)(parsed);
          if (opResult.error?.code === "STALE_REVISION") {
            const currentRevision = opResult.error.details?.currentRevision;
            if (typeof currentRevision === "number") {
              yield* Effect.fail(new StaleRevisionError(currentRevision));
            }
            yield* Effect.fail(new StaleRevisionError(0));
          }
        } catch {
          // Malformed 409 body: fall through to ApiError
        }
      }
      yield* Effect.fail(new ApiError(res.response.status, res.text));
    }

    return yield* Effect.try({
      try: () => {
        const opResult = Schema.decodeUnknownSync(OperationResultSchema)(JSON.parse(res.text));
        if (!opResult.ok) {
          if (opResult.error) {
            throw new ApiError(res.response.status, opResult.error.code + ": " + opResult.error.message);
          }
          throw new ApiError(res.response.status, "Operation failed");
        }
        if (!opResult.crew) {
          throw new Error("Missing crew in OperationResult");
        }
        const requested = opResult.applied.requested ?? status;
        const effective = opResult.applied.effective ?? requested;
        return { crew: opResult.crew, requested, effective };
      },
      catch: (cause) => {
        if (cause instanceof ApiError) return cause;
        return new DecodeError(cause);
      },
    });
  });
}

export function factionRemove(
  id: string,
  name: string,
  revision: number,
): Effect.Effect<Crew, ApiError | DecodeError | StaleRevisionError> {
  return crewMutate(id, "faction.remove", revision, { name });
}

// ---------------------------------------------------------------------------
// F2u crew operations — crewFieldsUpdate, crewRepAdd, crewHeatAdd,
// crewWantedAdd, crewTierAdd, crewHoldSet, crewCoinAdd, crewStashAdd
// ---------------------------------------------------------------------------

/**
 * Partial update of the crew's free-text fields (name, lair, reputation,
 * huntingGrounds, notes). Only the provided fields are sent — the contract
 * requires minProperties 1 and the server merges.
 */
export function crewFieldsUpdate(
  id: string,
  fields: Record<string, unknown>,
  revision: number,
): Effect.Effect<Crew, ApiError | DecodeError | StaleRevisionError> {
  return crewMutate(id, "fields.update", revision, fields);
}

/** Crew reputation delta (bounded 0..max server-side). */
export function crewRepAdd(
  id: string,
  delta: number,
  revision: number,
): Effect.Effect<Crew, ApiError | DecodeError | StaleRevisionError> {
  return crewMutate(id, "rep.add", revision, { delta });
}

/** Crew heat delta (bounded 0..max server-side). */
export function crewHeatAdd(
  id: string,
  delta: number,
  revision: number,
): Effect.Effect<Crew, ApiError | DecodeError | StaleRevisionError> {
  return crewMutate(id, "heat.add", revision, { delta });
}

/** Crew wanted-level delta (bounded 0..max server-side). */
export function crewWantedAdd(
  id: string,
  delta: number,
  revision: number,
): Effect.Effect<Crew, ApiError | DecodeError | StaleRevisionError> {
  return crewMutate(id, "wanted.add", revision, { delta });
}

/** Crew tier delta (bounded below at 0 server-side). */
export function crewTierAdd(
  id: string,
  delta: number,
  revision: number,
): Effect.Effect<Crew, ApiError | DecodeError | StaleRevisionError> {
  return crewMutate(id, "tier.add", revision, { delta });
}

/** Set crew hold to one of the contract enum values ("strong" | "weak"). */
export function crewHoldSet(
  id: string,
  hold: string,
  revision: number,
): Effect.Effect<Crew, ApiError | DecodeError | StaleRevisionError> {
  return crewMutate(id, "hold.set", revision, { hold });
}

/** Crew coin (loose funds) delta — bounded below at 0 server-side. */
export function crewCoinAdd(
  id: string,
  delta: number,
  revision: number,
): Effect.Effect<Crew, ApiError | DecodeError | StaleRevisionError> {
  return crewMutate(id, "coin.add", revision, { delta });
}

/** Crew stash (vaults) delta — bounded below at 0 server-side. */
export function crewStashAdd(
  id: string,
  delta: number,
  revision: number,
): Effect.Effect<Crew, ApiError | DecodeError | StaleRevisionError> {
  return crewMutate(id, "stash.add", revision, { delta });
}

// ---------------------------------------------------------------------------
// F2ac crew operations — crewNoteAdd, crewNoteRemove, crewTurfAdd
// (C4 playtest: notes[] via note.add/note.remove; turf 0..6 via turf.add)
// ---------------------------------------------------------------------------

/** Append a note to crew.notes (C4 string[]). The server rejects empty text
 * with VALIDATION. */
export function crewNoteAdd(
  id: string,
  text: string,
  revision: number,
): Effect.Effect<Crew, ApiError | DecodeError | StaleRevisionError> {
  return crewMutate(id, "note.add", revision, { text });
}

/** Remove the note at the 0-based index (out of range → NOT_FOUND). */
export function crewNoteRemove(
  id: string,
  index: number,
  revision: number,
): Effect.Effect<Crew, ApiError | DecodeError | StaleRevisionError> {
  return crewMutate(id, "note.remove", revision, { index });
}

/** Crew turf delta (C4: clamped 0..6 server-side; each turf lowers the rep
 * develop threshold by one). Negative deltas remove turf. */
export function crewTurfAdd(
  id: string,
  delta: number,
  revision: number,
): Effect.Effect<Crew, ApiError | DecodeError | StaleRevisionError> {
  return crewMutate(id, "turf.add", revision, { delta });
}

// ---------------------------------------------------------------------------
// F2v crew operations — crewAbilityTake, crewAbilityRemove, upgradeMark,
// upgradeUnmark, getCrewType, getCrewTypes
// ---------------------------------------------------------------------------

/** Take (or re-take) a crew special ability. Server enforces TimesTakeable →
 * ABILITY_MAXED (A8) and rejects unknown names with NOT_FOUND. */
export function crewAbilityTake(
  id: string,
  name: string,
  revision: number,
): Effect.Effect<Crew, ApiError | DecodeError | StaleRevisionError> {
  return crewMutate(id, "ability.take", revision, { name });
}

/** Remove a crew special ability entirely (whole-entry remove). */
export function crewAbilityRemove(
  id: string,
  name: string,
  revision: number,
): Effect.Effect<Crew, ApiError | DecodeError | StaleRevisionError> {
  return crewMutate(id, "ability.remove", revision, { name });
}

/**
 * Mark one box of a crew upgrade. The server upserts the upgrade entry and
 * rejects a full track with UPGRADE_MAXED (TotalBoxes from crew game
 * settings). Unmarking at 0 removes the entry server-side.
 */
export function upgradeMark(
  id: string,
  name: string,
  revision: number,
): Effect.Effect<Crew, ApiError | DecodeError | StaleRevisionError> {
  return crewMutate(id, "upgrade.mark", revision, { name });
}

/** Unmark one box of a crew upgrade (entry removed at 0). */
export function upgradeUnmark(
  id: string,
  name: string,
  revision: number,
): Effect.Effect<Crew, ApiError | DecodeError | StaleRevisionError> {
  return crewMutate(id, "upgrade.unmark", revision, { name });
}

// ---------------------------------------------------------------------------
// F2w crew operations — cohortAdd, cohortRemove, cohortUpdate
// ---------------------------------------------------------------------------

/** cohort.add request body — cohortKind required, everything else optional
 * (server generates the cohort id). Mirrors contract openapi cohort.add. */
export interface CohortAddBody {
  cohortKind: "gang" | "expert";
  gangType?: string;
  expertType?: string;
  quality?: number;
  scale?: number;
  hasArmor?: boolean;
  edges?: string[];
  flaws?: string[];
  description?: string;
}

/** cohort.update request body — cohortId plus only the changed fields
 * (contract requires minProperties 2: cohortId + at least one field). */
export interface CohortUpdateBody {
  cohortId: string;
  gangType?: string;
  expertType?: string;
  quality?: number;
  scale?: number;
  hasArmor?: boolean;
  edges?: string[];
  flaws?: string[];
  harm?: string;
  description?: string;
}

/** Add a cohort (gang or expert). The server generates the id; optional
 * fields are passed through. */
export function cohortAdd(
  id: string,
  body: CohortAddBody,
  revision: number,
): Effect.Effect<Crew, ApiError | DecodeError | StaleRevisionError> {
  return crewMutate(id, "cohort.add", revision, body);
}

/** Remove a cohort entirely (whole-entry remove by id). */
export function cohortRemove(
  id: string,
  cohortId: string,
  revision: number,
): Effect.Effect<Crew, ApiError | DecodeError | StaleRevisionError> {
  return crewMutate(id, "cohort.remove", revision, { cohortId });
}

/** Partial update of one cohort by id — send only the changed fields. */
export function cohortUpdate(
  id: string,
  body: CohortUpdateBody,
  revision: number,
): Effect.Effect<Crew, ApiError | DecodeError | StaleRevisionError> {
  return crewMutate(id, "cohort.update", revision, body);
}

// ---------------------------------------------------------------------------
// F2x crew operations — crewXpAdd, crewXpClear
// ---------------------------------------------------------------------------

/**
 * Crew experience delta (xp.add). The server clamps points to
 * experience.max (from the crew DTO / game data) — never hardcoded here.
 */
export function crewXpAdd(
  id: string,
  delta: number,
  revision: number,
): Effect.Effect<Crew, ApiError | DecodeError | StaleRevisionError> {
  return crewMutate(id, "xp.add", revision, { delta });
}

/** Clear all crew experience points (xp.clear — no request body). */
export function crewXpClear(
  id: string,
  revision: number,
): Effect.Effect<Crew, ApiError | DecodeError | StaleRevisionError> {
  return crewMutate(id, "xp.clear", revision);
}

/**
 * Full crew-type settings for one crew type (raw game-data object: Hook,
 * Description, ExperienceTrigger, SpecialAbilities, Upgrades,
 * StartingUpgrades, …). Mirrors getPlaybook.
 *
 * Note: the contract defines this endpoint, but the current Ada backend
 * answers 404 for a non-empty crewType segment (its conformance case
 * accepts [200, 404]); the crew page therefore falls back to getCrewTypes
 * and finds the crew type by name.
 */
export function getCrewType(
  gameStem: string,
  crewType: string,
): Effect.Effect<Record<string, unknown>, ApiError> {
  return Effect.gen(function* () {
    const raw = yield* fetchJson(`/api/games/${gameStem}/crews/${crewType}`);
    if (typeof raw !== "object" || raw === null) {
      yield* Effect.fail(new ApiError(0, "Expected object"));
    }
    return raw as Record<string, unknown>;
  });
}

/**
 * All crew types of a game (the `CrewTypes` array of the {stem}-crews.json
 * game-data file via /api/games/{stem}/crews) as raw settings objects —
 * the fallback source for per-crew-type settings when the single-type
 * endpoint is unavailable (see getCrewType).
 */
export function getCrewTypes(
  gameStem: string,
): Effect.Effect<readonly Record<string, unknown>[], ApiError | DecodeError> {
  return Effect.gen(function* () {
    const raw = yield* fetchJson(`/api/games/${gameStem}/crews`);
    return yield* Effect.try({
      try: () => {
        if (typeof raw !== "object" || raw === null || !("CrewTypes" in raw)) {
          throw new Error("Expected crews object with CrewTypes array");
        }
        const crewTypes = (raw as { CrewTypes?: unknown }).CrewTypes;
        if (!Array.isArray(crewTypes)) {
          throw new Error("CrewTypes is not an array");
        }
        return crewTypes
          .filter((ct): ct is Record<string, unknown> =>
            typeof ct === "object" && ct !== null,
          )
          .map((ct) => ct as Record<string, unknown>);
      },
      catch: (cause) => new DecodeError(cause),
    });
  });
}

/**
 * The raw crew game-data file for a game (`{stem}-crews.json` via
 * /api/games/{stem}/crews): `{ Name, Language, CrewTypes, CohortGangTypes?,
 * CohortExpertTypes? }`. Unlike getCrewTypes this returns the whole object —
 * the crew page needs the top-level cohort type lists (C4) in addition to
 * the CrewTypes array.
 */
export function getCrewGameData(
  gameStem: string,
): Effect.Effect<Record<string, unknown>, ApiError | DecodeError> {
  return Effect.gen(function* () {
    const raw = yield* fetchJson(`/api/games/${gameStem}/crews`);
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      yield* Effect.fail(new DecodeError(new Error("Expected crews object")));
    }
    return raw as Record<string, unknown>;
  });
}

// ---------------------------------------------------------------------------
// F2o operations — actionSetRating, attributeXpAdd, attributeXpClear,
// attributeLevelup, sessionSet, getPlaybook
// ---------------------------------------------------------------------------

/**
 * Direct-set an action rating. The server clamps to the action's maxRating
 * (game-settings ActionPointMaximum); the page compares the requested value
 * with the returned DTO rating to surface a clamp notice.
 */
export function actionSetRating(
  id: string,
  action: string,
  rating: number,
  revision: number,
): Effect.Effect<Character, ApiError | DecodeError | StaleRevisionError> {
  return characterMutate(id, "action.set-rating", revision, { action, rating });
}

export function attributeXpAdd(
  id: string,
  attribute: string,
  delta: number,
  revision: number,
): Effect.Effect<Character, ApiError | DecodeError | StaleRevisionError> {
  return characterMutate(id, "attribute-xp.add", revision, { attribute, delta });
}

export function attributeXpClear(
  id: string,
  attribute: string,
  revision: number,
): Effect.Effect<Character, ApiError | DecodeError | StaleRevisionError> {
  return characterMutate(id, "attribute-xp.clear", revision, { attribute });
}

/**
 * Spend a full attribute XP track to raise one of that attribute's actions.
 * Server rejects with CANNOT_LEVEL_UP when the track is not full and
 * RATING_MAXED when the action is already at max rating.
 */
export function attributeLevelup(
  id: string,
  attribute: string,
  action: string,
  revision: number,
): Effect.Effect<Character, ApiError | DecodeError | StaleRevisionError> {
  return characterMutate(id, "attribute.levelup", revision, { attribute, action });
}

export interface SessionFields {
  playbookExpressions?: number;
  characterExpressions?: number;
  struggleExpressions?: number;
}

/**
 * Partial session update — only the provided fields are sent (contract
 * requires minProperties 1); each value is clamped 0..max by the server.
 */
export function sessionSet(
  id: string,
  fields: SessionFields,
  revision: number,
): Effect.Effect<Character, ApiError | DecodeError | StaleRevisionError> {
  return characterMutate(id, "session.set", revision, fields);
}

/** Full playbook settings for one playbook (raw game-data object). */
export function getPlaybook(
  gameStem: string,
  playbook: string,
): Effect.Effect<Record<string, unknown>, ApiError> {
  return Effect.gen(function* () {
    const raw = yield* fetchJson(`/api/games/${gameStem}/playbooks/${playbook}`);
    if (typeof raw !== "object" || raw === null) {
      yield* Effect.fail(new ApiError(0, "Expected object"));
    }
    return raw as Record<string, unknown>;
  });
}

// ---------------------------------------------------------------------------
// F2p operations — playbookXpAdd, playbookXpClear, abilityTake, abilityRemove
// ---------------------------------------------------------------------------

export function playbookXpAdd(
  id: string,
  delta: number,
  revision: number,
): Effect.Effect<Character, ApiError | DecodeError | StaleRevisionError> {
  return characterMutate(id, "playbook-xp.add", revision, { delta });
}

export function playbookXpClear(
  id: string,
  revision: number,
): Effect.Effect<Character, ApiError | DecodeError | StaleRevisionError> {
  return characterMutate(id, "playbook-xp.clear", revision);
}

export function abilityTake(
  id: string,
  name: string,
  revision: number,
): Effect.Effect<Character, ApiError | DecodeError | StaleRevisionError> {
  return characterMutate(id, "ability.take", revision, { name });
}

export function abilityRemove(
  id: string,
  name: string,
  revision: number,
): Effect.Effect<Character, ApiError | DecodeError | StaleRevisionError> {
  return characterMutate(id, "ability.remove", revision, { name });
}

// ---------------------------------------------------------------------------
// F2r operations — gearAdd, gearRemove, gearCommit, gearUncommit, gearLock,
// gearUnlock, gearSetCommitment, gearClearCommitments
// ---------------------------------------------------------------------------

export function gearAdd(
  id: string,
  name: string,
  bulk: number,
  revision: number,
): Effect.Effect<Character, ApiError | DecodeError | StaleRevisionError> {
  return characterMutate(id, "gear.add", revision, { name, bulk });
}

/** Removes the item from available gear (and the loadout as a side effect). */
export function gearRemove(
  id: string,
  name: string,
  revision: number,
): Effect.Effect<Character, ApiError | DecodeError | StaleRevisionError> {
  return characterMutate(id, "gear.remove", revision, { name });
}

/** Moves an available item into the loadout (commitment must be set, bulk must fit). */
export function gearCommit(
  id: string,
  name: string,
  revision: number,
): Effect.Effect<Character, ApiError | DecodeError | StaleRevisionError> {
  return characterMutate(id, "gear.commit", revision, { name });
}

/** Removes an item from the loadout, keeping it in available gear. */
export function gearUncommit(
  id: string,
  name: string,
  revision: number,
): Effect.Effect<Character, ApiError | DecodeError | StaleRevisionError> {
  return characterMutate(id, "gear.uncommit", revision, { name });
}

export function gearLock(
  id: string,
  revision: number,
): Effect.Effect<Character, ApiError | DecodeError | StaleRevisionError> {
  return characterMutate(id, "gear.lock", revision);
}

export function gearUnlock(
  id: string,
  revision: number,
): Effect.Effect<Character, ApiError | DecodeError | StaleRevisionError> {
  return characterMutate(id, "gear.unlock", revision);
}

export function gearSetCommitment(
  id: string,
  commitment: string,
  revision: number,
): Effect.Effect<Character, ApiError | DecodeError | StaleRevisionError> {
  return characterMutate(id, "gear.set-commitment", revision, { commitment });
}

/** Clears the loadout and resets the commitment to "none". */
export function gearClearCommitments(
  id: string,
  revision: number,
): Effect.Effect<Character, ApiError | DecodeError | StaleRevisionError> {
  return characterMutate(id, "gear.clear-commitments", revision);
}

// ---------------------------------------------------------------------------
// F2s operations — fundGain, fundSpend, fundLiquidate
// coin/stash) and the clock lifecycle: listClocks, createClock, clockProgress,
// clockReset, deleteClock
// ---------------------------------------------------------------------------

/** Result of a character fund/stash op: the updated character plus the server's requested/effective counts (clamp reporting). */
export interface FundOpResult {
  character: Character;
  requested: number;
  effective: number;
}

/**
 * Generic fund mutator helper: POST to /api/characters/{id}/ops/{op}, parse
 * OperationResult, extract the updated character plus applied.requested /
 * applied.effective so the page can report server-side clamping (e.g. satchel
 * overflow on fund.gain). Same stale-revision path as characterMutate.
 */
function fundMutate(
  id: string,
  op: string,
  revision: number,
  body: unknown = {},
): Effect.Effect<FundOpResult, ApiError | DecodeError | StaleRevisionError> {
  return Effect.gen(function* () {
    const res = yield* Effect.tryPromise({
      try: async () => {
        const response = await fetch(`/api/characters/${id}/ops/${op}`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "If-Match": String(revision),
          },
          body: JSON.stringify(body),
        });
        const text = await response.text();
        return { response, text };
      },
      catch: (e) => new ApiError(0, e instanceof Error ? e.message : String(e)),
    });

    if (!res.response.ok) {
      if (res.response.status === 409) {
        try {
          const parsed = JSON.parse(res.text);
          const opResult = Schema.decodeUnknownSync(OperationResultSchema)(parsed);
          if (opResult.error?.code === "STALE_REVISION") {
            const currentRevision = opResult.error.details?.currentRevision;
            if (typeof currentRevision === "number") {
              yield* Effect.fail(new StaleRevisionError(currentRevision));
            }
            yield* Effect.fail(new StaleRevisionError(0));
          }
        } catch {
          // Malformed 409 body: fall through to ApiError
        }
      }
      yield* Effect.fail(new ApiError(res.response.status, res.text));
    }

    return yield* Effect.try({
      try: () => {
        const opResult = Schema.decodeUnknownSync(OperationResultSchema)(JSON.parse(res.text));
        if (!opResult.ok) {
          if (opResult.error) {
            throw new ApiError(res.response.status, opResult.error.code + ": " + opResult.error.message);
          }
          throw new ApiError(res.response.status, "Operation failed");
        }
        if (!opResult.character) {
          throw new Error("Missing character in OperationResult");
        }
        const requested = opResult.applied.requested ?? 0;
        const effective = opResult.applied.effective ?? requested;
        return { character: opResult.character, requested, effective };
      },
      catch: (cause) => {
        if (cause instanceof ApiError) return cause;
        return new DecodeError(cause);
      },
    });
  });
}

/** Satchel fills first, overflow to stash; coins that fit nowhere are reported via applied.effective. */
export function fundGain(
  id: string,
  coins: number,
  revision: number,
): Effect.Effect<FundOpResult, ApiError | DecodeError | StaleRevisionError> {
  return fundMutate(id, "fund.gain", revision, { coins });
}

/** Satchel first, then stash liquidation; insufficient funds → INSUFFICIENT_FUNDS (op-level error). */
export function fundSpend(
  id: string,
  coins: number,
  revision: number,
): Effect.Effect<FundOpResult, ApiError | DecodeError | StaleRevisionError> {
  return fundMutate(id, "fund.spend", revision, { coins });
}

/** Stash → satchel at 2 stash per 1 coin; satchel full → SATCHEL_FULL, stash short → INSUFFICIENT_FUNDS. */
export function fundLiquidate(
  id: string,
  coins: number,
  revision: number,
): Effect.Effect<FundOpResult, ApiError | DecodeError | StaleRevisionError> {
  return fundMutate(id, "fund.liquidate", revision, { coins });
}

/** Stash deposit/withdrawal by delta; bounded below at 0 server-side. */
/** GET /api/clocks — all campaign clocks (project + rollover). */
export function listClocks(): Effect.Effect<readonly Clock[], ApiError | DecodeError> {
  return Effect.gen(function* () {
    const raw = yield* fetchJson("/api/clocks");
    return yield* Effect.try({
      try: () => Schema.decodeUnknownSync(Schema.Array(ClockSchema))(raw),
      catch: (cause) => new DecodeError(cause),
    });
  });
}

/**
 * Generic clock mutator helper: POST to /api/clocks/{id}/{subpath} with an
 * If-Match header carrying the clock's own revision (clock ops take If-Match
 * like character ops do). Decodes the OperationResult and extracts the Clock
 * DTO. Stale-revision handling follows the F2h rule.
 */
function clockMutate(
  id: string,
  subpath: string,
  revision: number,
  body: unknown = {},
): Effect.Effect<Clock | null, ApiError | DecodeError | StaleRevisionError> {
  return Effect.gen(function* () {
    const res = yield* Effect.tryPromise({
      try: async () => {
        const response = await fetch(`/api/clocks/${id}/${subpath}`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "If-Match": String(revision),
          },
          body: JSON.stringify(body),
        });
        const text = await response.text();
        return { response, text };
      },
      catch: (e) => new ApiError(0, e instanceof Error ? e.message : String(e)),
    });

    if (!res.response.ok) {
      if (res.response.status === 409) {
        try {
          const parsed = JSON.parse(res.text);
          const opResult = Schema.decodeUnknownSync(OperationResultSchema)(parsed);
          if (opResult.error?.code === "STALE_REVISION") {
            const currentRevision = opResult.error.details?.currentRevision;
            if (typeof currentRevision === "number") {
              yield* Effect.fail(new StaleRevisionError(currentRevision));
            }
            yield* Effect.fail(new StaleRevisionError(0));
          }
        } catch {
          // Malformed 409 body: fall through to ApiError
        }
      }
      yield* Effect.fail(new ApiError(res.response.status, res.text));
    }

    return yield* Effect.try({
      try: () => {
        const opResult = Schema.decodeUnknownSync(OperationResultSchema)(JSON.parse(res.text));
        if (!opResult.ok) {
          if (opResult.error) {
            throw new ApiError(res.response.status, opResult.error.code + ": " + opResult.error.message);
          }
          throw new ApiError(res.response.status, "Operation failed");
        }
        // delete ops may omit the entity in some implementations; callers treat null as "gone"
        return opResult.clock ?? null;
      },
      catch: (cause) => {
        if (cause instanceof ApiError) return cause;
        return new DecodeError(cause);
      },
    });
  });
}

/** POST /api/clocks — create a project or rollover clock (no revision precondition on a new entity). */
export function createClock(
  name: string,
  clockKind: "project" | "rollover",
  size: number,
): Effect.Effect<Clock, ApiError | DecodeError> {
  return Effect.gen(function* () {
    const raw = yield* fetchJson("/api/clocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, clockKind, size }),
    });
    return yield* Effect.try({
      try: () => {
        const opResult = Schema.decodeUnknownSync(OperationResultSchema)(raw);
        if (!opResult.ok) {
          if (opResult.error) {
            throw new ApiError(200, opResult.error.code + ": " + opResult.error.message);
          }
          throw new ApiError(200, "Operation failed");
        }
        if (!opResult.clock) {
          throw new Error("Missing clock in OperationResult");
        }
        return opResult.clock;
      },
      catch: (cause) => {
        if (cause instanceof ApiError) return cause;
        return new DecodeError(cause);
      },
    });
  });
}

/** Progress a clock by a segment delta; project clocks clamp at full, rollover clocks carry overflow (applied on reset). */
export function clockProgress(
  id: string,
  segments: number,
  revision: number,
): Effect.Effect<Clock, ApiError | DecodeError | StaleRevisionError> {
  return Effect.gen(function* () {
    const maybe = yield* clockMutate(id, "ops/clock.progress", revision, { segments });
    if (maybe === null) {
      return yield* Effect.fail(new ApiError(200, "Missing clock in OperationResult"));
    }
    return maybe;
  });
}

/** Reset a clock to zero; rollover clocks re-apply carried overflow after reset. */
export function clockReset(
  id: string,
  revision: number,
): Effect.Effect<Clock, ApiError | DecodeError | StaleRevisionError> {
  return Effect.gen(function* () {
    const maybe = yield* clockMutate(id, "ops/clock.reset", revision);
    if (maybe === null) {
      return yield* Effect.fail(new ApiError(200, "Missing clock in OperationResult"));
    }
    return maybe;
  });
}

/** Delete a clock (confirm required per the contract); returns the deleted clock when the response includes it, else null. */
export function deleteClock(
  id: string,
  revision: number,
): Effect.Effect<Clock | null, ApiError | DecodeError | StaleRevisionError> {
  return clockMutate(id, "delete", revision, { confirm: true });
}
