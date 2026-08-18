import { Effect } from "effect";
import { ApiError, DecodeError } from "./client.js";

/**
 * import-repair.ts — the SC-F2 import/repair/degraded-deletion API surface.
 *
 * Drives the frozen contract's partial-document import (preview/apply), the
 * repair-preview/apply pair for degraded/repairable stored rows, and the
 * unreadable-row delete (If-Match content token) flow. Unlike the plain
 * mutations in client.ts, these endpoints return a rich typed failure surface
 * (NORMALIZATION_REQUIRED with its preview member, INVALID_ENTRY with
 * pointer-level issues, STALE_REVISION with the current state, INVALID_ENTITY
 * for unrepairable storage). The client decodes those into the typed error
 * classes below so pages can render friendly, non-raw failure states while
 * still folding the underlying detail into a collapsed <details>.
 */

export type EntityKind = "character" | "crew";

export interface Change {
  pointer: string;
  reason: string;
  previous: unknown;
  replacement: unknown;
}

/** A decoded normalization preview (from a preview 200 or an error's preview member). */
export interface PreviewView {
  /** true when the document is already canonical (no changes needed). */
  canonical: boolean;
  /** Every fill/conversion/correction/clamp/removal the canonicalizer would apply. */
  changes: Change[];
  warnings: string[];
  /** Exact JSON pointers awaiting caller-supplied values (non-empty → needs-input). */
  needsInputPointers: string[];
  /** Opaque token that unlocks the confirming apply; null when there is nothing to confirm. */
  previewToken: string | null;
}

export interface Issue {
  pointer: string;
  reason: string;
  expected: string;
}

/** Success identity for an apply: enough to show a friendly success state. */
export interface ApplyResult {
  kind: EntityKind;
  id: string;
  name: string;
  revision: number;
}

/** NORMALIZATION_REQUIRED — a material rewrite needs explicit confirmation. Carries the preview + token. */
export class NormalizationRequiredError extends Error {
  readonly _tag = "NormalizationRequiredError";
  constructor(readonly preview: PreviewView) {
    super("Normalization is required before this can be applied.");
    this.name = "NormalizationRequiredError";
  }
}

/** NORMALIZATION_REQUIRED whose preview ends with needs-input pointers — the caller must supply values first. */
export class NeedsInputError extends Error {
  readonly _tag = "NeedsInputError";
  readonly pointers: string[];
  constructor(readonly preview: PreviewView) {
    super("Some fields need your input before this can be applied.");
    this.name = "NeedsInputError";
    this.pointers = preview.needsInputPointers;
  }
}

/** 400 INVALID_ENTRY — the submitted content could not be normalized with the supplied values. */
export class InvalidEntryError extends Error {
  readonly _tag = "InvalidEntryError";
  constructor(readonly issues: Issue[]) {
    super("The submitted content has validation problems.");
    this.name = "InvalidEntryError";
  }
}

/** 422 INVALID_ENTITY — persisted bytes that cannot be normalized/repaired (deletion only). */
export class InvalidEntityError extends Error {
  readonly _tag = "InvalidEntityError";
  constructor(message: string) {
    super(message);
    this.name = "InvalidEntityError";
  }
}

/** 409 STALE_REVISION — the stored document changed since preview (or the token/revision went stale). */
export class StaleStateError extends Error {
  readonly _tag = "StaleStateError";
  constructor(
    readonly currentRevision?: number,
    readonly currentContentToken?: string,
  ) {
    super("This entry changed since you last previewed it.");
    this.name = "StaleStateError";
  }
}

