import { describe, expect } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";

// ---------------------------------------------------------------------------
// SC-O1 import/repair-token oracle (Wave 3).
//
// Freezes the degraded-entity contract from spec-change-work-spec.mdx
// "Degraded entities, collections, repair, and deletion" + the R0 matrix
// D9/D10 rows: unparseable bytes are unreadable (deletion only), the
// deleteToken is sha256:<hex> of the raw bytes, changed bytes → 409
// STALE_REVISION, and repair is atomic (crash-safe via --test-hooks).
//
// Setup note: the live Ada server has no admission/repair machinery, so every
// case here is expected red today; REPAIR-ATOMIC-004 additionally guards the
// crash-hook semantics (test-hooks/crash-mid-write is 501 until backend work).
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

function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/** The degraded-entity If-Match token: sha256:<lowercase hex> of the raw bytes. */
function entityToken(data: string | Buffer): string {
  return `sha256:${sha256Hex(data)}`;
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

describe("import/repair token oracle (SC-O1)", () => {
  testCase(
    "REPAIR-TOKEN-001",
    "unparseable bytes cannot be repaired (deletion only): direct GET returns 422 INVALID_ENTITY",
    async () => {
      // D10: bytes that do not parse as JSON are unreadable — no normalization
      // is possible, so direct access must classify them (422) and the repair
      // path must refuse (deletion is the only action).
      const bytes = Buffer.from("this is not json at all", "utf8");
      const seeded = await seedEntity("character", bytes);
      const token = entityToken(bytes);

      const get = await api.get(`characters/${seeded.id}`);
      expect(get.status).toBe(422);
      const body = JSON.parse(get.rawBody) as {
        error: { code: string; details?: { issues?: Array<{ pointer: string; reason: string; expected: string }> } };
      };
      expect(body.error?.code).toBe("INVALID_ENTITY");
      // unparseable bytes report a single issue at the document root pointer
      const issues = body.error?.details?.issues ?? [];
      expect(issues).toHaveLength(1);
      expect(issues[0]?.pointer).toBe("");
      for (const issue of issues) {
        expect(typeof issue.reason).toBe("string");
        expect(typeof issue.expected).toBe("string");
      }

      const preview = await api.post(`characters/${seeded.id}/repair-preview`, undefined, { "If-Match": token });
      expect(preview.status).toBe(422);
      // red today: no admission (GET serves the raw bytes / 400) and no
      // repair-preview route (404).
    },
  );

  testCase(
    "REPAIR-TOKEN-002",
    "deleteToken = sha256:<hex> is bound to the raw bytes; changed bytes -> 409 STALE_REVISION",
    async () => {
      // a repairable (parseable, non-canonical) stored entity is degraded:
      // its delete token is the sha256 of the current raw bytes, not a revision
      const seededId = randomUUID();
      const seeded = await seedEntity("character", await repairableCharacterBytes(seededId, "legacy note"), seededId);
      const token = entityToken(await readFile(seeded.path));

      // 1. delete with the correct content token succeeds
      const del = await api.post(`characters/${seeded.id}/delete`, { confirm: true }, { "If-Match": token });
      expect(del.status).toBe(200);
      const delBody = JSON.parse(del.rawBody) as { ok: boolean };
      expect(delBody.ok).toBe(true);
      const gone = await api.get(`characters/${seeded.id}`);
      expect(gone.status).toBe(404);
      // red today: If-Match is compared against the revision, so the token
      // is always stale (409) and the entity is never deletable.

      // 2. bytes change behind the token → the token is stale
      const otherId = randomUUID();
      const other = await seedEntity("character", await repairableCharacterBytes(otherId, "legacy note"), otherId);
      const oldToken = entityToken(await readFile(other.path));
      await writeFile(other.path, await repairableCharacterBytes(other.id, "changed legacy"));
      const stale = await api.post(`characters/${other.id}/delete`, { confirm: true }, { "If-Match": oldToken });
      expect(stale.status).toBe(409);
      const staleBody = JSON.parse(stale.rawBody) as {
        error: { code: string; details?: { currentContentToken?: string } };
      };
      expect(staleBody.error?.code).toBe("STALE_REVISION");
      expect(staleBody.error?.details?.currentContentToken).toBe(entityToken(await readFile(other.path)));
      const still = await api.get(`characters/${other.id}`);
      expect(still.status).not.toBe(404); // deletion never acted on unseen data
      // red today: STALE_REVISION carries no content-token details (the
      // binding to raw bytes does not exist).
    },
  );

  testCase(
    "REPAIR-TOKEN-003",
    "repair/delete after bytes change never acts on unseen data",
    async () => {
      const seededId = randomUUID();
      const seeded = await seedEntity("character", await repairableCharacterBytes(seededId, "legacy note"), seededId);
      const token = entityToken(await readFile(seeded.path));

      // preview binds the stored bytes and the previewed result
      const preview = await api.post(`characters/${seeded.id}/repair-preview`, undefined, { "If-Match": token });
      expect(preview.status).toBe(409);
      const previewBody = JSON.parse(preview.rawBody) as { error: { code: string; token?: string } };
      expect(previewBody.error?.code).toBe("NORMALIZATION_REQUIRED"); // red today: token If-Match is treated as a stale revision
      const previewToken = previewBody.error?.token;
      expect(previewToken).toBeTruthy();

      // the bytes change behind the preview; the apply must refuse and the
      // old previewed result must never be written over the new data
      await writeFile(seeded.path, await repairableCharacterBytes(seeded.id, "changed legacy"));
      const apply = await api.post(
        `characters/${seeded.id}/repair`,
        { previewToken, confirm: true },
        { "If-Match": token },
      );
      expect(apply.status).toBe(409);
      const applyBody = JSON.parse(apply.rawBody) as { error: { code: string } };
      expect(applyBody.error?.code).toBe("STALE_REVISION");
      const after = JSON.parse((await readFile(seeded.path)).toString("utf8")) as { dossier: { notes: unknown } };
      expect(after.dossier.notes).toBe("changed legacy"); // unseen-data result was NOT applied

      // the stale token also refuses deletion
      const del = await api.post(`characters/${seeded.id}/delete`, { confirm: true }, { "If-Match": token });
      expect(del.status).toBe(409);
      const still = await api.get(`characters/${seeded.id}`);
      expect(still.status).not.toBe(404);
      // red today: no repair ops (404 at repair-preview).
    },
  );

  testCase(
    "REPAIR-ATOMIC-004",
    "crash between preview and apply leaves old bytes; crash during apply leaves old or complete new file only (guard: crash hook)",
    async () => {
      // guard: uses --test-hooks/crash-mid-write (501 today) and fails today
      // at the repair preview; once repair exists, the on-disk invariant below
      // is what this case guards — never a partial JSON document.
      const seededId = randomUUID();
      const seeded = await seedEntity("character", await repairableCharacterBytes(seededId, "legacy note"), seededId);
      const preHash = sha256Hex(await readFile(seeded.path));
      const token = entityToken(await readFile(seeded.path));

      const preview = await api.post(`characters/${seeded.id}/repair-preview`, undefined, { "If-Match": token });
      expect(preview.status).toBe(409);
      const previewBody = JSON.parse(preview.rawBody) as { error: { code: string; token?: string } };
      expect(previewBody.error?.code).toBe("NORMALIZATION_REQUIRED"); // red today: token If-Match is treated as a stale revision
      const previewToken = previewBody.error?.token;
      expect(previewToken).toBeTruthy();

      // crash between preview and apply: the old bytes survive untouched
      const hook = await api.post("test-hooks/crash-mid-write", { entity: "character", id: seeded.id });
      expect([204, 501]).toContain(hook.status);
      expect(sha256Hex(await readFile(seeded.path))).toBe(preHash);

      // crash during apply: the file is either the old bytes or the complete
      // repaired document — never a partial write
      const hook2 = await api.post("test-hooks/crash-mid-write", { entity: "character", id: seeded.id });
      expect([204, 501]).toContain(hook2.status);
      try {
        await api.post(
          `characters/${seeded.id}/repair`,
          { previewToken, confirm: true },
          { "If-Match": token },
        );
      } catch {
        // a transport error after a real server crash is acceptable; the
        // on-disk invariant below is the assertion.
      }
      const finalBytes = await readFile(seeded.path);
      if (sha256Hex(finalBytes) !== preHash) {
        const parsed = JSON.parse(finalBytes.toString("utf8")) as { dossier?: { notes?: unknown } };
        expect(parsed.dossier?.notes).toEqual(["legacy note"]); // complete repaired document
      }
      // red today: repair-preview returns 404 (no repair ops); the crash hook
      // itself is 501 until backend work.
    },
  );

  // -------------------------------------------------------------------------
  // SC-O8 FV-specific oracle corrections (findings FV-001/FV-002/FV-009).
  //
  // Approved repair semantics (fix-wave oracle card; SC-R6 ledger rows; Q6;
  // spec-change-work-spec.mdx point 8): legacy v1 records — same
  // formatVersion 1 (no bump, Q5), missing only the post-C4 canonical
  // fields — are handled through EXPLICIT repair, never read repair
  // (O-MIGRATION's migrate-on-GET plan is superseded by the work spec).
  // Reads are pure and byte-identical (matrix D-rules): a direct GET of a
  // legacy record returns 422 INVALID_ENTITY (repairable, preview
  // available) and never writes; repair-preview returns 409
  // NORMALIZATION_REQUIRED with the conversion in the change list;
  // confirmed repair-apply returns 200 canonical (legacy string notes → a
  // one-entry array, L1; vice.purveyor fill, L4; turf/claimedClaimIds/
  // claimOverrides fills, L7) and atomically writes the previewed result.
  // No migration write ever happens on GET or on a mutation of a legacy
  // record — mutations fail 422 INVALID_ENTITY until repair applies. These
  // cases are red today: the server has no admission/repair machinery, so
  // GET serves the raw legacy shape with 200 (FV-001/FV-002/FV-009) and
  // repair-preview is 404.
  // -------------------------------------------------------------------------

  testCase(
    "FV-MIGRATE-CHAR-001",
    "legacy v1 character: direct GET 422 INVALID_ENTITY (repairable, never writes); preview 409 with the purveyor fill; apply 200 canonical (FV-001)",
    async () => {
      // L4 legacy shape: C#-era vice has no purveyor (FV-001 reproduction).
      const doc = await goldenCharacter();
      const seeded = await seedEntity("character", Buffer.from(JSON.stringify(doc), "utf8"));
      doc.id = seeded.id;
      delete (doc.dossier as Record<string, unknown>).vice;
      // Rebuild the golden vice WITHOUT purveyor (the legacy shape).
      (doc.dossier as Record<string, unknown>).vice = { name: "", description: "" };
      await writeFile(seeded.path, Buffer.from(JSON.stringify(doc), "utf8"));
      const token = entityToken(await readFile(seeded.path));
      const preHash = sha256Hex(await readFile(seeded.path));

      // 1. Direct GET classifies the legacy record as repairable (the L4
      // conversion exists) and never writes — no migrate-on-GET.
      const get = await api.get(`characters/${seeded.id}`);
      expect(get.status).toBe(422);
      const body = JSON.parse(get.rawBody) as {
        error: { code: string; details?: { issues?: Array<{ pointer: string; reason: string; expected: string }> } };
      };
      expect(body.error?.code).toBe("INVALID_ENTITY");
      const issues = body.error?.details?.issues ?? [];
      expect(issues.some((issue) => issue.pointer === "/dossier/vice/purveyor")).toBe(true);
      for (const issue of issues) {
        expect(typeof issue.reason).toBe("string");
        expect(typeof issue.expected).toBe("string");
      }
      expect(sha256Hex(await readFile(seeded.path))).toBe(preHash); // GET wrote nothing

      // 2. Repair preview lists the L4 conversion in the change list and
      // writes nothing.
      const preview = await api.post(`characters/${seeded.id}/repair-preview`, undefined, { "If-Match": token });
      expect(preview.status).toBe(409);
      const previewBody = JSON.parse(preview.rawBody) as {
        error: {
          code: string;
          token?: string;
          details?: { previewToken?: string; warnings?: string[] };
          preview?: { changes?: Array<{ pointer: string; reason: string; replacement?: unknown }> };
        };
      };
      expect(previewBody.error?.code).toBe("NORMALIZATION_REQUIRED"); // red today: repair-preview is 404
      const previewToken = previewBody.error?.token ?? previewBody.error?.details?.previewToken;
      expect(previewToken).toBeTruthy();
      expect(previewBody.error?.details?.warnings?.length ?? 0).toBeGreaterThan(0);
      const purveyorChange = (previewBody.error?.preview?.changes ?? []).find(
        (change) => change.pointer === "/dossier/vice/purveyor",
      );
      expect(purveyorChange).toBeDefined();
      // The L4 fill: purveyor becomes the canonical empty, so the record
      // decodes against the frozen character schema (FV-001's decode failure
      // disappears after apply).
      expect(purveyorChange?.replacement).toEqual({ name: "", description: "" });
      expect(sha256Hex(await readFile(seeded.path))).toBe(preHash); // preview wrote nothing

      // 3. Confirmed apply atomically writes the fill: revision +1, the
      // stored bytes are canonical, and a second read is byte-identical.
      const apply = await api.post(
        `characters/${seeded.id}/repair`,
        { previewToken, confirm: true },
        { "If-Match": token },
      );
      expect(apply.status).toBe(200);
      const applyBody = JSON.parse(apply.rawBody) as {
        ok: boolean;
        character: { revision: number; dossier: { vice: { purveyor: { name: string; description: string } } } };
      };
      expect(applyBody.ok).toBe(true);
      expect(applyBody.character.dossier.vice.purveyor).toEqual({ name: "", description: "" });
      expect(applyBody.character.revision).toBe((doc.revision as number) + 1);
      const onDisk = (await readFile(seeded.path)).toString("utf8");
      expect(JSON.parse(onDisk).dossier.vice.purveyor).toEqual({ name: "", description: "" });
      const second = await api.get(`characters/${seeded.id}`);
      expect(second.status).toBe(200);
      expect(second.rawBody).toBe(onDisk); // second read byte-identical
      // red today: GET returns the raw legacy document 200 — dossier.vice
      // has no purveyor, so the first assertion (422) fails.
    },
  );

  testCase(
    "FV-MIGRATE-CREW-001",
    "legacy v1 crew: direct GET 422 INVALID_ENTITY (repairable, never writes); preview 409 listing turf/claimedClaimIds/claimOverrides; apply 200 canonical (FV-002)",
    async () => {
      // Pre-C4 legacy crew: turf/claimedClaimIds/claimOverrides absent
      // (FV-002 reproduction; decodeCrewEither fails at the first missing
      // required key).
      const fixture = (await import("../../fixtures/golden-crew.json", { with: { type: "json" } })).default;
      const doc = JSON.parse(JSON.stringify(fixture)) as Record<string, unknown>;
      const seeded = await seedEntity("crew", Buffer.from(JSON.stringify(doc), "utf8"));
      doc.id = seeded.id;
      delete doc.turf;
      delete doc.claimedClaimIds;
      delete doc.claimOverrides;
      await writeFile(seeded.path, Buffer.from(JSON.stringify(doc), "utf8"));
      const token = entityToken(await readFile(seeded.path));
      const preHash = sha256Hex(await readFile(seeded.path));

      // 1. Direct GET classifies the legacy record as repairable, listing
      // every missing canonical key, and never writes.
      const get = await api.get(`crews/${seeded.id}`);
      expect(get.status).toBe(422);
      const body = JSON.parse(get.rawBody) as {
        error: { code: string; details?: { issues?: Array<{ pointer: string; reason: string; expected: string }> } };
      };
      expect(body.error?.code).toBe("INVALID_ENTITY");
      const issuePointers = (body.error?.details?.issues ?? []).map((issue) => issue.pointer);
      for (const pointer of ["/turf", "/claimedClaimIds", "/claimOverrides"]) {
        expect(issuePointers).toContain(pointer);
      }
      expect(sha256Hex(await readFile(seeded.path))).toBe(preHash); // GET wrote nothing

      // 2. Repair preview lists the L7 fills (turf:0, canonical arrays) in
      // the change list and writes nothing.
      const preview = await api.post(`crews/${seeded.id}/repair-preview`, undefined, { "If-Match": token });
      expect(preview.status).toBe(409);
      const previewBody = JSON.parse(preview.rawBody) as {
        error: {
          code: string;
          token?: string;
          details?: { previewToken?: string; warnings?: string[] };
          preview?: { changes?: Array<{ pointer: string; reason: string }> };
        };
      };
      expect(previewBody.error?.code).toBe("NORMALIZATION_REQUIRED"); // red today: repair-preview is 404
      const previewToken = previewBody.error?.token ?? previewBody.error?.details?.previewToken;
      expect(previewToken).toBeTruthy();
      expect(previewBody.error?.details?.warnings?.length ?? 0).toBeGreaterThan(0);
      const changePointers = (previewBody.error?.preview?.changes ?? []).map((change) => change.pointer);
      for (const pointer of ["/turf", "/claimedClaimIds", "/claimOverrides"]) {
        expect(changePointers).toContain(pointer);
      }
      expect(sha256Hex(await readFile(seeded.path))).toBe(preHash); // preview wrote nothing

      // 3. Confirmed apply writes the canonical fills: turf 0, both arrays
      // present and empty, revision +1, second read byte-identical.
      const apply = await api.post(
        `crews/${seeded.id}/repair`,
        { previewToken, confirm: true },
        { "If-Match": token },
      );
      expect(apply.status).toBe(200);
      const applyBody = JSON.parse(apply.rawBody) as {
        ok: boolean;
        crew: { revision: number; turf: number; claimedClaimIds: unknown[]; claimOverrides: unknown[] };
      };
      expect(applyBody.ok).toBe(true);
      expect(applyBody.crew.turf).toBe(0);
      expect(Array.isArray(applyBody.crew.claimedClaimIds)).toBe(true);
      expect(applyBody.crew.claimedClaimIds).toHaveLength(0);
      expect(Array.isArray(applyBody.crew.claimOverrides)).toBe(true);
      expect(applyBody.crew.claimOverrides).toHaveLength(0);
      expect(applyBody.crew.revision).toBe((doc.revision as number) + 1);
      const onDisk = JSON.parse((await readFile(seeded.path)).toString("utf8")) as Record<string, unknown>;
      expect(onDisk.turf).toBe(0);
      expect(Array.isArray(onDisk.claimedClaimIds)).toBe(true);
      const second = await api.get(`crews/${seeded.id}`);
      expect(second.status).toBe(200);
      expect(second.rawBody).toBe((await readFile(seeded.path)).toString("utf8")); // second read byte-identical
      // red today: GET returns the raw legacy document 200 — all three keys
      // are absent, so the first assertion fails.
    },
  );

  testCase(
    "FV-NOTES-STRING-001",
    "legacy string notes: direct GET and mutation 422 (no migration write); preview 409 listing the L1 conversion; apply 200 canonical one-entry array (FV-009)",
    async () => {
      // L1 legacy shape: Dossier/Crew notes is a single string (FV-009
      // reproduction). Repair converts it to a one-entry array; add/remove
      // then work without loss.
      const fixture = (await import("../../fixtures/golden-crew.json", { with: { type: "json" } })).default;
      const doc = JSON.parse(JSON.stringify(fixture)) as Record<string, unknown>;
      const seeded = await seedEntity("crew", Buffer.from(JSON.stringify(doc), "utf8"));
      doc.id = seeded.id;
      doc.notes = "The Bluecoats watch the mill";
      await writeFile(seeded.path, Buffer.from(JSON.stringify(doc), "utf8"));
      const token = entityToken(await readFile(seeded.path));
      const preHash = sha256Hex(await readFile(seeded.path));

      // 1. Direct GET classifies the string-notes record as repairable and
      // never writes (no migrate-on-GET).
      const get = await api.get(`crews/${seeded.id}`);
      expect(get.status).toBe(422);
      const body = JSON.parse(get.rawBody) as {
        error: { code: string; details?: { issues?: Array<{ pointer: string; reason: string; expected: string }> } };
      };
      expect(body.error?.code).toBe("INVALID_ENTITY");
      const issues = body.error?.details?.issues ?? [];
      expect(issues.some((issue) => issue.pointer === "/notes")).toBe(true);
      expect(sha256Hex(await readFile(seeded.path))).toBe(preHash); // GET wrote nothing

      // 2. A mutation on the legacy record fails 422 INVALID_ENTITY and
      // never migrates the string (the FV-009 journey starts only after
      // repair applies). Raw asserts: the frozen OperationResult decoder
      // would reject today's error shape.
      const addResponse = await api.post(
        `crews/${seeded.id}/ops/note.add`,
        { text: "vetting-note-k04" },
        { "If-Match": String(doc.revision) },
      );
      expect(addResponse.status).toBe(422);
      const addRejected = JSON.parse(addResponse.rawBody) as { ok: boolean; error: { code: string } };
      expect(addRejected.ok).toBe(false);
      expect(addRejected.error?.code).toBe("INVALID_ENTITY");
      expect(sha256Hex(await readFile(seeded.path))).toBe(preHash); // mutation wrote nothing

      // 3. Repair preview lists the L1 conversion (string → one-entry
      // array) in the change list and writes nothing.
      const preview = await api.post(`crews/${seeded.id}/repair-preview`, undefined, { "If-Match": token });
      expect(preview.status).toBe(409);
      const previewBody = JSON.parse(preview.rawBody) as {
        error: {
          code: string;
          token?: string;
          details?: { previewToken?: string; warnings?: string[] };
          preview?: { changes?: Array<{ pointer: string; reason: string; previous?: unknown; replacement?: unknown }> };
        };
      };
      expect(previewBody.error?.code).toBe("NORMALIZATION_REQUIRED"); // red today: repair-preview is 404
      const previewToken = previewBody.error?.token ?? previewBody.error?.details?.previewToken;
      expect(previewToken).toBeTruthy();
      const warnings = previewBody.error?.details?.warnings ?? [];
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.some((warning) => /notes/i.test(warning))).toBe(true);
      const notesChange = (previewBody.error?.preview?.changes ?? []).find((change) => change.pointer === "/notes");
      expect(notesChange).toBeDefined();
      expect(notesChange?.previous).toBe("The Bluecoats watch the mill"); // the legacy string
      expect(notesChange?.replacement).toEqual(["The Bluecoats watch the mill"]); // the one-entry array
      expect(sha256Hex(await readFile(seeded.path))).toBe(preHash); // preview wrote nothing

      // 4. Confirmed apply stores the one-entry array (revision +1) and a
      // second read is byte-identical.
      const apply = await api.post(
        `crews/${seeded.id}/repair`,
        { previewToken, confirm: true },
        { "If-Match": token },
      );
      expect(apply.status).toBe(200);
      const applyBody = JSON.parse(apply.rawBody) as {
        ok: boolean;
        crew: { notes: unknown[]; revision: number };
      };
      expect(applyBody.ok).toBe(true);
      expect(applyBody.crew.notes).toEqual(["The Bluecoats watch the mill"]);
      expect(applyBody.crew.revision).toBe((doc.revision as number) + 1);
      const getAfterApply = await api.get(`crews/${seeded.id}`);
      expect(getAfterApply.status).toBe(200);
      expect(getAfterApply.rawBody).toBe((await readFile(seeded.path)).toString("utf8")); // second read byte-identical

      // 5. Post-repair mutations work without loss (fix-wave P09 evidence).
      const add2Response = await api.post(
        `crews/${seeded.id}/ops/note.add`,
        { text: "vetting-note-k04" },
        { "If-Match": String(applyBody.crew.revision) },
      );
      expect(add2Response.status).toBe(200);
      const added = JSON.parse(add2Response.rawBody) as {
        ok: boolean;
        error: { code: string; message: string } | null;
        crew?: { notes: string[]; revision: number };
      };
      expect(added.ok).toBe(true);
      expect(added.error).toBeNull();
      expect(added.crew?.notes).toEqual(["The Bluecoats watch the mill", "vetting-note-k04"]);
      const removeResponse = await api.post(
        `crews/${seeded.id}/ops/note.remove`,
        { index: 1 },
        { "If-Match": String(added.crew?.revision ?? applyBody.crew.revision + 1) },
      );
      expect(removeResponse.status).toBe(200);
      const removed = JSON.parse(removeResponse.rawBody) as {
        ok: boolean;
        crew?: { notes: string[] };
      };
      expect(removed.ok).toBe(true);
      expect(removed.crew?.notes).toEqual(["The Bluecoats watch the mill"]);
      // The repaired array shape survives the ops: no legacy string ever
      // reappears on disk.
      const finalDoc = JSON.parse((await readFile(seeded.path)).toString("utf8")) as { notes?: unknown };
      expect(finalDoc.notes).toEqual(["The Bluecoats watch the mill"]);
      // red today: GET serves the raw legacy string 200 (no 422
      // classification) and note.add returns ok:false VALIDATION "invalid
      // operation arguments" (server Constraint_Error on the string notes
      // value), so the first assertion fails.
    },
  );
});
