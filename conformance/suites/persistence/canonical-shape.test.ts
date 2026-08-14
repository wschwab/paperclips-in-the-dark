import { describe, expect } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { BLADES } from "../../src/suite-helpers.js";
import { firstPlaybook } from "../../src/game-data.js";

// ---------------------------------------------------------------------------
// SC-O1 canonical-shape oracle (Wave 3).
//
// Freezes the Wave 2 contract rules from spec-change-work-spec.mdx
// "Canonical shape and normalization" + "Degraded entities, collections,
// repair, and deletion" + "Stored-entity classification and HTTP errors",
// cross-checked against the R0 canonicalization matrix (D1-D10, L1-L8).
//
// Setup note: the live Ada server still emits the pre-Wave-2 DTO shapes
// (characters lack traumaPending/isOutOfAction/stressClearPending; clocks
// still use the old clockKind shape), so the shared newCharacter() helper
// (which decodes the response) throws today.  These cases therefore create
// entities through the raw API and assert canonical shape on the SERVER'S RAW
// OUTPUT (JSON.parse of the response body) — never through the tolerant
// conformance decoders, which default the missing canonical fields and
// transform legacy clocks, and would let a legacy response pass the frozen
// shape checks (false green).
// ---------------------------------------------------------------------------

let storageRootCache: string | undefined;

async function storageRoot(): Promise<string> {
  if (storageRootCache === undefined) {
    const health = await api.health();
    storageRootCache = health.dataDir;
  }
  return storageRootCache;
}

/**
 * Seed raw entity bytes at <dataDir>/<kind>s/<id>/current.json (server reads
 * per request). The seeded body MUST carry the same id (and kind) as the
 * route: Q15 makes the route identity authoritative, so a body whose id
 * differs from its directory is itself a D8 identity defect. Pass the
 * identical id used to build the bytes so each degraded fixture tests ONLY
 * its documented defect class.
 */
async function seedEntity(
  kind: "character" | "crew" | "clock",
  bytes: string | Buffer,
  id: string = randomUUID(),
): Promise<{ id: string; path: string }> {
  const dir = join(await storageRoot(), `${kind}s`, id);
  await mkdir(dir, { recursive: true });
  const path = join(dir, "current.json");
  await writeFile(path, bytes);
  return { id, path };
}

async function currentFilePath(kind: "character" | "crew" | "clock", id: string): Promise<string> {
  return join(await storageRoot(), `${kind}s`, id, "current.json");
}

function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/** The degraded-entity If-Match token: sha256:<lowercase hex> of the raw bytes. */
function entityToken(data: string | Buffer): string {
  return `sha256:${sha256Hex(data)}`;
}

/** Create a character through the raw API (no decode — the live shape is not yet total). */
async function createRawCharacter(): Promise<{ id: string; revision: number }> {
  const response = await api.post("characters", { gameStem: BLADES, playbook: firstPlaybook(BLADES) });
  expect(response.status).toBe(200);
  const body = JSON.parse(response.rawBody) as { ok: boolean; character: { id: string; revision: number } };
  expect(body.ok).toBe(true);
  return body.character;
}

async function goldenCharacter(): Promise<Record<string, unknown>> {
  // JSON fixture modules cannot be statically imported: tsconfig has no
  // resolveJsonModule, so the dynamic import-with-attributes form is the
  // repo-wide fixture convention (see import-history.test.ts).
  const fixture = (await import("../../fixtures/golden-character.json", { with: { type: "json" } })).default;
  return JSON.parse(JSON.stringify(fixture)) as Record<string, unknown>;
}

/** Golden character, repairable per L1: notes is the legacy single string. */
async function repairableCharacterBytes(id: string, notes = "legacy note"): Promise<Buffer> {
  const doc = await goldenCharacter();
  doc.id = id;
  (doc.dossier as Record<string, unknown>).notes = notes;
  return Buffer.from(JSON.stringify(doc), "utf8");
}