export class NotFoundError extends Error {
  readonly _tag = "NotFoundError";
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ConfirmRequiredError extends Error {
  readonly _tag = "ConfirmRequiredError";
  constructor() {
    super("Confirmation is required.");
    this.name = "ConfirmRequiredError";
  }
}

// ---------------------------------------------------------------------------
// Parsing helpers (tolerant — the client never re-validates the backend).
// ---------------------------------------------------------------------------

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function asRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function parsePreview(parsed: unknown): PreviewView {
  const r = asRecord(parsed);
  const changes = Array.isArray(r.changes)
    ? (r.changes.filter(
        (c): boolean => c !== null && typeof c === "object",
      ) as Array<Record<string, unknown>>)
    : [];
  const canonical = typeof r.canonical === "boolean" ? r.canonical : changes.length === 0;
  const token = typeof r.previewToken === "string" && r.previewToken.length > 0 ? r.previewToken : null;
  return {
    canonical,
    changes: changes.map((c) => ({
      pointer: typeof c.pointer === "string" ? c.pointer : "",
      reason: typeof c.reason === "string" ? c.reason : "",
      previous: c.previous,
      replacement: c.replacement,
    })),
    warnings: asStringArray(r.warnings),
    needsInputPointers: asStringArray(r.needsInputPointers),
    previewToken: token,
  };
}

function parseIssues(parsed: unknown): Issue[] {
  const details = asRecord(parsed);
  const issues = Array.isArray(details.issues) ? details.issues : [];
  return issues
    .filter((i): boolean => i !== null && typeof i === "object")
    .map((i) => {
      const ir = i as Record<string, unknown>;
      return {
        pointer: typeof ir.pointer === "string" ? ir.pointer : "",
        reason: typeof ir.reason === "string" ? ir.reason : "",
        expected: typeof ir.expected === "string" ? ir.expected : "",
      };
    });
}

const errorMessage = (parsed: unknown, fallback: string): string => {
  const err = asRecord(asRecord(parsed).error);
  return typeof err.message === "string" && err.message.length > 0 ? err.message : fallback;
};

/** Extract the applied-entity identity from a successful apply response. */
function parseApplyResult(kind: EntityKind, parsed: unknown): ApplyResult {
  const r = asRecord(parsed);
  if (kind === "character") {
    const entity = asRecord(r.character);
    const dossier = asRecord(entity.dossier);
    return {
      kind,
      id: typeof entity.id === "string" ? entity.id : "",
      name: typeof dossier.name === "string" ? dossier.name : "",
      revision: typeof entity.revision === "number" ? entity.revision : 0,
    };
  }
  const entity = asRecord(r.crew);
  return {
    kind,
    id: typeof entity.id === "string" ? entity.id : "",
    name: typeof entity.name === "string" ? entity.name : "",
    revision: typeof entity.revision === "number" ? entity.revision : 0,
  };
}

const errorCode = (parsed: unknown): string => {
  const err = asRecord(asRecord(parsed).error);
  return typeof err.code === "string" ? err.code : "";
};

/** STALE_REVISION's details carry currentRevision (readable) or currentContentToken (degraded). */
function staleError(parsed: unknown): StaleStateError {
  const details = asRecord(asRecord(asRecord(parsed).error).details);
  const rev = details.currentRevision;
  const token = details.currentContentToken;
  return new StaleStateError(
    typeof rev === "number" ? rev : undefined,
    typeof token === "string" ? token : undefined,
  );
}

function post(
  path: string,
  body: unknown,
  ifMatch?: string,
): Effect.Effect<{ status: number; text: string }, ApiError> {
  return Effect.tryPromise({
    try: async () => {
      const headers: Record<string, string> = {
        Accept: "application/json",
        "Content-Type": "application/json",
      };
      if (ifMatch !== undefined) headers["If-Match"] = ifMatch;
      const res = await fetch(path, {
        method: "POST",
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await res.text();
      return { status: res.status, text };
    },
    catch: (e) => new ApiError(0, e instanceof Error ? e.message : String(e)),
  });
}

/**
 * Preview an import of a full or PARTIAL document (?preview=1) without writing.
 * Success (200, or 409 NORMALIZATION_REQUIRED with warnings) yields a PreviewView
 * carrying a preview token; needs-input previews throw NeedsInputError.
 */
export function importPreview(
  kind: EntityKind,
  id: string,
  document: unknown,
): Effect.Effect<
  PreviewView,
  ApiError | DecodeError | NormalizationRequiredError | NeedsInputError | InvalidEntryError | InvalidEntityError | NotFoundError
> {
  const path = `/api/${kind}s/${id}/import?preview=1`;
  return Effect.gen(function* () {
    const { status, text } = yield* post(path, { entity: document });
    const parsed = parseJson(text);

    // 200 carries the PreviewResult directly (import preview always token-bearing).
    if (status === 200) {
      return parsePreview(parsed);
    }

    const code = errorCode(parsed);
    if (status === 409 && code === "NORMALIZATION_REQUIRED") {
      const preview = parsePreview(asRecord(parsed).error ? asRecord(asRecord(parsed).error).preview : parsed);
      if (preview.needsInputPointers.length > 0) {
        yield* Effect.fail(new NeedsInputError(preview));
        return preview as never;
      }
      yield* Effect.fail(new NormalizationRequiredError(preview));
      return preview as never;
    }
    if (status === 400 && code === "INVALID_ENTRY") {
      yield* Effect.fail(new InvalidEntryError(parseIssues(asRecord(asRecord(parsed).error).details)));
      return null as never;
    }
    if (status === 422 && code === "INVALID_ENTITY") {
      yield* Effect.fail(new InvalidEntityError(errorMessage(parsed, "This entry cannot be imported.")));
      return null as never;
    }
    if (status === 404) {
      yield* Effect.fail(new NotFoundError(errorMessage(parsed, "This entry was not found.")));
      return null as never;
    }
    yield* Effect.fail(new ApiError(status, text));
    return null as never;
  });
}

/**
 * Apply a previewed import. Requires If-Match (entity revision or degraded
 * content token) plus the preview token; body is {entity, previewToken, confirm: true}.
 */
export function importApply(
  kind: EntityKind,
  id: string,
  document: unknown,
  ifMatch: string,
  previewToken: string,
): Effect.Effect<
  ApplyResult,
  ApiError | DecodeError | StaleStateError | NormalizationRequiredError | InvalidEntryError | InvalidEntityError | NotFoundError
> {
  const path = `/api/${kind}s/${id}/import`;
  return Effect.gen(function* () {
    const { status, text } = yield* post(path, { entity: document, previewToken, confirm: true }, ifMatch);
    const parsed = parseJson(text);

    if (status === 200) {
      return parseApplyResult(kind, parsed);
    }
    const code = errorCode(parsed);
    if (status === 409 && code === "STALE_REVISION") {
      yield* Effect.fail(staleError(parsed));
      return null as never;
    }
    if (status === 409 && code === "NORMALIZATION_REQUIRED") {
      const preview = parsePreview(asRecord(asRecord(parsed).error).preview);
      yield* Effect.fail(new NormalizationRequiredError(preview));
      return null as never;
    }
    if (status === 400 && code === "INVALID_ENTRY") {
      yield* Effect.fail(new InvalidEntryError(parseIssues(asRecord(asRecord(parsed).error).details)));
      return null as never;
    }
    if (status === 422 && code === "INVALID_ENTITY") {
      yield* Effect.fail(new InvalidEntityError(errorMessage(parsed, "This entry cannot be imported.")));
      return null as never;
    }
    if (status === 404) {
      yield* Effect.fail(new NotFoundError(errorMessage(parsed, "This entry was not found.")));
      return null as never;
    }
    yield* Effect.fail(new ApiError(status, text));
    return null as never;
  });
}

/**
 * Preview the repair of a degraded/repairable stored row. Optional body: values
 * for needs-input pointers, keyed by JSON pointer into the stored document.
 */
export function repairPreview(
  kind: EntityKind,
  id: string,
  ifMatch: string,
  values?: Record<string, unknown>,
): Effect.Effect<
  PreviewView,
  ApiError | DecodeError | NormalizationRequiredError | NeedsInputError | InvalidEntityError | NotFoundError
> {
  const path = `/api/${kind}s/${id}/repair-preview`;
  return Effect.gen(function* () {
    const { status, text } = yield* post(path, values, ifMatch);
    const parsed = parseJson(text);

    if (status === 200) {
      // Stored entity already canonical → nothing to confirm; no token.
      return parsePreview(parsed);
    }
    const code = errorCode(parsed);
    if (status === 409 && code === "NORMALIZATION_REQUIRED") {
      const preview = parsePreview(asRecord(asRecord(parsed).error).preview);
      if (preview.needsInputPointers.length > 0) {
        yield* Effect.fail(new NeedsInputError(preview));
        return preview as never;
      }
      yield* Effect.fail(new NormalizationRequiredError(preview));
      return preview as never;
    }
    if (status === 422 && code === "INVALID_ENTITY") {
      yield* Effect.fail(new InvalidEntityError(errorMessage(parsed, "This entry cannot be repaired.")));
      return null as never;
    }
    if (status === 404) {
      yield* Effect.fail(new NotFoundError(errorMessage(parsed, "This entry was not found.")));
      return null as never;
    }
    yield* Effect.fail(new ApiError(status, text));
    return null as never;
  });
}

/**
 * Apply a confirmed repair. Requires If-Match (revision or content token) and
 * the preview token; body is {previewToken, confirm: true}.
 */
export function repairApply(
  kind: EntityKind,
  id: string,
  ifMatch: string,
  previewToken: string,
): Effect.Effect<
  ApplyResult,
  ApiError | DecodeError | StaleStateError | NormalizationRequiredError | InvalidEntityError | NotFoundError
> {
  const path = `/api/${kind}s/${id}/repair`;
  return Effect.gen(function* () {
    const { status, text } = yield* post(path, { previewToken, confirm: true }, ifMatch);
    const parsed = parseJson(text);

    if (status === 200) {
      return parseApplyResult(kind, parsed);
    }
    const code = errorCode(parsed);
    if (status === 409 && code === "STALE_REVISION") {
      yield* Effect.fail(staleError(parsed));
      return null as never;
    }
    if (status === 409 && code === "NORMALIZATION_REQUIRED") {
      const preview = parsePreview(asRecord(asRecord(parsed).error).preview);
      yield* Effect.fail(new NormalizationRequiredError(preview));
      return null as never;
    }
    if (status === 422 && code === "INVALID_ENTITY") {
      yield* Effect.fail(new InvalidEntityError(errorMessage(parsed, "This entry cannot be repaired.")));
      return null as never;
    }
    if (status === 404) {
      yield* Effect.fail(new NotFoundError(errorMessage(parsed, "This entry was not found.")));
      return null as never;
    }
    yield* Effect.fail(new ApiError(status, text));
    return null as never;
  });
}

/**
 * Delete a degraded/unreadable row using its deleteToken (sha256 content
 * token) as If-Match. Body is {confirm: true}.
 */
export function deleteEntity(
  kind: EntityKind,
  id: string,
  deleteToken: string,
): Effect.Effect<void, ApiError | DecodeError | StaleStateError | NotFoundError> {
  const path = `/api/${kind}s/${id}/delete`;
  return Effect.gen(function* () {
    const { status, text } = yield* post(path, { confirm: true }, deleteToken);
    const parsed = parseJson(text);

    if (status === 200) return;
    const code = errorCode(parsed);
    if (status === 409 && code === "STALE_REVISION") {
      yield* Effect.fail(staleError(parsed));
      return;
    }
    if (status === 404) {
      yield* Effect.fail(new NotFoundError(errorMessage(parsed, "This entry was not found.")));
      return;
    }
    yield* Effect.fail(new ApiError(status, text));
  });
}
