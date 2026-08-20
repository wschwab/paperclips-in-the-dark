import { describe, expect } from "vitest";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import type { AnySchemaObject } from "ajv";
import { api, type HttpResponse } from "../../src/api.js";

// ajv is a CJS package with no "exports" map; under NodeNext its d.ts
// `export default` is modeled as the module namespace (CJS interop), so the
// class/plugin are loaded via createRequire with explicit types instead of a
// default import.
const require = createRequire(import.meta.url);
const Ajv2020: typeof import("ajv/dist/2020.js").Ajv2020 = require("ajv/dist/2020");
const addFormats: (ajv: unknown) => void = require("ajv-formats");
import { testCase } from "../../src/test-case.js";
import { firstAction, firstPlaybook } from "../../src/game-data.js";

// ---------------------------------------------------------------------------
// SC-O7 error-union oracle (frozen against contract/schemas/operation-result.json
// #/$defs/operationError, Wave 2).
//
// Every assertion targets the RAW response body so the frozen union shape is
// checked precisely. All branches are green against the completed
// implementation (Waves 4-7): errors carry status/retryable/recovery/details
// with typed per-code detail shapes, the import/repair/retire routes are
// live, and collections expose degraded-row state. The schema-level tooling
// check (ERR-MISMATCH-006) and the message hygiene guard (ERR-NORAW-009)
// also pass: the frozen schemas landed in Wave 2 and messages are short
// human strings.
// ---------------------------------------------------------------------------

const BLADES = "blades-in-the-dark";

type DetailFamily = "pointer" | "limit" | "funds" | "preview" | "stale" | "empty";
type EntityPresence = "required" | "optional" | "none";

interface ExpectedError {
  code: string;
  status: number;
  family: DetailFamily;
  entity: EntityPresence;
}

interface Branch extends ExpectedError {
  note: string;
  run: () => Promise<HttpResponse>;
}

const CONTENT_TOKEN = /^sha256:[0-9a-f]{64}$/;
const POINTER = /^(|\/.*)$/;

/** Runtime narrowing for JSON bodies: object and not an array. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function okFlag(body: unknown): boolean | null {
  const ok = asRecord(body)?.ok;
  return typeof ok === "boolean" ? ok : null;
}

async function createRawCharacter(): Promise<{ id: string; revision: number }> {
  const response = await api.post("characters", { gameStem: BLADES, playbook: firstPlaybook(BLADES) });
  const character = asRecord(asRecord(response.body)?.character);
  const id = asString(character?.id);
  const revision = asNumber(character?.revision);
  if (response.status !== 200 || id === null) {
    throw new Error(
      `cannot seed character: HTTP ${response.status} ${JSON.stringify(response.body ?? response.rawBody).slice(0, 200)}`,
    );
  }
  return { id, revision: revision ?? 1 };
}

async function createRawCrew(): Promise<{ id: string }> {
  const response = await api.post("crews", { gameStem: BLADES, crewType: "Assassins" });
  const crew = asRecord(asRecord(response.body)?.crew);
  const id = asString(crew?.id);
  if (response.status !== 200 || id === null) {
    throw new Error(
      `cannot seed crew: HTTP ${response.status} ${JSON.stringify(response.body ?? response.rawBody).slice(0, 200)}`,
    );
  }
  return { id };
}

async function readCharacter(id: string): Promise<Record<string, unknown> | null> {
  const response = await api.get(`characters/${id}`);
  if (response.status !== 200) return null;
  return asRecord(response.body);
}

async function dataDir(): Promise<string> {
  const response = await api.get("health");
  const dataDirValue = asString(asRecord(response.body)?.dataDir);
  if (dataDirValue === null) throw new Error(`health returned no dataDir: HTTP ${response.status}`);
  return dataDirValue;
}

/** Write raw (unparseable) bytes for an entity; directory location is authoritative for its identity. */
async function writeDegraded(kind: "character" | "crew" | "clock", id: string, bytes: string): Promise<void> {
  const dir = resolve(await dataDir(), `${kind}s`, id);
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, "current.json"), bytes, "utf8");
}

// ---------------------------------------------------------------------------
// Union-shape assertions on the raw response/error object.
// ---------------------------------------------------------------------------

