// Type declarations for the Wave-0 managed browser-smoke launcher
// (scripts/managed-browser-smoke.mjs), consumed by the tooling tests in src/.
// Keep in sync with the exports and shapes in managed-browser-smoke.mjs.

export interface SeedEntry {
  src: string;
  dest: string;
  kind: "file" | "dir";
}

export interface LauncherOptions {
  server: string | null;
  build: boolean;
  buildDir: string | null;
  seeds: string[];
  staticDir: string | null;
  gamesDir: string | null;
  timeoutMs: number;
  keep: boolean;
  help: boolean;
  command: string[];
}

export interface ChildEnv {
  BASE_URL: string;
  CONFORMANCE_BASE_URL: string;
  PITD_DATA_DIR: string;
}

export function defaultPaths(): {
  server: string;
  buildDir: string;
  staticDir: string;
  gamesDir: string;
  managedRoot: string;
};

export function usage(): string;

export function parseArgs(argv: string[]): LauncherOptions;

export function buildChildEnv(input: { baseUrl: string; dataDir: string }): ChildEnv;

export function isSubpath(root: string, candidate: string): boolean;

export function signalExitCode(signal: string): number;

export function childExitCode(code: number | null, signal: NodeJS.Signals | null): number;

export function pickPort(): Promise<number>;

export const PORT_RETRY_ATTEMPTS: number;

export function isPortCollision(logText: string): boolean;

export function seedDataDir(dataDir: string, seeds: string[]): Promise<SeedEntry[]>;

export function waitForHealth(
  baseUrl: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<void>;

export function main(argv?: string[]): Promise<void>;

export const conformanceDir: string;
export const repoRoot: string;
