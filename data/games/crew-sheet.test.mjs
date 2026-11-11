// CREW-SHEET-02 crew game data conformance.
//
// Every list below was transcribed from the official v8.2 crew sheet PDFs
// (https://bladesinthedark.com/sites/default/files/sheets/blades_sheets_v8_2_<Crew>.pdf)
// and cross-checked against the SRD crew-creation page
// (https://bladesinthedark.com/crew). Ability order is the sheet's printed order.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(new URL('../../conformance/package.json', import.meta.url));
const Ajv = require('ajv');
const read = (name) => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
const validateCrew = new Ajv({ strict: false }).compile(read('crew-settings-schema.json'));
const validateSettings = new Ajv({ strict: false }).compile(read('game-settings-schema.json'));
const blades = read('blades-in-the-dark-crews.json');

// The seven special abilities each sheet prints, plus Veteran. Veteran's own
// sheet text is "Choose a special ability from another crew."
// Raster-counted Veteran circles in Player's Kit v8.2, PDF pages 13–18:
// Assassins 3; Bravos, Cult, Hawkers, Shadows and Smugglers 2 each.
const VETERAN = 'Veteran';

const expected = {
  Assassins: {
    veteranTakes: 3,
    abilities: ['Deadly', "Crow's Veil", 'Emberdeath', 'No Traces', 'Patron', 'Predators', 'Vipers'],
    operations: ['Accident', 'Disappearance', 'Murder', 'Ransom'],
    starting: ['Insight Training', 'Prowess Training'],
    specific: ['Assassin rigging', 'Ironhook Contacts', 'Elite Skulks', 'Elite Thugs', 'Hardened'],
  },
  Bravos: {
    veteranTakes: 2,
    abilities: ['Dangerous', 'Blood Brothers', 'Door Kickers', 'Fiends', 'Forged in the Fire', 'Patron', 'War Dogs'],
    operations: ['Battle', 'Extortion', 'Sabotage', 'Smash & Grab'],
    starting: ['Cohort (Gang or Expert)', 'Prowess Training'],
    specific: ['Bravos rigging', 'Ironhook Contacts', 'Elite Rovers', 'Elite Thugs', 'Hardened'],
  },
  Cult: {
    veteranTakes: 2,
    abilities: ['Chosen', 'Anointed', 'Bound in Darkness', 'Conviction', 'Glory Incarnate', 'Sealed in Blood', 'Zealotry'],
    operations: ['Acquisition', 'Augury', 'Consecration', 'Sacrifice'],
    starting: ['Cohort (Gang or Expert)', 'Resolve Training'],
    specific: ['Cult rigging', 'Ritual sanctum in lair', 'Elite Adepts', 'Elite Thugs', 'Ordained'],
  },
  Hawkers: {
    veteranTakes: 2,
    abilities: ['Silver Tongues', 'Accord', 'The Good Stuff', 'Ghost Market', 'High Society', 'Hooked', 'Patron'],
    operations: ['Sale', 'Supply', 'Show of Force', 'Socialize'],
    starting: ['Secure Lair', 'Resolve Training'],
    specific: ["Hawker's rigging", 'Ironhook Contacts', 'Elite Rooks', 'Elite Thugs', 'Composed'],
  },
  Shadows: {
    veteranTakes: 2,
    abilities: ['Everyone Steals', 'Ghost Echoes', 'Pack Rats', 'Patron', 'Second Story', 'Slippery', 'Synchronized'],
    operations: ['Burglary', 'Espionage', 'Robbery', 'Sabotage'],
    starting: ['Hidden Lair', 'Prowess Training'],
    specific: ['Thief Rigging', 'Underground maps & passkeys', 'Elite Rooks', 'Elite Skulks', 'Steady'],
  },
  Smugglers: {
    veteranTakes: 2,
    abilities: ['Like Part of the Family', 'All Hands', 'Ghost Passage', 'Just Passing Through', 'Leverage', 'Reavers', 'Renegades'],
    operations: ['Arcane/weird', 'Arms', 'Contraband', 'Passengers'],
    label: 'Cargo type',
    freeText: true,
    starting: ['Vehicle', 'Prowess Training'],
    specific: ["Smuggler's rigging", 'Camouflage', 'Elite Rovers', 'Barge', 'Steady'],
  },
};

const byName = (name) => blades.CrewTypes.find((crew) => crew.Name === name);

