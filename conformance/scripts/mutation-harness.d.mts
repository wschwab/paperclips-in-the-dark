export type TestStatus = "passed" | "failed";
export type RunState =
  | "completed"
  | "setup-failure"
  | "timeout"
  | "compile-failure"
  | "test-failure"
  | "harness-error";

export interface TestResult {
  id: string;
  status: TestStatus;
}

export interface MutationEdit {
  file: string;
  symbol: string;
  search: string;
  replacement: string;
}

export interface Mutant {
  id: string;
  expectedFailureIds: string[];
  edits: MutationEdit[];
}

export interface RunResult {
  state: RunState;
  tests: TestResult[];
}

export interface Classification {
  state: RunState | "killed" | "survived";
  killed: boolean;
  newFailureIds: string[];
}

export function applyVerifiedEdits(repoRoot: string, edits: MutationEdit[]): Promise<Array<{
  path: string;
  bytes: Buffer;
  hash: string;
  regions: Array<{ symbol: string; offset: number }>;
}>>;

export function applyCatalogMutation(id: string, repoRoot: string): {
  files: string[];
  description: string;
};

export function classifyMutant(input: {
  baseline: TestResult[];
  mutant: TestResult[];
  expectedFailureIds: string[];
  runState: RunState;
}): Classification;

export function executeMutant(input: {
  repoRoot: string;
  mutant: Mutant;
  baselineTests: TestResult[];
  runMutant: () => Promise<RunResult>;
}): Promise<Classification & { restored: boolean; error?: string }>;

export function executeCampaign(input: {
  mutants: Mutant[];
  runBaseline: () => Promise<RunResult>;
  runMutant: (mutant: Mutant) => Promise<RunResult>;
  onApply?: (mutant: Mutant) => Promise<void>;
  repoRoot?: string;
}): Promise<Array<Classification & { restored: boolean; error?: string }>>;

export function writeMutationArtifact(input: {
  mode: "full" | "targeted";
  fullPath: string;
  diagnosticsDir: string;
  runId: string;
  artifact: unknown;
}): Promise<string>;

export function main(): void;
