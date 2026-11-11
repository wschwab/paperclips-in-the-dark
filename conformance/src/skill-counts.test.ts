import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// BUGFIX-1111 item 7 — skill/SKILL.md's operation counts were stale (86 of
// 110) while the generated reference reported 121 operations. The counts are
// now derived here from the generated artifacts, so they cannot drift again
// without failing this test.
// ---------------------------------------------------------------------------

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("BUGFIX-1111 skill reference counts", () => {
  it("[TOOLING-SKILL-001] SKILL.md operation counts match the generated reference and manifest", async () => {
    const [manifestText, reference, skill] = await Promise.all([
      readFile(join(repoRoot, "skill/api-reference/capability-manifest.json"), "utf8"),
      readFile(join(repoRoot, "skill/api-reference/README.md"), "utf8"),
      readFile(join(repoRoot, "skill/SKILL.md"), "utf8"),
    ]);

    const manifest = JSON.parse(manifestText) as {
      operationCount: number;
      dispositions: Record<string, { disposition: "agent" | "human" | "exempt" }>;
    };
    const counted = { agent: 0, human: 0, exempt: 0 };
    for (const entry of Object.values(manifest.dispositions)) counted[entry.disposition] += 1;

    // The generated reference states the same total the manifest enumerates.
    const referenceTotal = Number(/^Operations: (\d+)$/m.exec(reference)?.[1]);
    expect(referenceTotal).toBe(manifest.operationCount);
    expect(Object.keys(manifest.dispositions)).toHaveLength(manifest.operationCount);
    expect(counted.agent + counted.human + counted.exempt).toBe(manifest.operationCount);

    // SKILL.md states each disposition's share of that same total.
    for (const disposition of ["agent", "human"] as const) {
      const match = new RegExp(`\`${disposition}\`[^\\n]*?(\\d+) of (\\d+)`).exec(skill);
      expect(match, `SKILL.md states the ${disposition} operation count`).not.toBeNull();
      expect(
        { count: Number(match?.[1]), total: Number(match?.[2]) },
        `SKILL.md ${disposition} count is derived from the generated manifest`,
      ).toEqual({ count: counted[disposition], total: referenceTotal });
    }
  });

  it("[TOOLING-SKILL-002] SKILL.md documents every pitd launch flag", async () => {
    const [skill, launcher] = await Promise.all([
      readFile(join(repoRoot, "skill/SKILL.md"), "utf8"),
      readFile(join(repoRoot, "backend-ada/server/src/pitd.adb"), "utf8"),
    ]);
    const flags = [...launcher.matchAll(/Argument \(Position\) = "(--[a-z-]+)"/g)].map((match) => match[1]);
    expect(flags).toEqual(expect.arrayContaining(["--port", "--data", "--static", "--games"]));
    for (const flag of new Set(flags)) {
      // A flag is documented when its name appears in backticks, with or
      // without a value placeholder (`--games <directory>`, `--test-hooks`).
      expect(skill, `SKILL.md documents ${flag}`).toMatch(new RegExp(`\`${flag}(\`| )`));
    }
  });
});
