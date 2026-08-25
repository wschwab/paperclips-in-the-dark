import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { decode, Schemas } from "../../src/schemas.js";
import { testCase } from "../../src/test-case.js";
import { newCharacter, successfulCharacter } from "../../src/suite-helpers.js";

// CONTRACT-05 (human ruling 2026-08-24, binding): per-scoundrel Contacts.
// Characters gain `contacts: [{id, name, closeness}]` with closeness
// friend|contact|rival (default "contact") and ops contact.add /
// contact.closeness / contact.remove on /characters/{id}/ops/. Error codes
// diverge from crew contacts BY RULING: duplicate name and unknown name are
// both VALIDATION (crew uses DUPLICATE / NOT_FOUND).
//
// Sparse back-compat (CHAR-CONTACTS-009) needs a stored pre-C5 character —
// one that predates the contacts field entirely. Run through the managed
// harness with the c5 seeds:
//   node scripts/managed-run.mjs --seed conformance/fixtures/c5-seeds -- --run suites/semantics/character-contacts.test.ts
// (--seed-defaults includes conformance/fixtures/c5-seeds.)
// Seeded entity: characters/c05c05cd-c05c-4c05-8c05-c05c05cdc001/current.json
// (canonical totals, deliberately NO "contacts" key).

describe("CONTRACT-05 per-scoundrel contacts", () => {
  testCase("SEMANTICS-CHAR-CONTACTS-001", "contact.add writes a contact with default closeness 'contact' and a server id", async () => {
    const character = await newCharacter();
    const result = await api.characterOp(character.id, "contact.add", { name: "Marlane, a pugilist" });
    expect(result.ok).toBe(true);
    const added = result.character?.contacts?.find((c) => c.name === "Marlane, a pugilist");
    expect(added?.closeness).toBe("contact");
    expect(added?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  testCase("SEMANTICS-CHAR-CONTACTS-002", "duplicate contact name is VALIDATION", async () => {
    const character = await newCharacter();
    await api.characterOp(character.id, "contact.add", { name: "Chael, a vicious thug" });
    const duplicate = await api.characterOp(character.id, "contact.add", { name: "Chael, a vicious thug" });
    expect(duplicate.ok).toBe(false);
    expect(duplicate.error?.code).toBe("VALIDATION");
  });

  testCase("SEMANTICS-CHAR-CONTACTS-003", "contact.closeness sets each level across the full transition set", async () => {
    const character = await newCharacter();
    await api.characterOp(character.id, "contact.add", { name: "Mercy, a cold killer" });
    for (const level of ["friend", "rival", "contact"] as const) {
      const result = await api.characterOp(character.id, "contact.closeness", { name: "Mercy, a cold killer", closeness: level });
      expect(result.ok).toBe(true);
      expect(successfulCharacter(result).contacts?.find((c) => c.name === "Mercy, a cold killer")?.closeness).toBe(level);
    }
  });

  testCase("SEMANTICS-CHAR-CONTACTS-004", "contact.closeness on an unknown name is VALIDATION", async () => {
    const character = await newCharacter();
    const result = await api.characterOp(character.id, "contact.closeness", { name: "Nobody", closeness: "friend" });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("VALIDATION");
  });

  testCase("SEMANTICS-CHAR-CONTACTS-005", "contact.remove drops the named contact and keeps the rest", async () => {
    const character = await newCharacter();
    await api.characterOp(character.id, "contact.add", { name: "Grace, an extortionist" });
    await api.characterOp(character.id, "contact.add", { name: "Sawtooth, a physicker" });
    const removed = await api.characterOp(character.id, "contact.remove", { name: "Grace, an extortionist" });
    expect(removed.ok).toBe(true);
    const contacts = successfulCharacter(removed).contacts ?? [];
    expect(contacts.find((c) => c.name === "Grace, an extortionist")).toBeUndefined();
    expect(contacts.find((c) => c.name === "Sawtooth, a physicker")).toBeDefined();
  });

  testCase("SEMANTICS-CHAR-CONTACTS-006", "contact.remove on an unknown name is VALIDATION", async () => {
    const character = await newCharacter();
    const result = await api.characterOp(character.id, "contact.remove", { name: "Nobody" });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("VALIDATION");
  });

  testCase("SEMANTICS-CHAR-CONTACTS-007", "contacts persist across an independent reload of the character", async () => {
    const character = await newCharacter();
    await api.characterOp(character.id, "contact.add", { name: "Telda, a beggar" });
    await api.characterOp(character.id, "contact.closeness", { name: "Telda, a beggar", closeness: "rival" });
    const reloaded = await api.character(character.id);
    expect(reloaded.contacts?.find((c) => c.name === "Telda, a beggar")?.closeness).toBe("rival");
  });

  testCase("SEMANTICS-CHAR-CONTACTS-008", "history entries carry the contact op labels", async () => {
    const character = await newCharacter();
    await api.characterOp(character.id, "contact.add", { name: "Darmot, a bluecoat" });
    await api.characterOp(character.id, "contact.closeness", { name: "Darmot, a bluecoat", closeness: "friend" });
    await api.characterOp(character.id, "contact.remove", { name: "Darmot, a bluecoat" });
    const response = await api.get(`characters/${character.id}/history`);
    expect(response.status).toBe(200);
    const history = await decode(Schemas.History, response.body);
    expect(history[0]?.op).toBe("contact.remove");
    expect(history[1]?.op).toBe("contact.closeness");
    expect(history[2]?.op).toBe("contact.add");
  });

  testCase("SEMANTICS-CHAR-CONTACTS-009", "stored pre-C5 character without contacts decodes and accepts contact ops", async () => {
    const seededId = "c05c05cd-c05c-4c05-8c05-c05c05cdc001";
    // Sparse back-compat: the stored document has no "contacts" key; the
    // served document must decode with contacts defaulted to [] and remain
    // fully mutable through the new ops (first add materializes the array).
    const stored = await api.character(seededId);
    expect(stored.contacts).toEqual([]);
    const added = await api.characterOp(seededId, "contact.add", { name: "Roslyn Kellis, a noble" });
    expect(added.ok).toBe(true);
    expect(successfulCharacter(added).contacts?.find((c) => c.name === "Roslyn Kellis, a noble")?.closeness).toBe("contact");
    const reloaded = await api.character(seededId);
    expect(reloaded.contacts).toHaveLength(1);
  });
});