for (const [name, sheet] of Object.entries(expected)) {
  test(`${name}: the sheet's seven special abilities plus Veteran, in printed order`, () => {
    const crew = byName(name);
    assert.ok(crew, `missing crew type ${name}`);
    assert.deepEqual(
      crew.SpecialAbilities.map((ability) => ability.Name),
      [...sheet.abilities, VETERAN],
    );
    for (const ability of crew.SpecialAbilities) {
      const takes = ability.Name === VETERAN ? sheet.veteranTakes : 1;
      assert.equal(ability.TimesTakeable, takes, `${name}/${ability.Name}: printed take circles`);
      assert.ok(ability.Description.trim().length > 0, `${name}/${ability.Name}: needs a description`);
    }
    assert.match(crew.SpecialAbilities.at(-1).Description, /another crew/i);
  });

  test(`${name}: hunting grounds options and starting marks match the sheet`, () => {
    const crew = byName(name);
    assert.deepEqual(crew.FavoredOperations, sheet.operations);
    assert.equal(crew.FavoredOperationLabel, sheet.label ?? 'Favored operation');
    assert.equal(
      crew.FavoredOperationFreeText ?? false,
      sheet.freeText ?? false,
      `${name}: only Smugglers accept free-text cargo`,
    );
    assert.deepEqual(
      crew.StartingUpgrades,
      sheet.starting.map((upgradeName) => ({ Name: upgradeName, BoxesMarked: 1 })),
    );
    for (const start of crew.StartingUpgrades) {
      const upgrade = crew.Upgrades.find((row) => row.Name === start.Name);
      assert.ok(upgrade, `${name}: starting upgrade ${start.Name} is not in the catalog`);
      assert.ok(start.BoxesMarked <= upgrade.TotalBoxes, `${name}/${start.Name}: over-marked`);
    }
  });

  test(`${name}: the sheet's own five upgrades are in the catalog`, () => {
    const crew = byName(name);
    for (const upgradeName of sheet.specific) {
      const upgrade = crew.Upgrades.find((row) => row.Name === upgradeName);
      assert.ok(upgrade, `${name}: missing sheet upgrade ${upgradeName}`);
      assert.ok(upgrade.TotalBoxes >= 1, `${name}/${upgradeName}: needs boxes`);
      assert.ok(upgrade.Description.trim().length > 0, `${name}/${upgradeName}: needs a description`);
    }
  });
}

test('Veteran shares its name and text, but uses each crew sheet’s circle count', () => {
  for (const [name, sheet] of Object.entries(expected)) {
    assert.deepEqual(byName(name).SpecialAbilities.at(-1), {
      Name: VETERAN,
      TimesTakeable: sheet.veteranTakes,
      Description: 'Choose a special ability from another crew.',
    });
  }
});

test('Ironhook Contacts covers every Tier-related element in prison', () => {
  for (const name of ['Assassins', 'Bravos', 'Hawkers']) {
    const upgrade = byName(name).Upgrades.find((row) => row.Name === 'Ironhook Contacts');
    assert.equal(upgrade.Description, "Your crew's Tier is effectively +1 higher in prison. This applies to any Tier-related element in prison, including the incarceration roll.");
  }
});

test('lair rows: general facilities everywhere, two Vehicle rows on Smugglers', () => {
  const vehicle = byName('Smugglers').Upgrades.find((row) => row.Name === 'Vehicle');
  assert.ok(vehicle, 'Smugglers: Vehicle row missing');
  assert.equal(vehicle.TotalBoxes, 2, 'the sheet prints two Vehicle boxes');
  const additional = byName('Smugglers').Upgrades.find((row) => row.Name === 'Additional Vehicle');
  assert.ok(additional, 'the sheet prints a second Vehicle row');
  assert.equal(additional.TotalBoxes, vehicle.TotalBoxes);
  for (const row of [vehicle, additional]) {
    assert.match(row.Description, /table decides what the vehicle and its marks represent/i);
    assert.match(row.Description, /no automatic improvement or speed or armor bonus is defined/i);
    assert.doesNotMatch(row.Description, /second box improves/i);
  }
  for (const crew of blades.CrewTypes) {
    for (const facility of ['Boat House', 'Carriage House', 'Hidden Lair', 'Quarters', 'Secure Lair', 'Vault', 'Workshop']) {
      const row = crew.Upgrades.find((upgrade) => upgrade.Name === facility);
      assert.ok(row, `${crew.Name}: general lair row ${facility} missing`);
      assert.ok(row.TotalBoxes >= 1, `${crew.Name}/${facility}: needs boxes`);
    }
    for (const facility of ['Boat House', 'Carriage House']) {
      const row = crew.Upgrades.find((upgrade) => upgrade.Name === facility);
      assert.equal(row.TotalBoxes, 2, `${crew.Name}/${facility}: the sheet prints two boxes`);
    }
  }
});

