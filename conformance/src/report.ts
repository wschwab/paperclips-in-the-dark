export type TestStatus = "passed" | "failed" | "skipped" | "todo";

export interface StableTestResult {
  id: string;
  name: string;
  suite: string;
  status: TestStatus;
  durationMs: number | null;
  error?: string;
}

export interface ConformanceReport {
  schemaVersion: 1;
  against: string;
  results: StableTestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    todo: number;
  };
}

type VitestAssertion = {
  ancestorTitles?: string[];
  title?: string;
  fullName?: string;
  status?: string;
  duration?: number | null;
  failureMessages?: string[];
  failureDetails?: unknown[];
  error?: { message?: string; stack?: string };
};

type VitestFile = {
  name?: string;
  assertionResults?: VitestAssertion[];
};

type VitestJson = { testResults?: VitestFile[] };

const stableIdPattern = /\[([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)\]/;

export function extractStableTestId(name: string): string {
  const match = stableIdPattern.exec(name);
  if (!match) {
    throw new Error(`Test is missing a stable ID: ${name}`);
  }
  return match[1];
}

function statusOf(assertion: VitestAssertion): TestStatus {
  switch (assertion.status) {
    case "passed":
      return "passed";
    case "pending":
    case "skipped":
      return "skipped";
    case "todo":
      return "todo";
    default:
      return "failed";
  }
}

function errorOf(assertion: VitestAssertion): string | undefined {
  const messages = assertion.failureMessages ?? [];
  if (messages.length > 0) return messages.join("\n");
  if (assertion.error?.stack) return assertion.error.stack;
  if (assertion.error?.message) return assertion.error.message;
  if (assertion.failureDetails && assertion.failureDetails.length > 0) {
    return JSON.stringify(assertion.failureDetails);
  }
  return undefined;
}

export function normalizeVitestJson(
  input: VitestJson,
  against = process.env.CONFORMANCE_BASE_URL ?? process.env.BASE_URL ?? "http://localhost:9657",
): ConformanceReport {
  const results: StableTestResult[] = [];
  for (const file of input.testResults ?? []) {
    for (const assertion of file.assertionResults ?? []) {
      const name = assertion.fullName ?? assertion.title ?? "unnamed test";
      const id = extractStableTestId(name);
      const status = statusOf(assertion);
      results.push({
        id,
        name: assertion.fullName ?? assertion.title ?? id,
        suite: file.name ?? assertion.ancestorTitles?.[0] ?? "unknown",
        status,
        durationMs: assertion.duration ?? null,
        ...(status === "failed" && errorOf(assertion)
          ? { error: errorOf(assertion) }
          : {}),
      });
    }
  }

  results.sort((left, right) => left.id.localeCompare(right.id));
  const summary = {
    total: results.length,
    passed: results.filter((result) => result.status === "passed").length,
    failed: results.filter((result) => result.status === "failed").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    todo: results.filter((result) => result.status === "todo").length,
  };
  return { schemaVersion: 1, against, results, summary };
}
