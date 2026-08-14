// Type declarations for the SC-O0 managed conformance launcher
// (scripts/managed-run.mjs), consumed by the tooling tests in src/.
// Keep in sync with the exports and shapes in managed-run.mjs.

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
  cycles: number;
  staticDir: string | null;
  gamesDir: string | null;
  testHooks: boolean;
  timeoutMs: number;
  help: boolean;
  vitestArgs: string[];
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

export function pickPort(): Promise<number>;

export const PORT_RETRY_ATTEMPTS: number;

export function isPortCollision(logText: string): boolean;

export function seedDataDir(dataDir: string, seeds: string[]): Promise<SeedEntry[]>;

export function waitForHealth(baseUrl: string, timeoutMs: number, signal?: AbortSignal): Promise<void>;

export function stopServer(child: unknown): Promise<void>;

export function stopVitest(child: unknown): Promise<void>;

export function main(argv?: string[]): Promise<void>;

export const conformanceDir: string;
export const repoRoot: string;
