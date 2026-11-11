// Type declarations for the BUGFIX-1111 conformance target guard
// (scripts/target-guard.mjs). Keep in sync with its exports.

export const TARGET_ENV: "CONFORMANCE_BASE_URL";

export class MissingTargetError extends Error {}
export class TestHooksDisabledError extends Error {}

export function resolveCliTarget(options?: {
  againstFlag?: string | undefined;
  env?: Record<string, string | undefined>;
}): string;

export function resolveEnvTarget(env?: Record<string, string | undefined>): string;

export function requireTarget(env?: Record<string, string | undefined>): string;

export function healthUrl(target: string): string;

export interface HealthDocument {
  status?: string;
  implementation?: string;
  version?: string;
  dataDir?: string;
  testHooks?: boolean;
}

export function assertTestHooksEnabled(
  target: string,
  options?: { fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<HealthDocument>;