test('every shipped crew setting validates and has no stock contacts', () => {
  for (const file of readdirSync(new URL('.', import.meta.url)).filter((name) => name.endsWith('-crews.json'))) {
    const settings = read(file);
    assert.ok(validateCrew(settings), `${file}: ${JSON.stringify(validateCrew.errors)}`);
    for (const crew of settings.CrewTypes) {
      assert.deepEqual(crew.Contacts, [], `${file}/${crew.Name}: contacts are private restore only`);
      for (const start of crew.StartingUpgrades ?? []) {
        assert.deepEqual(Object.keys(start).sort(), ['BoxesMarked', 'Name']);
        const upgrade = crew.Upgrades.find((row) => row.Name === start.Name);
        assert.ok(upgrade, `${file}/${crew.Name}: missing ${start.Name}`);
        assert.ok(start.BoxesMarked <= upgrade.TotalBoxes);
      }
    }
  }
});

// Catalogs that shipped before this change, per crew type. Nothing a saved crew
// stored may become unresolvable: each name must still exist in that crew's
// Upgrades, or be mapped by LegacyUpgradeNames to the name it was renamed to.
const legacyUpgrades = {
  Assassins: ['Cohort (Gang or Expert)', 'Training', 'Secure Lair', 'Hidden Lair', 'Vault', 'Quarters', 'Workshop', 'Quality: Weapons', 'Mastery', 'Hardened', 'Composed'],
  Bravos: ['Cohort (Gang or Expert)', 'Training', 'Prowess Training', 'Secure Lair', 'Hidden Lair', 'Vault', 'Quarters', 'Workshop', 'Quality: Weapons', 'Mastery', 'Hardened', 'Composed'],
  Cult: ['Cohort (Gang or Expert)', 'Training', 'Secure Lair', 'Hidden Lair', 'Vault', 'Quarters', 'Workshop', 'Quality: Implements (Arcane)', 'Mastery', 'Hardened', 'Composed'],
  Hawkers: ['Cohort (Gang or Expert)', 'Training', 'Secure Lair', 'Hidden Lair', 'Vault', 'Quarters', 'Workshop', 'Quality: Supplies (Subterfuge)', 'Mastery', 'Hardened', 'Composed', 'Vice Den'],
  Shadows: ['Cohort (Gang or Expert)', 'Training', 'Secure Lair', 'Hidden Lair', 'Vault', 'Quarters', 'Workshop', 'Quality: Gear (Burglary & Climbing)', 'Mastery', 'Hardened', 'Composed'],
  Smugglers: ['Cohort (Gang or Expert)', 'Training', 'Boat House', 'Carriage House', 'Secure Lair', 'Hidden Lair', 'Vault', 'Quarters', 'Workshop', 'Mastery', 'Hardened', 'Composed'],
};

test('every pre-change upgrade name still resolves for its crew type', () => {
  for (const [name, legacy] of Object.entries(legacyUpgrades)) {
    const crew = byName(name);
    const catalog = new Set(crew.Upgrades.map((row) => row.Name));
    for (const legacyName of legacy) {
      const canonical = crew.LegacyUpgradeNames?.[legacyName] ?? legacyName;
      assert.ok(catalog.has(canonical), `${name}: ${legacyName} -> ${canonical} no longer resolves`);
    }
  }
});

test('legacy type, ability and operation names resolve to their canonical names', () => {
  assert.equal(byName('Cult').LegacyNames?.includes('Cultists'), true);
  assert.equal(byName('Cultists'), undefined, 'the sheet names the crew type Cult');
  assert.deepEqual(byName('Assassins').LegacyAbilityNames, { 'Death Veil': "Crow's Veil" });
  assert.deepEqual(byName('Cult').LegacyUpgradeNames, { Hardened: 'Ordained' });
  assert.deepEqual(byName('Shadows').LegacyUpgradeNames, { Composed: 'Steady' });
  assert.deepEqual(byName('Smugglers').LegacyUpgradeNames, { Composed: 'Steady' });
  assert.deepEqual(byName('Smugglers').LegacyFavoredOperations, {
    'Smuggling Arms': 'Arms',
    'Smuggling Contraband': 'Contraband',
    'Smuggling Passengers': 'Passengers',
  });
  for (const [name, sheet] of Object.entries(expected)) {
    const crew = byName(name);
    for (const canonical of Object.values(crew.LegacyAbilityNames ?? {})) {
      assert.ok(crew.SpecialAbilities.some((ability) => ability.Name === canonical), `${name}: ${canonical}`);
    }
    for (const canonical of Object.values(crew.LegacyUpgradeNames ?? {})) {
      assert.ok(crew.Upgrades.some((row) => row.Name === canonical), `${name}: ${canonical}`);
    }
    for (const canonical of Object.values(crew.LegacyFavoredOperations ?? {})) {
      assert.ok(sheet.operations.includes(canonical), `${name}: ${canonical}`);
    }
  }
});

