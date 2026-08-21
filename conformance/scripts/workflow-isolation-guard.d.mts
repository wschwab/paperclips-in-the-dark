// Type declarations for the OPT-010 workflow-isolation guard
// (scripts/workflow-isolation-guard.mjs), consumed by the tooling tests in src/.

export interface CheckResult {
  ok: boolean;
  reason: string;
}

export function checkCommand(args: string[], options?: { manual?: boolean }): CheckResult;

export function parseArgs(argv: string[]): {
  help?: boolean;
  manual?: boolean;
  checkCommand?: string;
  child?: string[];
};

export function usage(): string;

export function main(argv?: string[]): Promise<number>;
