import { Effect, Either, Schema } from "effect";
import { type Health, Health as HealthSchema, type Roster, Roster as RosterSchema, type HistoryEntry, HistoryEntry as HistoryEntrySchema } from "../schema/campaign.js";
import { type Character, Character as CharacterSchema } from "../schema/character.js";
import { type Crew, Crew as CrewSchema } from "../schema/crew.js";
import { type CrewSummary, CrewSummary as CrewSummarySchema } from "../schema/campaign.js";
import { decodeOperationResultEither } from "../schema/operation-result.js";
import type { OperationResult } from "../schema/operation-result.js";
import { type Clock, Clock as ClockSchema } from "../schema/clock.js";
// SC-F2 import/repair pipeline (same-origin client): the opId exports below
// pin the contract URL and delegate the classification to import-repair.ts.
import { importApply, repairApply, repairPreview } from "./import-repair.js";
import type {
  ApplyResult,
  InvalidEntityError,
  InvalidEntryError,
  NeedsInputError,
  NotFoundError,
  NormalizationRequiredError,
  PreviewView,
  StaleStateError,
} from "./import-repair.js";

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

/**
 * Typed operation failure: the server answered with an OperationResult whose
 * ok=false (or with a rejected HTTP status carrying a decodeable
 * OperationResult error). Carries the frozen-union decoded error so pages
 * map known codes to user copy without re-reading raw DTO text (FV-024).
 */
export class OpError extends ApiError {
  constructor(
    status: number,
    readonly error: Exclude<OperationResult["error"], null>,
  ) {
    const code = typeof error?.code === "string" ? error.code : "OPERATION_FAILED";
    const message = typeof error?.message === "string" ? error.message : "operation failed";
    super(status, `${code}: ${message}`);
    this.name = "OpError";
  }
}

/** User-facing copy for transport failures (fetch() threw; no HTTP answer). */
export const NETWORK_ERROR_COPY = "Could not reach the server — check the connection and try again.";

/** User-facing copy for responses that failed to parse/decode. */
export const DECODE_ERROR_COPY = "The server answered in an unexpected format — refresh the sheet and try again.";

/** Distinct friendly copy per transport class (FV-023). */
export function transportErrorText(err: ApiError): string {
  return err.status === 0 ? NETWORK_ERROR_COPY : `The server returned an error (${err.status}).`;
}

/** Distinct friendly copy for decode failures (FV-023). Never parser text. */
export function decodeErrorText(_err: DecodeError): string {
  return DECODE_ERROR_COPY;
}

/** Known operation-error codes → user copy (FV-024; no raw code/DTO text). */
const OP_ERROR_COPY: Readonly<Record<string, string>> = {
  VALIDATION: "The request wasn't valid — check the fields and try again.",
  INVALID_ENTRY: "The entry wasn't valid — fix it and try again.",
  INVALID_ENTITY: "The sheet data couldn't be read — refresh the sheet.",
  NORMALIZATION_REQUIRED: "The sheet needs its data normalized before continuing.",
  NOT_FOUND: "That's no longer there — the sheet refreshes with the server state.",
  STALE_REVISION: "The sheet changed in another tab — refresh to see the latest state.",
  RETIRED: "This character has retired — no further actions are available.",
  CONFIRM_REQUIRED: "This action needs an explicit confirmation before it can run.",
  DUPLICATE: "That already exists — enter something new.",
  SLOT_FULL_FATAL: "There's no room for that.",
  CANNOT_HEAL: "Cannot heal — the healing clock isn't full yet.",
  ARMOR_NOT_AVAILABLE: "That armor isn't available to use.",
  ABILITY_MAXED: "That ability is already taken to its limit.",
  CANNOT_LEVEL_UP: "The XP track isn't full enough to level up yet.",
  RATING_MAXED: "That rating is already at its maximum.",
  UPGRADE_MAXED: "All of that upgrade's boxes are already marked.",
  INSUFFICIENT_FUNDS: "Not enough coins to cover that.",
  SATCHEL_FULL: "The satchel can't hold that many coins.",
  OVER_BULK: "This would exceed the load capacity.",
  NO_COMMITMENT: "Set a load commitment before committing gear.",
  COMMITMENT_LOCKED: "The commitment is locked — unlock it first.",
  NO_HISTORY: "Nothing to undo — no history available.",
  GAME_NOT_FOUND: "The game data for this campaign couldn't be found.",
  PAYLOAD_TOO_LARGE: "That request was too large to handle.",
  TRAUMA_REQUIRED: "That requires a trauma before it can happen.",
  OUT_OF_ACTION: "This character is out of action right now.",
};

/** Concise fallback for a decoded error code with no known user copy. */
const OP_ERROR_FALLBACK =
  "That action couldn't be completed — the sheet refreshes with the server state.";

/**
 * Friendly text for a typed operation error: known codes map to user copy
 * and the server's `recovery` instruction is surfaced when present; unknown
 * codes get a concise fallback (FV-024).
 */
