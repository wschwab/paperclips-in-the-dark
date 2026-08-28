import { Effect } from "effect";
import { ApiError, DecodeError, OpError, StaleRevisionError } from "../api/client.js";

/**
 * Shared mutation transport (ARCH-02): the Effect-runner plumbing every
 * detail-page mutation uses — cancel-check, loading-flag teardown,
 * stale-revision recovery (F2h rule), and failure reporting. Pages supply
 * hooks; this module owns the Effect.match wiring so both detail pages share
 * one implementation instead of two copies of the same closure pattern.
 */

/** A program a page mutation runs: one result, the standard error union. */
export type MutationProgram<T> = Effect.Effect<
  T,
  ApiError | DecodeError | StaleRevisionError
>;

/**
 * Page-supplied hooks. `fail` routes the error where the user acted (the
 * CHAR-03 section card, or the page's sheet-level notice field);
 * `onStale` refetches after a stale-revision rejection (F2h rule).
 */
export interface MutationTransport {
  isCancelled(): boolean;
  rerender(): void;
  fail(
    section: string | null,
    err: unknown,
    onOpError?: (err: OpError) => string,
  ): void;
  onStale(): void;
}

/**
 * Standard failure path for a mutation: clears the loading flag, recovers
 * from stale revisions (rerender + refetch), and surfaces API/decode errors
 * through the transport.
 */
export function failMutation(
  t: MutationTransport,
  err: unknown,
  clearLoading: () => void,
  section: string | null = null,
  onOpError?: (err: OpError) => string,
  onStale?: () => void,
): void {
  if (t.isCancelled()) return;
  clearLoading();
  if (err instanceof StaleRevisionError) {
    t.rerender();
    (onStale ?? t.onStale)();
  } else {
    t.fail(section, err, onOpError);
    t.rerender();
  }
}

/**
 * Shared mutation runner: standard error paths + stale-revision recovery
 * (F2h rule). `onStale` overrides the transport default for pages whose
 * stale recovery refetches a different resource (e.g. campaign clocks).
 */
export function runMutation<T>(
  t: MutationTransport,
  section: string | null,
  program: MutationProgram<T>,
  onSuccess: (value: T) => void,
  clearLoading: () => void,
  onOpError?: (err: OpError) => string,
  onStale?: () => void,
): void {
  void Effect.runPromise(
    Effect.match(program, {
      onFailure: (err) => failMutation(t, err, clearLoading, section, onOpError, onStale),
      onSuccess: (value) => {
        if (t.isCancelled()) return;
        clearLoading();
        onSuccess(value);
      },
    }),
  );
}
