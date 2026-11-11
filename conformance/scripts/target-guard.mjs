// BUGFIX-1111 (bug report item 1): a conformance run must never mutate a
// server it did not start.
//
// On 2026-11-11 a run without an explicit target fell back to
// `http://localhost:9657` — a live campaign server — and wrote 454
// characters, 187 crews and 192 clocks into the campaign's data directory.
// Two rules prevent a repeat:
//
//   1. There is NO default target. The operator names one (--against, or
//      CONFORMANCE_BASE_URL / BASE_URL). Without one, every entry point
//      refuses to start.
//   2. The named target must announce that its test hooks are enabled:
//      GET /api/health must return `testHooks: true`. A campaign server
//      started without --test-hooks never reports it, so it is refused
//      before a single mutating request is sent.
//
// The module is plain ESM so the CLI runner (bin/conformance.mjs), the
// Vitest configuration, and the TypeScript client can all share one rule.

/** Canonical variable holding the conformance target; set by vitest.config.ts. */
export const TARGET_ENV = "CONFORMANCE_BASE_URL";

export class MissingTargetError extends Error {
  constructor(message) {
    super(
      message ??
        "no conformance target: pass --against <url> (or set CONFORMANCE_BASE_URL / BASE_URL). " +
          "The runner never guesses a default server, so a test run cannot mutate a data directory it did not create.",
    );
    this.name = "MissingTargetError";
  }
}

export class TestHooksDisabledError extends Error {
  constructor(message) {
    super(message);
    this.name = "TestHooksDisabledError";
  }
}

function trimTarget(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Resolve the target a CLI invocation names explicitly. `--against` wins over
 * the environment; CONFORMANCE_BASE_URL wins over BASE_URL (BASE_URL is
 * Vite's variable inside Vitest, so it is only consulted at the CLI boundary).
 * Returns "" when the caller named no target at all — there is no fallback.
 */
export function resolveCliTarget({ againstFlag, env = process.env } = {}) {
  return (
    trimTarget(againstFlag) || trimTarget(env[TARGET_ENV]) || trimTarget(env.BASE_URL)
  );
}

/** The target named by the environment, or "" when none is named. */
export function resolveEnvTarget(env = process.env) {
  return trimTarget(env[TARGET_ENV]);
}

/** The named target, or a MissingTargetError. Never returns a default. */
export function requireTarget(env = process.env) {
  const target = resolveEnvTarget(env);
  if (target === "") throw new MissingTargetError();
  return target;
}

export function healthUrl(target) {
  return `${String(target).replace(/\/+$/, "")}/api/health`;
}

/**
 * Refuse a target whose /api/health does not show test hooks enabled.
 * Throws TestHooksDisabledError with the reason; resolves the parsed health
 * document when the target is safe to drive.
 */
export async function assertTestHooksEnabled(target, { fetchImpl = fetch, timeoutMs = 5000 } = {}) {
  const url = healthUrl(target);
  let response;
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    throw new TestHooksDisabledError(
      `${url}: health request failed (${error instanceof Error ? error.message : String(error)}); ` +
        "refusing to run against a server that did not report test hooks",
    );
  }
  if (response.status !== 200) {
    throw new TestHooksDisabledError(
      `${url}: health returned HTTP ${response.status}; refusing to run against an unverified server`,
    );
  }
  let health;
  try {
    health = await response.json();
  } catch {
    throw new TestHooksDisabledError(`${url}: health returned invalid JSON; refusing to run against an unverified server`);
  }
  if (health?.testHooks !== true) {
    throw new TestHooksDisabledError(
      `${url}: health reports testHooks=${JSON.stringify(health?.testHooks)}; ` +
        "refusing to run against a server that was not started with --test-hooks " +
        "(it may be a live campaign server)",
    );
  }
  return health;
}
