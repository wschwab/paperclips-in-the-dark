import { describe, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { api, type HttpResponse } from "../../src/api.js";
import { decode, Schemas } from "../../src/schemas.js";
import { testCase } from "../../src/test-case.js";

// SC-O2 total-collections oracle (frozen Wave 2 contract, E11 + FV-010).
// Every collection endpoint is total: one degraded member never changes the
// response away from 200 and never hides valid rows.  Degraded rows keep the
// same summary schema as valid rows (route-derived id/kind, canonical
// empties, isReadable/isRepairable/isComplete, sha256 deleteToken).  The
// unreadable crew deletion case freezes Q16: deleting an unreadable crew
// scans READABLE characters and atomically clears matching dossier.crewId
// while unreadable characters remain separately visible.

const UNREADABLE_CHAR = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"; // truncated bytes
const STALE_CHAR = "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd"; // non-object root
const UNREADABLE_CHAR_2 = "c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0"; // truncated bytes
const VALID_CHAR = "deadbeef-dead-4ead-8ead-deadbeefdead"; // readable, linked to UNREADABLE_CREW
const UNREADABLE_CREW = "efefefef-efef-4fef-8fef-efefefefefef"; // truncated bytes
const VALID_CREW = "f00df00d-f00d-4f00-8f00-f00df00df00d"; // readable
const UNREADABLE_CLOCK = "abababab-abab-4bab-8bab-abababababab"; // truncated bytes

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

async function roster(): Promise<{ characters: Array<Record<string, unknown>>; crews: Array<Record<string, unknown>> }> {
  const response = await api.get("campaign/roster");
  expect(response.status).toBe(200);
  return response.body as { characters: Array<Record<string, unknown>>; crews: Array<Record<string, unknown>> };
}

function rowOf(
  rows: Array<Record<string, unknown>>,
  id: string,
): Record<string, unknown> {
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error(`row ${id} missing from collection`);
  return row;
}

describe("contract total collections (SC-O2)", () => {
  testCase(
    "TOTAL-200-001",
    "the roster stays 200 with an unreadable member present and every valid row preserved (FV-010 reproduction)",
    async () => {
      const body = await roster();
      const validChar = rowOf(body.characters as Array<Record<string, unknown>>, VALID_CHAR);
      expect(validChar.name).toBe("Sable Verity");
      expect(validChar.isReadable).toBe(true);
      const validCrew = rowOf(body.crews as Array<Record<string, unknown>>, VALID_CREW);
      expect(validCrew.crewType).toBe("Assassins");
      expect(validCrew.isReadable).toBe(true);
      // the unreadable member is still listed, not dropped
      const degraded = rowOf(body.characters as Array<Record<string, unknown>>, UNREADABLE_CHAR);
      expect(degraded.isReadable).toBe(false);
    },
  );

  testCase(
    "TOTAL-ROW-002",
    "a degraded row carries the same summary schema as valid rows: route id/kind, canonical empties, readability flags, deleteToken",
    async () => {
      const body = await roster();
      const row = rowOf(body.characters as Array<Record<string, unknown>>, UNREADABLE_CHAR);
      expect(row.kind).toBe("character"); // route-derived kind
      expect(row.id).toBe(UNREADABLE_CHAR); // route-derived identity
      expect(row.name).toBe("");
      expect(row.alias).toBe("");
      expect(row.playbook).toBe("");
      expect(row.gameStem).toBe("");
      expect(row.crewId).toBe("");
      expect(row.stress).toBe(0);
      expect(row.traumas).toEqual([]);
      expect(row.isRetired).toBe(false);
      expect(row.isDeadish).toBe(false);
      expect(row.isReadable).toBe(false);
      expect(row.isRepairable).toBe(false); // unparseable bytes cannot be normalized
      expect(row.isComplete).toBe(false);
      expect(row.deleteToken).toMatch(/^sha256:[0-9a-f]{64}$/); // bound to raw bytes
    },
  );

  testCase(
    "TOTAL-DELETE-003",
    "an unreadable member is deletable via its deleteToken as If-Match",
    async () => {
      const body = await roster();
      const token = String(rowOf(body.characters as Array<Record<string, unknown>>, UNREADABLE_CHAR).deleteToken);
      expect(token).toMatch(/^sha256:[0-9a-f]{64}$/);
      const response = await api.post(
        `characters/${UNREADABLE_CHAR}/delete`,
        { confirm: true },
        { "If-Match": token },
      );
      expect(response.status).toBe(200);
      const result = await api.operation(response);
      expect(result.ok).toBe(true);
      const gone = await api.get(`characters/${UNREADABLE_CHAR}`);
      expect(gone.status).toBe(404);
    },
  );

  testCase(
    "TOTAL-STALE-004",
    "deleting with a stale content token returns 409 STALE_REVISION and leaves the degraded row in place",
    async () => {
      const body = await roster();
      rowOf(body.characters as Array<Record<string, unknown>>, STALE_CHAR);
      const staleToken = `sha256:${"0".repeat(64)}`;
      const response = await api.post(
        `characters/${STALE_CHAR}/delete`,
        { confirm: true },
        { "If-Match": staleToken },
      );
      expect(response.status).toBe(409);
      const result = await api.operation(response);
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("STALE_REVISION");
      // bytes unchanged, row still degraded
      const still = await api.get(`characters/${STALE_CHAR}`);
      expect(still.status).toBe(422);
    },
  );

  testCase(
    "TOTAL-CREW-005",
    "deleting an unreadable crew atomically unlinks its readable characters while unreadable characters remain visible separately",
    async () => {
      const body = await roster();
      const token = String(rowOf(body.crews as Array<Record<string, unknown>>, UNREADABLE_CREW).deleteToken);
      expect(token).toMatch(/^sha256:[0-9a-f]{64}$/);
      const response = await api.post(
        `crews/${UNREADABLE_CREW}/delete`,
        { confirm: true },
        { "If-Match": token },
      );
      expect(response.status).toBe(200);
      const result = await api.operation(response);
      expect(result.ok).toBe(true);

      // readable member unlinked atomically with the crew removal (raw
      // assert; the current server lags the frozen lifecycle fields)
      const unlinked = await api.get(`characters/${VALID_CHAR}`);
      expect(unlinked.status).toBe(200);
      expect((unlinked.body as { dossier?: { crewId?: string } }).dossier?.crewId).toBe("");

      // unreadable characters are not hidden by the crew deletion
      const after = await roster();
      const ghost = rowOf(after.characters as Array<Record<string, unknown>>, UNREADABLE_CHAR_2);
      expect(ghost.isReadable).toBe(false);
      expect(after.crews.some((c) => c.id === UNREADABLE_CREW)).toBe(false);
    },
  );

  testCase(
    "TOTAL-LIST-006",
    "character, crew, and clock list endpoints stay 200 with degraded members listed",
    async () => {
      const characters = await api.get("characters");
      expect(characters.status).toBe(200);
      const charRows = await decode(Schemas.CharacterSummaryList, characters.body);
      const degradedChar = charRows.find((c) => c.id === STALE_CHAR);
      expect(degradedChar).toBeDefined();
      expect(degradedChar?.isReadable).toBe(false);
      expect(charRows.some((c) => c.id === UNREADABLE_CHAR_2)).toBe(true);

      const crews = await api.get("crews");
      expect(crews.status).toBe(200);
      const crewRows = await decode(Schemas.CrewSummaryList, crews.body);
      expect(crewRows.some((c) => c.id === VALID_CREW)).toBe(true);

      const clocks = await api.get("clocks");
      expect(clocks.status).toBe(200);
      const clockRows = clocks.body as Array<Record<string, unknown>>;
      expect(clockRows.some((c) => c.id === UNREADABLE_CLOCK)).toBe(true);
    },
  );

  testCase(
    "TOTAL-HEALTH-007",
    "guard: the server stays healthy after every counterexample in this suite",
    async () => {
      const health = await api.health();
      expect(health.status).toBe("ok");
    },
  );

  testCase(
    "TOTAL-NOWRITE-008",
    "guard: collection reads never write (checksums of degraded and valid seed files unchanged)",
    async () => {
      const watched: Array<[string, string]> = [
        ["character", STALE_CHAR],
        ["character", UNREADABLE_CHAR_2],
        ["crew", VALID_CREW],
        ["clock", UNREADABLE_CLOCK],
      ];
      const before = new Map<string, string>();
      for (const [kind, id] of watched) before.set(`${kind}/${id}`, await fileSha256(kind, id));

      await api.get("campaign/roster");
      await api.get("characters");
      await api.get("crews");
      await api.get("clocks");

      for (const [kind, id] of watched) {
        expect(await fileSha256(kind, id)).toBe(before.get(`${kind}/${id}`));
      }
    },
  );
});
