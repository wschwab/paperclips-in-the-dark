import { describe, expect } from "vitest";
import { readFileSync } from "node:fs";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { BLADES, SCUM, newCharacter, newCrew, revisionHeader } from "../../src/suite-helpers.js";
import { firstPlaybook, gameSetting } from "../../src/game-data.js";
import { validateOrThrow } from "../../src/contract-validator.js";

const catalog = JSON.parse(readFileSync(new URL("../../../data/games/blades-in-the-dark-crews.json", import.meta.url), "utf8")) as {
  CrewTypes: Array<{
    Name: string;
    StartingUpgrades?: Array<{ Name: string; BoxesMarked: number }>;
    LegacyNames?: string[];
    LegacyAbilityNames?: Record<string, string>;
    LegacyUpgradeNames?: Record<string, string>;
    LegacyFavoredOperations?: Record<string, string>;
    Upgrades?: Array<{ Name: string; TotalBoxes: number }>;
  }>;
};

const bladesSettings = gameSetting(BLADES);

/** One named key of an unknown JSON settings object (runtime-narrowed). */
function settingValue(settings: unknown, key: string): unknown {
  if (typeof settings !== "object" || settings === null || !(key in settings)) return undefined;
  return (settings as Record<string, unknown>)[key];
}

/**
 * The contract's creation setting with its structural fallback: the shipped
 * value when it is valid, else the canonical default (hold "strong", coin 0,
 * satchel 0). Invalid = wrong type, outside nonnegative Int32, or an unknown hold.
 */
function creationSetting(
  settings: unknown,
  key: "CrewStartingHold" | "CrewStartingCoin" | "StartingSatchelCoins",
): string | number {
  const value = settingValue(settings, key);
  if (key === "CrewStartingHold") {
    return value === "weak" || value === "strong" ? value : "strong";
  }
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 2147483647 ? value : 0;
}

/** One numeric field of a named row in an unknown capabilities array. */
function catalogCount(body: unknown, list: string, name: string, field: string): number | undefined {
  const rows = settingValue(body, list);
  if (!Array.isArray(rows)) return undefined;
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const candidate = row as Record<string, unknown>;
    const value = candidate[field];
    if (candidate.name === name && typeof value === "number") return value;
  }
  return undefined;
}

/** The length of a named array in an unknown capabilities body. */
function catalogSize(body: unknown, list: string): number | undefined {
  const rows = settingValue(body, list);
  return Array.isArray(rows) ? rows.length : undefined;
}

/**
 * Overwrite a stored crew's document on disk (the managed server's data dir)
 * and return the exact bytes, so a legacy-shaped document can be exercised
 * without a legacy server. The document must stay admission-canonical.
 */
async function storeCrewDocument(crewId: string, mutate: (entity: Record<string, unknown>) => void): Promise<string> {
  const entity = structuredClone((await api.get(`crews/${crewId}`)).body) as Record<string, unknown>;
  mutate(entity);
  validateOrThrow("crew", entity);
  const health = await api.health();
  const path = join(health.dataDir, "crews", crewId, "current.json");
  const bytes = JSON.stringify(entity, null, 3);
  await writeFile(path, bytes);
  return bytes;
}