function assertErrorObject(error: unknown, expected: ExpectedError, label: string): void {
  const err = asRecord(error);
  expect(err, `${label} error object present`).not.toBeNull();
  if (err === null) return;
  expect(err.code, `${label} code`).toBe(expected.code);
  expect(err.status, `${label} declared status`).toBe(expected.status);
  const message = asString(err.message);
  expect(message, `${label} message is a non-empty human string`).not.toBeNull();
  if (message !== null) expect(message.length).toBeGreaterThan(0);
  expect(err.retryable, `${label} retryable is a boolean`).toBeTypeOf("boolean");
  const recovery = asString(err.recovery);
  expect(recovery, `${label} recovery instruction`).not.toBeNull();
  if (recovery !== null) expect(recovery.length).toBeGreaterThan(0);

  const det = asRecord(err.details);
  expect(det, `${label} details present`).not.toBeNull();
  if (det === null) return;
  switch (expected.family) {
    case "pointer": {
      const rawIssues = det.issues;
      expect(Array.isArray(rawIssues), `${label} pointer details carry issues[]`).toBe(true);
      const issues = Array.isArray(rawIssues) ? rawIssues : [];
      expect(issues.length, `${label} issues non-empty`).toBeGreaterThanOrEqual(1);
      for (const rawIssue of issues) {
        const issue = asRecord(rawIssue);
        expect(issue, `${label} issue is an object`).not.toBeNull();
        if (issue === null) continue;
        expect(issue.pointer, `${label} issue pointer is RFC 6901`).toMatch(POINTER);
        const reason = asString(issue.reason);
        expect(reason, `${label} issue reason`).not.toBeNull();
        if (reason !== null) expect(reason.length).toBeGreaterThan(0);
        const expected = asString(issue.expected);
        expect(expected, `${label} issue expected`).not.toBeNull();
        if (expected !== null) expect(expected.length).toBeGreaterThan(0);
      }
      break;
    }
    case "limit": {
      const limit = asNumber(det.limit);
      expect(limit, `${label} limit is a non-negative integer`).not.toBeNull();
      if (limit !== null) {
        expect(Number.isInteger(limit)).toBe(true);
        expect(limit >= 0).toBe(true);
      }
      const current = asNumber(det.current);
      expect(current, `${label} current is a non-negative integer`).not.toBeNull();
      if (current !== null) {
        expect(Number.isInteger(current)).toBe(true);
        expect(current >= 0).toBe(true);
      }
      break;
    }
    case "funds": {
      // Frozen detail shape common.json#/$defs/errorFundsDetails:
      // required [available, needed], additionalProperties: false;
      // available minimum 0, needed minimum 1.
      const available = asNumber(det.available);
      expect(available, `${label} available is a non-negative integer`).not.toBeNull();
      if (available !== null) {
        expect(Number.isInteger(available)).toBe(true);
        expect(available >= 0).toBe(true);
      }
      const needed = asNumber(det.needed);
      expect(needed, `${label} needed is a positive integer`).not.toBeNull();
      if (needed !== null) {
        expect(Number.isInteger(needed)).toBe(true);
        expect(needed >= 1).toBe(true);
      }
      break;
    }
    case "preview": {
      const warnings = det.warnings;
      expect(Array.isArray(warnings), `${label} preview details carry warnings[]`).toBe(true);
      if (Array.isArray(warnings)) {
        for (const warning of warnings) {
          expect(warning, `${label} warning is a string`).toBeTypeOf("string");
        }
      }
      const previewToken = asString(det.previewToken);
      expect(previewToken, `${label} preview details carry previewToken`).not.toBeNull();
      if (previewToken !== null) expect(previewToken.length).toBeGreaterThan(0);
      expect(asRecord(err.preview), `${label} carries the previewed document`).not.toBeNull();
      const token = asString(err.token);
      expect(token, `${label} carries the preview token`).not.toBeNull();
      if (token !== null) expect(token.length).toBeGreaterThan(0);
      expect(token, `${label} token equals details.previewToken`).toBe(previewToken);
      break;
    }
    case "stale": {
      const revision = asNumber(det.currentRevision);
      const hasRevision = revision !== null && Number.isInteger(revision);
      const token = asString(det.currentContentToken);
      const hasToken = token !== null && CONTENT_TOKEN.test(token);
      expect(hasRevision || hasToken, `${label} stale details carry exactly one of currentRevision | currentContentToken`).toBe(true);
      expect(hasRevision && hasToken, `${label} stale details are mutually exclusive`).toBe(false);
      break;
    }
    case "empty": {
      expect(Object.keys(det), `${label} empty detail shape (additionalProperties: false)`).toHaveLength(0);
      break;
    }
  }

  const entity = err.entity;
  switch (expected.entity) {
    case "required":
      expect(asRecord(entity), `${label} entity accompanies the error`).not.toBeNull();
      break;
    case "optional":
      if (entity !== undefined && entity !== null) {
        expect(asRecord(entity), `${label} entity (optional) is an object`).not.toBeNull();
      }
      break;
    case "none":
      expect(entity, `${label} no entity accompanies the error`).toBeUndefined();
      break;
  }
}

function assertErrorResponse(response: HttpResponse, expected: ExpectedError): void {
  const label = `[${expected.code}]`;
  expect(response.status, `${label} delivered HTTP status`).toBe(expected.status);
  const body = asRecord(response.body);
  expect(body, `${label} response body is a JSON object`).not.toBeNull();
  if (body === null) return;
  expect(body.ok, `${label} ok=false`).toBe(false);
  assertErrorObject(body.error, expected, label);
}

/** Structural union-shape check for errors whose code is dynamic (batch items). */
function assertUnionObjectShape(error: unknown, label: string): void {
  const err = asRecord(error);
  expect(err, `${label} error object present`).not.toBeNull();
  if (err === null) return;
  expect(err.code, `${label} code is a string`).toBeTypeOf("string");
  const status = asNumber(err.status);
  expect(status, `${label} status is an integer`).not.toBeNull();
  if (status !== null) expect(Number.isInteger(status)).toBe(true);
  expect(err.message, `${label} message`).toBeTypeOf("string");
  expect(err.retryable, `${label} retryable`).toBeTypeOf("boolean");
  expect(err.recovery, `${label} recovery`).toBeTypeOf("string");
  expect(asRecord(err.details), `${label} details`).not.toBeNull();
}

// ---------------------------------------------------------------------------
// ERR-UNION-001 triggers. Each trigger is contract-grounded: the request and
// its documented outcome come from openapi.yaml descriptions and the Wave 0
// matrices, so the branch fires on the contract-conformant server.
// ---------------------------------------------------------------------------