// Every named contact on the six official sheets and the fifteen withdrawn
// Scum and Villainy entries, plus the placeholder rows that used to ship.
const contactNames = [
  'Trev', 'Lydra', 'Irimina', 'Karlos', 'Exeter', 'Sevoy',
  'Meg', 'Conway', 'Keller', 'Tomas', 'Walker', 'Lutes',
  'Gagan', 'Adikin', 'Hutchins', 'Moriya', 'Mateas Kline', 'Bennett',
  'Rolan Wott', 'Laroze', 'Hoxley', 'Anya', 'Marlo',
  'Dowler', 'Amancio', 'Fitz', 'Adelaide Phroaig', 'Rigney',
  'Elynn', 'Rolan', 'Sera', 'Nyelle', 'Decker', 'Esme',
  "T'kala", 'Alor', 'Heani', 'Rakka', 'Citani',
  'Stacy Weathers', 'Arlox', 'Ishi', 'Lix', 'Jezri',
  'Garin', 'Tyura', 'Ada Black', 'Tiko Lux', 'Ibo-one',
  'Placeholder Contact',
];

test('no named contact appears anywhere in shipped game data', () => {
  const strings = (value, out = []) => {
    if (typeof value === 'string') out.push(value);
    else if (Array.isArray(value)) for (const item of value) strings(item, out);
    else if (value && typeof value === 'object') for (const item of Object.values(value)) strings(item, out);
    return out;
  };
  for (const file of readdirSync(new URL('.', import.meta.url)).filter((name) => name.endsWith('.json'))) {
    for (const value of strings(read(file))) {
      for (const contact of contactNames) {
        assert.equal(
          value === contact || value.startsWith(`${contact},`) || value.startsWith(`${contact} \u2014`),
          false,
          `${file}: contact name ${contact} must not ship (found ${JSON.stringify(value)})`,
        );
      }
    }
  }
});

test('optional metadata supports other games and private contact restore', () => {
  const minimal = {
    Name: 'Other',
    Language: 'en',
    CrewTypes: [{ Name: 'Other', Hook: '', Description: '', ExperienceTrigger: '', SpecialAbilities: [], Upgrades: [] }],
  };
  assert.ok(validateCrew(minimal), JSON.stringify(validateCrew.errors));
  const crew = minimal.CrewTypes[0];
  crew.Contacts = [{ Name: 'User contact', Profession: 'User profession' }];
  crew.StartingUpgrades = [{ Name: 'User upgrade', BoxesMarked: 1 }];
  crew.FavoredOperations = [];
  crew.FavoredOperationLabel = 'Cargo type';
  crew.FavoredOperationFreeText = true;
  crew.LegacyNames = ['Old name'];
  crew.LegacyAbilityNames = { Old: 'New' };
  crew.LegacyUpgradeNames = { Old: 'New' };
  crew.LegacyFavoredOperations = { Old: 'New' };
  assert.ok(validateCrew(minimal), JSON.stringify(validateCrew.errors));
  crew.StartingUpgrades[0].BoxesMarked = -1;
  assert.equal(validateCrew(minimal), false);
  crew.StartingUpgrades[0].BoxesMarked = 1;
  crew.Contacts[0].Description = 'obsolete shape';
  assert.equal(validateCrew(minimal), false);
  delete crew.Contacts[0].Description;
  crew.LegacyAbilityNames = { Old: 7 };
  assert.equal(validateCrew(minimal), false);
  crew.LegacyAbilityNames = { Old: 'New' };
  crew.FavoredOperationFreeText = 'yes';
  assert.equal(validateCrew(minimal), false);
});

test('starting defaults ship as game settings with a structural fallback', () => {
  const settings = read('blades-in-the-dark.json');
  assert.equal(settings.CrewStartingHold, 'strong');
  assert.equal(settings.CrewStartingCoin, 2);
  assert.equal(settings.StartingSatchelCoins, 0);
  assert.ok(validateSettings(settings), JSON.stringify(validateSettings.errors));
  for (const file of ['scum-and-villainy.json', 'français-blades-in-the-dark.json', 'rus-blades-in-the-dark.json']) {
    const other = read(file);
    assert.ok(validateSettings(other), `${file}: ${JSON.stringify(validateSettings.errors)}`);
    for (const key of ['CrewStartingHold', 'CrewStartingCoin', 'StartingSatchelCoins']) {
      assert.equal(key in other, false, `${file}: ${key} stays absent and falls back to strong/0/0`);
    }
  }
  const bad = { ...settings, CrewStartingHold: 'sideways' };
  assert.equal(validateSettings(bad), false);
  const negative = { ...settings, StartingSatchelCoins: -1 };
  assert.equal(validateSettings(negative), false);
});
