import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { assertResponseValid } from "../../src/schemas.js";
import { testCase } from "../../src/test-case.js";
import { BLADES } from "../../src/suite-helpers.js";
import { firstPlaybook } from "../../src/game-data.js";

const REQUEST_LIMIT = 1_048_576;

interface CharacterSeed {
  id: string;
  revision: number;
  entity: Record<string, unknown>;
}

interface PreviewBody {
  error?: {
    code?: string;
    token?: string;
    details?: { previewToken?: string };
    preview?: unknown;
  };
}

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

async function createCharacter(): Promise<CharacterSeed> {
  const response = await api.post("characters", {
    gameStem: BLADES,
    playbook: firstPlaybook(BLADES),
  });
  expect(response.status).toBe(200);
  assertResponseValid("createCharacter", response.status, response.body);
  const body = response.body as {
    character: Record<string, unknown> & { id: string; revision: number };
  };
  return { id: body.character.id, revision: body.character.revision, entity: body.character };
}

async function previewImport(seed: CharacterSeed): Promise<{
  preview: unknown;
  token: string;
}> {
  const response = await api.post(`characters/${seed.id}/import?preview=1`, {
    entity: seed.entity,
  });
  expect(response.status).toBe(409);
  assertResponseValid("importCharacter", response.status, response.body);
  const body = response.body as PreviewBody;
  expect(body.error?.code).toBe("NORMALIZATION_REQUIRED");
  const token = body.error?.token ?? body.error?.details?.previewToken;
  expect(token).toBeTruthy();
  return { preview: body.error?.preview, token: token ?? "" };
}

function addTopLevelUnknowns(entity: Record<string, unknown>, count: number): string[] {
  const pointers: string[] = [];
  for (let index = 0; index < count; index++) {
    const key = `unknownKey${String(index).padStart(4, "0")}`;
    entity[key] = `value-${index}`;
    pointers.push(`/${key}`);
  }
  return pointers;
}

function expectExactPointerMultiset(actual: string[], expected: string[]): void {
  expect([...actual].sort()).toEqual([...expected].sort());
}

function nestedRecord(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = parent[key];
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`expected ${key} to be an object`);
  }
  return value as Record<string, unknown>;
}

function recordArray(parent: Record<string, unknown>, key: string): Array<Record<string, unknown>> {
  const value = parent[key];
  if (!Array.isArray(value) || value.some((item) => item === null || typeof item !== "object" || Array.isArray(item))) {
    throw new Error(`expected ${key} to be an object array`);
  }
  return value as Array<Record<string, unknown>>;
}

