import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { BLADES } from "../../src/suite-helpers.js";
import { firstPlaybook } from "../../src/game-data.js";

// AUDIT-0 Wave 2B: unknown-key truncation. The normalization preview must
// list EVERY unknown key as a removal, not just the first 512. The old
// code used a fixed 512-element buffer and silently dropped keys beyond
// that limit. These tests verify that 513 and 600-key objects have ALL
// their unknown keys reported.

/** Extract removal pointers from a preview/normalization response. */
function removalPointers(preview: unknown): string[] {
  const entries: unknown[] = Array.isArray(preview)
    ? preview
    : (preview as { changes?: unknown[] } | null)?.changes ?? [];
  return entries
    .filter(
      (entry): entry is Record<string, unknown> =>
        typeof entry === "object" && entry !== null && "reason" in entry,
    )
    .filter((entry) => String(entry.reason).includes("unknown-key removal"))
    .map((entry) => String(entry.pointer ?? ""));
}

/** Create a character with N unknown top-level keys, return its id. */
async function characterWithUnknownKeys(n: number): Promise<{ id: string; revision: number; keys: string[] }> {
  const response = await api.post("characters", { gameStem: BLADES, playbook: firstPlaybook(BLADES) });
  expect(response.status).toBe(200);
  const body = JSON.parse(response.rawBody) as { ok: boolean; character: { id: string; revision: number } };
  expect(body.ok).toBe(true);

  // Build an entity document with the canonical character shape plus N
  // unknown top-level keys. The import preview must classify each unknown
  // key as a removal.
  const entity = JSON.parse(response.rawBody).character as Record<string, unknown>;
  const keys: string[] = [];
  for (let i = 0; i < n; i++) {
    const key = `unknownKey${String(i).padStart(4, "0")}`;
    entity[key] = `value-${i}`;
    keys.push(key);
  }

  // Preview the import — the canonicalizer will classify the unknown keys
  const preview = await api.post(`characters/${body.character.id}/import?preview=1`, { entity });
  expect(preview.status).toBe(409);
  const previewBody = JSON.parse(preview.rawBody) as {
    error?: { code?: string; preview?: unknown };
  };
  expect(previewBody.error?.code).toBe("NORMALIZATION_REQUIRED");

  return {
    id: body.character.id,
    revision: body.character.revision,
    keys,
    // Return the preview body for the test to inspect
    ...({ preview: previewBody.error?.preview } as Record<string, unknown>),
  };
}

describe("unknown-key boundary (AUDIT-0 Wave 2B)", () => {
  testCase(
    "UNKNOWN-KEY-512",
    "an object with 512 unknown keys lists all 512 as removals",
    async () => {
      const result = await characterWithUnknownKeys(512);
      const preview = (result as { preview?: unknown }).preview;
      const pointers = removalPointers(preview);
      // Every unknown key must appear as a removal pointer
      expect(pointers.length).toBe(512);
      for (const key of result.keys) {
        expect(pointers).toContain(`/${key}`);
      }
    },
  );

  testCase(
    "UNKNOWN-KEY-513",
    "an object with 513 unknown keys lists all 513 as removals (no truncation at 512)",
    async () => {
      const result = await characterWithUnknownKeys(513);
      const preview = (result as { preview?: unknown }).preview;
      const pointers = removalPointers(preview);
      // 513 keys — the 513th must NOT be silently dropped
      expect(pointers.length).toBe(513);
      for (const key of result.keys) {
        expect(pointers).toContain(`/${key}`);
      }
      // Specifically check the last key (the one that would be truncated)
      expect(pointers).toContain(`/unknownKey0512`);
    },
  );

  testCase(
    "UNKNOWN-KEY-600",
    "an object with 600 unknown keys lists all 600 as removals",
    async () => {
      const result = await characterWithUnknownKeys(600);
      const preview = (result as { preview?: unknown }).preview;
      const pointers = removalPointers(preview);
      expect(pointers.length).toBe(600);
      // Check first, last, and the boundary keys
      expect(pointers).toContain(`/unknownKey0000`);
      expect(pointers).toContain(`/unknownKey0512`);
      expect(pointers).toContain(`/unknownKey0599`);
    },
  );
});