export function opErrorFriendlyText(err: OpError): string {
  const error = err.error;
  const code = typeof error?.code === "string" ? error.code : "";
  let recovery = "";
  if (
    error &&
    typeof error === "object" &&
    "recovery" in error &&
    typeof error.recovery === "string"
  ) {
    recovery = error.recovery;
  }
  const base = OP_ERROR_COPY[code] ?? OP_ERROR_FALLBACK;
  return recovery ? `${base} ${recovery}` : base;
}

/**
 * Friendly, classified copy for any client failure (FV-023/FV-024): op-level
 * operation errors map to known user copy, transport failures to per-status
 * copy, and decode failures to parser-free copy. Never surfaces raw
 * ApiError.body or DecodeError.message text.
 */
export function apiFailureText(err: unknown): string {
  if (err instanceof OpError) return opErrorFriendlyText(err);
  if (err instanceof ApiError) return transportErrorText(err);
  if (err instanceof DecodeError) return decodeErrorText(err);
  return "Something went wrong — try again.";
}

/**
 * Classify one fetch: malformed 200 JSON → DecodeError (never a status-0
 * ApiError, never parser text); rejected HTTP → ApiError; thrown fetch →
 * network ApiError (FV-023).
 */
export function fetchJson(
  path: string,
  init?: RequestInit,
): Effect.Effect<unknown, ApiError | DecodeError> {
  return Effect.tryPromise({
    try: async () => {
      let res: Response;
      try {
        res = await fetch(path, {
          ...init,
          headers: {
            Accept: "application/json",
            ...(init?.headers ?? {}),
          },
        });
      } catch {
        throw new ApiError(0, NETWORK_ERROR_COPY);
      }
      const text = await res.text();
      if (!res.ok) {
        throw new ApiError(res.status, text);
      }
      if (text.length === 0) return null;
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new DecodeError(new Error("malformed JSON response"));
      }
    },
    catch: (e) => {
      if (e instanceof ApiError || e instanceof DecodeError) return e;
      return new ApiError(0, NETWORK_ERROR_COPY);
    },
  });
}

// ---------------------------------------------------------------------------
// Operation response classification (whole-error union)
// ---------------------------------------------------------------------------

/**
 * Decode an operation response body through the frozen whole-error union.
 * Null when the body is missing, malformed JSON, or not a valid
 * OperationResult (callers decide the error class from the HTTP status).
 */
function tryDecodeOperationBody(text: string): OperationResult | null {
  if (text.length === 0) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    const either = decodeOperationResultEither(parsed);
    return Either.isLeft(either) ? null : either.right;
  } catch {
    return null;
  }
}

/** Build the stale-revision failure from a decoded STALE_REVISION error. */
function staleRevisionFrom(
  error: NonNullable<OperationResult["error"]>,
): StaleRevisionError {
  if (error.code !== "STALE_REVISION") return new StaleRevisionError(0);
  const currentRevision = error.details?.currentRevision;
  return new StaleRevisionError(
    typeof currentRevision === "number" ? currentRevision : 0,
  );
}

/**
 * POST to an operation endpoint and classify the response through the
 * frozen whole-error union (FV-023/FV-024):
 *
 * - thrown fetch → network ApiError (status 0, friendly copy)
 * - rejected HTTP carrying a decodeable OperationResult error → typed
 *   OpError (STALE_REVISION → StaleRevisionError with the current revision)
 * - rejected HTTP otherwise → ApiError(status, body)
 * - ok HTTP whose body is not a valid OperationResult → DecodeError
 * - ok HTTP with ok:false → OpError carrying the union-decoded error
 * - ok HTTP with ok:true → the decoded OperationResult
 */
function fetchOperation(
  path: string,
  init: RequestInit,
): Effect.Effect<OperationResult, ApiError | DecodeError | StaleRevisionError> {
  return Effect.gen(function* () {
    const res = yield* Effect.tryPromise({
      try: async () => {
        try {
          return await fetch(path, init);
        } catch {
          throw new ApiError(0, NETWORK_ERROR_COPY);
        }
      },
      catch: (e) =>
        e instanceof ApiError ? e : new ApiError(0, NETWORK_ERROR_COPY),
    });
    const text = yield* Effect.tryPromise({
      try: () => res.text(),
      catch: () => new ApiError(0, NETWORK_ERROR_COPY),
    });

    if (!res.ok) {
      const opResult = tryDecodeOperationBody(text);
      if (opResult && !opResult.ok && opResult.error) {
        if (opResult.error.code === "STALE_REVISION") {
          return yield* Effect.fail(staleRevisionFrom(opResult.error));
        }
        return yield* Effect.fail(new OpError(res.status, opResult.error));
      }
      return yield* Effect.fail(new ApiError(res.status, text));
    }

    const opResult = tryDecodeOperationBody(text);
    if (!opResult) {
      return yield* Effect.fail(new DecodeError(new Error("invalid OperationResult")));
    }
    if (!opResult.ok) {
      if (opResult.error) {
        if (opResult.error.code === "STALE_REVISION") {
          return yield* Effect.fail(staleRevisionFrom(opResult.error));
        }
        return yield* Effect.fail(new OpError(res.status, opResult.error));
      }
      return yield* Effect.fail(new ApiError(res.status, "Operation failed"));
    }
    return opResult;
  });
}