/** Golden character missing an ordinary FILL property (D1: /dossier/look). */
async function missingLookCharacterBytes(id: string): Promise<Buffer> {
  const doc = await goldenCharacter();
  doc.id = id;
  delete (doc.dossier as Record<string, unknown>).look;
  return Buffer.from(JSON.stringify(doc), "utf8");
}

/** Extract the JSON pointers of a normalization change list, whatever its container shape. */
function changePointers(preview: unknown): string[] {
  const entries: unknown[] = Array.isArray(preview) ? preview : (preview as { changes?: unknown[] } | null)?.changes ?? [];
  return entries
    .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
    .map((entry) => String(entry.pointer ?? ""));
}

describe("canonical shape oracle (SC-O1)", () => {
  testCase(
    "CANON-CREATE-001",
    "create writes every declared key in canonical shape (character, crew, clock)",
    async () => {
      // Raw-body assertions on the server's own output: every declared
      // canonical key PRESENT with its canonical value — no decode tolerance
      // (character.json/crew.json/clock.json all set additionalProperties:
      // false and full required lists, so key presence in the raw body is
      // the observable contract).
      const character = await api.post("characters", { gameStem: BLADES, playbook: firstPlaybook(BLADES) });
      expect(character.status).toBe(200);
      const characterBody = JSON.parse(character.rawBody) as { ok: boolean; character: Record<string, unknown> };
      expect(characterBody.character.kind).toBe("character");
      expect(characterBody.character.formatVersion).toBe(1);
      expect(characterBody.character.isRetired).toBe(false);
      expect(characterBody.character.isDeadish).toBe(false);
      expect(characterBody.character).toHaveProperty("traumaPending", false);
      expect(characterBody.character).toHaveProperty("isOutOfAction", false);
      expect(characterBody.character).toHaveProperty("stressClearPending", false);

      const crew = await api.post("crews", { gameStem: BLADES, crewType: "Assassins" });
      expect(crew.status).toBe(200);
      const crewBody = JSON.parse(crew.rawBody) as { ok: boolean; crew: Record<string, unknown> };
      expect(crewBody.crew.kind).toBe("crew");
      expect(crewBody.crew.formatVersion).toBe(1);
      expect(crewBody.crew).toHaveProperty("contacts");
      expect(crewBody.crew).toHaveProperty("factions");

      const clock = await api.post("clocks", {
        name: "Canonical Clock",
        behavior: "bounded",
        size: 4,
        purpose: "custom",
        ownerKind: "campaign",
        ownerId: "",
        relatedClockIds: [],
      });
      expect(clock.status).toBe(200);
      const clockBody = JSON.parse(clock.rawBody) as { ok: boolean; clock: Record<string, unknown> };
      expect(clockBody.clock.kind).toBe("clock");
      expect(clockBody.clock.formatVersion).toBe(1);
      expect(clockBody.clock).toHaveProperty("behavior");
      expect(clockBody.clock).not.toHaveProperty("clockKind");
      expect(clockBody.clock).toHaveProperty("ownerKind");
      expect(clockBody.clock).toHaveProperty("ownerId");
      expect(clockBody.clock).toHaveProperty("purpose");
      expect(clockBody.clock).toHaveProperty("relatedClockIds");
      // red today (raw-body failures): the create template omits
      // traumaPending/isOutOfAction/stressClearPending (character) and still
      // emits the old clockKind shape with no ownerKind/ownerId/purpose/
      // behavior/relatedClockIds (clock), so the raw key-presence assertions
      // above fail for exactly those missing keys / that old shape.
    },
  );

  testCase(
    "CANON-NULL-002",
    "create rejects an explicit null with 400 VALIDATION; import previews the null-to-default fill (D2)",
    async () => {
      // D2: missing and null are the same defect, and the frozen R0 matrix
      // fixes the CREATE surface at 400 VALIDATION — a null where a value is
      // required is invalid inbound request syntax, never normalized. The
      // frozen create body is exactly {gameStem, playbook}, so the explicit
      // null lands on the required playbook.
      const rejected = await api.post("characters", { gameStem: BLADES, playbook: null });
      expect(rejected.status).toBe(400);
      const rejectedBody = JSON.parse(rejected.rawBody) as { ok: boolean; error: { code: string } };
      expect(rejectedBody.ok).toBe(false);
      expect(rejectedBody.error?.code).toBe("VALIDATION");
      // guard today: the server already rejects nulls in create bodies
      // (400 VALIDATION "field playbook has wrong type").

      // Import is the normalization home for null ("D2: identical to D1" —
      // inbound import preview 409 / apply 200): the preview classifies the
      // null->default fill (warning + change-list entry) and apply stores the
      // filled value — null is never stored.
      const character = await createRawCharacter();
      const path = await currentFilePath("character", character.id);
      const before = sha256Hex(await readFile(path));
      const preview = await api.post(`characters/${character.id}/import?preview=1`, {
        entity: { dossier: { name: null } },
      });
      expect(preview.status).toBe(409);
      const previewBody = JSON.parse(preview.rawBody) as {
        error: {
          code: string;
          token?: string;
          details?: { previewToken?: string; warnings?: string[] };
          preview?: unknown;
        };
      };
      expect(previewBody.error?.code).toBe("NORMALIZATION_REQUIRED");
      expect(previewBody.error?.token).toBeTruthy();
      expect(previewBody.error?.details?.previewToken).toBe(previewBody.error?.token);
      expect(previewBody.error?.details?.warnings?.length ?? 0).toBeGreaterThan(0);
      expect(previewBody.error?.details?.warnings?.some((warning) => /null/i.test(warning))).toBe(true);
      expect(changePointers(previewBody.error?.preview)).toContain("/dossier/name");
      // preview never writes: stored bytes untouched
      expect(sha256Hex(await readFile(path))).toBe(before);

      const apply = await api.post(
        `characters/${character.id}/import`,
        { entity: { dossier: { name: null } }, previewToken: previewBody.error?.token, confirm: true },
        { "If-Match": String(character.revision) },
      );
      expect(apply.status).toBe(200);
      const applyBody = JSON.parse(apply.rawBody) as { ok: boolean; character: { dossier: { name: string } } };
      expect(applyBody.ok).toBe(true);
      expect(applyBody.character.dossier.name).toBe("");
      const stored = JSON.parse(
        (await readFile(await currentFilePath("character", character.id))).toString("utf8"),
      ) as { dossier: { name: unknown } };
      expect(stored.dossier.name).toBe("");
      // red today: no preview machinery exists — the contract-shaped import
      // is rejected 400 VALIDATION (envelope + NORMALIZATION_REQUIRED absent).
    },
  );

  testCase(
    "CANON-IMPORT-003",
    "partial import preview returns 409 NORMALIZATION_REQUIRED with warnings + preview token and writes nothing",
    async () => {
      const character = await createRawCharacter();
      const path = await currentFilePath("character", character.id);
      const before = sha256Hex(await readFile(path));

      const preview = await api.post(`characters/${character.id}/import?preview=1`, {
        entity: { dossier: { name: "Imported Name" } },
      });
      expect(preview.status).toBe(409);
      const body = JSON.parse(preview.rawBody) as {
        error: {
          code: string;
          token?: string;
          details?: { previewToken?: string; warnings?: string[] };
          preview?: unknown;
        };
      };
      expect(body.error?.code).toBe("NORMALIZATION_REQUIRED");
      expect(body.error?.token).toBeTruthy();
      expect(body.error?.details?.previewToken).toBe(body.error?.token);
      expect(Array.isArray(body.error?.details?.warnings)).toBe(true);
      expect(body.error?.details?.warnings?.length ?? 0).toBeGreaterThan(0);
      expect(body.error?.preview).toBeTruthy();
      // preview never writes: stored bytes, revision, history untouched
      expect(sha256Hex(await readFile(path))).toBe(before);
      const history = await api.get(`characters/${character.id}/history`);
      expect(JSON.parse(history.rawBody) as unknown[]).toHaveLength(0);
      // red today: no preview exists — partial import is rejected 400 VALIDATION.
    },
  );

  testCase(
    "CANON-IMPORT-004",
    "confirmed import apply requires If-Match + preview token + confirmation and atomically writes the previewed result",
    async () => {
      const character = await createRawCharacter();
      const preview = await api.post(`characters/${character.id}/import?preview=1`, {
        entity: { dossier: { name: "Imported Name" } },
      });
      expect(preview.status).toBe(409);
      const previewBody = JSON.parse(preview.rawBody) as {
        error: { token?: string; details?: { previewToken?: string } };
      };
      const token = previewBody.error?.token ?? previewBody.error?.details?.previewToken;
      expect(token).toBeTruthy();

      const apply = await api.post(
        `characters/${character.id}/import`,
        { entity: { dossier: { name: "Imported Name" } }, previewToken: token, confirm: true },
        { "If-Match": String(character.revision) },
      );
      expect(apply.status).toBe(200);
      const applyBody = JSON.parse(apply.rawBody) as {
        ok: boolean;
        character: { revision: number; dossier: { name: string } };
      };
      expect(applyBody.ok).toBe(true);
      expect(applyBody.character.revision).toBe(character.revision + 1);
      expect(applyBody.character.dossier.name).toBe("Imported Name");

      // the stored document is exactly the previewed result, served byte-identically
      const stored = await readFile(await currentFilePath("character", character.id));
      const current = await api.get(`characters/${character.id}`);
      expect(current.status).toBe(200);
      expect(Buffer.from(current.rawBody, "utf8")).toEqual(stored); // GET byte-identical to disk
      const currentBody = JSON.parse(current.rawBody) as { dossier: { name: string } };
      expect(currentBody.dossier.name).toBe("Imported Name");

      // atomic: exactly one baseline snapshot
      const history = await api.get(`characters/${character.id}/history`);
      expect(JSON.parse(history.rawBody) as unknown[]).toHaveLength(1);
      // red today: preview does not exist, so the whole flow fails at the 409.
    },
  );

  testCase(
    "CANON-IMPORT-005",
    "import apply with missing needs-input pointer values returns 400 INVALID_ENTRY with pointer-level details",
    async () => {
      const character = await createRawCharacter();
      // D4 needs-input class: an unknown enum variant has no derivable
      // canonical value — the preview lists it as a needs-input pointer, and
      // applying without a caller value must fail INVALID_ENTRY with the
      // pointer. (Fills like /createdAt are derivable — the matrix allows the
      // preview to offer server 'now' — so they must NOT be used here.)
      const partial = { gear: { commitment: "medium" } };
      const preview = await api.post(`characters/${character.id}/import?preview=1`, {
        entity: partial,
      });
      expect(preview.status).toBe(409);
      const previewBody = JSON.parse(preview.rawBody) as {
        error: { token?: string; details?: { previewToken?: string; needsInputPointers?: string[] } };
      };
      const token = previewBody.error?.token ?? previewBody.error?.details?.previewToken;
      expect(token).toBeTruthy();
      expect(previewBody.error?.details?.needsInputPointers ?? []).toContain("/gear/commitment");

      // apply re-submits the same partial document without the caller value.
      const apply = await api.post(
        `characters/${character.id}/import`,
        { entity: partial, previewToken: token, confirm: true },
        { "If-Match": String(character.revision) },
      );
      expect(apply.status).toBe(400);
      const applyBody = JSON.parse(apply.rawBody) as {
        error: {
          code: string;
          details?: { issues?: Array<{ pointer: string; reason: string; expected: string }> };
        };
      };
      expect(applyBody.error?.code).toBe("INVALID_ENTRY");
      const issues = applyBody.error?.details?.issues ?? [];
      expect(issues.length).toBeGreaterThan(0);
      for (const issue of issues) {
        expect(typeof issue.pointer).toBe("string");
        expect(issue.pointer.startsWith("/")).toBe(true);
        expect(typeof issue.reason).toBe("string");
        expect(typeof issue.expected).toBe("string");
      }
      // needs-input apply without caller values → 400 INVALID_ENTRY with
      // pointer-level details (SC-A2 machinery; green since Wave 4 A2).
    },
  );

  testCase(
    "CANON-IMPORT-006",
    "unknown property in import is rejected unless the preview classifies and displays removal; with preview the removal is listed",
    async () => {
      const character = await createRawCharacter();

      // (a) no preview: the unknown property is rejected — no silent loss
      // (D6: inbound → 400 INVALID_ENTRY unless the preview classified the removal)
      const direct = await api.post(
        `characters/${character.id}/import`,
        { entity: { dossier: { name: "X" }, xCaptainColor: "red" }, confirm: true },
        { "If-Match": String(character.revision) },
      );
      expect(direct.status).toBe(400);
      const directBody = JSON.parse(direct.rawBody) as {
        error: { code: string; details?: { issues?: Array<{ pointer: string }> } };
      };
      expect(directBody.error?.code).toBe("INVALID_ENTRY");
      expect((directBody.error?.details?.issues ?? []).some((issue) => issue.pointer === "/xCaptainColor")).toBe(true);

      // (b) preview classifies and DISPLAYS the removal (409 + listing)
      const preview = await api.post(`characters/${character.id}/import?preview=1`, {
        entity: { dossier: { name: "X" }, xCaptainColor: "red" },
      });
      expect(preview.status).toBe(409);
      const previewBody = JSON.parse(preview.rawBody) as {
        error: { code: string; token?: string; preview?: unknown; details?: { warnings?: string[] } };
      };
      expect(previewBody.error?.code).toBe("NORMALIZATION_REQUIRED");
      const displayed =
        JSON.stringify(previewBody.error?.preview ?? "") + JSON.stringify(previewBody.error?.details?.warnings ?? []);
      expect(displayed).toContain("xCaptainColor");

      // (c) apply after the classified removal: 200, and the stored document
      // no longer carries the unknown property
      const apply = await api.post(
        `characters/${character.id}/import`,
        { entity: { dossier: { name: "X" }, xCaptainColor: "red" }, previewToken: previewBody.error?.token, confirm: true },
        { "If-Match": String(character.revision) },
      );
      expect(apply.status).toBe(200);
      const stored = JSON.parse(
        (await readFile(await currentFilePath("character", character.id))).toString("utf8"),
      ) as Record<string, unknown>;
      expect(stored).not.toHaveProperty("xCaptainColor");
      // red today: no preview/INVALID_ENTRY machinery — both branches 400 VALIDATION.
    },
  );

  testCase(
    "CANON-LEGACY-007",
    "known legacy conversion (notes string -> one-entry array) is previewed and applied",
    async () => {
      // L1: a single-string notes value converts to a one-entry array; the
      // conversion is an explicit, previewed rule — never a silent rewrite.
      const character = await createRawCharacter();
      const preview = await api.post(`characters/${character.id}/import?preview=1`, {
        entity: { dossier: { notes: "legacy note" } },
      });
      expect(preview.status).toBe(409);
      const previewBody = JSON.parse(preview.rawBody) as {
        error: { token?: string; details?: { previewToken?: string; warnings?: string[] } };
      };
      const warnings = previewBody.error?.details?.warnings ?? [];
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.some((warning) => /notes/i.test(warning))).toBe(true);
      const token = previewBody.error?.token ?? previewBody.error?.details?.previewToken;
      expect(token).toBeTruthy();

      const apply = await api.post(
        `characters/${character.id}/import`,
        { entity: { dossier: { notes: "legacy note" } }, previewToken: token, confirm: true },
        { "If-Match": String(character.revision) },
      );
      expect(apply.status).toBe(200);
      const applyBody = JSON.parse(apply.rawBody) as { ok: boolean; character: { dossier: { notes: unknown } } };
      expect(applyBody.ok).toBe(true);
      expect(applyBody.character.dossier.notes).toEqual(["legacy note"]);
      const current = await api.get(`characters/${character.id}`);
      expect(current.status).toBe(200);
      const currentBody = JSON.parse(current.rawBody) as { dossier: { notes: unknown } };
      expect(currentBody.dossier.notes).toEqual(["legacy note"]);
      // red today: no preview exists (400 VALIDATION).
    },
  );

  testCase(
    "CANON-REPAIR-008",
    "repair preview on a degraded stored entity computes without writing; apply atomically writes; preview-token staleness -> 409 STALE_REVISION",
    async () => {
      const seededId = randomUUID();
      const seeded = await seedEntity("character", await repairableCharacterBytes(seededId, "legacy note"), seededId);
      const seededBytes = await readFile(seeded.path);
      const token = entityToken(seededBytes);
      const preHash = sha256Hex(seededBytes);

      // 1. direct access classifies the stored entity as degraded
      const degraded = await api.get(`characters/${seeded.id}`);
      expect(degraded.status).toBe(422);
      const degradedBody = JSON.parse(degraded.rawBody) as {
        error: { code: string; details?: { issues?: unknown[] } };
      };
      expect(degradedBody.error?.code).toBe("INVALID_ENTITY");
      expect(Array.isArray(degradedBody.error?.details?.issues)).toBe(true);

      // 2. repair preview computes the normalized result WITHOUT writing
      const preview = await api.post(`characters/${seeded.id}/repair-preview`, undefined, { "If-Match": token });
      expect(preview.status).toBe(409);
      const previewBody = JSON.parse(preview.rawBody) as {
        error: { code: string; token?: string; details?: { previewToken?: string; warnings?: string[] }; preview?: unknown };
      };
      expect(previewBody.error?.code).toBe("NORMALIZATION_REQUIRED"); // red today: token If-Match is treated as a stale revision
      expect(previewBody.error?.details?.warnings?.length ?? 0).toBeGreaterThan(0);
      expect(previewBody.error?.preview).toBeTruthy();
      const previewToken = previewBody.error?.token ?? previewBody.error?.details?.previewToken;
      expect(previewToken).toBeTruthy();
      expect(sha256Hex(await readFile(seeded.path))).toBe(preHash); // preview wrote nothing

      // 3. confirmed apply atomically writes the previewed result
      const apply = await api.post(
        `characters/${seeded.id}/repair`,
        { previewToken, confirm: true },
        { "If-Match": token },
      );
      expect(apply.status).toBe(200);
      const applyBody = JSON.parse(apply.rawBody) as {
        ok: boolean;
        character: { revision: number; dossier: { notes: unknown } };
      };
      expect(applyBody.ok).toBe(true);
      expect(applyBody.character.dossier.notes).toEqual(["legacy note"]);
      // seeded golden character carries revision 12; repair is revision +1
      expect(applyBody.character.revision).toBe(13);
      const stored = await readFile(seeded.path);
      const storedDoc = JSON.parse(stored.toString("utf8")) as { dossier: { notes: unknown } };
      expect(storedDoc.dossier.notes).toEqual(["legacy note"]);
      const current = await api.get(`characters/${seeded.id}`);
      expect(current.status).toBe(200);
      expect(Buffer.from(current.rawBody, "utf8")).toEqual(stored); // GET byte-identical to disk
      const currentBody = JSON.parse(current.rawBody) as { kind: string };
      expect(currentBody.kind).toBe("character");

      // 4. preview-token staleness: bytes change behind the preview → 409
      const staleId = randomUUID();
      const stale = await seedEntity("character", await repairableCharacterBytes(staleId, "legacy note"), staleId);
      const staleToken = entityToken(await readFile(stale.path));
      const stalePreview = await api.post(`characters/${stale.id}/repair-preview`, undefined, {
        "If-Match": staleToken,
      });
      expect(stalePreview.status).toBe(409);
      const stalePreviewBody = JSON.parse(stalePreview.rawBody) as { error: { code: string; token?: string } };
      expect(stalePreviewBody.error?.code).toBe("NORMALIZATION_REQUIRED");
      const stalePreviewToken = stalePreviewBody.error?.token;
      expect(stalePreviewToken).toBeTruthy();
      await writeFile(stale.path, await repairableCharacterBytes(stale.id, "changed legacy"));
      const staleApply = await api.post(
        `characters/${stale.id}/repair`,
        { previewToken: stalePreviewToken, confirm: true },
        { "If-Match": staleToken },
      );
      expect(staleApply.status).toBe(409);
      const staleBody = JSON.parse(staleApply.rawBody) as {
        error: { code: string; details?: { currentContentToken?: string } };
      };
      expect(staleBody.error?.code).toBe("STALE_REVISION");
      expect(staleBody.error?.details?.currentContentToken).toBe(entityToken(await readFile(stale.path)));
      // red today: no admission/repair machinery — direct access serves the
      // seeded non-canonical file with 200 instead of classifying it
      // 422 INVALID_ENTITY (the flow dies at step 1, before any repair op).
    },
  );

  testCase(
    "CANON-READONLY-009",
    "GET returns the stored document byte-identically and never repairs a seeded non-canonical file (guard: read identity)",
    async () => {
      // guard part (green today): a normal GET returns the stored bytes
      // byte-identically and a second read changes zero bytes.
      const character = await createRawCharacter();
      const path = await currentFilePath("character", character.id);
      const stored = await readFile(path);
      const first = await api.get(`characters/${character.id}`);
      expect(first.status).toBe(200);
      expect(Buffer.from(first.rawBody, "utf8")).toEqual(stored);
      const second = await api.get(`characters/${character.id}`);
      expect(second.rawBody).toBe(first.rawBody);

      // red part: a GET after a seeded non-canonical file does NOT repair it —
      // the server must classify it (422 INVALID_ENTITY) instead of serving it
      const seededId = randomUUID();
      const seeded = await seedEntity("character", await repairableCharacterBytes(seededId, "legacy note"), seededId);
      const before = sha256Hex(await readFile(seeded.path));
      const degraded = await api.get(`characters/${seeded.id}`);
      expect(degraded.status).toBe(422); // red today: no admission — raw bytes served with 200
      expect(sha256Hex(await readFile(seeded.path))).toBe(before); // never repaired on read
    },
  );

  testCase(
    "CANON-NOWRITE-010",
    "no read path writes to disk (guard)",
    async () => {
      // guard: expected green today; keeps the read-purity rule pinned.
      const character = await createRawCharacter();
      const path = await currentFilePath("character", character.id);
      const before = sha256Hex(await readFile(path));
      await api.get(`characters/${character.id}`);
      await api.get(`characters/${character.id}?download=1`);
      await api.get("health");
      expect(sha256Hex(await readFile(path))).toBe(before);
    },
  );

  testCase(
    "CANON-VERSION-011",
    "canonicalisation never changes formatVersion",
    async () => {
      // The seeded repairable document carries formatVersion 1; the repair
      // preview change list must contain no entry for /formatVersion and the
      // applied document must keep formatVersion 1.
      const seededId = randomUUID();
      const seeded = await seedEntity("character", await repairableCharacterBytes(seededId, "legacy note"), seededId);
      const token = entityToken(await readFile(seeded.path));
      const preview = await api.post(`characters/${seeded.id}/repair-preview`, undefined, { "If-Match": token });
      expect(preview.status).toBe(409);
      const previewBody = JSON.parse(preview.rawBody) as { error: { code: string; token?: string; preview?: unknown } };
      expect(previewBody.error?.code).toBe("NORMALIZATION_REQUIRED"); // red today: token If-Match is treated as a stale revision
      expect(changePointers(previewBody.error?.preview)).not.toContain("/formatVersion");
      const apply = await api.post(
        `characters/${seeded.id}/repair`,
        { previewToken: previewBody.error?.token, confirm: true },
        { "If-Match": token },
      );
      expect(apply.status).toBe(200);
      const stored = JSON.parse((await readFile(seeded.path)).toString("utf8")) as { formatVersion: number };
      expect(stored.formatVersion).toBe(1);
      // red today: the token If-Match is treated as a stale revision — the
      // preview returns 409 STALE_REVISION instead of NORMALIZATION_REQUIRED.
    },
  );

  testCase(
    "CANON-SPARSE-012",
    "claimOverrides outer array always present; items keep only claimId when inheriting (guard)",
    async () => {
      // guard: the frozen C1 crew schema is already sparse-permissive —
      // override items require only claimId (name/description/effects absent
      // = inherit, Q2/Q3), so this case is green today and pins the contract.
      const crew = await api.post("crews", { gameStem: BLADES, crewType: "Assassins" });
      expect(crew.status).toBe(200);
      const crewBody = JSON.parse(crew.rawBody) as {
        ok: boolean;
        crew: { claimOverrides: unknown; claimedClaimIds: unknown };
      };
      expect(Array.isArray(crewBody.crew.claimOverrides)).toBe(true);
      expect(crewBody.crew.claimOverrides).toEqual([]);
      expect(Array.isArray(crewBody.crew.claimedClaimIds)).toBe(true);

      // a claimId-only override item is canonical (sparse overlay): the stored
      // document is served without repair, and its raw body carries the
      // sparse overlay.
      // Route identity == body identity (single id, kind "crew" from the
      // fixture) so the case tests ONLY the sparse overlay, never D8.
      const fixture = (await import("../../fixtures/golden-crew.json", { with: { type: "json" } })).default;
      const doc = JSON.parse(JSON.stringify(fixture)) as Record<string, unknown>;
      const crewId = randomUUID();
      const seeded = await seedEntity(
        "crew",
        Buffer.from(JSON.stringify({ ...doc, id: crewId, claimOverrides: [{ claimId: "serpents-tail" }] }), "utf8"),
        crewId,
      );
      const get = await api.get(`crews/${seeded.id}`);
      expect(get.status).toBe(200);
      const getBody = JSON.parse(get.rawBody) as { claimOverrides: unknown };
      expect(getBody.claimOverrides).toEqual([{ claimId: "serpents-tail" }]);
    },
  );

  testCase(
    "CANON-TOTAL-013",
    "a stored document missing an ordinary property is classified repairable, never silently repaired on read",
    async () => {
      // D1: /dossier/look has a canonical default (""), so the stored
      // document is repairable — direct access must return 422 INVALID_ENTITY
      // with repairability details, and the file must stay untouched.
      const seededId = randomUUID();
      const seeded = await seedEntity("character", await missingLookCharacterBytes(seededId), seededId);
      const before = sha256Hex(await readFile(seeded.path));
      const get = await api.get(`characters/${seeded.id}`);
      expect(get.status).toBe(422); // red today: no classification — 200 raw bytes
      const body = JSON.parse(get.rawBody) as {
        error: { code: string; details?: { issues?: Array<{ pointer: string; reason: string; expected: string }> } };
      };
      expect(body.error?.code).toBe("INVALID_ENTITY");
      const issues = body.error?.details?.issues ?? [];
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some((issue) => issue.pointer === "/dossier/look")).toBe(true);
      for (const issue of issues) {
        expect(typeof issue.reason).toBe("string");
        expect(typeof issue.expected).toBe("string");
      }
      expect(sha256Hex(await readFile(seeded.path))).toBe(before); // never silently repaired on read
    },
  );
});