function branches(): Branch[] {
  return [
    {
      code: "VALIDATION",
      status: 400,
      family: "pointer",
      entity: "optional",
      note: "invalid inbound request shape (missing required create fields)",
      run: () => api.post("characters", {}),
    },
    {
      code: "INVALID_ENTRY",
      status: 400,
      family: "pointer",
      entity: "none",
      note: "import apply without values for needs-input pointers",
      run: async () => {
        const { id, revision } = await createRawCharacter();
        // gear.availableGear[].name has no derivable canonical default
        // (canonicalization-matrix §3.1: NEEDS-INPUT), so apply without caller
        // values must fail as INVALID_ENTRY with pointer-level details.
        const entity = { kind: "character", id, gear: { availableGear: [{ bulk: 0 }] } };
        const preview = await api.post(`characters/${id}/import?preview=1`, { entity });
        const previewError = asRecord(asRecord(preview.body)?.error);
        const previewToken = asString(asRecord(previewError?.details)?.previewToken) ?? asString(previewError?.token);
        return api.post(
          `characters/${id}/import`,
          { entity, previewToken: previewToken ?? "preview-token", confirm: true },
          { "If-Match": String(revision) },
        );
      },
    },
    {
      code: "INVALID_ENTITY",
      status: 422,
      family: "pointer",
      entity: "none",
      note: "direct access to unparseable stored bytes",
      run: async () => {
        const id = "10000000-0000-4000-8000-000000000001";
        await writeDegraded("character", id, "this is not json {");
        return api.get(`characters/${id}`);
      },
    },
    {
      code: "NORMALIZATION_REQUIRED",
      status: 409,
      family: "preview",
      entity: "none",
      note: "import preview of a non-canonical document",
      run: async () => {
        const { id } = await createRawCharacter();
        return api.post(`characters/${id}/import?preview=1`, { entity: { kind: "character", id, dossier: { name: "Import Me" } } });
      },
    },
    {
      code: "NOT_FOUND",
      status: 404,
      family: "empty",
      entity: "optional",
      note: "missing path",
      run: () => api.get("characters/20000000-0000-4000-8000-000000000002"),
    },
    {
      code: "STALE_REVISION",
      status: 409,
      family: "stale",
      entity: "optional",
      note: "changed revision under If-Match",
      run: async () => {
        const { id, revision } = await createRawCharacter();
        await api.post(`characters/${id}/ops/note.add`, { text: "advance" });
        return api.post(`characters/${id}/ops/note.add`, { text: "stale" }, { "If-Match": String(revision) });
      },
    },
    {
      code: "RETIRED",
      status: 200,
      family: "empty",
      // Frozen schema: RETIRED's required list omits entity (unlike the other
      // 200-domain branches); the property may still accompany the error.
      entity: "optional",
      note: "gameplay mutation on a retired character",
      run: async () => {
        const { id, revision } = await createRawCharacter();
        await api.post(`characters/${id}/retire`, { confirm: true }, { "If-Match": String(revision) });
        return api.post(`characters/${id}/ops/stress.add`, { delta: 1 });
      },
    },
    {
      code: "CONFIRM_REQUIRED",
      status: 200,
      family: "empty",
      entity: "required",
      note: "destructive op without confirm:true",
      run: async () => {
        const { id, revision } = await createRawCharacter();
        return api.post(`characters/${id}/delete`, { confirm: false }, { "If-Match": String(revision) });
      },
    },
    {
      code: "DUPLICATE",
      status: 200,
      family: "empty",
      entity: "required",
      note: "duplicate rolodex entry",
      run: async () => {
        const { id } = await createRawCharacter();
        await api.post(`characters/${id}/ops/rolodex.add`, { entry: "Marlane" });
        return api.post(`characters/${id}/ops/rolodex.add`, { entry: "Marlane" });
      },
    },
    {
      code: "SLOT_FULL_FATAL",
      status: 200,
      family: "empty",
      entity: "required",
      note: "all harm slots full at/above the requested intensity",
      run: async () => {
        const { id } = await createRawCharacter();
        for (const intensity of ["lesser", "moderate", "severe", "fatal"]) {
          await api.post(`characters/${id}/ops/harm.add`, { description: `harm-${intensity}`, intensity });
        }
        return api.post(`characters/${id}/ops/harm.add`, { description: "overflow", intensity: "fatal" });
      },
    },
    {
      code: "CANNOT_HEAL",
      status: 200,
      family: "limit",
      entity: "required",
      note: "harm.heal with the healing clock not full",
      run: async () => {
        const { id } = await createRawCharacter();
        await api.post(`characters/${id}/ops/harm.add`, { description: "cut", intensity: "lesser" });
        return api.post(`characters/${id}/ops/harm.heal`, { description: "cut", intensity: "lesser" });
      },
    },
    {
      code: "ARMOR_NOT_AVAILABLE",
      status: 200,
      family: "empty",
      entity: "required",
      note: "armor.set used=true without availability",
      run: async () => {
        const { id } = await createRawCharacter();
        return api.post(`characters/${id}/ops/armor.set`, { armor: "standard", used: true });
      },
    },
    {
      code: "ABILITY_MAXED",
      status: 200,
      family: "limit",
      entity: "required",
      note: "ability.take beyond TimesTakeable",
      run: async () => {
        const { id } = await createRawCharacter();
        let last = await api.post(`characters/${id}/ops/ability.take`, { name: "Battleborn" });
        for (let i = 0; i < 5 && okFlag(last.body) !== false; i += 1) {
          last = await api.post(`characters/${id}/ops/ability.take`, { name: "Battleborn" });
        }
        return last;
      },
    },
    {
      code: "CANNOT_LEVEL_UP",
      status: 200,
      family: "limit",
      entity: "required",
      note: "attribute.levelup with the XP track not full",
      run: async () => {
        const { id } = await createRawCharacter();
        const { attribute, action } = firstAction(BLADES);
        return api.post(`characters/${id}/ops/attribute.levelup`, { attribute, action });
      },
    },
    {
      code: "RATING_MAXED",
      status: 200,
      family: "limit",
      entity: "required",
      note: "action.set-rating above the effective cap",
      run: async () => {
        const { id } = await createRawCharacter();
        const { action } = firstAction(BLADES);
        return api.post(`characters/${id}/ops/action.set-rating`, { action, rating: 99 });
      },
    },
    {
      code: "UPGRADE_MAXED",
      status: 200,
      family: "limit",
      entity: "required",
      note: "upgrade.mark beyond TotalBoxes",
      run: async () => {
        const { id } = await createRawCrew();
        let last = await api.post(`crews/${id}/ops/upgrade.mark`, { name: "Training" });
        for (let i = 0; i < 12 && okFlag(last.body) !== false; i += 1) {
          last = await api.post(`crews/${id}/ops/upgrade.mark`, { name: "Training" });
        }
        return last;
      },
    },
    {
      code: "INSUFFICIENT_FUNDS",
      status: 200,
      family: "funds",
      entity: "required",
      note: "fund.spend beyond the maximum affordable (frozen details {available, needed})",
      run: async () => {
        const { id } = await createRawCharacter();
        const character = await readCharacter(id);
        const fund = asRecord(character?.fund);
        const satchel = asRecord(fund?.satchel);
        const stash = asRecord(fund?.stash);
        // Bounds come from the entity's own settings-derived maxima; a
        // missing value is a fixture defect, not a reason to hardcode.
        const satchelMax = asNumber(satchel?.max);
        const stashMax = asNumber(stash?.max);
        if (satchelMax == null || stashMax == null) {
          throw new Error("INSUFFICIENT_FUNDS probe: entity satchel/stash max missing");
        }
        return api.post(`characters/${id}/ops/fund.spend`, { coins: satchelMax + stashMax + 5 });
      },
    },
    {
      code: "SATCHEL_FULL",
      status: 200,
      family: "limit",
      entity: "required",
      note: "fund.liquidate with a full satchel",
      run: async () => {
        const { id } = await createRawCharacter();
        await api.post(`characters/${id}/ops/fund.gain`, { coins: 2 });
        return api.post(`characters/${id}/ops/fund.liquidate`, { coins: 1 });
      },
    },
    {
      code: "OVER_BULK",
      status: 200,
      family: "limit",
      entity: "required",
      note: "gear.commit exceeding the load capacity",
      run: async () => {
        const { id } = await createRawCharacter();
        await api.post(`characters/${id}/ops/gear.add`, { name: "Greatcoat", bulk: 9 });
        await api.post(`characters/${id}/ops/gear.set-commitment`, { commitment: "light" });
        return api.post(`characters/${id}/ops/gear.commit`, { name: "Greatcoat" });
      },
    },
    {
      code: "NO_COMMITMENT",
      status: 200,
      family: "empty",
      entity: "required",
      note: "gear.commit with commitment none",
      run: async () => {
        const { id } = await createRawCharacter();
        await api.post(`characters/${id}/ops/gear.add`, { name: "Knife", bulk: 1 });
        return api.post(`characters/${id}/ops/gear.commit`, { name: "Knife" });
      },
    },
    {
      code: "COMMITMENT_LOCKED",
      status: 200,
      family: "empty",
      entity: "required",
      note: "gear.set-commitment while locked",
      run: async () => {
        const { id } = await createRawCharacter();
        await api.post(`characters/${id}/ops/gear.lock`);
        return api.post(`characters/${id}/ops/gear.set-commitment`, { commitment: "light" });
      },
    },
    {
      code: "NO_HISTORY",
      status: 200,
      family: "empty",
      entity: "required",
      note: "undo with no snapshot left",
      run: async () => {
        const { id } = await createRawCharacter();
        let last: HttpResponse | undefined;
        for (let i = 0; i < 3; i += 1) {
          const character = await readCharacter(id);
          const revision = asNumber(character?.revision) ?? 1;
          last = await api.post(`characters/${id}/undo`, undefined, { "If-Match": String(revision) });
          if (last.status !== 200 || okFlag(last.body) === false) break;
        }
        return last ?? api.post(`characters/${id}/undo`, undefined, { "If-Match": "1" });
      },
    },
    {
      code: "GAME_NOT_FOUND",
      status: 200,
      family: "empty",
      entity: "none",
      note: "create with an unknown game stem",
      run: () => api.post("characters", { gameStem: "no-such-game", playbook: "Cutter" }),
    },
    {
      code: "PAYLOAD_TOO_LARGE",
      status: 413,
      family: "limit",
      entity: "none",
      note: "request exceeding the service payload bound (1 MiB)",
      run: () => api.post("characters", { gameStem: BLADES, playbook: "Cutter", pad: "x".repeat(1_100_000) }),
    },
    {
      code: "TRAUMA_REQUIRED",
      status: 200,
      family: "empty",
      entity: "required",
      note: "end-score with pending trauma",
      run: async () => {
        const { id } = await createRawCharacter();
        await api.post(`characters/${id}/ops/stress.add`, { delta: 99 });
        return api.post(`characters/${id}/end-score`, {});
      },
    },
    {
      code: "OUT_OF_ACTION",
      status: 200,
      family: "empty",
      entity: "required",
      note: "stress.add while out of action",
      run: async () => {
        const { id } = await createRawCharacter();
        await api.post(`characters/${id}/ops/stress.add`, { delta: 99 });
        await api.post(`characters/${id}/ops/trauma.add`, { trauma: "Haunted" });
        return api.post(`characters/${id}/ops/stress.add`, { delta: 1 });
      },
    },
  ];
}

