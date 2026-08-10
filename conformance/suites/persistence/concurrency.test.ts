import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { newCharacter } from "../../src/suite-helpers.js";

const CONCURRENT_NOTES = 80;

describe("persistence concurrent writes", () => {
  testCase(
    "PERSISTENCE-CONCURRENCY-001",
    "every acknowledged concurrent write survives on the entity",
    async () => {
      const character = await newCharacter();
      const texts = Array.from({ length: CONCURRENT_NOTES }, (_, index) => `concurrent-note-${index}`);
      // Node's undici fetch has a per-origin connection limit; firing all 80
      // at once can surface UND_ERR_SOCKET client-side even when the server
      // handles them (verified 80/80 via curl).  Chunk into waves of 16 —
      // same observable contract: every acknowledged write must survive.
      const responses: Awaited<ReturnType<typeof api.post>>[] = [];
      const WAVE = 16;
      for (let start = 0; start < texts.length; start += WAVE) {
        const wave = texts.slice(start, start + WAVE);
        responses.push(
          ...(await Promise.all(
            wave.map((text) => api.post(`characters/${character.id}/ops/note.add`, { text })),
          )),
        );
      }
      for (const response of responses) {
        expect(response.status).toBe(200);
      }

      const current = await api.character(character.id);
      expect(current.dossier.notes).toHaveLength(CONCURRENT_NOTES);
      expect([...current.dossier.notes].sort()).toEqual([...texts].sort());
      expect(current.revision).toBe(character.revision + CONCURRENT_NOTES);
    },
  );

  testCase(
    "PERSISTENCE-CONCURRENCY-002",
    "a same-revision If-Match race yields one winner and one typed STALE_REVISION with intact JSON",
    async () => {
      const character = await newCharacter();
      const headers = { "If-Match": String(character.revision) };
      const [first, second] = await Promise.all([
        api.post(`characters/${character.id}/ops/note.add`, { text: "race-note" }, headers),
        api.post(`characters/${character.id}/ops/note.add`, { text: "race-note" }, headers),
      ]);
      expect([first.status, second.status].sort()).toEqual([200, 409]);
      for (const response of [first, second]) {
        expect(() => JSON.parse(response.rawBody)).not.toThrow();
      }
      const loser = first.status === 409 ? first : second;
      const loserResult = await api.operation(loser);
      expect(loserResult.ok).toBe(false);
      expect(loserResult.error?.code).toBe("STALE_REVISION");

      const current = await api.character(character.id);
      expect(current.dossier.notes).toEqual(["race-note"]);
    },
  );
});
