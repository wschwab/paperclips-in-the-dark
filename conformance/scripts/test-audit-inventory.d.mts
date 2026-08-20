// TA00 test-audit inventory generator declarations.
// Keep in sync with the exports and shapes in test-audit-inventory.mjs.

export interface InventoryRow {
  id: string;
  name: string;
  file: string;
  layer: string;
  framework: string;
  line: number | null;
  decision: string;
  target: string;
  dupeOf: string;
}

export interface InventoryObject {
  schema: {
    $id: string;
    description: string;
    fields: Record<string, string>;
    generated: boolean;
  };
  generated: boolean;
  groups: unknown[];
  rows: InventoryRow[];
}

export interface BundleSet {
  frontend: InventoryRow[];
  conformance: InventoryRow[];
  tooling: InventoryRow[];
  ada: InventoryRow[];
  proof: InventoryRow[];
}

export interface GenerateResult {
  output: string;
  rowCount: number;
}

export const conformanceDir: string;
export const repoRoot: string;
export const LAYERS: string[];

export function defaultOutputPath(): string;
export function usage(): string;
export function parseArgs(argv?: string[]): { output: string; help: boolean };
export function deriveLayer(relPath: string): string;
export function slugify(s: string): string;
export function conformanceIdFromName(name: string): string | null;
export function idForVitest(name: string, relFile: string): string;
export function collapseAssertLabel(inner: string): string;
export function parseAdaAsserts(
  sourceText: string,
): Array<{ line: number; endLine: number; label: string }>;
export function parseProofFamilies(sourceText: string): Array<{ name: string; line: number }>;
export function packageOfSpec(sourceText: string): string | null;
export function blankRow(): { decision: string; target: string; dupeOf: string };
export function makeVitestRow(args: { id: string; name: string; relFile: string; line?: number | null }): InventoryRow;
export function makeAdaRow(args: { line: number; label: string; relFile: string }): InventoryRow;
export function makeProofRow(args: {
  subprogram: string;
  pkg: string;
  line: number;
  relFile: string;
}): InventoryRow;
export function rowsFromVitestList(
  rows: Array<{ name: string; file: string }>,
  opts: { repoRelativeFile: (abs: string) => string },
): InventoryRow[];
export function compareRows(a: InventoryRow, b: InventoryRow): number;
export function sortRows(rows: InventoryRow[]): InventoryRow[];
export function collect(repoRootDir?: string): Promise<BundleSet>;
export function assemble(bundles: BundleSet): InventoryObject;
export function writeInventory(inventory: InventoryObject, outputPath: string): Promise<string>;
export function generate(opts?: { output?: string }): Promise<GenerateResult>;
export function main(argv?: string[]): Promise<GenerateResult | { help: boolean }>;
