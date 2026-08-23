import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// SC-C5 tooling tests: generator determinism/idempotency (run twice, zero-byte
// diff), regeneration parity with the committed artifacts (no hand-edited
// drift), and operation capability manifest completeness (every operationId
// has exactly one disposition).
// ---------------------------------------------------------------------------

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const execFileAsync = (
  file: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> =>
  new Promise((resolvePromise, rejectPromise) => {
    execFile(
      file,
      args,
      { cwd: repoRoot, timeout: 60_000 },
      (error, stdout, stderr) => {
        if (error) rejectPromise(error);
        else resolvePromise({ stdout, stderr });
      },
    );
  });

const runGenerator = (script: string, args: string[] = []) =>
  execFileAsync(process.execPath, [resolve(repoRoot, "skill", script), ...args]);

const runContractCoverageGenerator = (out: string) =>
  execFileAsync(
    resolve(repoRoot, "conformance/node_modules/.bin/tsx"),
    [resolve(repoRoot, "conformance/scripts/generate-contract-coverage.mts"), "--out", out],
  );

const tmpDir = () => mkdtemp(join(tmpdir(), "sc-c5-generators-"));

describe("SC-C5 generators", () => {
  it("[TOOLING-GEN-001] completeness module regenerates byte-identically and idempotently", async () => {
    const dir = await tmpDir();
    const first = join(dir, "completeness.ts");
    const second = join(dir, "completeness-2.ts");
    await runGenerator("generate-completeness.mjs", ["--out", first]);
    await runGenerator("generate-completeness.mjs", ["--out", second]);

    const [a, b, committed] = await Promise.all([
      readFile(first, "utf8"),
      readFile(second, "utf8"),
      readFile(join(repoRoot, "frontend/src/schema/generated/completeness.ts"), "utf8"),
    ]);
    expect(b).toBe(a); // second run changes zero bytes
    expect(committed).toBe(a); // committed artifact matches regeneration
  });

  it("[TOOLING-GEN-002] API reference regenerates byte-identically with all SC-C5 sections", async () => {
    const dir = await tmpDir();
    const firstDir = join(dir, "ref-1");
    const secondDir = join(dir, "ref-2");
    await runGenerator("generate-api-reference.mjs", ["--out", firstDir]);
    await runGenerator("generate-api-reference.mjs", ["--out", secondDir]);

    const [a, b, committed] = await Promise.all([
      readFile(join(firstDir, "README.md"), "utf8"),
      readFile(join(secondDir, "README.md"), "utf8"),
      readFile(join(repoRoot, "skill/api-reference/README.md"), "utf8"),
    ]);
    expect(b).toBe(a); // second run changes zero bytes
    expect(committed).toBe(a); // committed artifact matches regeneration

    // The SC-C5 sections must exist in the generated reference.
    expect(a).toContain("## Completeness predicates");
    expect(a).toContain("## Capability endpoints");
    expect(a).toContain("## Recovery instructions and typed error codes");
    expect(a).toContain("## Lifecycle attention codes");
  });

  it("[TOOLING-GEN-003] capability manifest regenerates byte-identically and covers every operationId", async () => {
    const dir = await tmpDir();
    const first = join(dir, "capability-manifest.json");
    const second = join(dir, "capability-manifest-2.json");
    await runGenerator("generate-capability-manifest.mjs", ["--out", first]);
    await runGenerator("generate-capability-manifest.mjs", ["--out", second]);

    const [a, b, committedText] = await Promise.all([
      readFile(first, "utf8"),
      readFile(second, "utf8"),
      readFile(join(repoRoot, "skill/api-reference/capability-manifest.json"), "utf8"),
    ]);
    expect(b).toBe(a); // second run changes zero bytes
    expect(committedText).toBe(a); // committed artifact matches regeneration

    // Enumerate operationIds with the generator's own parser (single source).
    const { stdout } = await runGenerator("generate-capability-manifest.mjs", [
      "--list-operation-ids",
    ]);
    const operationIds = stdout.trim().split("\n").filter(Boolean);

    interface ManifestDisposition {
      disposition: "agent" | "human" | "exempt";
      method: string;
      path: string;
      agentReference: string;
      summary: string;
      categories?: string[];
      humanControl?: string;
      flagged?: boolean;
    }
    interface CapabilityManifest {
      schemaVersion: number;
      operationCount: number;
      dispositions: Record<string, ManifestDisposition>;
      approvedExemptions: Array<{ operationId: string; reason: string }>;
      flaggedCandidates: string[];
    }
    const manifest = JSON.parse(a) as CapabilityManifest;
    expect(manifest.operationCount).toBe(operationIds.length);
    expect(Object.keys(manifest.dispositions).length).toBe(operationIds.length);

    // Every operationId has exactly one disposition, and no extras.
    for (const id of operationIds) {
      const entry = manifest.dispositions[id];
      expect(entry, `operationId ${id} has a disposition`).toBeDefined();
      expect(["agent", "human", "exempt"]).toContain(entry.disposition);
    }
    for (const id of Object.keys(manifest.dispositions)) {
      expect(operationIds, `disposition key ${id} is a real operationId`).toContain(id);
    }

    // Human dispositions must carry the reachable-control requirement.
    for (const [id, entry] of Object.entries(manifest.dispositions)) {
      if (entry.disposition !== "human") continue;
      expect(entry.humanControl, `${id} humanControl`).toBeDefined();
      expect(entry.humanControl!.length).toBeGreaterThan(0);
      expect(Array.isArray(entry.categories)).toBe(true);
    }

    // Exemptions require explicit contract-author approval; default is none.
    expect(Array.isArray(manifest.approvedExemptions)).toBe(true);
    for (const [id, entry] of Object.entries(manifest.dispositions)) {
      if (entry.disposition !== "exempt") continue;
      const approval = manifest.approvedExemptions.find(
        (record) => record.operationId === id,
      );
      expect(approval, `exempt ${id} has an approval record`).toBeDefined();
      expect(typeof approval!.reason).toBe("string");
    }

    // Flagged candidates are declared and consistent.
    for (const id of manifest.flaggedCandidates) {
      expect(manifest.dispositions[id].flagged).toBe(true);
    }
  });

  it("[TOOLING-GEN-004] Ada validator metadata regenerates byte-identically and idempotently", async () => {
    const dir = await tmpDir();
    const firstDir = join(dir, "ada-1");
    const secondDir = join(dir, "ada-2");
    await runGenerator("generate-ada-validators.mjs", ["--out", firstDir]);
    await runGenerator("generate-ada-validators.mjs", ["--out", secondDir]);

    const committedDir = join(repoRoot, "backend-ada/server/src/generated");
    for (const file of ["pitd_schema_validators.ads", "pitd_schema_validators.adb"]) {
      const [a, b, committed] = await Promise.all([
        readFile(join(firstDir, file), "utf8"),
        readFile(join(secondDir, file), "utf8"),
        readFile(join(committedDir, file), "utf8"),
      ]);
      expect(b, `${file} second run`).toBe(a);
      expect(committed, `${file} committed`).toBe(a);
    }
  });

  it("[ORACLE-01] contract coverage is deterministic, current, and complete", async () => {
    const dir = await tmpDir();
    const first = join(dir, "contract-coverage.json");
    const second = join(dir, "contract-coverage-2.json");
    await runContractCoverageGenerator(first);
    await runContractCoverageGenerator(second);

    const [a, b, committedText, contractText] = await Promise.all([
      readFile(first),
      readFile(second),
      readFile(join(repoRoot, "conformance/generated/contract-coverage.json")),
      readFile(join(repoRoot, "contract/openapi.yaml"), "utf8"),
    ]);
    expect(b).toEqual(a);
    expect(committedText).toEqual(a);

    const artifact = JSON.parse(a.toString()) as {
      rows: Array<{
        operationId: string;
        method: string;
        path: string;
        status: string;
        kind: string;
      }>;
    };
    expect(Array.isArray(artifact.rows)).toBe(true);

    const yaml = await import("yaml");
    const contract = yaml.parse(contractText) as {
      paths: Record<string, Record<string, {
        operationId?: string;
        responses?: Record<string, unknown>;
      }>>;
    };
    const expected = Object.entries(contract.paths).flatMap(([path, item]) =>
      Object.entries(item)
        .filter(([method]) => ["get", "post", "put", "patch", "delete", "options", "head", "trace"].includes(method))
        .flatMap(([method, operation]) =>
          Object.keys(operation.responses ?? {}).map((status) => `${operation.operationId}:${method.toUpperCase()}:${path}:${status}`),
        ),
    );
    const actual = artifact.rows.map((row) => `${row.operationId}:${row.method}:${row.path}:${row.status}`);
    expect(new Set(actual).size).toBe(actual.length);
    expect(actual.sort()).toEqual(expected.sort());

    for (const row of artifact.rows) {
      expect(row.operationId).toEqual(expect.any(String));
      expect(row.method).toMatch(/^[A-Z]+$/);
      expect(row.path).toEqual(expect.any(String));
      expect(row.status).toEqual(expect.any(String));
      expect(row.kind).toEqual(expect.any(String));
    }
    expect(artifact.rows.every((row) => ["schema", "inline", "no-body"].includes(row.kind))).toBe(true);
    expect(artifact.rows.some((row) => row.kind === "unresolved")).toBe(false);
  });
});