describe("recursive and near-limit unknown-key disclosure (EDGE-01)", () => {
  for (const count of [512, 513, 600]) {
    testCase(
      `UNKNOWN-KEY-${count}`,
      `${count} top-level unknown keys have exact, untruncated removal pointers`,
      async () => {
        const seed = await createCharacter();
        const expected = addTopLevelUnknowns(seed.entity, count);
        const { preview } = await previewImport(seed);
        expectExactPointerMultiset(removalPointers(preview), expected);
      },
    );
  }

  testCase(
    "UNKNOWN-KEY-NEAR-LIMIT-001",
    "a request just below one MiB discloses its unknown-key removal",
    async () => {
      const seed = await createCharacter();
      seed.entity.nearLimitUnknown = "";
      const baseBytes = Buffer.byteLength(JSON.stringify({ entity: seed.entity }));
      seed.entity.nearLimitUnknown = "x".repeat(REQUEST_LIMIT - 512 - baseBytes);
      const requestBytes = Buffer.byteLength(JSON.stringify({ entity: seed.entity }));
      expect(requestBytes).toBeLessThan(REQUEST_LIMIT);
      expect(requestBytes).toBeGreaterThanOrEqual(REQUEST_LIMIT - 1024);
      const { preview } = await previewImport(seed);
      expectExactPointerMultiset(removalPointers(preview), ["/nearLimitUnknown"]);
    },
  );

  testCase(
    "UNKNOWN-KEY-RECURSIVE-001",
    "nested objects and repeated names in multiple array items retain exact pointer multiplicity",
    async () => {
      const seed = await createCharacter();
      nestedRecord(seed.entity, "dossier").repeatedUnknown = "dossier";
      const talent = nestedRecord(seed.entity, "talent");
      const attributes = recordArray(talent, "attributes");
      const firstActions = recordArray(attributes[0]!, "actions");
      const secondActions = recordArray(attributes[1]!, "actions");
      firstActions[0]!.repeatedUnknown = "first";
      secondActions[0]!.repeatedUnknown = "second";
      const expected = [
        "/dossier/repeatedUnknown",
        "/talent/attributes/0/actions/0/repeatedUnknown",
        "/talent/attributes/1/actions/0/repeatedUnknown",
      ];
      const { preview } = await previewImport(seed);
      expectExactPointerMultiset(removalPointers(preview), expected);
    },
  );

  testCase(
    "UNKNOWN-KEY-APPLY-001",
    "confirmed preview apply removes every unknown key and preserves known values",
    async () => {
      const seed = await createCharacter();
      const dossier = nestedRecord(seed.entity, "dossier");
      const knownName = dossier.name;
      dossier.unknownNested = "remove me";
      const expected = addTopLevelUnknowns(seed.entity, 3);
      expected.push("/dossier/unknownNested");
      const { preview, token } = await previewImport(seed);
      expectExactPointerMultiset(removalPointers(preview), expected);

      const apply = await api.post(
        `characters/${seed.id}/import`,
        { entity: seed.entity, previewToken: token, confirm: true },
        { "If-Match": String(seed.revision) },
      );
      expect(apply.status).toBe(200);
      assertResponseValid("importCharacter", apply.status, apply.body);

      const stored = await api.get(`characters/${seed.id}`);
      expect(stored.status).toBe(200);
      assertResponseValid("getCharacter", stored.status, stored.body);
      const document = stored.body as Record<string, unknown>;
      for (const pointer of expected.filter((item) => item.startsWith("/unknownKey"))) {
        expect(document).not.toHaveProperty(pointer.slice(1));
      }
      const storedDossier = nestedRecord(document, "dossier");
      expect(storedDossier).not.toHaveProperty("unknownNested");
      expect(storedDossier.name).toEqual(knownName);
      expect(document.gameStem).toEqual(seed.entity.gameStem);
    },
  );

  testCase(
    "UNKNOWN-KEY-STALE-001",
    "a stale preview token fails without writing its previewed document",
    async () => {
      const seed = await createCharacter();
      seed.entity.staleUnknown = "must never persist";
      const { token } = await previewImport(seed);

      const mutation = await api.post(`characters/${seed.id}/ops/note.add`, { text: "newer state" });
      expect(mutation.status).toBe(200);
      assertResponseValid("noteAdd", mutation.status, mutation.body);
      const current = await api.get(`characters/${seed.id}`);
      expect(current.status).toBe(200);
      assertResponseValid("getCharacter", current.status, current.body);
      const currentBody = structuredClone(current.body);
      const currentRevision = (current.body as { revision: number }).revision;

      const stale = await api.post(
        `characters/${seed.id}/import`,
        { entity: seed.entity, previewToken: token, confirm: true },
        { "If-Match": String(currentRevision) },
      );
      expect(stale.status).toBe(409);
      assertResponseValid("importCharacter", stale.status, stale.body);
      expect((stale.body as { error?: { code?: string } }).error?.code).toBe("STALE_REVISION");

      const after = await api.get(`characters/${seed.id}`);
      expect(after.status).toBe(200);
      assertResponseValid("getCharacter", after.status, after.body);
      expect(after.body).toEqual(currentBody);
      expect(after.body).not.toHaveProperty("staleUnknown");
    },
  );
});