export function getHealth(): Effect.Effect<Health, ApiError | DecodeError> {
  return Effect.gen(function* () {
    const raw = yield* fetchJson("/api/health");
    return yield* Effect.try({
      try: () => Schema.decodeUnknownSync(HealthSchema, { onExcessProperty: "error" })(raw),
      catch: (cause) => new DecodeError(cause),
    });
  });
}

export function getRoster(): Effect.Effect<Roster, ApiError | DecodeError> {
  return Effect.gen(function* () {
    const raw = yield* fetchJson("/api/campaign/roster");
    return yield* Effect.try({
      try: () => Schema.decodeUnknownSync(RosterSchema, { onExcessProperty: "error" })(raw),
      catch: (cause) => new DecodeError(cause),
    });
  });
}

export function getCharacter(id: string): Effect.Effect<Character, ApiError | DecodeError> {
  return Effect.gen(function* () {
    const raw = yield* fetchJson(`/api/characters/${id}`);
    return yield* Effect.try({
      try: () => Schema.decodeUnknownSync(CharacterSchema, { onExcessProperty: "error" })(raw),
      catch: (cause) => new DecodeError(cause),
    });
  });
}

export function listCrews(): Effect.Effect<readonly CrewSummary[], ApiError | DecodeError> {
  return Effect.gen(function* () {
    const raw = yield* fetchJson("/api/crews");
    return yield* Effect.try({
      try: () => Schema.decodeUnknownSync(Schema.Array(CrewSummarySchema), { onExcessProperty: "error" })(raw),
      catch: (cause) => new DecodeError(cause),
    });
  });
}

export function getCrew(id: string): Effect.Effect<Crew, ApiError | DecodeError> {
  return Effect.gen(function* () {
    const raw = yield* fetchJson(`/api/crews/${id}`);
    return yield* Effect.try({
      try: () => Schema.decodeUnknownSync(CrewSchema, { onExcessProperty: "error" })(raw),
      catch: (cause) => new DecodeError(cause),
    });
  });
}

// ---------------------------------------------------------------------------
// SC-F3 capability projections (advisory, never persisted). The server
// computes derived limits (effective action caps, harm capacities, load
// limits, ability takes, crew upgrade/ability catalogs, effective turf and
// the develop threshold) so the client never joins settings with cross-entity
// state to discover an enforced cap. Mutations remain authoritative.
// ---------------------------------------------------------------------------

export interface CharacterCapabilities {
  characterId: string;
  effectiveActionCaps: readonly EffectiveActionCap[];
  harmCapacities: readonly HarmCapacity[];
  loadLimits: readonly LoadLimit[];
  availableAbilityTakes: readonly AvailableAbilityTake[];
}

export interface EffectiveActionCap {
  action: string;
  maxRating: number;
  effectiveMax: number;
  masteryTotalBoxes: number;
  masteryMarkedBoxes: number;
}

export interface HarmCapacity {
  level: "lesser" | "moderate" | "severe" | "fatal";
  capacity: number;
  remaining: number;
}

export interface LoadLimit {
  commitment: "none" | "light" | "normal" | "heavy" | "encumbered";
  maxBulk: number;
  remainingBulk: number;
}

export interface AvailableAbilityTake {
  name: string;
  timesTaken: number;
  maxTakes: number;
  remaining: number;
}

export interface CrewCapabilities {
  crewId: string;
  upgrades: readonly UpgradeCapability[];
  abilities: readonly AbilityCapability[];
  effectiveTurf: number;
  developThreshold: number;
}

export interface UpgradeCapability {
  name: string;
  totalBoxes: number;
  marked: number;
  remaining: number;
}

export interface AbilityCapability {
  name: string;
  maxTakes: number;
  taken: number;
  remaining: number;
}

const EffectiveActionCapSchema = Schema.Struct({
  action: Schema.String,
  maxRating: Schema.Number.pipe(Schema.int()),
  effectiveMax: Schema.Number.pipe(Schema.int()),
  masteryTotalBoxes: Schema.Number.pipe(Schema.int()),
  masteryMarkedBoxes: Schema.Number.pipe(Schema.int()),
});

const HarmCapacitySchema = Schema.Struct({
  level: Schema.Literal("lesser", "moderate", "severe", "fatal"),
  capacity: Schema.Number.pipe(Schema.int()),
  remaining: Schema.Number.pipe(Schema.int()),
});

const LoadLimitSchema = Schema.Struct({
  commitment: Schema.Literal("none", "light", "normal", "heavy", "encumbered"),
  maxBulk: Schema.Number.pipe(Schema.int()),
  remainingBulk: Schema.Number.pipe(Schema.int()),
});

const AvailableAbilityTakeSchema = Schema.Struct({
  name: Schema.String,
  timesTaken: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
  maxTakes: Schema.Number.pipe(Schema.int()),
  remaining: Schema.Number.pipe(Schema.int()),
});

const CharacterCapabilitiesSchema = Schema.Struct({
  characterId: Schema.String,
  effectiveActionCaps: Schema.Array(EffectiveActionCapSchema),
  harmCapacities: Schema.Array(HarmCapacitySchema),
  loadLimits: Schema.Array(LoadLimitSchema),
  availableAbilityTakes: Schema.Array(AvailableAbilityTakeSchema),
});

