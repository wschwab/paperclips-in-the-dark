import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { newCharacter } from "../../src/suite-helpers.js";

describe("persistence atomic-write crash hook", () => {
  // Upgrade (persistence.decisions.json): the previous form tolerated every
  // hook/read outcome and could not fail on a real torn write. The upgraded
  // form pins REPAIR-ATOMIC-004's old-or-complete on-disk invariant with
  // fixture setup separated from the assertions.
  testCase("PERSISTENCE-ATOMIC-001", "crash-mid-write never exposes a partial JSON document (old-or-complete bytes on disk)", async () => {
    // Fixture setup — one fresh character through the public API plus the
    // pre-hook on-disk baseline (dataDir revealed via /api/health).
    const character = await newCharacter();
    const { dataDir } = await api.health();
    const currentPath = join(dataDir, "characters", character.id, "current.json");
    const preBytes = await readFile(currentPath);
    const preHash = createHash("sha256").update(preBytes).digest("hex");

    // Exercise — fire the optional crash hook against that entity.
    const hook = await api.post("test-hooks/crash-mid-write", { entity: "character", id: character.id });

    // Assertions — the on-disk document is either still the old bytes or a
    // complete parseable JSON document; a torn write is never observable.
    expect([204, 404, 501]).toContain(hook.status);
    const postBytes = await readFile(currentPath);
    const postHash = createHash("sha256").update(postBytes).digest("hex");
    if (postHash === preHash) return; // old bytes survive: safe half of the invariant
    // Bytes changed: only acceptable when the crash hook actually fired;
    // then they must constitute one complete document.
    expect(hook.status, `bytes changed under a non-firing hook (${hook.status}) for ${character.id}`).toBe(204);
    let parsed: unknown;
    try {
      parsed = JSON.parse(postBytes.toString("utf8"));
    } catch (error) {
      throw new Error(`partial JSON document exposed mid-write for character ${character.id}`, { cause: error });
    }
    expect(parsed, "post-crash document must be a JSON object").toBeTypeOf("object");
  });
});