describe("CREW-SHEET-02 favored operation and starting upgrades", () => {
  testCase("CREW-SHEET-DEFAULT-001", "new crews store an empty favored operation", async () => {
    const crew = await newCrew();
    const response = await api.get(`crews/${crew.id}`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ favoredOperation: "" });
  });

  testCase("CREW-SHEET-FAVORED-001", "favored-operation.set stores arbitrary text and supports clearing", async () => {
    const crew = await newCrew();
    for (const value of ['Rare cargo "and" secrets', ""]) {
      const response = await api.post(`crews/${crew.id}/ops/favored-operation.set`, { value });
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ crew: { favoredOperation: value } });
      expect((await api.get(`crews/${crew.id}`)).body).toMatchObject({ favoredOperation: value });
    }
  });

  testCase("CREW-SHEET-VALIDATION-001", "favored-operation.set rejects invalid bodies without writing", async () => {
    const crew = await newCrew();
    const before = await api.get(`crews/${crew.id}`);
    for (const body of [{}, { value: null }, { value: 3 }, { value: "a", extra: true }]) {
      const response = await api.post(`crews/${crew.id}/ops/favored-operation.set`, body);
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ error: { code: "VALIDATION" } });
      expect((await api.get(`crews/${crew.id}`)).rawBody).toBe(before.rawBody);
    }
  });

  testCase("CREW-SHEET-STARTING-001", "create grants exactly the type's settings-defined starting upgrades", async () => {
    expect(catalog.CrewTypes.some((type) => (type.StartingUpgrades?.length ?? 0) > 0)).toBe(true);
    for (const type of catalog.CrewTypes) {
      const response = await api.post("crews", { gameStem: "blades-in-the-dark", crewType: type.Name });
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ crew: { upgrades: (type.StartingUpgrades ?? []).map((u) => ({ name: u.Name, boxesMarked: u.BoxesMarked })) } });
    }
  });
  testCase("CREW-SHEET-READ-001", "legacy reads preserve bytes and the next write fills only favored operation", async () => {
    const crew = await newCrew();
    const entity = structuredClone((await api.get(`crews/${crew.id}`)).body) as Record<string, unknown>;
    delete entity.favoredOperation;
    entity.upgrades = [];
    validateOrThrow("crew", entity);
    const health = await api.health();
    const path = join(health.dataDir, "crews", crew.id, "current.json");
    const bytes = JSON.stringify(entity, null, 3);
    await writeFile(path, bytes);
    const fetched = await api.get(`crews/${crew.id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.rawBody).toBe(bytes);
    expect(await readFile(path, "utf8")).toBe(bytes);
    const mutated = await api.post(`crews/${crew.id}/ops/note.add`, { text: "Legacy crew" });
    expect(mutated.status).toBe(200);
    expect(mutated.body).toMatchObject({ crew: { favoredOperation: "", upgrades: [] } });
  });

  testCase("CREW-SHEET-IMPORT-001", "imports preserve favored text and normalize null to empty", async () => {
    for (const value of ["Cargo of forbidden books", null]) {
      const crew = await newCrew();
      const entity = { ...crew, favoredOperation: value };
      const preview = await api.post(`crews/${crew.id}/import?preview=1`, { entity });
      expect(preview.status).toBe(value === null ? 409 : 200);
      const previewBody = preview.body as { previewToken?: string; error?: { token?: string } };
      const previewToken = previewBody.previewToken ?? previewBody.error?.token;
      expect(previewToken).toBeTruthy();
      const applied = await api.post(`crews/${crew.id}/import`, { entity, previewToken, confirm: true }, revisionHeader(crew.revision));
      expect(applied.status).toBe(200);
      expect((await api.get(`crews/${crew.id}`)).body).toMatchObject({ favoredOperation: value ?? "" });
    }
  });


  testCase("CREW-SHEET-LEGACY-001", "legacy import fills favored operation but never grants starting upgrades", async () => {
    const crew = await newCrew();
    const entity = structuredClone((await api.get(`crews/${crew.id}`)).body) as Record<string, unknown>;
    delete entity.favoredOperation;
    entity.upgrades = [];
    const preview = await api.post(`crews/${crew.id}/import?preview=1`, { entity });
    expect(preview.status).toBe(200);
    const previewBody = preview.body as { previewToken: string };
    const previewToken = previewBody.previewToken;
    const applied = await api.post(`crews/${crew.id}/import`, { entity, previewToken, confirm: true }, revisionHeader(crew.revision));
    expect(applied.status).toBe(200);
    const stored = (await api.get(`crews/${crew.id}`)).body as Record<string, unknown>;
    expect(stored.favoredOperation).toBe("");
    expect(stored.upgrades).toEqual([]);
    const updated = await api.post(`crews/${crew.id}/ops/favored-operation.set`, { value: "Smuggling" });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ crew: { upgrades: [] } });
  });

  // ---------------------------------------------------------------------
  // CREW-SHEET-02 (settings wave): creation settings and legacy names.
  // Every expectation is derived from the shipped game data, so a literal
  // standing in for a setting cannot pass.
  // ---------------------------------------------------------------------

  testCase("CREW-SHEET-SETTINGS-001", "new crew hold and coin come from the game settings, with the structural fallback", async () => {
    const crew = await newCrew();
    expect(crew.hold).toBe(creationSetting(bladesSettings, "CrewStartingHold"));
    expect(crew.coin).toBe(creationSetting(bladesSettings, "CrewStartingCoin"));
    // A game that publishes neither key exercises the canonical structural
    // fallback (hold "strong", coin 0) — the pre-change literals were hold
    // "weak" / coin 0, so only settings-driven creation passes both games.
    const scumSettings = gameSetting(SCUM);
    const scum = await newCrew(SCUM, "Stardancer");
    expect(scum.hold).toBe(creationSetting(scumSettings, "CrewStartingHold"));
    expect(scum.coin).toBe(creationSetting(scumSettings, "CrewStartingCoin"));
    const allSettings = ["blades-in-the-dark", "scum-and-villainy", "français-blades-in-the-dark", "rus-blades-in-the-dark"].map(
      (stem) => gameSetting(stem),
    );
    expect(allSettings.some((settings) => settingValue(settings, "CrewStartingHold") === undefined)).toBe(true);
  });

  testCase("CREW-SHEET-SETTINGS-002", "new character satchel coins come from the game settings, with the structural fallback", async () => {
    const character = await newCharacter();
    expect(character.fund.satchel.coins).toBe(creationSetting(bladesSettings, "StartingSatchelCoins"));
    const scum = await newCharacter(SCUM, firstPlaybook(SCUM));
    expect(scum.fund.satchel.coins).toBe(creationSetting(gameSetting(SCUM), "StartingSatchelCoins"));
  });

  testCase("CREW-SHEET-SETTINGS-003", "out-of-range starting amounts use structural zero without failing creation", async () => {
    // A unique uncached stem exercises the same settings reader without
    // changing the managed server's shared, startup-cached games.
    const stem = `crew-sheet-overflow-${crypto.randomUUID()}`;
    const settingsPath = new URL(`../../../data/games/${stem}.json`, import.meta.url);
    const crewsPath = new URL(`../../../data/games/${stem}-crews.json`, import.meta.url);
    await writeFile(settingsPath, JSON.stringify({ ...bladesSettings, CrewStartingCoin: 2147483648, StartingSatchelCoins: 2147483648 }));
    await writeFile(crewsPath, JSON.stringify(catalog));
    try {
      const crew = await api.post("crews", { gameStem: stem, crewType: "Shadows" });
      expect.soft(crew.status, crew.rawBody).toBe(200);
      expect.soft(crew.body).toMatchObject({ crew: { coin: 0 } });
      const character = await api.post("characters", { gameStem: stem, playbook: firstPlaybook(BLADES) });
      expect.soft(character.status, character.rawBody).toBe(200);
      expect.soft(character.body).toMatchObject({ character: { fund: { satchel: { coins: 0 } } } });
    } finally {
      await Promise.all([unlink(settingsPath), unlink(crewsPath)]);
    }
  });

  testCase("CREW-SHEET-SETTINGS-004", "a starting satchel above the settings maximum is clamped, never stored over capacity", async () => {
    // The review found that an over-cap start makes the next fund.gain report
    // negative effective space and destroy owned coin.
    const stem = `crew-sheet-satchel-${crypto.randomUUID()}`;
    const settingsPath = new URL(`../../../data/games/${stem}.json`, import.meta.url);
    const crewsPath = new URL(`../../../data/games/${stem}-crews.json`, import.meta.url);
    const satchelMax = bladesSettings.FundMaxima.SatchelMax;
    await writeFile(settingsPath, JSON.stringify({ ...bladesSettings, StartingSatchelCoins: satchelMax + 1 }));
    await writeFile(crewsPath, JSON.stringify(catalog));
    try {
      const created = await api.post("characters", { gameStem: stem, playbook: firstPlaybook(BLADES) });
      expect.soft(created.status, created.rawBody).toBe(200);
      const character = settingValue(created.body, "character") as { id: string; fund: { satchel: { coins: number } } };
      expect(character.fund.satchel.coins).toBe(satchelMax);
      const id = character.id;
      const spent = await api.characterOp(id, "fund.spend", { coins: satchelMax });
      expect.soft(spent.ok, JSON.stringify(spent.error)).toBe(true);
      expect(spent.character?.fund.satchel.coins).toBe(0);
      const gained = await api.characterOp(id, "fund.gain", { coins: 1 });
      expect.soft(gained.ok, JSON.stringify(gained.error)).toBe(true);
      expect(gained.character?.fund.satchel.coins).toBe(1);
      expect(gained.character?.fund.stash.coins).toBe(0);
      expect(gained.applied.effective).toBe(1);
    } finally {
      await Promise.all([unlink(settingsPath), unlink(crewsPath)]);
    }
  });

  testCase("CREW-SHEET-LEGACY-TYPE-001", "a stored legacy crew-type name loads, resolves its settings, and renames on write", async () => {
    const type = catalog.CrewTypes.find((candidate) => (candidate.LegacyNames ?? []).length > 0);
    expect(type).toBeDefined();
    const legacyName = type!.LegacyNames![0]!;
    expect(catalog.CrewTypes.some((candidate) => candidate.Name === legacyName)).toBe(false);

    const crew = await newCrew(BLADES, type!.Name);
    const bytes = await storeCrewDocument(crew.id, (entity) => {
      entity.crewTypeName = legacyName;
    });
    // 1. A legacy stored crew keeps loading, byte-identical to disk.
    const read = await api.get(`crews/${crew.id}`);
    expect(read.status).toBe(200);
    expect(read.rawBody).toBe(bytes);
    expect(read.body).toMatchObject({ crewTypeName: legacyName });
    // 2. The per-type settings lookup resolves the legacy name (200, never 404).
    const resolved = await api.get(`games/${BLADES}/crews/${encodeURIComponent(legacyName)}`);
    expect(resolved.status).toBe(200);
    expect(resolved.body).toMatchObject({ Name: type!.Name });
    // 3. The crew capability catalog resolves the legacy type's catalog.
    const capabilities = await api.get(`crews/${crew.id}/capabilities`);
    expect(capabilities.status).toBe(200);
    expect(catalogSize(capabilities.body, "upgrades")).toBe(type!.Upgrades?.length ?? 0);
    // 4. The next mutating write renames to the canonical name...
    const mutated = await api.post(`crews/${crew.id}/ops/note.add`, { text: "Renamed" });
    expect(mutated.status).toBe(200);
    expect(mutated.body).toMatchObject({ crew: { crewTypeName: type!.Name } });
    expect((await api.get(`crews/${crew.id}`)).body).toMatchObject({ crewTypeName: type!.Name });
    // ...and the rename is idempotent.
    const again = await api.post(`crews/${crew.id}/ops/note.add`, { text: "Still canonical" });
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ crew: { crewTypeName: type!.Name } });
  });

  testCase("CREW-SHEET-LEGACY-NAMES-001", "stored legacy upgrade and favored-operation names are retained and their box ops work", async () => {
    const type = catalog.CrewTypes.find(
      (candidate) => candidate.LegacyUpgradeNames && candidate.LegacyFavoredOperations,
    );
    expect(type).toBeDefined();
    const [legacyUpgrade, canonicalUpgrade] = Object.entries(type!.LegacyUpgradeNames!)[0]!;
    const [legacyOperation] = Object.entries(type!.LegacyFavoredOperations!)[0]!;
    const canonicalTotal = type!.Upgrades!.find((upgrade) => upgrade.Name === canonicalUpgrade)!.TotalBoxes;
    expect(canonicalTotal).toBeGreaterThan(1);

    const crew = await newCrew(BLADES, type!.Name);
    const bytes = await storeCrewDocument(crew.id, (entity) => {
      entity.upgrades = [
        { name: legacyUpgrade, boxesMarked: 1 },
        { name: "Homebrew Contraption", boxesMarked: 2 },
      ];
      entity.favoredOperation = legacyOperation;
    });
    // Retained on read, byte-identical: no name is rewritten on the wire.
    const read = await api.get(`crews/${crew.id}`);
    expect(read.rawBody).toBe(bytes);
    expect(read.body).toMatchObject({
      upgrades: [
        { name: legacyUpgrade, boxesMarked: 1 },
        { name: "Homebrew Contraption", boxesMarked: 2 },
      ],
      favoredOperation: legacyOperation,
    });
    // The capability catalog counts the legacy-stored name under the entry
    // it was renamed to.
    const capabilities = await api.get(`crews/${crew.id}/capabilities`);
    expect(catalogCount(capabilities.body, "upgrades", canonicalUpgrade, "marked")).toBe(1);
    // A mutating write keeps every stored name — mapped and unknown alike.
    const noted = await api.post(`crews/${crew.id}/ops/note.add`, { text: "Legacy names" });
    expect(noted.status).toBe(200);
    expect(noted.body).toMatchObject({
      crew: {
        upgrades: [
          { name: legacyUpgrade, boxesMarked: 1 },
          { name: "Homebrew Contraption", boxesMarked: 2 },
        ],
        favoredOperation: legacyOperation,
      },
    });
    // Marking by the stored legacy name uses the canonical entry's box total.
    const marked = await api.post(`crews/${crew.id}/ops/upgrade.mark`, { name: legacyUpgrade });
    expect(marked.status).toBe(200);
    expect(marked.body).toMatchObject({
      crew: { upgrades: [{ name: legacyUpgrade, boxesMarked: 2 }, { name: "Homebrew Contraption", boxesMarked: 2 }] },
    });
    const unmarked = await api.post(`crews/${crew.id}/ops/upgrade.unmark`, { name: legacyUpgrade });
    expect(unmarked.status).toBe(200);
    expect(unmarked.body).toMatchObject({
      crew: { upgrades: [{ name: legacyUpgrade, boxesMarked: 1 }, { name: "Homebrew Contraption", boxesMarked: 2 }] },
    });
    // A legacy-only (catalog-unknown) upgrade unmarks by its own name and stays listed.
    const unmarkedUnknown = await api.post(`crews/${crew.id}/ops/upgrade.unmark`, { name: "Homebrew Contraption" });
    expect(unmarkedUnknown.status).toBe(200);
    expect(unmarkedUnknown.body).toMatchObject({
      crew: { upgrades: [{ name: legacyUpgrade, boxesMarked: 1 }, { name: "Homebrew Contraption", boxesMarked: 1 }] },
    });
    expect((await api.get(`crews/${crew.id}`)).body).toMatchObject({ favoredOperation: legacyOperation });
  });

  testCase("CREW-SHEET-LEGACY-NAMES-003", "canonical upgrade operations update the alias-owned entry and share its limit", async () => {
    const crew = await newCrew(BLADES, "Shadows");
    await storeCrewDocument(crew.id, (entity) => {
      entity.upgrades = [{ name: "Composed", boxesMarked: 1 }];
    });
    const marked = await api.post(`crews/${crew.id}/ops/upgrade.mark`, { name: "Steady" });
    expect(marked.body).toMatchObject({ ok: true, crew: { upgrades: [{ name: "Composed", boxesMarked: 2 }] } });
    expect(settingValue(settingValue(marked.body, "crew"), "upgrades")).toHaveLength(1);
    const full = await api.post(`crews/${crew.id}/ops/upgrade.mark`, { name: "Composed" });
    expect(full.body).toMatchObject({ ok: true, crew: { upgrades: [{ name: "Composed", boxesMarked: 3 }] } });
    const maxed = await api.post(`crews/${crew.id}/ops/upgrade.mark`, { name: "Steady" });
    expect(maxed.body).toMatchObject({ ok: false, error: { code: "UPGRADE_MAXED" } });
    const unmarked = await api.post(`crews/${crew.id}/ops/upgrade.unmark`, { name: "Steady" });
    expect(unmarked.body).toMatchObject({ ok: true, crew: { upgrades: [{ name: "Composed", boxesMarked: 2 }] } });
    expect(settingValue(settingValue(unmarked.body, "crew"), "upgrades")).toHaveLength(1);
  });

  testCase("CREW-SHEET-LEGACY-NAMES-004", "canonical ability take shares the alias-owned limit and removal resolves either name", async () => {
    const crew = await newCrew(BLADES, "Assassins");
    await storeCrewDocument(crew.id, (entity) => {
      entity.specialAbilities = [{ name: "Death Veil", timesTaken: 1 }];
    });
    const take = await api.post(`crews/${crew.id}/ops/ability.take`, { name: "Crow's Veil" });
    expect(take.body).toMatchObject({ ok: false, error: { code: "ABILITY_MAXED" } });
    expect((await api.get(`crews/${crew.id}`)).body).toMatchObject({ specialAbilities: [{ name: "Death Veil", timesTaken: 1 }] });
    const removed = await api.post(`crews/${crew.id}/ops/ability.remove`, { name: "Crow's Veil" });
    expect(removed.body).toMatchObject({ ok: true, crew: { specialAbilities: [] } });
  });

  testCase("CREW-SHEET-ALIAS-OVERFLOW-001", "accepted alias totals remain projectable and decrementable above Int32", async () => {
    const crew = await newCrew(BLADES, "Shadows");
    const entity = { ...crew, upgrades: [{ name: "Composed", boxesMarked: 2147483647 }, { name: "Steady", boxesMarked: 1 }] };
    const preview = await api.post(`crews/${crew.id}/import?preview=1`, { entity });
    expect(preview.status).toBe(200);
    const applied = await api.post(`crews/${crew.id}/import`, { entity, previewToken: settingValue(preview.body, "previewToken"), confirm: true }, revisionHeader(crew.revision));
    expect(applied.status).toBe(200);
    const caps = await api.get(`crews/${crew.id}/capabilities`);
    expect(caps.status).toBe(200);
    expect(catalogCount(caps.body, "upgrades", "Steady", "marked")).toBe(2147483648);
    const unmark = await api.post(`crews/${crew.id}/ops/upgrade.unmark`, { name: "Steady" });
    expect(unmark.status).toBe(200);
    expect(catalogCount((await api.get(`crews/${crew.id}/capabilities`)).body, "upgrades", "Steady", "marked")).toBe(2147483647);
    const assassin = await newCrew(BLADES, "Assassins");
    await storeCrewDocument(assassin.id, (e) => { e.specialAbilities = [{ name: "Death Veil", timesTaken: 2147483647 }, { name: "Crow's Veil", timesTaken: 1 }]; });
    const abilities = await api.get(`crews/${assassin.id}/capabilities`);
    expect(abilities.status).toBe(200);
    expect(catalogCount(abilities.body, "abilities", "Crow's Veil", "taken")).toBe(2147483648);
    expect((await api.post(`crews/${assassin.id}/ops/ability.remove`, { name: "Crow's Veil" })).status).toBe(200);
  });

  testCase("CREW-SHEET-ALIAS-EFFECTS-001", "Vault and Mastery effects use shared alias totals", async () => {
    const stem = `crew-sheet-effects-${crypto.randomUUID()}`;
    const settingsPath = new URL(`../../../data/games/${stem}.json`, import.meta.url);
    const crewsPath = new URL(`../../../data/games/${stem}-crews.json`, import.meta.url);
    const settings = structuredClone(catalog);
    const type = settings.CrewTypes.find((t) => t.Name === "Shadows")!;
    type.LegacyUpgradeNames = { ...type.LegacyUpgradeNames, "Old Mastery": "Mastery", "Old Vault": "Vault" };
    await writeFile(settingsPath, JSON.stringify(bladesSettings));
    await writeFile(crewsPath, JSON.stringify(settings));
    try {
      const created = await api.post("crews", { gameStem: stem, crewType: "Shadows" });
      const crew = settingValue(created.body, "crew") as { id: string };
      const entity = { ...settingValue(created.body, "crew") as Record<string, unknown>, upgrades: [{ name: "Old Mastery", boxesMarked: 2 }, { name: "Mastery", boxesMarked: 2 }, { name: "Old Vault", boxesMarked: 1 }, { name: "Vault", boxesMarked: 1 }] };
      const preview = await api.post(`crews/${crew.id}/import?preview=1`, { entity });
      const token = settingValue(preview.body, "previewToken") ?? settingValue(settingValue(preview.body, "error"), "token");
      const imported = await api.post(`crews/${crew.id}/import`, { entity, previewToken: token, confirm: true }, revisionHeader(settingValue(entity, "revision") as number));
      expect(imported.status, imported.rawBody).toBe(200);
      const caps = await api.get(`crews/${crew.id}/capabilities`);
      expect(caps.status, caps.rawBody).toBe(200);
      expect(caps.body).toHaveProperty("upgrades");
      expect(catalogCount(caps.body, "upgrades", "Mastery", "marked")).toBe(4);
      expect(catalogCount(caps.body, "upgrades", "Vault", "marked")).toBe(2);
      const noted = await api.post(`crews/${crew.id}/ops/note.add`, { text: "derive" });
      expect(noted.body).toMatchObject({ crew: { stashCapacity: 16 } });
      const character = await api.post("characters", { gameStem: stem, playbook: firstPlaybook(BLADES) });
      const pc = settingValue(character.body, "character") as { id: string };
      const health = await api.health();
      const path = join(health.dataDir, "characters", pc.id, "current.json");
      const doc = JSON.parse(await readFile(path, "utf8"));
      doc.dossier.crewId = crew.id;
      await writeFile(path, JSON.stringify(doc));
      const characterCaps = await api.get(`characters/${pc.id}/capabilities`);
      expect(settingValue(characterCaps.body, "effectiveActionCaps")).toEqual(expect.arrayContaining([expect.objectContaining({ masteryMarkedBoxes: 4, effectiveMax: 4 })]));
    } finally {
      await Promise.all([unlink(settingsPath), unlink(crewsPath)]);
    }
  });

  testCase("CREW-SHEET-LEGACY-NAMES-002", "stored legacy ability names are retained and their ability ops work", async () => {
    const type = catalog.CrewTypes.find((candidate) => candidate.LegacyAbilityNames);
    expect(type).toBeDefined();
    const [legacyAbility, canonicalAbility] = Object.entries(type!.LegacyAbilityNames!)[0]!;

    const crew = await newCrew(BLADES, type!.Name);
    await storeCrewDocument(crew.id, (entity) => {
      entity.specialAbilities = [
        { name: legacyAbility, timesTaken: 1 },
        { name: "Old Rite", timesTaken: 1 },
      ];
    });
    expect((await api.get(`crews/${crew.id}`)).body).toMatchObject({
      specialAbilities: [
        { name: legacyAbility, timesTaken: 1 },
        { name: "Old Rite", timesTaken: 1 },
      ],
    });
    // The capability catalog counts the legacy-stored name under the entry it
    // was renamed to, so the take limit is the canonical entry's.
    const capabilities = await api.get(`crews/${crew.id}/capabilities`);
    expect(catalogCount(capabilities.body, "abilities", canonicalAbility, "taken")).toBe(1);
    // ability.take by the stored legacy name reports the canonical entry's limit.
    const take = await api.post(`crews/${crew.id}/ops/ability.take`, { name: legacyAbility });
    expect(take.body).toMatchObject({ ok: false, error: { code: "ABILITY_MAXED" } });
    // A mutating write keeps both names.
    const noted = await api.post(`crews/${crew.id}/ops/note.add`, { text: "Legacy abilities" });
    expect(noted.body).toMatchObject({
      crew: {
        specialAbilities: [
          { name: legacyAbility, timesTaken: 1 },
          { name: "Old Rite", timesTaken: 1 },
        ],
      },
    });
    // remove works by the stored legacy name...
    const removed = await api.post(`crews/${crew.id}/ops/ability.remove`, { name: legacyAbility });
    expect(removed.status).toBe(200);
    expect(removed.body).toMatchObject({ crew: { specialAbilities: [{ name: "Old Rite", timesTaken: 1 }] } });
    // ...and by a legacy-only (catalog-unknown) name.
    const removedUnknown = await api.post(`crews/${crew.id}/ops/ability.remove`, { name: "Old Rite" });
    expect(removedUnknown.status).toBe(200);
    expect(removedUnknown.body).toMatchObject({ crew: { specialAbilities: [] } });
  });
});