const UpgradeCapabilitySchema = Schema.Struct({
  name: Schema.String,
  totalBoxes: Schema.Number.pipe(Schema.int()),
  marked: Schema.Number.pipe(Schema.int()),
  remaining: Schema.Number.pipe(Schema.int()),
});

const AbilityCapabilitySchema = Schema.Struct({
  name: Schema.String,
  maxTakes: Schema.Number.pipe(Schema.int()),
  taken: Schema.Number.pipe(Schema.int()),
  remaining: Schema.Number.pipe(Schema.int()),
});

const CrewCapabilitiesSchema = Schema.Struct({
  crewId: Schema.String,
  upgrades: Schema.Array(UpgradeCapabilitySchema),
  abilities: Schema.Array(AbilityCapabilitySchema),
  effectiveTurf: Schema.Number.pipe(Schema.int()),
  developThreshold: Schema.Number.pipe(Schema.int()),
});

/** Advisory character capability projection (SC-F3): effective action caps,
 * harm capacities, load limits, remaining ability takes. */
export function getCharacterCapabilities(
  id: string,
): Effect.Effect<CharacterCapabilities, ApiError | DecodeError> {
  return Effect.gen(function* () {
    const raw = yield* fetchJson(`/api/characters/${id}/capabilities`);
    return yield* Effect.try({
      try: () => Schema.decodeUnknownSync(CharacterCapabilitiesSchema, { onExcessProperty: "error" })(raw),
      catch: (cause) => new DecodeError(cause),
    });
  });
}

/** Advisory crew capability projection (SC-F3): full upgrade/ability catalog
 * with current box/take state, effective turf, and the rep develop threshold. */
export function getCrewCapabilities(
  id: string,
): Effect.Effect<CrewCapabilities, ApiError | DecodeError> {
  return Effect.gen(function* () {
    const raw = yield* fetchJson(`/api/crews/${id}/capabilities`);
    return yield* Effect.try({
      try: () => Schema.decodeUnknownSync(CrewCapabilitiesSchema, { onExcessProperty: "error" })(raw),
      catch: (cause) => new DecodeError(cause),
    });
  });
}