describe("contract error union (SC-O7)", () => {
  testCase(
    "ERR-UNION-001",
    "every branch of the whole-error union is exercised with status, code, detail shape, retryable, and recovery",
    async () => {
      // Run every branch and collect each failure so the oracle reports the
      // whole union at once.
      const failures: string[] = [];
      for (const branch of branches()) {
        try {
          const response = await branch.run();
          assertErrorResponse(response, {
            code: branch.code,
            status: branch.status,
            family: branch.family,
            entity: branch.entity,
          });
        } catch (error) {
          failures.push(
            `[${branch.code}] ${branch.note}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      expect(failures, "every union branch must conform to the frozen union").toEqual([]);
    },
  );

  testCase(
    "ERR-DETAIL-002",
    "VALIDATION carries pointer-level details with expected shape",
    async () => {
      const response = await api.post("characters", { gameStem: BLADES });
      assertErrorResponse(response, { code: "VALIDATION", status: 400, family: "pointer", entity: "optional" });
      const error = asRecord(asRecord(response.body)?.error);
      const rawIssues = asRecord(error?.details)?.issues;
      const issues = Array.isArray(rawIssues) ? rawIssues : [];
      expect(issues.length).toBeGreaterThanOrEqual(1);
      for (const rawIssue of issues) {
        const issue = asRecord(rawIssue);
        expect(issue).not.toBeNull();
        if (issue === null) continue;
        expect(issue.pointer).toMatch(POINTER);
        expect(issue.reason).toBeTypeOf("string");
        expect((issue.reason as string).length).toBeGreaterThan(0);
        expect(issue.expected).toBeTypeOf("string");
        expect((issue.expected as string).length).toBeGreaterThan(0);
      }
    },
  );

  testCase(
    "ERR-DETAIL-003",
    "RATING_MAXED carries limit and current in its details",
    async () => {
      const { id } = await createRawCharacter();
      const { action } = firstAction(BLADES);
      const response = await api.post(`characters/${id}/ops/action.set-rating`, { action, rating: 99 });
      assertErrorResponse(response, { code: "RATING_MAXED", status: 200, family: "limit", entity: "required" });
      const details = asRecord(asRecord(asRecord(response.body)?.error)?.details);
      const limit = asNumber(details?.limit);
      const current = asNumber(details?.current);
      expect(limit).not.toBeNull();
      if (limit !== null) {
        expect(Number.isInteger(limit)).toBe(true);
        expect(limit >= 1).toBe(true);
      }
      expect(current).not.toBeNull();
      if (current !== null) {
        expect(Number.isInteger(current)).toBe(true);
        expect(current >= 0).toBe(true);
      }
    },
  );

  testCase(
    "ERR-DETAIL-004",
    "NORMALIZATION_REQUIRED carries warnings and the preview token",
    async () => {
      const { id } = await createRawCharacter();
      const response = await api.post(`characters/${id}/import?preview=1`, {
        entity: { kind: "character", id, dossier: { name: "Import Me" } },
      });
      assertErrorResponse(response, { code: "NORMALIZATION_REQUIRED", status: 409, family: "preview", entity: "none" });
      const error = asRecord(response.body)?.error;
      const details = asRecord(asRecord(error)?.details);
      const token = asString(asRecord(error)?.token);
      const previewToken = asString(details?.previewToken);
      expect(asRecord(asRecord(error)?.preview)).not.toBeNull();
      expect(token).not.toBeNull();
      if (token !== null) expect(token.length).toBeGreaterThan(0);
      expect(Array.isArray(details?.warnings)).toBe(true);
      expect(previewToken).toBe(token);
    },
  );

  testCase(
    "ERR-DETAIL-005",
    "STALE_REVISION carries the current revision in its details",
    async () => {
      const { id, revision } = await createRawCharacter();
      const winner = await api.post(`characters/${id}/ops/note.add`, { text: "win" });
      expect(winner.status).toBe(200);
      const stale = await api.post(`characters/${id}/ops/note.add`, { text: "lose" }, { "If-Match": String(revision) });
      assertErrorResponse(stale, { code: "STALE_REVISION", status: 409, family: "stale", entity: "optional" });
      const currentRevision = revision + 1;
      const error = asRecord(stale.body)?.error;
      const details = asRecord(asRecord(error)?.details);
      const staleEntity = asRecord(error)?.entity;
      expect(details?.currentRevision).toBe(currentRevision);
      if (staleEntity !== undefined && staleEntity !== null) {
        const entityRevision = asNumber(asRecord(staleEntity)?.revision);
        expect(entityRevision).toBe(currentRevision);
      }
    },
  );

  testCase(
    "ERR-MISMATCH-006",
    "code/details mismatch is impossible at the schema level (frozen union probe)",
    async () => {
      // Tooling check over the frozen contract schemas with the REAL ajv
      // (draft 2020-12): operation-result.json + common.json + the three
      // entity schemas it refs (character/crew/clock.json), registered by
      // their $ids so every relative $ref resolves. Instance probes run
      // through ajv.compile on the full OperationResult schema — the union
      // branch (error) is validated as part of the document that carries it.
      const schemaDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "contract", "schemas");
      const parseSchema = async (file: string): Promise<Record<string, unknown> | null> =>
        asRecord(JSON.parse(await readFile(resolve(schemaDir, file), "utf8")) as unknown);
      const opSchema = await parseSchema("operation-result.json");
      const common = await parseSchema("common.json");
      const character = await parseSchema("character.json");
      const crew = await parseSchema("crew.json");
      const clock = await parseSchema("clock.json");
      // Boundary: the parsed files are the frozen contract; every access below
      // is additionally exercised by the behavioral probes.
      for (const [file, schema] of [
        ["operation-result.json", opSchema],
        ["common.json", common],
        ["character.json", character],
        ["crew.json", crew],
        ["clock.json", clock],
      ] as const) {
        expect(schema, `${file} is an object`).not.toBeNull();
      }
      if (opSchema === null || common === null || character === null || crew === null || clock === null) return;

      // Ajv2020 (draft 2020-12) over the real schema files. strict:false —
      // the frozen schemas carry the custom x-requiredWhenComplete annotation
      // keyword (completeness metadata, not a validation keyword); ajv-formats
      // supplies the date-time format the entity schemas use. addSchema by $id
      // makes every relative ref (common.json#/..., character.json, ...)
      // resolve against the operation-result base URI.
      const ajv = new Ajv2020({ allErrors: true, strict: false });
      addFormats(ajv);
      for (const schema of [opSchema, common, character, crew, clock]) {
        const id = asString(schema.$id);
        expect(id, "$id present").not.toBeNull();
        if (id !== null) ajv.addSchema(schema as unknown as AnySchemaObject, id);
      }
      const validate = ajv.compile(opSchema as unknown as AnySchemaObject);

      const defs = asRecord(opSchema.$defs);
      const commonDefs = asRecord(common.$defs);
      const union = schemaRecord(defs?.operationError);
      expect(union, "operationError union present").not.toBeNull();
      if (union === null) return;
      const branchesOf = Array.isArray(union.oneOf)
        ? union.oneOf.filter((branch): branch is JsonSchema => typeof branch === "object" && branch !== null)
        : [];
      const errorCodeRaw = asRecord(commonDefs?.errorCode)?.enum;
      const errorCodeEnum = Array.isArray(errorCodeRaw) ? errorCodeRaw : [];

      // Structural freeze: one branch per code, all required union fields.
      const codes: string[] = [];
      for (const branch of branchesOf) {
        const code = asRecord(asRecord(branch.properties)?.code)?.const;
        if (typeof code === "string") codes.push(code);
      }
      expect(codes.length).toBe(errorCodeEnum.length);
      expect([...codes].sort()).toEqual([...errorCodeEnum].sort());
      expect(new Set(codes).size).toBe(codes.length);
      for (const branch of branchesOf) {
        const required = branch.required as string[] | undefined;
        expect(required ?? []).toEqual(expect.arrayContaining(["code", "status", "message", "retryable", "recovery", "details"]));
        expect(branch.additionalProperties).toBe(false);
      }

      // Locked status table (work spec, stored-entity classification).
      const STATUS_TABLE: Record<string, number> = {
        VALIDATION: 400, INVALID_ENTRY: 400, INVALID_ENTITY: 422, NORMALIZATION_REQUIRED: 409,
        NOT_FOUND: 404, STALE_REVISION: 409, RETIRED: 200, CONFIRM_REQUIRED: 200, DUPLICATE: 200,
        SLOT_FULL_FATAL: 200, CANNOT_HEAL: 200, ARMOR_NOT_AVAILABLE: 200, ABILITY_MAXED: 200,
        CANNOT_LEVEL_UP: 200, RATING_MAXED: 200, UPGRADE_MAXED: 200, INSUFFICIENT_FUNDS: 200,
        SATCHEL_FULL: 200, OVER_BULK: 200, NO_COMMITMENT: 200, COMMITMENT_LOCKED: 200,
        NO_HISTORY: 200, GAME_NOT_FOUND: 200, PAYLOAD_TOO_LARGE: 413, TRAUMA_REQUIRED: 200,
        OUT_OF_ACTION: 200,
      };
      const DETAIL_REF: Record<string, string> = {
        VALIDATION: "errorPointerDetails", INVALID_ENTRY: "errorPointerDetails", INVALID_ENTITY: "errorPointerDetails",
        NORMALIZATION_REQUIRED: "errorPreviewDetails", STALE_REVISION: "errorStaleDetails",
        CANNOT_HEAL: "errorLimitDetails", ABILITY_MAXED: "errorLimitDetails", CANNOT_LEVEL_UP: "errorLimitDetails",
        RATING_MAXED: "errorLimitDetails", UPGRADE_MAXED: "errorLimitDetails", INSUFFICIENT_FUNDS: "errorFundsDetails",
        SATCHEL_FULL: "errorLimitDetails", OVER_BULK: "errorLimitDetails", PAYLOAD_TOO_LARGE: "errorLimitDetails",
      };
      for (const code of codes) {
        const branch = branchesOf.find(
          (candidate) => asRecord(asRecord(candidate.properties)?.code)?.const === code,
        );
        expect(branch, `${code} branch present`).toBeDefined();
        if (branch === undefined) continue;
        const props = asRecord(branch.properties);
        expect(asRecord(props?.status)?.const, `${code} locked status`).toBe(STATUS_TABLE[code]);
        if (code === "NORMALIZATION_REQUIRED") {
          expect(branch.required as string[] | undefined).toEqual(expect.arrayContaining(["preview", "token"]));
        }
        const details = asRecord(props?.details);
        const expectedRef = DETAIL_REF[code];
        if (expectedRef !== undefined) {
          expect(details?.$ref, `${code} details reference`).toBe(`common.json#/$defs/${expectedRef}`);
        } else {
          expect(details?.type).toBe("object");
          expect(details?.additionalProperties).toBe(false);
          expect(details?.properties ?? {}).toEqual({});
        }
      }

      // Behavioral probes through ajv. Every error probe is wrapped in a full
      // OperationResult document (ok=false, applied, sideEffects) so the union
      // is exercised where it lives. Entity members use the frozen golden
      // fixture (conformance/fixtures/golden-character.json), which must
      // itself validate against character.json for the probes to be sound.
      const goldenCharacter = JSON.parse(
        await readFile(resolve(schemaDir, "..", "..", "conformance", "fixtures", "golden-character.json"), "utf8"),
      ) as unknown;
      const validateCharacter = ajv.compile(character as unknown as AnySchemaObject);
      const goldenOk = validateCharacter(goldenCharacter);
      expect(goldenOk, `golden-character.json validates against character.json — ${ajv.errorsText(validateCharacter.errors)}`).toBe(true);

      const wrap = (error: unknown) => ({ ok: false, applied: { op: "x" }, sideEffects: [], error });
      const base = (code: string, status: number, details: unknown, extra: Record<string, unknown> = {}) => ({
        code, status, message: "m", retryable: true, recovery: "r", details, ...extra,
      });
      const probes: Array<{ label: string; value: unknown; valid: boolean }> = [
        // (a) A conforming VALIDATION error with pointer details validates.
        { label: "VALIDATION with pointer details", value: wrap(base("VALIDATION", 400, { issues: [{ pointer: "/dossier/name", reason: "x", expected: "y" }] })), valid: true },
        // (b) Code/details mismatch: VALIDATION carrying limit/current fails.
        { label: "VALIDATION with limit details", value: wrap(base("VALIDATION", 400, { limit: 1, current: 2 })), valid: false },
        { label: "VALIDATION without details", value: wrap({ code: "VALIDATION", status: 400, message: "m", retryable: true, recovery: "r" }), valid: false },
        { label: "STALE_REVISION with currentRevision only", value: wrap(base("STALE_REVISION", 409, { currentRevision: 3 })), valid: true },
        { label: "STALE_REVISION with currentContentToken only", value: wrap(base("STALE_REVISION", 409, { currentContentToken: `sha256:${"a".repeat(64)}` })), valid: true },
        { label: "STALE_REVISION with both stale fields", value: wrap(base("STALE_REVISION", 409, { currentRevision: 3, currentContentToken: `sha256:${"a".repeat(64)}` })), valid: false },
        { label: "STALE_REVISION with neither stale field", value: wrap(base("STALE_REVISION", 409, {})), valid: false },
        // (d) NORMALIZATION_REQUIRED with a full preview — changes + the
        //     golden document + canonical:false + previewToken — validates.
        { label: "NORMALIZATION_REQUIRED with full preview", value: wrap(base("NORMALIZATION_REQUIRED", 409, { warnings: [], previewToken: "t" }, { preview: { changes: [], document: goldenCharacter, canonical: false, previewToken: "t" }, token: "t" })), valid: true },
        // (e) Preview without the document fails (document is required).
        { label: "NORMALIZATION_REQUIRED preview without document", value: wrap(base("NORMALIZATION_REQUIRED", 409, { warnings: [], previewToken: "t" }, { preview: { changes: [], canonical: false, previewToken: "t" }, token: "t" })), valid: false },
        { label: "NORMALIZATION_REQUIRED without preview/token", value: wrap(base("NORMALIZATION_REQUIRED", 409, { warnings: ["w"], previewToken: "t" })), valid: false },
        { label: "RETIRED with entity", value: wrap(base("RETIRED", 200, {}, { entity: goldenCharacter })), valid: true },
        // The frozen schema does not list entity among RETIRED's required
        // fields (unlike CONFIRM_REQUIRED and the other 200-domain branches),
        // so a bare RETIRED error is schema-valid.
        { label: "RETIRED without entity", value: wrap(base("RETIRED", 200, {})), valid: true },
        { label: "CONFIRM_REQUIRED with entity", value: wrap(base("CONFIRM_REQUIRED", 200, {}, { entity: goldenCharacter })), valid: true },
        { label: "CONFIRM_REQUIRED without entity", value: wrap(base("CONFIRM_REQUIRED", 200, {})), valid: false },
        { label: "RETIRED with excess detail key", value: wrap(base("RETIRED", 200, { unexpected: 1 }, { entity: goldenCharacter })), valid: false },
        { label: "GAME_NOT_FOUND without entity", value: wrap(base("GAME_NOT_FOUND", 200, {})), valid: true },
        { label: "GAME_NOT_FOUND with entity", value: wrap(base("GAME_NOT_FOUND", 200, {}, { entity: goldenCharacter })), valid: false },
        { label: "PAYLOAD_TOO_LARGE with limit/current", value: wrap(base("PAYLOAD_TOO_LARGE", 413, { limit: 1048576, current: 2000000 })), valid: true },
        { label: "PAYLOAD_TOO_LARGE with empty details", value: wrap(base("PAYLOAD_TOO_LARGE", 413, {})), valid: false },
        // (f) INSUFFICIENT_FUNDS pins errorFundsDetails ({available, needed}),
        //     not the generic limit family: a limit/current detail must fail
        //     the union even though every value type-checks individually.
        //     Entity is required on this 200-domain branch.
        { label: "INSUFFICIENT_FUNDS with funds details", value: wrap(base("INSUFFICIENT_FUNDS", 200, { available: 4, needed: 9 }, { entity: goldenCharacter })), valid: true },
        { label: "INSUFFICIENT_FUNDS with limit/current", value: wrap(base("INSUFFICIENT_FUNDS", 200, { limit: 4, current: 9 }, { entity: goldenCharacter })), valid: false },
        { label: "INSUFFICIENT_FUNDS with empty details", value: wrap(base("INSUFFICIENT_FUNDS", 200, {}, { entity: goldenCharacter })), valid: false },
        { label: "VALIDATION with wrong status", value: wrap(base("VALIDATION", 409, { issues: [{ pointer: "", reason: "x", expected: "y" }] })), valid: false },
      ];
      for (const probe of probes) {
        const matches = validate(probe.value);
        expect(matches, `${probe.label} — ${ajv.errorsText(validate.errors)}`).toBe(probe.valid);
      }

      // Top-level OperationResult: the top-level error and batch[].error share
      // the union; the legacy {code,message} shape must be rejected.
      const resultError = wrap(base("VALIDATION", 400, { issues: [{ pointer: "/x", reason: "x", expected: "y" }] }));
      expect(validate(resultError), `OperationResult with typed VALIDATION error — ${ajv.errorsText(validate.errors)}`).toBe(true);
      // (c) The legacy {code,message} error shape fails the union.
      const legacy = { ok: false, applied: { op: "x" }, sideEffects: [], error: { code: "VALIDATION", message: "old shape" } };
      expect(validate(legacy), `OperationResult with legacy {code,message} error — ${ajv.errorsText(validate.errors)}`).toBe(false);
    },
  );

  testCase(
    "ERR-RETRY-007",
    "after the documented recovery action the same semantic operation succeeds",
    async () => {
      const { id, revision } = await createRawCharacter();
      const rejected = await api.post(`characters/${id}/delete`, { confirm: false }, { "If-Match": String(revision) });
      assertErrorResponse(rejected, { code: "CONFIRM_REQUIRED", status: 200, family: "empty", entity: "required" });
      const error = asRecord(asRecord(rejected.body)?.error);
      expect(error?.retryable, "CONFIRM_REQUIRED is retryable").toBe(true);
      const recovery = asString(error?.recovery);
      expect(recovery, "recovery names the missing confirmation").not.toBeNull();
      if (recovery !== null) expect(recovery.length).toBeGreaterThan(0);

      // The documented recovery action: repeat the same semantic operation
      // with confirm:true (same revision — retryable never promises blind
      // identical replay).
      const retried = await api.post(`characters/${id}/delete`, { confirm: true }, { "If-Match": String(revision) });
      expect(retried.status).toBe(200);
      expect(okFlag(retried.body)).toBe(true);
      const gone = await api.get(`characters/${id}`);
      expect(gone.status).toBe(404);
    },
  );

  testCase(
    "ERR-BATCH-008",
    "batch items use the same whole-error union schema",
    async () => {
      const { id } = await createRawCharacter();
      // Seed one ability take so the second batch op deterministically fails
      // with ABILITY_MAXED (a 200-status domain failure, consistent with the
      // delivered batch response).
      await api.post(`characters/${id}/ops/ability.take`, { name: "Battleborn" });
      const second = await createRawCharacter();
      await api.post(`characters/${second.id}/ops/ability.take`, { name: "Battleborn" });
      const response = await api.post("campaign/batch", {
        ops: [
          { entity: "character", id, op: "note.add", args: { text: "batched" } },
          { entity: "character", id: second.id, op: "ability.take", args: { name: "Battleborn" } },
        ],
      });
      expect(response.status).toBe(200);
      const body = asRecord(response.body);
      const rawBatch = body?.batch;
      expect(Array.isArray(rawBatch), "batch outcomes array present").toBe(true);
      const batch = Array.isArray(rawBatch) ? rawBatch : [];
      expect(batch).toHaveLength(2);
      const firstItem = asRecord(batch[0]);
      const secondItem = asRecord(batch[1]);
      expect(firstItem?.ok).toBe(true);
      expect(secondItem?.ok).toBe(false);
      assertErrorObject(secondItem?.error, { code: "ABILITY_MAXED", status: 200, family: "limit", entity: "required" }, "[batch ABILITY_MAXED]");
      if (body?.error !== undefined && body.error !== null) {
        assertUnionObjectShape(body.error, "[batch top-level error]");
      }
    },
  );

  testCase(
    "ERR-NORAW-009",
    "error messages are human-presentable and never embed a raw document",
    async () => {
      const responses: Array<{ code: string; response: HttpResponse }> = [];
      {
        const { id, revision } = await createRawCharacter();
        // Advance the revision so the original revision is stale.
        await api.post(`characters/${id}/ops/note.add`, { text: "advance" });
        const stale = await api.post(`characters/${id}/ops/note.add`, { text: "x" }, { "If-Match": String(revision) });
        responses.push({ code: "STALE_REVISION", response: stale });
      }
      {
        const { id, revision } = await createRawCharacter();
        const missingConfirm = await api.post(`characters/${id}/delete`, { confirm: false }, { "If-Match": String(revision) });
        responses.push({ code: "CONFIRM_REQUIRED", response: missingConfirm });
      }
      {
        const { id } = await createRawCharacter();
        await api.post(`characters/${id}/ops/ability.take`, { name: "Battleborn" });
        const maxed = await api.post(`characters/${id}/ops/ability.take`, { name: "Battleborn" });
        responses.push({ code: "ABILITY_MAXED", response: maxed });
      }
      {
        const { id } = await createRawCharacter();
        // The create baseline (FV-028) means the FIRST undo is satisfiable
        // (restores the create state). A second undo has no snapshots left
        // and returns NO_HISTORY with a non-null message.
        let last: HttpResponse | undefined;
        for (let i = 0; i < 3; i += 1) {
          const character = await readCharacter(id);
          const revision = asNumber(character?.revision) ?? 1;
          last = await api.post(`characters/${id}/undo`, undefined, { "If-Match": String(revision) });
          if (okFlag(last.body) === false || asRecord(asRecord(last.body)?.error)?.code === "NO_HISTORY") break;
        }
        responses.push({ code: "NO_HISTORY", response: last ?? await api.post(`characters/${id}/undo`, undefined, { "If-Match": "1" }) });
      }
      for (const { code, response } of responses) {
        const message = asString(asRecord(asRecord(response.body)?.error)?.message);
        expect(message, `[${code}] message is a string`).not.toBeNull();
        if (message === null) continue;
        expect(message.length, `[${code}] message non-empty`).toBeGreaterThan(0);
        // No raw document: not a JSON payload, no DTO fragments (F4: friendly
        // typed errors, no raw result documents).
        expect(message.startsWith("{") || message.startsWith("["), `[${code}] message is not raw JSON`).toBe(false);
        for (const fragment of ['"kind"', '"dossier"', '"monitor"', '"gear"']) {
          expect(message.includes(fragment), `[${code}] message does not embed ${fragment}`).toBe(false);
        }
      }
    },
  );

  // -------------------------------------------------------------------------
  // SC-O8 FV-specific oracle corrections (FV-004, FV-026).
  //
  // FV-004 (owner SC-A9): the server's cohort.add field check previously
  // rejected the contract-allowed fields hasArmor/edges/flaws/description
  // ("unknown field", 400 VALIDATION). The case asserts the SERVER behavior
  // (allowed fields accepted, true unknowns rejected), which is distinct
  // from the contract schema check — green since the field check was fixed.
  //
  // FV-026 (owner SC-C6, contract-only): dossier.update's vice request
  // schema previously typed vice as namedDescription (no purveyor). Wave 2
  // corrected it to $defs.vice (purveyor required). The contract is already
  // frozen correct, so this case is a GREEN guard that pins the corrected
  // request schema and the server's persist behavior.
  // -------------------------------------------------------------------------

  testCase(
    "ERR-FV004-001",
    "cohort.add accepts hasArmor/edges/flaws/description and rejects a true unknown field (FV-004)",
    async () => {
      const created = await api.post("crews", { gameStem: BLADES, crewType: "Assassins" });
      expect(created.status).toBe(200);
      expect(okFlag(created.body)).toBe(true);
      const crewRecord = asRecord(asRecord(created.body)?.crew);
      const id = asString(crewRecord?.id);
      const revision = asNumber(crewRecord?.revision);
      if (!id || revision === null) throw new Error("create returned no crew");

      // The exact UI payload from the FV-004 reproduction: the checkbox sends
      // hasArmor:false on every cohort add.
      const withArmor = await api.post(
        `crews/${id}/ops/cohort.add`,
        { cohortKind: "gang", gangType: "Thugs", hasArmor: false },
        { "If-Match": String(revision) },
      );
      expect(withArmor.status).toBe(200);
      expect(okFlag(withArmor.body)).toBe(true); // contract-allowed fields accepted
      const armorCohorts = Array.isArray(asRecord(asRecord(withArmor.body)?.crew)?.cohorts)
        ? (asRecord(asRecord(withArmor.body)?.crew)?.cohorts as Array<Record<string, unknown>>)
        : [];
      expect(armorCohorts[0]?.hasArmor).toBe(false);
      const revAfterArmor = asNumber(asRecord(asRecord(withArmor.body)?.crew)?.revision) ?? revision + 1;

      const withExtras = await api.post(
        `crews/${id}/ops/cohort.add`,
        {
          cohortKind: "expert",
          expertType: "Physicker",
          edges: ["Fearsome"],
          flaws: ["Savage"],
          description: "A steady hand",
        },
        { "If-Match": String(revAfterArmor) },
      );
      expect(withExtras.status).toBe(200);
      expect(okFlag(withExtras.body)).toBe(true); // full allowed field set accepted
      const extrasCohorts = Array.isArray(asRecord(asRecord(withExtras.body)?.crew)?.cohorts)
        ? (asRecord(asRecord(withExtras.body)?.crew)?.cohorts as Array<Record<string, unknown>>)
        : [];
      expect(extrasCohorts[0]?.edges).toEqual(["Fearsome"]);
      expect(extrasCohorts[0]?.flaws).toEqual(["Savage"]);
      expect(extrasCohorts[0]?.description).toBe("A steady hand");
      const revAfterExtras = asNumber(asRecord(asRecord(withExtras.body)?.crew)?.revision) ?? revAfterArmor + 1;

      // Control: a true unknown field stays rejected with the
      // VALIDATION branch of the error union.
      const unknown = await api.post(
        `crews/${id}/ops/cohort.add`,
        { cohortKind: "gang", xYzExtra: 1 },
        { "If-Match": String(revAfterExtras) },
      );
      expect(okFlag(unknown.body)).toBe(false);
      expect(asRecord(asRecord(unknown.body)?.error)?.code).toBe("VALIDATION");
    },
  );

  testCase(
    "ERR-FV026-001",
    "dossier.update vice request schema is $defs.vice (purveyor required) and a full vice object persists (FV-026, guard)",
    async () => {
      // Guard: Wave 2 (SC-C6) already corrected the request schema from
      // namedDescription to $defs.vice; this case pins that correction and
      // must stay green. It is the request-validation pin for FV-026.
      const schemaDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "contract", "schemas");
      const common = schemaRecord(JSON.parse(await readFile(resolve(schemaDir, "common.json"), "utf8")) as unknown);
      const vice = schemaRecord(asRecord(common?.$defs)?.vice);
      expect(vice, "$defs.vice present").not.toBeNull();
      expect(vice?.required).toEqual(expect.arrayContaining(["purveyor"]));

      const openapi = await readFile(
        resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "contract", "openapi.yaml"),
        "utf8",
      );
      const updateBlock = openapi.match(/  \/characters\/\{id\}\/ops\/dossier\.update:[\s\S]*?\n  \/[a-z]/)?.[0] ?? "";
      expect(updateBlock.length, "dossier.update block found").toBeGreaterThan(0);
      expect(updateBlock).toMatch(/vice:\s*\{\s*\$ref:\s*"\.\/schemas\/common\.json#\/\$defs\/vice"\s*\}/);

      const created = await api.post("characters", { gameStem: BLADES, playbook: firstPlaybook(BLADES) });
      expect(created.status).toBe(200);
      expect(okFlag(created.body)).toBe(true);
      const characterRecord = asRecord(asRecord(created.body)?.character);
      const id = asString(characterRecord?.id);
      const revision = asNumber(characterRecord?.revision);
      if (!id || revision === null) throw new Error("create returned no character");

      const updated = await api.post(
        `characters/${id}/ops/dossier.update`,
        { vice: { name: "Wine", description: "", purveyor: { name: "Salia", description: "" } } },
        { "If-Match": String(revision) },
      );
      expect(updated.status).toBe(200);
      expect(okFlag(updated.body)).toBe(true);

      const get = await api.get(`characters/${id}`);
      expect(get.status).toBe(200);
      const viceBody = asRecord(asRecord(get.body)?.dossier)?.vice as Record<string, unknown> | undefined;
      expect(asString(viceBody?.name)).toBe("Wine");
      expect(viceBody?.purveyor).toEqual({ name: "Salia", description: "" });
    },
  );
});

// ---------------------------------------------------------------------------
// JsonSchema + schemaRecord: boundary narrowing for the parsed frozen schema
// files (ERR-MISMATCH-006 hands them to ajv; ERR-FV026-001 reads $defs.vice).
// ---------------------------------------------------------------------------

interface JsonSchema {
  type?: string;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  properties?: Record<string, JsonSchema | boolean>;
  items?: JsonSchema | boolean;
  minItems?: number;
  minLength?: number;
  minimum?: number;
  pattern?: string;
  enum?: unknown[];
  const?: unknown;
  $ref?: string;
  oneOf?: Array<JsonSchema | boolean>;
  $defs?: Record<string, JsonSchema>;
}

/** Boundary narrowing for parsed schema files: a JSON object is a JsonSchema. */
function schemaRecord(value: unknown): JsonSchema | null {
  return asRecord(value) as JsonSchema | null;
}
