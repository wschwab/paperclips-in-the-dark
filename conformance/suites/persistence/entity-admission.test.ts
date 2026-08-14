import { describe, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { api, type HttpResponse } from "../../src/api.js";
import { decode, Schemas } from "../../src/schemas.js";
import { testCase } from "../../src/test-case.js";
import { BLADES } from "../../src/suite-helpers.js";
import { firstPlaybook } from "../../src/game-data.js";

// SC-O2 recursive admission oracle (frozen Wave 2 contract).  The seeded
// degraded files under conformance/fixtures/sc-o2-seeds/ land in the launcher
// data dir before the server starts; the server would never write these
// shapes itself.  Each case freezes one defect class of the SC-R0 matrix
// (docs/pages/contract/wave0/canonicalization-matrix.mdx, D1-D10) on the
// direct-access/history/mutation/import surface.

const TRUNCATED = "11111111-1111-4111-8111-111111111111"; // D10 truncated JSON
const INVALID_UTF8 = "12121212-1212-4212-8212-121212121212"; // D10 invalid UTF-8
const ARRAY_ROOT = "22222222-2222-4222-8222-222222222222"; // D9 non-object root
const TOP_LEVEL_KEY = "33333333-3333-4333-8333-333333333333"; // D6 top-level unknown key
const NESTED_KEY = "44444444-4444-4444-8444-444444444444"; // D6 nested unknown key
const MISSING_NESTED = "55555555-5555-4555-8555-555555555555"; // D1 missing nested required
const WRONG_TYPE = "66666666-6666-4666-8666-666666666666"; // D3 wrong type at depth
const BAD_ENUM = "77777777-7777-4777-8777-777777777777"; // D4 invalid enum at depth
const OUT_OF_BOUND = "88888888-8888-4888-8888-888888888888"; // D5 bound violation at depth
const IDENTITY_MISMATCH = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; // D8 body/route mismatch
const REV_ZERO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"; // revision < 1
const FMT_TWO = "99999999-9999-4999-8999-999999999999"; // formatVersion != 1

let cachedDataDir: string | undefined;
async function dataDir(): Promise<string> {
  cachedDataDir ??= (await api.health()).dataDir;
  return cachedDataDir;
}

async function fileSha256(kind: string, id: string): Promise<string> {
  const dir = await dataDir();
  const bytes = readFileSync(join(dir, `${kind}s`, id, "current.json"));
  return createHash("sha256").update(bytes).digest("hex");
}

/** Assert the frozen direct-access failure shape: 422 INVALID_ENTITY. */
async function expectInvalidEntity(response: HttpResponse): Promise<void> {
  expect(response.status).toBe(422);
  const result = await api.operation(response);
  expect(result.ok).toBe(false);
  expect(result.error?.code).toBe("INVALID_ENTITY");
}

describe("persistence entity admission (SC-O2 recursive admission)", () => {
  testCase(
    "ADMIT-PARSE-001",
    "unparseable stored bytes (truncated JSON, invalid UTF-8) fail direct GET with 422 INVALID_ENTITY and stay byte-identical",
    async () => {
      for (const id of [TRUNCATED, INVALID_UTF8]) {
        const before = await fileSha256("character", id);
        await expectInvalidEntity(await api.get(`characters/${id}`));
        // reads never write: the raw bytes are untouched (checksum guard)
        expect(await fileSha256("character", id)).toBe(before);
      }
    },
  );

  testCase(
    "ADMIT-ROOT-002",
    "a non-object stored root (array) fails direct GET with 422 INVALID_ENTITY while collections stay 200",
    async () => {
      await expectInvalidEntity(await api.get(`characters/${ARRAY_ROOT}`));
      const list = await api.get("characters");
      expect(list.status).toBe(200);
    },
  );

  testCase(
    "ADMIT-KEY-003",
    "an undeclared top-level key fails admission with 422 INVALID_ENTITY, never writes, and collections stay 200",
    async () => {
      const before = await fileSha256("character", TOP_LEVEL_KEY);
      await expectInvalidEntity(await api.get(`characters/${TOP_LEVEL_KEY}`));
      expect(await fileSha256("character", TOP_LEVEL_KEY)).toBe(before);
      const roster = await api.get("campaign/roster");
      expect(roster.status).toBe(200);
    },
  );

  testCase(
    "ADMIT-KEY-004",
    "an undeclared NESTED key fails admission with 422 INVALID_ENTITY (recursive, not top-level-only) and never writes",
    async () => {
      const before = await fileSha256("character", NESTED_KEY);
      await expectInvalidEntity(await api.get(`characters/${NESTED_KEY}`));
      expect(await fileSha256("character", NESTED_KEY)).toBe(before);
    },
  );

  testCase(
    "ADMIT-REQUIRED-005",
    "a missing nested required property fails admission with 422 INVALID_ENTITY and never writes",
    async () => {
      const before = await fileSha256("character", MISSING_NESTED);
      await expectInvalidEntity(await api.get(`characters/${MISSING_NESTED}`));
      expect(await fileSha256("character", MISSING_NESTED)).toBe(before);
    },
  );

  testCase(
    "ADMIT-TYPE-006",
    "a wrong primitive type at depth fails admission with 422 INVALID_ENTITY and never writes",
    async () => {
      const before = await fileSha256("character", WRONG_TYPE);
      await expectInvalidEntity(await api.get(`characters/${WRONG_TYPE}`));
      expect(await fileSha256("character", WRONG_TYPE)).toBe(before);
    },
  );

  testCase(
    "ADMIT-ENUM-007",
    "an invalid enum value at depth fails admission with 422 INVALID_ENTITY and never writes",
    async () => {
      const before = await fileSha256("character", BAD_ENUM);
      await expectInvalidEntity(await api.get(`characters/${BAD_ENUM}`));
      expect(await fileSha256("character", BAD_ENUM)).toBe(before);
    },
  );

  testCase(
    "ADMIT-BOUND-008",
    "an out-of-bound number at depth fails admission with 422 INVALID_ENTITY and never writes",
    async () => {
      const before = await fileSha256("character", OUT_OF_BOUND);
      await expectInvalidEntity(await api.get(`characters/${OUT_OF_BOUND}`));
      expect(await fileSha256("character", OUT_OF_BOUND)).toBe(before);
    },
  );

  testCase(
    "ADMIT-IDENTITY-009",
    "a body whose kind/id contradicts its route fails direct GET with 422 and the roster row keeps the route-derived identity",
    async () => {
      // The seeded bytes under characters/<route-id>/ are a full crew body:
      // route identity (Q15) is authoritative.
      await expectInvalidEntity(await api.get(`characters/${IDENTITY_MISMATCH}`));
      const roster = await decode(Schemas.Roster, (await api.get("campaign/roster")).body);
      const row = roster.characters.find((c) => c.id === IDENTITY_MISMATCH);
      expect(row).toBeDefined();
      expect(roster.crews.some((c) => c.id === IDENTITY_MISMATCH)).toBe(false);
      expect(row?.isReadable).toBe(false);
    },
  );

  testCase(
    "ADMIT-REVISION-010",
    "revision below 1 and a formatVersion mismatch both fail admission with 422 INVALID_ENTITY and never write",
    async () => {
      for (const id of [REV_ZERO, FMT_TWO]) {
        const before = await fileSha256("character", id);
        await expectInvalidEntity(await api.get(`characters/${id}`));
        expect(await fileSha256("character", id)).toBe(before);
      }
    },
  );

  testCase(
    "ADMIT-HISTORY-011",
    "history reads of a degraded entity fail with 422 INVALID_ENTITY",
    async () => {
      await expectInvalidEntity(await api.get(`characters/${TRUNCATED}/history`));
    },
  );

  testCase(
    "ADMIT-MUTATION-012",
    "mutations on a degraded entity fail with 422 INVALID_ENTITY and never write",
    async () => {
      const before = await fileSha256("character", TRUNCATED);
      const response = await api.post(
        `characters/${TRUNCATED}/ops/note.add`,
        { text: "must not land on a degraded entity" },
        { "If-Match": "1" },
      );
      expect(response.status).toBe(422);
      const result = await api.operation(response);
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("INVALID_ENTITY");
      expect(await fileSha256("character", TRUNCATED)).toBe(before);
    },
  );

  testCase(
    "ADMIT-IMPORT-013",
    "importing an entity that fails admission returns 400 INVALID_ENTRY with pointer-level details",
    async () => {
      // Raw create (no DTO decode): the current server's create response
      // lacks the frozen SC-R5 lifecycle fields (separate known lag).
      const created = await api.post("characters", { gameStem: BLADES, playbook: firstPlaybook(BLADES) });
      expect(created.status).toBe(200);
      const createdBody = created.body as { character?: { id?: string; revision?: number } };
      if (!createdBody.character?.id) throw new Error("import target creation returned no id");
      const targetId = createdBody.character.id;
      const targetRevision = createdBody.character.revision ?? 1;
      // Dynamic JSON import: tsconfig has no resolveJsonModule, so static
      // JSON imports are not type-checkable; this is the suite convention
      // (see persistence/import-history.test.ts).
      const body = (await import("../../fixtures/golden-character.json", { with: { type: "json" } }))
        .default as Record<string, unknown>;
      // full canonical body with one genuinely uncoercible wrong-type
      // pointer at depth, sent in the frozen {entity, ...} import envelope
      // (ImportRequest: required [entity], additionalProperties false).
      // D3: object → scalar cannot be converted (a numeric 42 would be a
      // lossless number→string coercion, so it is NOT a defect — the
      // counterexample must pick the uncoercible direction).
      const imported = {
        ...body,
        id: targetId,
        kind: "character",
        revision: targetRevision,
        dossier: { ...(body.dossier as Record<string, unknown>), name: { uncoercible: true } },
      };
      // Contract apply sequence: preview first — the uncoercible dossier.name
      // is classified as a needs-input pointer (D3), so the frozen preview
      // returns 409 NORMALIZATION_REQUIRED with the preview token; the apply
      // without caller values for that pointer then fails admission with
      // 400 INVALID_ENTRY. RED today: no preview machinery — the
      // contract-shaped envelope is rejected with 400 VALIDATION at the
      // preview (and NORMALIZATION_REQUIRED 409 is absent), so the flow
      // stops here; the /dossier/name pointer assertion below is reached
      // when the preview lands.
      const preview = await api.post(`characters/${targetId}/import?preview=1`, { entity: imported });
      expect(preview.status).toBe(409);
      const previewBody = JSON.parse(preview.rawBody) as {
        error?: { code?: string; token?: string; details?: { previewToken?: string } };
      };
      expect(previewBody.error?.code).toBe("NORMALIZATION_REQUIRED");
      const previewToken = previewBody.error?.token ?? previewBody.error?.details?.previewToken;
      expect(previewToken).toBeTruthy();
      const response = await api.post(
        `characters/${targetId}/import`,
        { entity: imported, previewToken: previewToken ?? "preview-token", confirm: true },
        { "If-Match": String(targetRevision) },
      );
      expect(response.status).toBe(400);
      const result = await api.operation(response);
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("INVALID_ENTRY");
      expect(result.error?.details.issues.length).toBeGreaterThan(0);
      expect(result.error?.details.issues[0]?.pointer).toBe("/dossier/name");
      // red today: no envelope/INVALID_ENTRY machinery — the server validates
      // the raw body as the entity, so the contract-shaped request fails with
      // generic 400 VALIDATION instead of pointer-level INVALID_ENTRY.
    },
  );

  testCase(
    "ADMIT-CONTROLS-014",
    "control: valid canonical character, crew (empty contacts/factions), and clock pass admission untouched",
    async () => {
      // Raw assertions rather than full DTO decode: the current server does
      // not yet emit the frozen SC-R5 lifecycle fields (traumaPending,
      // isOutOfAction, stressClearPending) on create, a separate known
      // server-lag red; admission itself must stay green here.
      const created = await api.post("characters", { gameStem: BLADES, playbook: firstPlaybook(BLADES) });
      expect(created.status).toBe(200);
      const createdBody = created.body as { ok?: boolean; character?: { id?: string; dossier?: { crewId?: string } } };
      expect(createdBody.ok).toBe(true);
      if (!createdBody.character?.id) throw new Error("control character creation returned no id");
      expect(createdBody.character.dossier?.crewId).toBe("");
      const characterGet = await api.get(`characters/${createdBody.character.id}`);
      expect(characterGet.status).toBe(200);
      expect((characterGet.body as { dossier?: { crewId?: string } }).dossier?.crewId).toBe("");

      const crewCreated = await api.post("crews", { gameStem: BLADES, crewType: "Assassins" });
      expect(crewCreated.status).toBe(200);
      const crewCreatedBody = crewCreated.body as {
        ok?: boolean;
        crew?: { id?: string; contacts?: unknown[]; factions?: unknown[] };
      };
      expect(crewCreatedBody.ok).toBe(true);
      expect(crewCreatedBody.crew?.contacts).toEqual([]);
      expect(crewCreatedBody.crew?.factions).toEqual([]);
      if (!crewCreatedBody.crew?.id) throw new Error("control crew creation returned no id");
      const crewGet = await api.get(`crews/${crewCreatedBody.crew.id}`);
      expect(crewGet.status).toBe(200);

      // Clock create uses the frozen request shape (SC-A7); the created
      // clock must pass admission untouched (ADMIT-CONTROLS-014).
      const clockCreated = await api.createClock("SC-O2 control clock", "bounded", 4);
      expect(clockCreated.ok).toBe(true);
      if (!clockCreated.clock?.id) throw new Error("control clock creation returned no id");
      const clockGet = await api.get(`clocks/${clockCreated.clock.id}`);
      expect(clockGet.status).toBe(200);
      // seeded frozen-shape clock passes admission untouched (direct GET 200)
      const seededClockGet = await api.get("clocks/babababa-baba-4bab-8bab-babababababa");
      expect(seededClockGet.status).toBe(200);
    },
  );
});