export function getCharacterHistory(id: string): Effect.Effect<readonly HistoryEntry[], ApiError | DecodeError> {
  return Effect.gen(function* () {
    const raw = yield* fetchJson(`/api/characters/${id}/history`);
    return yield* Effect.try({
      try: () => Schema.decodeUnknownSync(Schema.Array(HistoryEntrySchema), { onExcessProperty: "error" })(raw),
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

export function createCharacter(gameStem: string, playbook: string): Effect.Effect<Character, ApiError | DecodeError | StaleRevisionError> {
  return Effect.gen(function* () {
    const opResult = yield* fetchOperation("/api/characters", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ gameStem, playbook }),
    });
    if (!opResult.character) {
      return yield* Effect.fail(new DecodeError(new Error("Missing character in OperationResult")));
    }
    return opResult.character;
  });
}

export function getCrewHistory(id: string): Effect.Effect<readonly HistoryEntry[], ApiError | DecodeError> {
  return Effect.gen(function* () {
    const raw = yield* fetchJson(`/api/crews/${id}/history`);
    return yield* Effect.try({
      try: () => Schema.decodeUnknownSync(Schema.Array(HistoryEntrySchema), { onExcessProperty: "error" })(raw),
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

// ---------------------------------------------------------------------------
// F4 lifecycle operations — retireCharacter, endScore, deleteCharacter
// (lifecycle-matrix §3/§4/§6; SC-F4 exports for reachable client parity)
// ---------------------------------------------------------------------------

/**
 * Explicit retirement (Q33 / lifecycle-matrix §3): confirmation-guarded
 * (body {confirm:true}), legal in any state and below maximum trauma. Runs
 * the shared retirement cleanup atomically — one snapshot, one history
 * entry; undo restores the complete prior state (the sanctioned recovery
 * path). Degraded entity → 422 INVALID_ENTITY.
 */
export function retireCharacter(
  id: string,
  revision: number,
): Effect.Effect<Character, ApiError | DecodeError | StaleRevisionError> {
  return Effect.gen(function* () {
    const opResult = yield* fetchOperation(`/api/characters/${id}/retire`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "If-Match": String(revision),
      },
      body: JSON.stringify({ confirm: true }),
    });
    if (!opResult.character) {
      return yield* Effect.fail(new DecodeError(new Error("Missing character in OperationResult")));
    }
    return opResult.character;
  });
}

/** Optional score-cleanup flags for endScore. The body is optional — a
 * missing/empty body clears stress + out-of-action flags only. */
export interface EndScoreFlags {
  clearArmorUsed?: boolean;
  resetLoadoutCommitment?: boolean;
}

/**
 * End the score (lifecycle-matrix §4): ALWAYS clears stress → 0 and resets
 * both out-of-action flags (isOutOfAction, stressClearPending); optional
 * flags add armor/loadout cleanup. The whole composite lands in one snapshot
 * and exactly one history entry (any mid-composite failure fails everything).
 * Gates: retired → RETIRED; traumaPending → TRAUMA_REQUIRED.
 */
export function endScore(
  id: string,
  revision: number,
  flags: EndScoreFlags = {},
): Effect.Effect<Character, ApiError | DecodeError | StaleRevisionError> {
  return Effect.gen(function* () {
    const opResult = yield* fetchOperation(`/api/characters/${id}/end-score`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "If-Match": String(revision),
      },
      body: JSON.stringify(flags),
    });
    if (!opResult.character) {
      return yield* Effect.fail(new DecodeError(new Error("Missing character in OperationResult")));
    }
    return opResult.character;
  });
}

/** Optional endDowntime body: clearSessionExpressions + a GM-judged vice-relief stress amount. */
export interface EndDowntimeOptions {
  clearSessionExpressions?: boolean;
  viceReliefStress?: number;
}

/**
 * End downtime (composite helper): clears the session expression tracks; an
 * optional vice-relief stress clear amount is caller-supplied (GM judgment).
 * Same If-Match + OperationResult shape as endScore.
 */
export function endDowntime(
  id: string,
  revision: number,
  opts: EndDowntimeOptions = {},
): Effect.Effect<Character, ApiError | DecodeError | StaleRevisionError> {
  return Effect.gen(function* () {
    const opResult = yield* fetchOperation(`/api/characters/${id}/end-downtime`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "If-Match": String(revision),
      },
      body: JSON.stringify(opts),
    });
    if (!opResult.character) {
      return yield* Effect.fail(new DecodeError(new Error("Missing character in OperationResult")));
    }
    return opResult.character;
  });
}

/**
 * Delete a character (lifecycle-matrix §6.1 — retired characters remain
 * deletable). Requires {confirm:true} (else CONFIRM_REQUIRED); If-Match is
 * the entity revision, or the sha256: content token for a degraded entity.
 * The response carries no entity (deletion always succeeds to a gone state);
 * this Effect resolves to void and the caller navigates away on success.
 */
export function deleteCharacter(
  id: string,
  ifMatch: string,
): Effect.Effect<void, ApiError | DecodeError | StaleRevisionError> {
  const op = "delete" as const;
  return Effect.gen(function* () {
    yield* fetchOperation(`/api/characters/${id}/${op}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "If-Match": ifMatch,
      },
      body: JSON.stringify({ confirm: true }),
    });
  });
}

/**
 * Delete a crew (requires {confirm:true} else CONFIRM_REQUIRED; not undoable).
 * If-Match is the crew revision, or the sha256: content token for a degraded
 * crew. Unlinks member characters and reassigns standalone crew-owned clocks
 * to campaign ownership in the same atomic snapshot (see the contract).
 * Mirrors deleteCharacter: resolves to void and the page navigates away.
 */
export function deleteCrew(
  id: string,
  ifMatch: string,
): Effect.Effect<void, ApiError | DecodeError | StaleRevisionError> {
  const op = "delete" as const;
  return Effect.gen(function* () {
    yield* fetchOperation(`/api/crews/${id}/${op}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "If-Match": ifMatch,
      },
      body: JSON.stringify({ confirm: true }),
    });
  });
}

/** Result of undoCharacter: the restored character plus the derived undo state (FV-028 / lifecycle-matrix §9). */
export interface UndoCharacterResult {
  character: Character;
  /** True while at least one snapshot remains (derived server-side; false below the retention floor). */
  canUndo: boolean;
  /** Number of retained snapshot entries (0..50) — consumed one per undo. */
  historyCount: number;
}

/**
 * Undo the last character change (P19/FV-019). Destructive ops require
 * If-Match with the current revision; a 409 STALE_REVISION surfaces as
 * StaleRevisionError so the page refreshes without undoing concurrent state.
 * The response's derived canUndo/historyCount (never stored) drive the
 * undo control's state (FV-028).
 */
export function undoCharacter(
  id: string,
  revision: number,
): Effect.Effect<UndoCharacterResult, ApiError | DecodeError | StaleRevisionError> {
  return Effect.gen(function* () {
    const opResult = yield* fetchOperation(`/api/characters/${id}/undo`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "If-Match": String(revision),
      },
      body: JSON.stringify({}),
    });
    if (!opResult.character) {
      return yield* Effect.fail(new DecodeError(new Error("Missing character in OperationResult")));
    }
    return {
      character: opResult.character,
      canUndo: opResult.canUndo ?? false,
      historyCount: opResult.historyCount ?? 0,
    };
  });
}

/** Result of undoCrew: the restored crew plus the derived undo state (FV-028). */
export interface UndoCrewResult {
  crew: Crew;
  canUndo: boolean;
  historyCount: number;
}

/**
 * Undo the last crew change (P19/FV-019). Same If-Match contract as
 * undoCharacter.
 */
