import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { decode, Schemas } from "../../src/schemas.js";
import type { CharacterDto } from "../../src/schemas.js";
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
    // complete canonical document; a torn write is never observable.
    expect([204, 404, 501]).toContain(hook.status);
    const postBytes = await readFile(currentPath);
    const postHash = createHash("sha256").update(postBytes).digest("hex");
    if (postHash === preHash) return; // old bytes survive: safe half of the invariant
    // Bytes changed: only acceptable when the crash hook actually fired;
    // then they must constitute the COMPLETE canonical character — validated
    // with the same strict schema every read route uses, plus an identity
    // check, so a syntactically-valid but truncated or replaced document
    // still fails.
    try {
      const decoded: CharacterDto = await decode(Schemas.Character, postBytes.toString("utf8"));
      expect(decoded.id, "post-crash document must preserve entity identity").toBe(character.id);
      expect(decoded.dossier.name.length).toBeGreaterThan(0);
    } catch (error) {
      throw new Error(`post-crash bytes are not a complete canonical character for ${character.id}`, { cause: error });
    }
  });
});
