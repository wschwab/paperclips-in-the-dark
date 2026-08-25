import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { decode, Schemas, assertResponseValid } from "../../src/schemas.js";
import { testCase } from "../../src/test-case.js";
import { newCharacter, successfulCharacter } from "../../src/suite-helpers.js";

// CONTRACT-05 (human ruling 2026-08-24; 2026-08-25 correction): per-scoundrel
// Contacts — the single relationship family, EVOLVED from the former rolodex
// surface ("instead of calling it Rolodex, let's just call it Contacts").
// Characters carry REQUIRED `contacts: [{id, name, closeness}]` with
// closeness friend|contact|rival (default "contact") and ops contact.add /
// contact.closeness / contact.remove on /characters/{id}/ops/. Error codes
// diverge from crew contacts BY RULING: duplicate name and unknown name are
// both VALIDATION (crew uses DUPLICATE / NOT_FOUND). Legacy close-friend
// values are NOT auto-migrated — the spec page documents the value migration;
// stored seeds/fixtures were updated in place.

describe("CONTRACT-05 per-scoundrel contacts", () => {
  testCase("SEMANTICS-CHAR-CONTACTS-001", "contact.add writes a contact with default closeness 'contact' and a server id", async () => {
    const character = await newCharacter();
    const result = await api.characterOp(character.id, "contact.add", { name: "Marlane, a pugilist" });
    expect(result.ok).toBe(true);
    assertResponseValid("characterContactAdd", 200, result);
    const added = successfulCharacter(result).contacts.find((c) => c.name === "Marlane, a pugilist");
    expect(added?.closeness).toBe("contact");
    expect(added?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  testCase("SEMANTICS-CHAR-CONTACTS-002", "duplicate contact name is VALIDATION with a schema-valid error body", async () => {
    const character = await newCharacter();
    await api.characterOp(character.id, "contact.add", { name: "Chael, a vicious thug" });
    const duplicate = await api.characterOp(character.id, "contact.add", { name: "Chael, a vicious thug" });
    expect(duplicate.ok).toBe(false);
    assertResponseValid("characterContactAdd", duplicate.error?.status ?? 400, duplicate);
    expect(duplicate.error?.code).toBe("VALIDATION");
  });

  testCase("SEMANTICS-CHAR-CONTACTS-003", "contact.closeness sets each level across the full transition set", async () => {
    const character = await newCharacter();
    await api.characterOp(character.id, "contact.add", { name: "Mercy, a cold killer" });
    for (const level of ["friend", "rival", "contact"] as const) {
      const result = await api.characterOp(character.id, "contact.closeness", { name: "Mercy, a cold killer", closeness: level });
      expect(result.ok).toBe(true);
      expect(successfulCharacter(result).contacts.find((c) => c.name === "Mercy, a cold killer")?.closeness).toBe(level);
    }
  });

  testCase("SEMANTICS-CHAR-CONTACTS-004", "contact.closeness on an unknown name is VALIDATION with a schema-valid error body", async () => {
    const character = await newCharacter();
    const result = await api.characterOp(character.id, "contact.closeness", { name: "Nobody", closeness: "friend" });
    expect(result.ok).toBe(false);
    assertResponseValid("characterContactCloseness", result.error?.status ?? 400, result);
    expect(result.error?.code).toBe("VALIDATION");
  });

  testCase("SEMANTICS-CHAR-CONTACTS-005", "contact.remove drops the named contact and keeps the rest", async () => {
    const character = await newCharacter();
    await api.characterOp(character.id, "contact.add", { name: "Grace, an extortionist" });
    await api.characterOp(character.id, "contact.add", { name: "Sawtooth, a physicker" });
    const removed = await api.characterOp(character.id, "contact.remove", { name: "Grace, an extortionist" });
    expect(removed.ok).toBe(true);
    const contacts = successfulCharacter(removed).contacts;
    expect(contacts.find((c) => c.name === "Grace, an extortionist")).toBeUndefined();
    expect(contacts.find((c) => c.name === "Sawtooth, a physicker")).toBeDefined();
  });

  testCase("SEMANTICS-CHAR-CONTACTS-006", "contact.remove on an unknown name is VALIDATION with a schema-valid error body", async () => {
    const character = await newCharacter();
    const result = await api.characterOp(character.id, "contact.remove", { name: "Nobody" });
    expect(result.ok).toBe(false);
    assertResponseValid("characterContactRemove", result.error?.status ?? 400, result);
    expect(result.error?.code).toBe("VALIDATION");
  });

  testCase("SEMANTICS-CHAR-CONTACTS-007", "contacts persist across an independent reload of the character", async () => {
    const character = await newCharacter();
    await api.characterOp(character.id, "contact.add", { name: "Telda, a beggar" });
    await api.characterOp(character.id, "contact.closeness", { name: "Telda, a beggar", closeness: "rival" });
    const reloaded = await api.character(character.id);
    expect(reloaded.contacts.find((c) => c.name === "Telda, a beggar")?.closeness).toBe("rival");
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

  testCase("SEMANTICS-CHAR-CONTACTS-009", "fresh characters carry the REQUIRED canonical empty contacts array", async () => {
    // contacts returned to the required list in the 2026-08-25 correction:
    // every ordinary current-version character document must carry the key
    // (no sparse overlay beside claimOverrides item fields).
    const character = await newCharacter();
    expect(character.contacts).toEqual([]);
    const added = await api.characterOp(character.id, "contact.add", { name: "Roslyn Kellis, a noble" });
    expect(added.ok).toBe(true);
    expect(successfulCharacter(added).contacts.find((c) => c.name === "Roslyn Kellis, a noble")?.closeness).toBe("contact");
    const reloaded = await api.character(character.id);
    expect(reloaded.contacts).toHaveLength(1);
  });
});
