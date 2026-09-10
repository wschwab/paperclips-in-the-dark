import { copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { applyCatalogMutation } from "../scripts/mutation-harness.mjs";

async function mutatedSource(id: string, relative: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "pitd-read-retarget-"));
  try {
    const file = join(root, relative);
    await mkdir(dirname(file), { recursive: true });
    await copyFile(resolve(import.meta.dirname, "../..", relative), file);
    applyCatalogMutation(id, root);
    return await readFile(file, "utf8");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("read-performance mutation anchors", () => {
  it("[MUT-READ-001] M04 truncates the live unknown-removal collector, not dictionary keys", async () => {
    const source = await mutatedSource("M04", "backend-ada/server/src/pitd_normalize.adb");
    const collector = source.match(/function Collect_Removal_Keys[\s\S]*?end Collect_Removal_Keys;/)?.[0];
    expect(collector).toContain("MUTANT M04");
    expect(source.match(/function Collect_Keys[\s\S]*?end Collect_Keys;/)?.[0]).not.toContain("MUTANT M04");
  });

  it("[MUT-READ-002] M06 still inserts a forbidden write after the single stored parse", async () => {
    const source = await mutatedSource("M06", "backend-ada/server/src/pitd_stored.adb");
    expect(source).toMatch(/E := Read \(Bytes\);\s+Set_Field \(E, "revision", Int_Field \(E, "revision"\) \+ 1\);\s+Write_Entity \(Kind, Id, E\);/);
    expect(source).toContain("Ctx := Pitd_Normalize.Canonicalize (Kind, Id, E);");
  });
});
