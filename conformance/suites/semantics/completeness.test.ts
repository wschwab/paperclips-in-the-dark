import { describe, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { BLADES } from "../../src/suite-helpers.js";
import { firstPlaybook } from "../../src/game-data.js";
import { PREDICATES } from "../../../frontend/src/schema/generated/completeness.js";

/**
 * SC-O3 completeness oracle (governing spec § Completeness; wave0
 * completeness-audit.mdx).
 *
 * Completeness is DERIVED, never stored, and separate from structural
 * validity. The frozen contract pins 13 completeness pointers (8 character,
 * 5 crew) via `x-requiredWhenComplete` records with the `nonBlankString`
 * predicate; clocks carry no completeness list (Q12). A present canonical
 * empty (`""`) at a locked pointer makes an entity readable + incomplete; a
 * satisfying value advances it toward complete; legitimate empties OUTSIDE
 * the list never block completeness; retirement/deadish state does not
 * change the computation; the roster summary reports
 * isReadable/isRepairable/isComplete derived at response time.
 *
 * These cases create entities through the raw API (the suite targets exact
 * pointer values) and assert readability as "served as a normal entity
 * document (200) with the expected pointer value"; full frozen-schema
 * readability is pinned by SC-O1's canonical-shape cases.
 *
 * The roster summary derives isReadable/isRepairable/isComplete/deleteToken
 * at response time (green since Wave 4). The real-value assertions in
 * COMPLETE-LEGIT-005 (a fully-named entity must report isReadable/isComplete
 * true) and the seeded stored-entity directions in COMPLETE-ALL-003
 * (canonical empty at /playbook/name and /crewTypeName, directions the ops
 * cannot reach) assert that derivation end to end; the guards
 * (COMPLETE-CLOCK-009, COMPLETE-NOSTORE-010) stay green.
 *
 * Run through the managed harness with the completeness seeds (the seeded
 * stored entities only exist when the seed tree is applied):
 *   node scripts/managed-run.mjs --seed conformance/fixtures/completeness-seeds -- --run suites/semantics/completeness.test.ts
 * The suite also runs green under `--seed-defaults`, which applies the
 * sc-o2-seeds admission fixtures plus the completeness seeds.
 */

// ---------------------------------------------------------------------------
// Frozen completeness pointer lists (contract/schemas/character.json,
// contract/schemas/crew.json `x-requiredWhenComplete`; wave0 audit table).
// ---------------------------------------------------------------------------

const CHARACTER_POINTERS = [
  "/dossier/name",
  "/dossier/alias",
  "/dossier/look",
  "/dossier/heritage/name",
  "/dossier/background/name",
  "/dossier/vice/name",
  "/dossier/vice/purveyor/name",
  "/playbook/name",
] as const;

const CREW_POINTERS = ["/name", "/crewTypeName", "/lair", "/reputation", "/huntingGrounds"] as const;

// Stored entities seeded from conformance/fixtures/completeness-seeds/ (the
// managed harness applies the tree via --seed before server start). Each is
// a canonical document — route id == body id, kind matches, every pointer
// satisfied except the one named — carrying the canonical empty at a pointer
// the API cannot rewrite (playbook.name / crewTypeName are satisfied at
// creation and no op updates them). They pin the empty-to-incomplete
// direction for those two pointers. The retired seed (isRetired true,
// canonical empty at /dossier/name — retirement preserves dossier verbatim,
// so the empty survives any lifecycle transition) pins the lifecycle-invariant
// direction (COMPLETE-RETIRED-008).
const PLAYBOOK_EMPTY_SEED = "c0ffee00-c0ff-4ee0-8c0f-feec0ffee000";
const CREWTYPE_EMPTY_SEED = "b0b5eed0-b0b5-4eed-9eed-b0b5eed0b0b5";
const RETIRED_EMPTY_SEED = "d3adbeef-d3ad-4ead-8ead-d3adbeef0001";

// dossier.update body that satisfies all seven dossier pointers. The op is a
// partial update at the top level, and each provided nested object (heritage,
// background, vice) REPLACES the stored object wholesale, so every value here
// is a complete schema-valid object.
const DOSSIER_FULL = {
  name: "Brenda",
  alias: "Web",
  look: "Sharp",
  heritage: { name: "Iruvian", description: "d" },
  background: { name: "Soldier", description: "d" },
  vice: { name: "Faith", description: "d", purveyor: { name: "Priest", description: "d" } },
};

// fields.update body that satisfies the four reachable crew pointers
// (crewTypeName is satisfied at creation).
const CREW_FULL = { name: "The Knives", lair: "A cellar", reputation: "Dreaded", huntingGrounds: "Docks" };

/**
 * The dossier.update / fields.update payload that fills every pointer EXCEPT
 * the given one. Nested pointers drop their whole top-level field: the frozen
 * op schemas require complete nested objects (vice/heritage/background), so a
 * partial nested object would be rejected once the runtime catches up; the
 * omitted pointer's canonical empty is what the assertion needs, and any
 * sibling fields left empty only keep the entity incomplete.
 *
 * The vice pair is the exception: both /dossier/vice/name and
 * /dossier/vice/purveyor/name live in the SAME nested object, so deleting
 * `vice` would empty BOTH pointers at once and neither would be tested
 * independently. The empty direction therefore re-sends the sibling
 * satisfied: for the /dossier/vice/name target, purveyor.name stays
 * "Priest"; for the /dossier/vice/purveyor/name target, vice.name stays
 * "Faith" — exactly one pointer is left canonical empty in each case.
 */
function fillExcept(pointer: string, full: Record<string, unknown>): Record<string, unknown> {
  const result = { ...full };
  if (pointer === "/dossier/vice/name" || pointer === "/dossier/vice/purveyor/name") {
    const vice = { ...(full.vice as Record<string, unknown>) };
    const purveyor = { ...(vice.purveyor as Record<string, unknown>) };
    if (pointer === "/dossier/vice/name") {
      vice.name = "";
    } else {
      purveyor.name = "";
    }
    vice.purveyor = purveyor;
    result.vice = vice;
    return result;
  }
  const segments = pointer.split("/").filter(Boolean);
  const top = segments[0] === "dossier" ? segments[1] : segments[0];
  if (top !== undefined) delete result[top];
  return result;
}

/** Minimal dossier.update payload that satisfies one character pointer. */
function dossierFill(pointer: string): Record<string, unknown> {
  switch (pointer) {
    case "/dossier/name":
      return { name: "Brenda" };
    case "/dossier/alias":
      return { alias: "Web" };
    case "/dossier/look":
      return { look: "Sharp" };
    case "/dossier/heritage/name":
      return { heritage: { name: "Iruvian", description: "d" } };
    case "/dossier/background/name":
      return { background: { name: "Soldier", description: "d" } };
    case "/dossier/vice/name":
      // dossier.update replaces the nested vice object wholesale, so the
      // satisfying fill must re-send the sibling already satisfied by the
      // empty direction (purveyor.name "Priest"); the fill TRANSITIONS only
      // the target pointer — vice.name goes from canonical empty to "Faith"
      // while purveyor.name is untouched.
      return { vice: { name: "Faith", description: "d", purveyor: { name: "Priest", description: "d" } } };
    case "/dossier/vice/purveyor/name":
      // Mirror of the vice/name case: the payload is the same complete vice
      // object (wholesale replacement), but after the empty direction stored
      // vice.name "Faith" with purveyor.name "", this fill transitions ONLY
      // the target — purveyor.name goes from canonical empty to "Priest"
      // while vice.name is untouched. The two vice iterations are therefore
      // independent: each proves that its own pointer is what blocks
      // completeness and that filling it alone completes the entity.
      return { vice: { name: "Faith", description: "d", purveyor: { name: "Priest", description: "d" } } };
    default:
      throw new Error(`no dossier fill for ${pointer}`);
  }
}

/** Minimal fields.update payload that satisfies one crew pointer. */
function crewFill(pointer: string): Record<string, unknown> {
  switch (pointer) {
    case "/name":
      return { name: "The Knives" };
    case "/lair":
      return { lair: "A cellar" };
    case "/reputation":
      return { reputation: "Dreaded" };
    case "/huntingGrounds":
      return { huntingGrounds: "Docks" };
    default:
      throw new Error(`no crew fill for ${pointer}`);
  }
}

// ---------------------------------------------------------------------------
// Raw API helpers (raw bodies, no DTO decode — assertions target exact field
// values).
// ---------------------------------------------------------------------------

async function createRawCharacter(): Promise<{ id: string; revision: number }> {
  const response = await api.post("characters", { gameStem: BLADES, playbook: firstPlaybook(BLADES) });
  expect(response.status).toBe(200);
  const body = JSON.parse(response.rawBody) as { ok: boolean; character: { id: string; revision: number } };
  expect(body.ok).toBe(true);
  return body.character;
}

async function createRawCrew(): Promise<{ id: string; revision: number }> {
  const response = await api.post("crews", { gameStem: BLADES, crewType: "Assassins" });
  expect(response.status).toBe(200);
  const body = JSON.parse(response.rawBody) as { ok: boolean; crew: { id: string; revision: number } };
  expect(body.ok).toBe(true);
  return body.crew;
}

async function rawCharacterOp(id: string, op: string, body?: unknown): Promise<Record<string, unknown>> {
  const response = await api.post(`characters/${id}/ops/${op}`, body);
  expect(response.status).toBe(200);
  const parsed = JSON.parse(response.rawBody) as Record<string, unknown>;
  expect(parsed.ok).toBe(true);
  return parsed;
}

async function rawCrewOp(id: string, op: string, body?: unknown): Promise<Record<string, unknown>> {
  const response = await api.post(`crews/${id}/ops/${op}`, body);
  expect(response.status).toBe(200);
  const parsed = JSON.parse(response.rawBody) as Record<string, unknown>;
  expect(parsed.ok).toBe(true);
  return parsed;
}

async function rawDetail(kind: "characters" | "crews", id: string): Promise<Record<string, unknown>> {
  const response = await api.get(`${kind}/${encodeURIComponent(id)}`);
  expect(response.status).toBe(200);
  return JSON.parse(response.rawBody) as Record<string, unknown>;
}

/**
 * Roster row lookup. Read the raw body and find the row by id so assertions
 * target exact field values.
 */
async function rosterRow(kind: "characters" | "crews", id: string): Promise<Record<string, unknown>> {
  const response = await api.get("campaign/roster");
  expect(response.status).toBe(200);
  const body = response.body;
  if (body === null || typeof body !== "object" || !("characters" in body) || !("crews" in body)) {
    throw new Error("roster response is not a {characters, crews} object");
  }
  const rows = body[kind];
  if (!Array.isArray(rows)) throw new Error(`roster ${kind} is not an array`);
  const row = rows.find((item) => item !== null && typeof item === "object" && "id" in item && item.id === id);
  if (row === undefined) throw new Error(`roster missing ${kind} row ${id}`);
  return row;
}

describe("§ Completeness — derived, never stored (SC-O3)", () => {
  testCase(
    "COMPLETE-EMPTY-001",
    "a character with canonical empty at /dossier/name is readable and incomplete",
    async () => {
      const character = await createRawCharacter();

      // Readable: the canonical empty is schema-valid (no minLength on the
      // locked pointers — Q10), so the entity is served as a normal document
      // with the canonical empty at the pointer.
      const detail = await rawDetail("characters", character.id);
      expect(detail.dossier).toMatchObject({ name: "" });

      // Incomplete: the roster summary must report it (derived at response
      // time).
      const summary = await rosterRow("characters", character.id);
      expect(summary.isReadable).toBe(true);
      expect(summary.isComplete).toBe(false);
    },
  );

  testCase(
    "COMPLETE-FILL-002",
    "filling the pointer flips the roster summary to complete without any stored flag change",
    async () => {
      const character = await createRawCharacter();
      const health = await api.health();
      const storedPath = join(health.dataDir, "characters", character.id, "current.json");
      const before = readFileSync(storedPath, "utf8");
      expect(before).not.toContain("isComplete");
      expect(before).not.toContain("isReadable");
      expect(before).not.toContain("isRepairable");

      // A fresh character carries canonical empties at all seven dossier
      // pointers (create fills only playbook.name), so filling name alone
      // leaves six pointers empty and the roster incomplete. Fill the other
      // six first: the empty direction must report incomplete, and the name
      // fill is what flips the summary to complete.
      await rawCharacterOp(character.id, "dossier.update", fillExcept("/dossier/name", DOSSIER_FULL));
      const beforeFlip = await rosterRow("characters", character.id);
      expect(beforeFlip.isComplete).toBe(false);

      const filled = await rawCharacterOp(character.id, "dossier.update", { name: "Brenda" });
      expect(filled.character).toMatchObject({ dossier: { name: "Brenda" } });

      // The roster summary flips to complete (derived at response time).
      const summary = await rosterRow("characters", character.id);
      expect(summary.isComplete).toBe(true);

      // The stored document changed only in the dossier field — no
      // completeness flag was persisted alongside it.
      const after = readFileSync(storedPath, "utf8");
      expect(after).not.toContain("isComplete");
      expect(after).not.toContain("isReadable");
      expect(after).not.toContain("isRepairable");
    },
  );

  testCase(
    "COMPLETE-ALL-003",
    "each of the 13 completeness pointers: canonical empty → incomplete; a satisfying value → complete",
    async () => {
      for (const pointer of CHARACTER_POINTERS) {
        const character = await createRawCharacter();
        if (pointer === "/playbook/name") {
          // playbook.name is satisfied at creation (create takes the playbook
          // name); the canonical-empty direction is unreachable through the
          // API (no op rewrites playbook.name). Pin the satisfying direction
          // here, and the canonical-empty direction on the seeded stored
          // character (route id == body id, kind matches, canonical
          // otherwise — see conformance/fixtures/completeness-seeds/): its
          // stored playbook.name is "" and every other pointer is satisfied,
          // so the roster must report it incomplete.
          const filled = await rawCharacterOp(character.id, "dossier.update", DOSSIER_FULL);
          expect(filled.ok).toBe(true);
          const summary = await rosterRow("characters", character.id);
          expect(summary.isComplete).toBe(true);
          const seededDetail = await rawDetail("characters", PLAYBOOK_EMPTY_SEED);
          expect(seededDetail.playbook).toMatchObject({ name: "" });
          const seeded = await rosterRow("characters", PLAYBOOK_EMPTY_SEED);
          expect(seeded.isComplete).toBe(false);
          continue;
        }
        // Canonical empty at this pointer, every other dossier pointer
        // satisfied → incomplete.
        const except = fillExcept(pointer, DOSSIER_FULL);
        const partial = await rawCharacterOp(character.id, "dossier.update", except);
        expect(partial.ok).toBe(true);
        const incomplete = await rosterRow("characters", character.id);
        expect(incomplete.isComplete).toBe(false);
        // A satisfying value at the pointer → complete.
        const done = await rawCharacterOp(character.id, "dossier.update", dossierFill(pointer));
        expect(done.ok).toBe(true);
        const complete = await rosterRow("characters", character.id);
        expect(complete.isComplete).toBe(true);
      }

      for (const pointer of CREW_POINTERS) {
        const crew = await createRawCrew();
        if (pointer === "/crewTypeName") {
          // crewTypeName is satisfied at creation; same unreachability note
          // as /playbook/name. Pin the satisfying direction here and the
          // canonical-empty direction on the seeded stored crew (route id ==
          // body id, kind matches, canonical otherwise): stored
          // crewTypeName "" with every other pointer satisfied must be
          // reported incomplete.
          const filled = await rawCrewOp(crew.id, "fields.update", CREW_FULL);
          expect(filled.ok).toBe(true);
          const summary = await rosterRow("crews", crew.id);
          expect(summary.isComplete).toBe(true);
          const seededDetail = await rawDetail("crews", CREWTYPE_EMPTY_SEED);
          expect(seededDetail).toMatchObject({ crewTypeName: "" });
          const seeded = await rosterRow("crews", CREWTYPE_EMPTY_SEED);
          expect(seeded.isComplete).toBe(false);
          continue;
        }
        const except = fillExcept(pointer, CREW_FULL);
        const partial = await rawCrewOp(crew.id, "fields.update", except);
        expect(partial.ok).toBe(true);
        const incomplete = await rosterRow("crews", crew.id);
        expect(incomplete.isComplete).toBe(false);
        const done = await rawCrewOp(crew.id, "fields.update", crewFill(pointer));
        expect(done.ok).toBe(true);
        const complete = await rosterRow("crews", crew.id);
        expect(complete.isComplete).toBe(true);
      }
    },
  );

  testCase(
    "COMPLETE-WHITESPACE-004",
    "whitespace-only string fails nonBlankString and stays incomplete",
    async () => {
      const character = await createRawCharacter();
      const set = await rawCharacterOp(character.id, "dossier.update", { name: "   " });
      expect(set.character).toMatchObject({ dossier: { name: "   " } });

      // Whitespace is schema-valid (no minLength/pattern on the pointer), so
      // the entity stays readable — but nonBlankString fails (no
      // non-whitespace character), so it must be reported incomplete.
      const detail = await rawDetail("characters", character.id);
      expect(detail.dossier).toMatchObject({ name: "   " });
      const summary = await rosterRow("characters", character.id);
      expect(summary.isComplete).toBe(false);

      // Unicode whitespace is ALSO blank per the predicate vocabulary
      // (nonBlankString = at least one character that is NOT Unicode
      // whitespace; audit X1). NBSP must fail the predicate on both the
      // backend and the frontend evaluators.
      const nbsp = await rawCharacterOp(character.id, "dossier.update", { name: "\u00A0\u00A0" });
      expect(nbsp.character).toMatchObject({ dossier: { name: "\u00A0\u00A0" } });
      const nbspSummary = await rosterRow("characters", character.id);
      expect(nbspSummary.isComplete).toBe(false);
    },
  );

  testCase(
    "COMPLETE-LEGIT-005",
    "legitimate empties outside the list leave a fully-named entity complete",
    async () => {
      // Character: all 8 pointers satisfied; crewId "", notes [], notebook "",
      // zero monitor/talent/gear/fund/contacts/session state — all legitimate
      // permanent states (wave0 audit exclusion table).
      const character = await createRawCharacter();
      const filled = await rawCharacterOp(character.id, "dossier.update", DOSSIER_FULL);
      expect(filled.character).toMatchObject({ dossier: { crewId: "", notes: [] } });
      const detail = await rawDetail("characters", character.id);
      expect(detail.dossier).toMatchObject({ name: "Brenda", crewId: "" });
      const summary = await rosterRow("characters", character.id);
      // Real-value assertion: a fully-named entity (all 8 pointers
      // satisfied) with only legitimate empties outside the list must be
      // reported readable and complete (green since Wave 4) — and it also
      // fails if the implementation ever over-reports incompleteness for
      // these states.
      expect(summary.isReadable).toBe(true);
      expect(summary.isComplete).toBe(true);

      // Crew: all 5 pointers satisfied; tier 0, contacts [], factions [],
      // notes [], coin/stash 0 — legitimate states (Q4 empty roster).
      const crew = await createRawCrew();
      const crewFilled = await rawCrewOp(crew.id, "fields.update", CREW_FULL);
      expect(crewFilled.crew).toMatchObject({ tier: 0, contacts: [], factions: [] });
      const crewDetail = await rawDetail("crews", crew.id);
      expect(crewDetail).toMatchObject({ name: "The Knives", tier: 0 });
      const crewSummary = await rosterRow("crews", crew.id);
      // Same real-value assertion as the character half: all 5 crew
      // pointers satisfied, legitimate states only outside the list →
      // readable and complete.
      expect(crewSummary.isReadable).toBe(true);
      expect(crewSummary.isComplete).toBe(true);
    },
  );

  testCase(
    "COMPLETE-PREDICATES-006",
    "counterexamples X2/X3/X4 are schema-valid, readable, and never block completeness",
    async () => {
      // Predicate vocabulary (Q9): nonBlankString, nonEmptyArray,
      // positiveInteger, true. The initial field set uses only
      // nonBlankString, so X2/X3/X4 pin the reserved predicates' semantics:
      // each value is schema-valid (readable — never routed to repair) and
      // fails its predicate (positiveInteger on 0, `true` on false,
      // nonEmptyArray on []). Because no locked pointer uses them, the values
      // must not block completeness of an otherwise fully-named entity; a
      // future pointer using one of these predicates routes these values to
      // readable-incomplete, never repair (Q10).
      //
      // X2 — valid zero: crew.tier 0 (minimum 0).
      // X4 — valid empty array: crew.contacts [] (no minItems).
      const crew = await createRawCrew();
      const crewFilled = await rawCrewOp(crew.id, "fields.update", CREW_FULL);
      expect(crewFilled.crew).toMatchObject({ tier: 0, contacts: [] });
      const crewDetail = await rawDetail("crews", crew.id);
      expect(crewDetail).toMatchObject({ tier: 0, contacts: [] });
      const crewSummary = await rosterRow("crews", crew.id);
      expect(crewSummary.isComplete).toBe(true);

      // X3 — valid false: character.traumaPending false (type boolean).
      const character = await createRawCharacter();
      const charFilled = await rawCharacterOp(character.id, "dossier.update", DOSSIER_FULL);
      expect(charFilled.character).toMatchObject({ traumaPending: false });
      const charDetail = await rawDetail("characters", character.id);
      expect(charDetail).toMatchObject({ traumaPending: false });
      const charSummary = await rosterRow("characters", character.id);
      expect(charSummary.isComplete).toBe(true);

      // (a) Predicate level — audit X0-X4 semantics (Q9): each predicate is
      // the GENERATED production evaluator from
      // frontend/src/schema/generated/completeness.ts (regenerated from the
      // contract x-requiredWhenComplete lists), so this pin can never drift
      // from what the runtime derives. The initial field set uses only
      // nonBlankString, so X2/X3/X4 pin the RESERVED predicates' semantics
      // (positiveInteger, true, nonEmptyArray) as locked vocabulary: a future
      // pointer using them routes these counterexample values to
      // readable-incomplete, never to repair. A type mismatch is a predicate
      // failure, never a schema violation (the document stays readable).
      expect(PREDICATES.nonBlankString("")).toBe(false); // X0 canonical empty
      expect(PREDICATES.nonBlankString("   ")).toBe(false); // X1 whitespace
      expect(PREDICATES.nonBlankString("a")).toBe(true);
      expect(PREDICATES.positiveInteger(0)).toBe(false); // X2 valid zero
      expect(PREDICATES.positiveInteger(1)).toBe(true);
      expect(PREDICATES.true(false)).toBe(false); // X3 valid false
      expect(PREDICATES.true(true)).toBe(true);
      expect(PREDICATES.nonEmptyArray([])).toBe(false); // X4 valid empty array
      expect(PREDICATES.nonEmptyArray(["x"])).toBe(true);

      // (b) Readability — pinned above per entity: each X-value is
      // schema-valid (the raw GET returns 200 with the pointer value intact),
      // so the entity is served readable, never routed to repair.
      //
      // (c) Current-set behavior — also pinned above: with the initial
      // pointer set (all nonBlankString), the SAME entities are complete
      // (roster summary isComplete true). That is the current field set,
      // distinct from the reserved-predicate classification in (a): only a
      // FUTURE pointer using positiveInteger/true/nonEmptyArray would
      // classify these values as readable-incomplete (Q10).
    },
  );

  testCase(
    "COMPLETE-SUMMARY-007",
    "roster summary reports isReadable/isRepairable/isComplete with no stored flags",
    async () => {
      // A fresh character is readable (canonical), repairable (a canonical
      // result exists — itself), incomplete (canonical empties at the locked
      // pointers), and carries an empty deleteToken (readable rows). All
      // derived at response time; nothing stored.
      const character = await createRawCharacter();
      const summary = await rosterRow("characters", character.id);
      expect(summary.isReadable).toBe(true);
      expect(summary.isRepairable).toBe(true);
      expect(summary.isComplete).toBe(false);
      expect(summary.deleteToken).toBe("");

      const crew = await createRawCrew();
      const crewSummary = await rosterRow("crews", crew.id);
      expect(crewSummary.isReadable).toBe(true);
      expect(crewSummary.isRepairable).toBe(true);
      expect(crewSummary.isComplete).toBe(false);
      expect(crewSummary.deleteToken).toBe("");
    },
  );

  testCase(
    "COMPLETE-RETIRED-008",
    "retired and deadish entities use the same completeness computation",
    async () => {
      // Retired: the seeded stored retired character (canonical, isRetired
      // true, canonical empty at /dossier/name — retirement preserves
      // dossier verbatim, so the empty stays) must remain incomplete.
      const retiredDetail = await rawDetail("characters", RETIRED_EMPTY_SEED);
      expect(retiredDetail.isRetired).toBe(true);
      expect(retiredDetail.dossier).toMatchObject({ name: "" });
      const retiredSummary = await rosterRow("characters", RETIRED_EMPTY_SEED);
      expect(retiredSummary.isComplete).toBe(false);

      // Deadish: fatal harm (isDeadish true), dossier preserved.
      const deadish = await createRawCharacter();
      const fatal = await rawCharacterOp(deadish.id, "harm.add", { intensity: "fatal", description: "dead" });
      expect(fatal.ok).toBe(true);
      const deadishDto = await rawDetail("characters", deadish.id);
      expect(deadishDto.isDeadish).toBe(true);
      expect(deadishDto.dossier).toMatchObject({ name: "" });
      const deadishSummary = await rosterRow("characters", deadish.id);
      expect(deadishSummary.isComplete).toBe(false);

      // Same computation: a plain character with the same dossier state
      // reports the same completeness value as both lifecycle states.
      const plain = await createRawCharacter();
      const plainSummary = await rosterRow("characters", plain.id);
      expect(plainSummary.isComplete).toBe(retiredSummary.isComplete);
      expect(plainSummary.isComplete).toBe(deadishSummary.isComplete);
    },
  );

  testCase(
    "COMPLETE-CLOCK-009",
    "standalone clocks are always complete after create: no completeness list exists on clocks",
    async () => {
      // Static: the frozen clock schema carries no completeness list (Q12 —
      // a standalone clock's identifying configuration is mandatory at
      // creation, so a list would be vacuous).
      const clockSchema = JSON.parse(
        readFileSync(new URL("../../../contract/schemas/clock.json", import.meta.url), "utf8"),
      ) as Record<string, unknown>;
      expect(clockSchema).not.toHaveProperty("x-requiredWhenComplete");

      // Dynamic: a created clock response carries no completeness fields.
      // The frozen create shape (behavior/ownerKind/ownerId/purpose) is
      // accepted; the fallback below only matters if a runtime ever rejects
      // it, so this guard stays green regardless.
      const frozen = await api.post("clocks", {
        name: "Long Term Project",
        behavior: "bounded",
        size: 4,
        purpose: "custom",
        ownerKind: "campaign",
        ownerId: "",
        relatedClockIds: [],
      });
      let response = frozen;
      if (frozen.status !== 200) {
        const body = frozen.body;
        let code: unknown;
        if (body !== null && typeof body === "object" && "error" in body) {
          const error = body.error;
          if (error !== null && typeof error === "object" && "code" in error) {
            code = error.code;
          }
        }
        expect(code).toBe("VALIDATION");
        response = await api.post("clocks", { name: "Long Term Project", clockKind: "project", size: 4 });
      }
      expect(response.status).toBe(200);
      const clock = response.body;
      if (clock === null || typeof clock !== "object") throw new Error("clock response is not an object");
      expect(clock).not.toHaveProperty("isComplete");
      expect(clock).not.toHaveProperty("isReadable");
      expect(clock).not.toHaveProperty("isRepairable");
    },
  );

  testCase(
    "COMPLETE-NOSTORE-010",
    "no completeness flag is ever persisted: stored bytes are stable across roster reads",
    async () => {
      // Guard. Completeness is derived at response time; roster reads must
      // never write. Checksum the stored entity files before and after
      // repeated roster reads and assert no completeness key ever appears in
      // the stored bytes. (The managed harness runs the server on this
      // machine with a throwaway data dir, so the health-reported dataDir is
      // readable from the test process.)
      const health = await api.health();
      const character = await createRawCharacter();
      const filled = await rawCharacterOp(character.id, "dossier.update", DOSSIER_FULL);
      expect(filled.ok).toBe(true);
      const crew = await createRawCrew();
      const crewFilled = await rawCrewOp(crew.id, "fields.update", CREW_FULL);
      expect(crewFilled.ok).toBe(true);

      const characterPath = join(health.dataDir, "characters", character.id, "current.json");
      const crewPath = join(health.dataDir, "crews", crew.id, "current.json");
      const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

      const characterBefore = readFileSync(characterPath);
      const crewBefore = readFileSync(crewPath);
      expect(characterBefore.toString("utf8")).not.toContain("isComplete");
      expect(crewBefore.toString("utf8")).not.toContain("isComplete");

      for (let index = 0; index < 3; index += 1) {
        const roster = await api.get("campaign/roster");
        expect(roster.status).toBe(200);
      }

      const characterAfter = readFileSync(characterPath);
      const crewAfter = readFileSync(crewPath);
      expect(digest(characterAfter)).toBe(digest(characterBefore));
      expect(digest(crewAfter)).toBe(digest(crewBefore));
      expect(characterAfter.toString("utf8")).not.toContain("isReadable");
      expect(characterAfter.toString("utf8")).not.toContain("isRepairable");
      expect(crewAfter.toString("utf8")).not.toContain("isReadable");
      expect(crewAfter.toString("utf8")).not.toContain("isRepairable");
    },
  );
});
