// Type declarations for the RV-00 default-data write guard
// (scripts/default-data-guard.mjs), consumed by the tooling tests in src/.
// Keep in sync with the exports and shapes in default-data-guard.mjs.

export interface FileRow {
  path: string;
  size: number;
  sha256: string;
}

export interface Manifest {
  dirs: string[];
  files: FileRow[];
}

export type Row =
  | { path: string; type: "dir" }
  | FileRow & { type: "file" };

export interface ChangedRow extends FileRow {
  type: "file";
  before: { size: number; sha256: string };
}

export interface ManifestDiff {
  added: Row[];
  removed: Row[];
  changed: ChangedRow[];
}

export interface ParsedArgs {
  help: boolean;
  child: string[];
}

export function repoRootOf(scriptUrl: string | URL): string;

export const repoRoot: string;

export function defaultManifestRoot(): string;

export function snapshotRoot(root: string): Promise<Manifest>;

export function compareManifests(before: Manifest, after: Manifest): ManifestDiff;

export function realChildRunner(child: string[], cwd: string): Promise<number>;

export function runGuard(
  root: string,
  child: string[],
  options?: { cwd?: string; childRunner?: (child: string[], cwd: string) => Promise<number> },
): Promise<number>;

export function usage(): string;

export function parseArgs(argv: string[]): ParsedArgs;

export function main(argv?: string[]): Promise<number>;