export function undoCrew(
  id: string,
  revision: number,
): Effect.Effect<UndoCrewResult, ApiError | DecodeError | StaleRevisionError> {
  return Effect.gen(function* () {
    const opResult = yield* fetchOperation(`/api/crews/${id}/undo`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "If-Match": String(revision),
      },
      body: JSON.stringify({}),
    });
    if (!opResult.crew) {
      return yield* Effect.fail(new DecodeError(new Error("Missing crew in OperationResult")));
    }
    return {
      crew: opResult.crew,
      canUndo: opResult.canUndo ?? false,
      historyCount: opResult.historyCount ?? 0,
    };
  });
}

export function createCrew(gameStem: string, crewType: string): Effect.Effect<Crew, ApiError | DecodeError | StaleRevisionError> {
  return Effect.gen(function* () {
    const opResult = yield* fetchOperation("/api/crews", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        gameStem,
        crewType,
      }),
    });
    if (!opResult.crew) {
      return yield* Effect.fail(new DecodeError(new Error("Missing crew in OperationResult")));
    }
    return opResult.crew;
  });
}

// ---------------------------------------------------------------------------
// F2m operations — dossierUpdate, stressClear, traumaAdd, traumaRemove, getGame
// ---------------------------------------------------------------------------

/** Generic mutator helper: POST to /ops/{op}, decode through the whole-error union, extract character. */
function characterMutate(
  id: string,
  op: string,
  revision: number,
  body: unknown = {},
): Effect.Effect<Character, ApiError | DecodeError | StaleRevisionError> {
  return Effect.gen(function* () {
    const opResult = yield* fetchOperation(`/api/characters/${id}/ops/${op}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "If-Match": String(revision),
      },
      body: JSON.stringify(body),
    });
    if (!opResult.character) {
      return yield* Effect.fail(new DecodeError(new Error("Missing character in OperationResult")));
    }
    return opResult.character;
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
    const opResult = yield* fetchOperation(`/api/characters/${id}/ops/harm.add`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "If-Match": String(revision),
      },
      body: JSON.stringify({ description, intensity }),
    });
    if (!opResult.character) {
      return yield* Effect.fail(new DecodeError(new Error("Missing character in OperationResult")));
    }
    const landedIntensity = opResult.applied.landedIntensity ?? null;
    return { character: opResult.character, landedIntensity };
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

export function getGame(gameStem: string): Effect.Effect<Record<string, unknown>, ApiError | DecodeError> {
  return Effect.gen(function* () {
    const raw = yield* fetchJson(`/api/games/${gameStem}`);
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      yield* Effect.fail(new DecodeError(new Error("Expected game data object")));
    }
    return raw as Record<string, unknown>;
  });
}

export function stressAdd(id: string, delta: number, revision: number): Effect.Effect<Character, ApiError | DecodeError | StaleRevisionError> {
  return Effect.gen(function* () {
    const opResult = yield* fetchOperation(`/api/characters/${id}/ops/stress.add`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "If-Match": String(revision),
      },
      body: JSON.stringify({ delta }),
    });
    if (!opResult.character) {
      return yield* Effect.fail(new DecodeError(new Error("Missing character in OperationResult")));
    }
    return opResult.character;
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

/** Replace the character's free-text notebook (contract /ops/notebook.set). */
export function notebookSet(
  id: string,
  text: string,
  revision: number,
): Effect.Effect<Character, ApiError | DecodeError | StaleRevisionError> {
  return characterMutate(id, "notebook.set", revision, { text });
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
    const opResult = yield* fetchOperation(`/api/crews/${id}/ops/${op}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "If-Match": String(revision),
      },
      body: JSON.stringify(body),
    });
    if (!opResult.crew) {
      return yield* Effect.fail(new DecodeError(new Error("Missing crew in OperationResult")));
    }
    return opResult.crew;
  });
}

/** Crew Claims: acquire (claimed=true) or relinquish (claimed=false) a claim. */
export function crewClaimSet(
  id: string,
  claimId: string,
  claimed: boolean,
  revision: number,
): Effect.Effect<Crew, ApiError | DecodeError | StaleRevisionError> {
  return crewMutate(id, "claim.set", revision, { claimId, claimed });
}

/** Crew Claims: write/merge a per-crew override for a canonical claim. */
export function crewClaimCustomize(
  id: string,
  claimId: string,
  fields: { name?: string; description?: string; effects?: unknown[] },
  revision: number,
): Effect.Effect<Crew, ApiError | DecodeError | StaleRevisionError> {
  return crewMutate(id, "claim.customize", revision, { claimId, ...fields });
}

/** Crew Claims: delete the override for a claim, restoring canonical defaults. */
export function crewClaimReset(
  id: string,
  claimId: string,
  revision: number,
): Effect.Effect<Crew, ApiError | DecodeError | StaleRevisionError> {
  return crewMutate(id, "claim.reset", revision, { claimId });
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
    const opResult = yield* fetchOperation(`/api/crews/${id}/ops/faction.set-status`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "If-Match": String(revision),
      },
      body: JSON.stringify({ name, status }),
    });
    if (!opResult.crew) {
      return yield* Effect.fail(new DecodeError(new Error("Missing crew in OperationResult")));
    }
    const requested = opResult.applied.requested ?? status;
    const effective = opResult.applied.effective ?? requested;
    return { crew: opResult.crew, requested, effective };
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

