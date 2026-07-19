import { Effect, Schema } from "effect";
import { type Health, Health as HealthSchema } from "../schema/campaign.js";

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
