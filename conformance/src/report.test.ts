import { describe, expect, it } from "vitest";
import { normalizeVitestJson } from "./report.js";

describe("stable conformance report", () => {
  it("[TOOLING-REPORT-001] normalizes Vitest results into sorted stable IDs", () => {
    const report = normalizeVitestJson(
      {
        testResults: [
          {
            name: "suites/semantics/bounded-integer.test.ts",
            assertionResults: [
              {
                ancestorTitles: ["BoundedInteger"],
                title: "[SEMANTICS-BOUNDED-INTEGER-002] clamps below zero",
                fullName:
                  "BoundedInteger [SEMANTICS-BOUNDED-INTEGER-002] clamps below zero",
                status: "failed",
                duration: 3,
                failureMessages: ["connection refused"],
              },
              {
                ancestorTitles: ["BoundedInteger"],
                title: "[SEMANTICS-BOUNDED-INTEGER-001] clamps above max",
                fullName:
                  "BoundedInteger [SEMANTICS-BOUNDED-INTEGER-001] clamps above max",
                status: "passed",
                duration: 2,
                failureMessages: [],
              },
            ],
          },
        ],
      },
      "http://localhost:1",
    );

    expect(report.schemaVersion).toBe(1);
    expect(report.against).toBe("http://localhost:1");
    expect(report.results.map((result) => result.id)).toEqual([
      "SEMANTICS-BOUNDED-INTEGER-001",
      "SEMANTICS-BOUNDED-INTEGER-002",
    ]);
    expect(report.summary).toEqual({
      total: 2,
      passed: 1,
      failed: 1,
      skipped: 0,
      todo: 0,
    });
  });
});