/** Result of a crew tracker (0..max bounded) op: the updated crew plus the
 * server's requested/effective deltas so the page can report clamping (P29/FV-029),
 * following the fund-result pattern. When the server applied the full requested
 * change, requested === effective and the page stays quiet. */
export interface CrewTrackOpResult {
  crew: Crew;
  requested: number;
  effective: number;
}

/**
 * Generic crew tracker mutator: POST to /ops/{op}, parse the OperationResult,
 * extract the updated crew plus applied.requested / applied.effective (the
 * same clamp-reporting shape used by fundMutate / factionSetStatus).
 */
function crewTrackMutate(
  id: string,
  op: string,
  revision: number,
  body: unknown = {},
): Effect.Effect<CrewTrackOpResult, ApiError | DecodeError | StaleRevisionError> {
  return Effect.gen(function* () {
    const opResult = yield* fetchOperation(`/api/crews/${id}/ops/${op}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "If-Match": String(revision),
      },
      body: JSON.stringify(body),
    });
    if (!opResult.crew) {
      return yield* Effect.fail(new DecodeError(new Error("Missing crew in OperationResult")));
    }
    const requested =
      opResult.applied.requested ??
      (typeof body === "object" && body !== null && "delta" in body
        ? (body as { delta: number }).delta
        : 0);
    const effective = opResult.applied.effective ?? requested;
    return { crew: opResult.crew, requested, effective };
  });
}

/** Crew reputation delta (bounded 0..max server-side; reports clamps via requested/effective). */
export function crewRepAdd(
  id: string,
  delta: number,
  revision: number,
): Effect.Effect<CrewTrackOpResult, ApiError | DecodeError | StaleRevisionError> {
  return crewTrackMutate(id, "rep.add", revision, { delta });
}

/** Crew heat delta (bounded 0..max server-side; reports clamps via requested/effective). */
export function crewHeatAdd(
  id: string,
  delta: number,
  revision: number,
): Effect.Effect<CrewTrackOpResult, ApiError | DecodeError | StaleRevisionError> {
  return crewTrackMutate(id, "heat.add", revision, { delta });
}

/** Crew wanted-level delta (bounded 0..max server-side; reports clamps via requested/effective). */
export function crewWantedAdd(
  id: string,
  delta: number,
  revision: number,
): Effect.Effect<CrewTrackOpResult, ApiError | DecodeError | StaleRevisionError> {
  return crewTrackMutate(id, "wanted.add", revision, { delta });
}

/** Crew tier delta (bounded below at 0 server-side; reports clamps via requested/effective). */
export function crewTierAdd(
  id: string,
  delta: number,
  revision: number,
): Effect.Effect<CrewTrackOpResult, ApiError | DecodeError | StaleRevisionError> {
  return crewTrackMutate(id, "tier.add", revision, { delta });
}

/** Set crew hold to one of the contract enum values ("strong" | "weak"). */
export function crewHoldSet(
  id: string,
  hold: string,
  revision: number,
): Effect.Effect<Crew, ApiError | DecodeError | StaleRevisionError> {
  return crewMutate(id, "hold.set", revision, { hold });
}

/** Crew coin (loose funds) delta — bounded below at 0 server-side; reports clamps via requested/effective. */
export function crewCoinAdd(
  id: string,
  delta: number,
  revision: number,
): Effect.Effect<CrewTrackOpResult, ApiError | DecodeError | StaleRevisionError> {
  return crewTrackMutate(id, "coin.add", revision, { delta });
}

/** Crew stash (vaults) delta — bounded below at 0 server-side; reports clamps via requested/effective. */
export function crewStashAdd(
  id: string,
  delta: number,
  revision: number,
): Effect.Effect<CrewTrackOpResult, ApiError | DecodeError | StaleRevisionError> {
  return crewTrackMutate(id, "stash.add", revision, { delta });
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
 * develop threshold by one). Negative deltas remove turf. Reports clamps via
 * requested/effective. */
export function crewTurfAdd(
  id: string,
  delta: number,
  revision: number,
): Effect.Effect<CrewTrackOpResult, ApiError | DecodeError | StaleRevisionError> {
  return crewTrackMutate(id, "turf.add", revision, { delta });
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
 * Reports clamps via requested/effective.
 */
export function crewXpAdd(
  id: string,
  delta: number,
  revision: number,
): Effect.Effect<CrewTrackOpResult, ApiError | DecodeError | StaleRevisionError> {
  return crewTrackMutate(id, "xp.add", revision, { delta });
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
): Effect.Effect<Record<string, unknown>, ApiError | DecodeError> {
  return Effect.gen(function* () {
    const raw = yield* fetchJson(`/api/games/${gameStem}/crews/${crewType}`);
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      yield* Effect.fail(new DecodeError(new Error("Expected crew type object")));
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
): Effect.Effect<Record<string, unknown>, ApiError | DecodeError> {
  return Effect.gen(function* () {
    const raw = yield* fetchJson(`/api/games/${gameStem}/playbooks/${playbook}`);
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      yield* Effect.fail(new DecodeError(new Error("Expected playbook object")));
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
    const opResult = yield* fetchOperation(`/api/characters/${id}/ops/${op}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "If-Match": String(revision),
      },
      body: JSON.stringify(body),
    });
    if (!opResult.character) {
      return yield* Effect.fail(new DecodeError(new Error("Missing character in OperationResult")));
    }
    const requested = opResult.applied.requested ?? 0;
    const effective = opResult.applied.effective ?? requested;
    return { character: opResult.character, requested, effective };
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
      try: () => Schema.decodeUnknownSync(Schema.Array(ClockSchema), { onExcessProperty: "error" })(raw),
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
    const opResult = yield* fetchOperation(`/api/clocks/${id}/${subpath}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "If-Match": String(revision),
      },
      body: JSON.stringify(body),
    });
    // delete ops may omit the entity in some implementations; callers treat null as "gone"
    return opResult.clock ?? null;
  });
}

/** POST /api/clocks — create a project or rollover clock (no revision precondition on a new entity). */
export function createClock(
  name: string,
  clockKind: "project" | "rollover",
  size: number,
): Effect.Effect<Clock, ApiError | DecodeError | StaleRevisionError> {
  return Effect.gen(function* () {
    const opResult = yield* fetchOperation("/api/clocks", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, clockKind, size }),
    });
    if (!opResult.clock) {
      return yield* Effect.fail(new DecodeError(new Error("Missing clock in OperationResult")));
    }
    return opResult.clock;
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

// ---------------------------------------------------------------------------
// SC-F2 import/repair opId exports — importCharacter, importCrew,
// repairCharacterPreview/Apply, repairCrewPreview/Apply
//
// Kind-bound entry points for the shared import/repair pipeline in
// import-repair.ts. Each pins the exact contract URL (the capability-parity
// oracle verifies the URL literal in the body) while the typed classification
// (NORMALIZATION_REQUIRED / INVALID_ENTRY / INVALID_ENTITY / STALE_REVISION)
// stays single-sourced in import-repair.ts.
// ---------------------------------------------------------------------------

/**
 * Apply a previewed import of a full or PARTIAL character document.
 * Requires If-Match (revision, or the sha256: content token for a degraded
 * row) plus the preview token from the preview step.
 */
export function importCharacter(
  id: string,
  document: unknown,
  ifMatch: string,
  previewToken: string,
): Effect.Effect<
  ApplyResult,
  ApiError | DecodeError | StaleStateError | NormalizationRequiredError | InvalidEntryError | InvalidEntityError | NotFoundError
> {
  return importApply("character", id, document, ifMatch, previewToken, `/api/characters/${id}/import`);
}

/**
 * Apply a previewed import of a full or PARTIAL crew document.
 * Requires If-Match (revision, or the sha256: content token for a degraded
 * row) plus the preview token from the preview step.
 */
export function importCrew(
  id: string,
  document: unknown,
  ifMatch: string,
  previewToken: string,
): Effect.Effect<
  ApplyResult,
  ApiError | DecodeError | StaleStateError | NormalizationRequiredError | InvalidEntryError | InvalidEntityError | NotFoundError
> {
  return importApply("crew", id, document, ifMatch, previewToken, `/api/crews/${id}/import`);
}

/**
 * Preview the repair of a degraded/repairable stored character. Optional
 * values keyed by JSON pointer satisfy the preview's needs-input pointers.
 */
export function repairCharacterPreview(
  id: string,
  ifMatch: string,
  values?: Record<string, unknown>,
): Effect.Effect<
  PreviewView,
  ApiError | DecodeError | NormalizationRequiredError | NeedsInputError | InvalidEntityError | NotFoundError
> {
  return repairPreview("character", id, ifMatch, values, `/api/characters/${id}/repair-preview`);
}

/**
 * Apply a confirmed character repair. Requires If-Match (revision or content
 * token) plus the preview token from repairCharacterPreview.
 */
export function repairCharacterApply(
  id: string,
  ifMatch: string,
  previewToken: string,
): Effect.Effect<
  ApplyResult,
  ApiError | DecodeError | StaleStateError | NormalizationRequiredError | InvalidEntityError | NotFoundError
> {
  return repairApply("character", id, ifMatch, previewToken, `/api/characters/${id}/repair`);
}

/**
 * Preview the repair of a degraded/repairable stored crew. Optional values
 * keyed by JSON pointer satisfy the preview's needs-input pointers.
 */
export function repairCrewPreview(
  id: string,
  ifMatch: string,
  values?: Record<string, unknown>,
): Effect.Effect<
  PreviewView,
  ApiError | DecodeError | NormalizationRequiredError | NeedsInputError | InvalidEntityError | NotFoundError
> {
  return repairPreview("crew", id, ifMatch, values, `/api/crews/${id}/repair-preview`);
}

/**
 * Apply a confirmed crew repair. Requires If-Match (revision or content
 * token) plus the preview token from repairCrewPreview.
 */
export function repairCrewApply(
  id: string,
  ifMatch: string,
  previewToken: string,
): Effect.Effect<
  ApplyResult,
  ApiError | DecodeError | StaleStateError | NormalizationRequiredError | InvalidEntityError | NotFoundError
> {
  return repairApply("crew", id, ifMatch, previewToken, `/api/crews/${id}/repair`);
}
