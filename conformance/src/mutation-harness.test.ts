import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyCatalogMutation,
  applyVerifiedEdits,
  classifyMutant,
  executeCampaign,
  executeMutant,
  writeMutationArtifact,
} from "../scripts/mutation-harness.mjs";

const passing = (id: string) => ({ id, status: "passed" as const });
const failing = (id: string) => ({ id, status: "failed" as const });

async function fixtureFile(content = "function target() { return true; }\n") {
  const root = await mkdtemp(join(tmpdir(), "pitd-mutation-"));
  const file = join(root, "target.ts");
  await writeFile(file, content);
  return { root, file };
}

describe("mutation harness methodology", () => {
  it("[MUT-CAL-001] refuses classification when the unmodified baseline is red", async () => {
    let applied = false;
    await expect(executeCampaign({
      mutants: [{ id: "MX", expectedFailureIds: ["EXPECTED"], edits: [] }],
      runBaseline: async () => ({ state: "test-failure", tests: [failing("BASELINE")] }),
      runMutant: async () => ({ state: "completed", tests: [] }),
      onApply: async () => { applied = true; },
    })).rejects.toThrow(/baseline.*green/i);
    expect(applied).toBe(false);
  });

  it("[MUT-CAL-002] rejects an edit whose mutation pattern matches no bytes", async () => {
    const { root, file } = await fixtureFile();
    await expect(applyVerifiedEdits(root, [{
      file: "target.ts", symbol: "target", search: "missing anchor", replacement: "changed",
    }])).rejects.toThrow(/match|anchor/i);
    expect(await readFile(file, "utf8")).toBe("function target() { return true; }\n");
  });

  it("[MUT-CAL-003] rejects a byte-identical replacement before tests run", async () => {
    const { root, file } = await fixtureFile();
    await expect(applyVerifiedEdits(root, [{
      file: "target.ts", symbol: "target", search: "return true", replacement: "return true",
    }])).rejects.toThrow(/identical|changed bytes/i);
    expect(await readFile(file, "utf8")).toBe("function target() { return true; }\n");
  });

  it("[MUT-CAL-004] a mutant producing only the baseline failure set survives", () => {
    expect(classifyMutant({
      baseline: [failing("KNOWN"), passing("EXPECTED")],
      mutant: [failing("KNOWN"), passing("EXPECTED")],
      expectedFailureIds: ["EXPECTED"],
      runState: "test-failure",
    })).toEqual({ state: "survived", killed: false, newFailureIds: [] });
  });

  it("[MUT-CAL-005] a new expected test-ID failure kills the mutant and source restores byte-exactly", async () => {
    const { root, file } = await fixtureFile();
    const before = await readFile(file, "utf8");
    const result = await executeMutant({
      repoRoot: root,
      mutant: {
        id: "MX",
        expectedFailureIds: ["EXPECTED"],
        edits: [{ file: "target.ts", symbol: "target", search: "return true", replacement: "return false" }],
      },
      baselineTests: [passing("EXPECTED")],
      runMutant: async () => {
        expect(await readFile(file, "utf8")).toContain("return false");
        return { state: "test-failure", tests: [failing("EXPECTED")] };
      },
    });
    expect(result.state).toBe("killed");
    expect(result.killed).toBe(true);
    expect(result.newFailureIds).toEqual(["EXPECTED"]);
    expect(await readFile(file, "utf8")).toBe(before);
    expect(result.restored).toBe(true);
  });

  it("[MUT-CAL-006] targeted diagnostics never alter the immutable full artifact", async () => {
    const { root } = await fixtureFile();
    const full = join(root, "mutation-baseline.json");
    const diagnostics = join(root, "diagnostics");
    await writeFile(full, "FULL-IMMUTABLE\n");
    const targetedPath = await writeMutationArtifact({
      mode: "targeted",
      fullPath: full,
      diagnosticsDir: diagnostics,
      runId: "2026-08-23T120000Z",
      artifact: { results: [{ id: "MX", state: "survived" }] },
    });
    expect(await readFile(full, "utf8")).toBe("FULL-IMMUTABLE\n");
    expect(targetedPath).toBe(join(diagnostics, "2026-08-23T120000Z.json"));
    expect(JSON.parse(await readFile(targetedPath, "utf8"))).toEqual({
      results: [{ id: "MX", state: "survived" }],
    });
  });

  it.each(["setup-failure", "timeout", "compile-failure", "test-failure", "harness-error"] as const)(
    "[MUT-CAL-007] preserves the distinct %s state",
    (state) => {
      expect(classifyMutant({
        baseline: [passing("EXPECTED")],
        mutant: [],
        expectedFailureIds: ["EXPECTED"],
        runState: state,
      }).state).toBe(state);
    },
  );
});

  it("[MUT-CAL-008] refreshed M01, M06, and M17 anchors mutate their intended current symbols", async () => {
    const repoRoot = resolve(import.meta.dirname, "../..");
    const targets: Record<string, string> = {
      M01: "backend-ada/server/src/pitd_callback.adb",
      M06: "backend-ada/server/src/pitd_callback.adb",
      M17: "frontend/src/lib/focus.ts",
    };
    for (const [id, relative] of Object.entries(targets)) {
      const root = await mkdtemp(join(tmpdir(), `pitd-${id}-`));
      const copy = join(root, relative);
      await mkdir(dirname(copy), { recursive: true });
      await copyFile(join(repoRoot, relative), copy);
      const before = await readFile(copy);
      const result = applyCatalogMutation(id, root);
      expect(result.files).toEqual([relative]);
      expect(await readFile(copy)).not.toEqual(before);
      expect(result.description).toEqual(expect.any(String));
    }
  });
