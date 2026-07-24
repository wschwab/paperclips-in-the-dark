import { Effect, Schema } from "effect";
import { type Health, Health as HealthSchema, type Roster, Roster as RosterSchema, type HistoryEntry, HistoryEntry as HistoryEntrySchema } from "../schema/campaign.js";
import { type Character, Character as CharacterSchema } from "../schema/character.js";
import { type Crew, Crew as CrewSchema } from "../schema/crew.js";
import { OperationResult as OperationResultSchema } from "../schema/operation-result.js";

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
