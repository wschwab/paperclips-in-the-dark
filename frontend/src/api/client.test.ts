import { readFileSync } from "node:fs";
import { Effect } from "effect";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpError,
  opErrorFriendlyText,
  transportErrorText,
  decodeErrorText,
  NETWORK_ERROR_COPY,
  getRoster, getCharacter, getCrew, getCharacterCapabilities, getCrewCapabilities, getCharacterHistory, getCrewHistory, getPlaybookList, createCharacter, getCrewTypeList, createCrew, stressAdd, undoCharacter, undoCrew, retireCharacter, endScore, deleteCharacter, dossierUpdate, stressClear, traumaAdd, traumaRemove, getGame, harmAdd, harmHeal, harmRemove, harmHealingClock, armorSet, crewContactAdd, crewContactRemove, factionSetStatus, factionRemove, crewFieldsUpdate, crewRepAdd, crewHeatAdd, crewWantedAdd, crewTierAdd, crewHoldSet, crewCoinAdd, crewStashAdd, crewAbilityTake, crewAbilityRemove, upgradeMark, upgradeUnmark, getCrewType, getCrewTypes, actionSetRating, attributeXpAdd, attributeXpClear, attributeLevelup, sessionSet, getPlaybook, playbookXpAdd, playbookXpClear, abilityTake, abilityRemove, gearAdd, gearRemove, gearCommit, gearUncommit, gearLock, gearUnlock, gearSetCommitment, gearClearCommitments, fundGain, fundSpend, fundLiquidate, listClocks, createClock, clockProgress, clockReset, deleteClock, noteAdd, noteRemove, listCrews, cohortAdd, cohortRemove, cohortUpdate, crewXpAdd, crewXpClear, crewNoteAdd, crewNoteRemove, crewTurfAdd, getCrewGameData, ApiError, DecodeError, StaleRevisionError } from "./client.js";

const goldenCharacter = JSON.parse(
  readFileSync(new URL("../../../conformance/fixtures/golden-character.json", import.meta.url), "utf8"),
) as Record<string, unknown>;
const goldenCrew = JSON.parse(
  readFileSync(new URL("../../../conformance/fixtures/golden-crew.json", import.meta.url), "utf8"),
) as Record<string, unknown>;

describe("getRoster", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches /api/campaign/roster and decodes a valid roster", async () => {
    const rosterData = {
      characters: [
        {
          // SC-F1 frozen decoder requires the summary discriminant.
          kind: "character",
          id: "c46ba7cb-993b-4fc7-974d-fb95eacd5446",
          name: "Brenda Hilton",
          alias: "Webweaver",
          playbook: "Spider",
          gameStem: "blades-in-the-dark",
          crewId: "8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2",
          stress: 3,
          traumas: ["Haunted"],
          isRetired: false,
          isDeadish: false,
          revision: 12,
          isReadable: true,
          isRepairable: false,
          isComplete: true,
          deleteToken: "",
          canUndo: false,
          historyCount: 0,
        },
      ],
      crews: [
        {
          // SC-F1 frozen decoder requires the summary discriminant.
          kind: "crew",
          id: "8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2",
          name: "The Red Sashes",
          crewType: "Assassins",
          gameStem: "blades-in-the-dark",
          tier: 0,
          heat: 4,
          wanted: 1,
          rep: 3,
          hold: "strong",
          memberCount: 1,
          revision: 5,
          isReadable: true,
          isRepairable: false,
          isComplete: true,
          deleteToken: "",
          canUndo: false,
          historyCount: 0,
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(rosterData),
    });

    const result = await Effect.runPromise(getRoster());
    expect(result.characters).toHaveLength(1);
    expect(result.characters[0]?.name).toBe("Brenda Hilton");
    expect(result.crews).toHaveLength(1);
    expect(result.crews[0]?.name).toBe("The Red Sashes");
    expect(global.fetch).toHaveBeenCalledWith("/api/campaign/roster", {
      headers: { Accept: "application/json" },
    });
  });

  it("exposes ApiError when fetch fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => "Not Found",
      status: 404,
    });

    const result = await Effect.runPromise(
      Effect.either(getRoster()),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(404);
    }
  });

  it("exposes DecodeError when response is not valid roster JSON", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ invalid: "data" }),
    });

    const result = await Effect.runPromise(
      Effect.either(getRoster()),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(DecodeError);
    }
  });
});

describe("getCharacter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches /api/characters/{id} and decodes a valid character", async () => {
    const characterId = "c46ba7cb-993b-4fc7-974d-fb95eacd5446";
    const characterData = {
      kind: "character",
      id: characterId,
      gameStem: "blades-in-the-dark",
      gameName: "Blades in the Dark",
      language: "en",
      revision: 12,
      formatVersion: 1,
      createdAt: "2026-07-22T00:00:00.000Z",
      updatedAt: "2026-07-22T00:00:00.000Z",
      isRetired: false,
      isDeadish: false,
      traumaPending: false,
      isOutOfAction: false,
      stressClearPending: false,
      dossier: {
        name: "Brenda Hilton",
        crewId: "8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2",
        alias: "Webweaver",
        look: "Keen and calculating",
        notes: "Spider operative",
        background: { name: "Urchin", description: "" },
        heritage: { name: "Akorosi", description: "" },
        vice: { name: "Gambling", description: "", purveyor: { name: "Mother Narya", description: "House of the Weeping Lady, Six Towers" } },
      },
      monitor: {
        stress: { current: 3, max: 9 },
        trauma: { traumas: ["Haunted"], max: 4 },
        harm: {
          lesser: [],
          moderate: [],
          severe: [],
          fatal: [],
          healingClock: { segments: 0, size: 6, rollover: 0 },
        },
        armor: {
          standardUsed: false,
          heavyUsed: false,
          specialUsed: false,
          hasStandard: true,
          hasHeavy: false,
          hasSpecial: false,
        },
      },
      talent: { attributes: [] },
      playbook: { name: "Spider", experience: { points: 4, max: 8 }, abilities: [] },
      gear: {
        loadout: [],
        availableGear: [],
        commitment: "none",
        isCommitmentLocked: false,
        maxBulk: 8,
      },
      fund: { satchel: { coins: 0, max: 2 }, stash: { coins: 0, max: 8 } },
      rolodex: { friends: [] },
      session: { playbookExpressions: 0, characterExpressions: 0, struggleExpressions: 0, max: 3 },
      notebook: "",
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(characterData),
    });

    const result = await Effect.runPromise(getCharacter(characterId));
    expect(result.id).toBe(characterId);
    expect(result.dossier.name).toBe("Brenda Hilton");
    expect(global.fetch).toHaveBeenCalledWith(`/api/characters/${characterId}`, {
      headers: { Accept: "application/json" },
    });
  });

  it("exposes ApiError when fetch fails with 404", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => "Not Found",
      status: 404,
    });

    const result = await Effect.runPromise(
      Effect.either(getCharacter("nonexistent-id")),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(404);
    }
  });

  it("exposes DecodeError when response is not valid character JSON", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ invalid: "data" }),
    });

    const result = await Effect.runPromise(
      Effect.either(getCharacter("some-id")),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(DecodeError);
    }
  });
});

describe("getCrew", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches /api/crews/{id} and decodes a valid crew", async () => {
    const crewId = "8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2";
    const crewData = {
      kind: "crew",
      id: crewId,
      gameStem: "blades-in-the-dark",
      gameName: "Blades in the Dark",
      language: "en",
      revision: 5,
      formatVersion: 1,
      createdAt: "2026-07-22T00:00:00.000Z",
      updatedAt: "2026-07-22T00:00:00.000Z",
      crewTypeName: "Assassins",
      name: "The Red Sashes",
      lair: "Northside safehouse",
      reputation: "ruthless",
      huntingGrounds: "The Docks",
      tier: 1,
      hold: "strong",
      heat: { current: 4, max: 9 },
      wanted: { current: 1, max: 4 },
      rep: { current: 3, max: 12 },
      experience: { points: 2, max: 8 },
      specialAbilities: [],
      upgrades: [],
      cohorts: [],
      contacts: [],
      factions: [],
      coin: 0,
      stash: 2,
      notes: "Up-and-coming crew",
      turf: 0,
      claimedClaimIds: [],
      claimOverrides: [],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(crewData),
    });

    const result = await Effect.runPromise(getCrew(crewId));
    expect(result.id).toBe(crewId);
    expect(result.name).toBe("The Red Sashes");
    expect(global.fetch).toHaveBeenCalledWith(`/api/crews/${crewId}`, {
      headers: { Accept: "application/json" },
    });
  });

  it("exposes ApiError when fetch fails with 404", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => "Not Found",
      status: 404,
    });

    const result = await Effect.runPromise(
      Effect.either(getCrew("nonexistent-id")),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(404);
    }
  });

  it("exposes DecodeError when response is not valid crew JSON", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ invalid: "data" }),
    });

    const result = await Effect.runPromise(
      Effect.either(getCrew("some-id")),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(DecodeError);
    }
  });
});

describe("getCrewHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches /api/crews/{id}/history and decodes a valid history array", async () => {
    const crewId = "8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2";
    const historyData = [
      {
        snapshotId: "20260722160000000-abc123",
        takenAt: "2026-07-22T16:00:00.000Z",
        op: "heat.add",
      },
      {
        snapshotId: "20260722150000000-def456",
        takenAt: "2026-07-22T15:00:00.000Z",
        op: "rep.add",
      },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(historyData),
    });

    const result = await Effect.runPromise(getCrewHistory(crewId));
    expect(result).toHaveLength(2);
    expect(result[0]?.op).toBe("heat.add");
    expect(result[1]?.op).toBe("rep.add");
    expect(global.fetch).toHaveBeenCalledWith(`/api/crews/${crewId}/history`, {
      headers: { Accept: "application/json" },
    });
  });

  it("exposes ApiError when fetch fails with 404", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => "Not Found",
      status: 404,
    });

    const result = await Effect.runPromise(
      Effect.either(getCrewHistory("nonexistent-id")),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(404);
    }
  });

  it("exposes DecodeError when response is not valid history array", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ invalid: "data" }),
    });

    const result = await Effect.runPromise(
      Effect.either(getCrewHistory("some-id")),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(DecodeError);
    }
  });

  it("decodes an empty history list as an empty array", async () => {
    const crewId = "8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2";

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify([]),
    });

    const result = await Effect.runPromise(getCrewHistory(crewId));
    expect(result).toHaveLength(0);
  });
});

describe("getCharacterHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches /api/characters/{id}/history and decodes a valid history array", async () => {
    const characterId = "c46ba7cb-993b-4fc7-974d-fb95eacd5446";
    const historyData = [
      {
        snapshotId: "20260722160000000-abc123",
        takenAt: "2026-07-22T16:00:00.000Z",
        op: "stress.add",
      },
      {
        snapshotId: "20260722150000000-def456",
        takenAt: "2026-07-22T15:00:00.000Z",
        op: "trauma.mark",
      },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(historyData),
    });

    const result = await Effect.runPromise(getCharacterHistory(characterId));
    expect(result).toHaveLength(2);
    expect(result[0]?.op).toBe("stress.add");
    expect(result[1]?.op).toBe("trauma.mark");
    expect(global.fetch).toHaveBeenCalledWith(`/api/characters/${characterId}/history`, {
      headers: { Accept: "application/json" },
    });
  });

  it("exposes ApiError when fetch fails with 404", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => "Not Found",
      status: 404,
    });

    const result = await Effect.runPromise(
      Effect.either(getCharacterHistory("nonexistent-id")),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(404);
    }
  });

  it("exposes DecodeError when response is not valid history array", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ invalid: "data" }),
    });

    const result = await Effect.runPromise(
      Effect.either(getCharacterHistory("some-id")),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(DecodeError);
    }
  });
});

describe("getPlaybookList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches /api/games/{gameStem}/playbooks and decodes playbook names", async () => {
    const playbookData = [
      { Name: "Cutter" },
      { Name: "Hound" },
      { Name: "Spider" },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(playbookData),
    });

    const result = await Effect.runPromise(getPlaybookList("blades-in-the-dark"));
    expect(result).toEqual(["Cutter", "Hound", "Spider"]);
    expect(global.fetch).toHaveBeenCalledWith("/api/games/blades-in-the-dark/playbooks", {
      headers: { Accept: "application/json" },
    });
  });

  it("exposes ApiError when fetch fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => "Not Found",
      status: 404,
    });

    const result = await Effect.runPromise(
      Effect.either(getPlaybookList("nonexistent-game")),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(404);
    }
  });

  it("exposes DecodeError when response is not a valid playbook array", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ invalid: "data" }),
    });

    const result = await Effect.runPromise(
      Effect.either(getPlaybookList("blades-in-the-dark")),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(DecodeError);
    }
  });
});

describe("createCharacter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/characters and decodes the created character from OperationResult", async () => {
    const characterData = {
      kind: "character",
      id: "c46ba7cb-993b-4fc7-974d-fb95eacd5446",
      gameStem: "blades-in-the-dark",
      gameName: "Blades in the Dark",
      language: "en",
      revision: 1,
      formatVersion: 1,
      createdAt: "2026-07-24T00:00:00.000Z",
      updatedAt: "2026-07-24T00:00:00.000Z",
      isRetired: false,
      isDeadish: false,
      traumaPending: false,
      isOutOfAction: false,
      stressClearPending: false,
      dossier: {
        name: "Rowan",
        crewId: "",
        alias: "",
        look: "",
        notes: "",
        background: { name: "Dock Worker", description: "" },
        heritage: { name: "Duskborn", description: "" },
        vice: { name: "Gambling", description: "", purveyor: { name: "Mother Narya", description: "House of the Weeping Lady, Six Towers" } },
      },
      monitor: {
        stress: { current: 0, max: 9 },
        trauma: { traumas: [], max: 4 },
        harm: {
          lesser: [],
          moderate: [],
          severe: [],
          fatal: [],
          healingClock: { segments: 0, size: 6, rollover: 0 },
        },
        armor: {
          standardUsed: false,
          heavyUsed: false,
          specialUsed: false,
          hasStandard: false,
          hasHeavy: false,
          hasSpecial: false,
        },
      },
      talent: { attributes: [] },
      playbook: { name: "Cutter", experience: { points: 0, max: 8 }, abilities: [] },
      gear: { loadout: [], availableGear: [], commitment: "none", isCommitmentLocked: false, maxBulk: 6 },
      fund: { satchel: { coins: 0, max: 12 }, stash: { coins: 0, max: 16 } },
      rolodex: { friends: [] },
      session: { playbookExpressions: 0, characterExpressions: 0, struggleExpressions: 0, max: 5 },
      notebook: "",
    };

    const opResult = {
      ok: true,
      character: characterData,
      applied: { op: "character.create" },
      sideEffects: [],
      error: null,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(opResult),
    });

    const result = await Effect.runPromise(
      createCharacter("blades-in-the-dark", "Cutter"),
    );
    expect(result.id).toBe("c46ba7cb-993b-4fc7-974d-fb95eacd5446");
    expect(result.dossier.name).toBe("Rowan");
    expect(result.playbook.name).toBe("Cutter");
    expect(global.fetch).toHaveBeenCalledWith("/api/characters", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ gameStem: "blades-in-the-dark", playbook: "Cutter" }),
    });
  });

  it("exposes ApiError when POST fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => "Bad Request",
      status: 400,
    });

    const result = await Effect.runPromise(
      Effect.either(createCharacter("blades-in-the-dark", "Cutter")),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(400);
    }
  });

  it("exposes DecodeError when response is not valid OperationResult", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ invalid: "data" }),
    });

    const result = await Effect.runPromise(
      Effect.either(createCharacter("blades-in-the-dark", "Cutter")),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(DecodeError);
    }
  });
});

describe("getCrewTypeList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches /api/games/{gameStem}/crews and decodes crew type names", async () => {
    const crewSettingsData = {
      CrewTypes: [
        { Name: "Assassins" },
        { Name: "Blades" },
        { Name: "Bravos" },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(crewSettingsData),
    });

    const result = await Effect.runPromise(getCrewTypeList("blades-in-the-dark"));
    expect(result).toEqual(["Assassins", "Blades", "Bravos"]);
    expect(global.fetch).toHaveBeenCalledWith("/api/games/blades-in-the-dark/crews", {
      headers: { Accept: "application/json" },
    });
  });

  it("exposes ApiError when fetch fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => "Not Found",
      status: 404,
    });

    const result = await Effect.runPromise(
      Effect.either(getCrewTypeList("nonexistent-game")),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(404);
    }
  });

  it("exposes DecodeError when response is not valid crew types object", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ invalid: "data" }),
    });

    const result = await Effect.runPromise(
      Effect.either(getCrewTypeList("blades-in-the-dark")),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(DecodeError);
    }
  });
});

describe("createCrew", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/crews and decodes the created crew from OperationResult", async () => {
    const crewData = {
      kind: "crew",
      id: "8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2",
      gameStem: "blades-in-the-dark",
      gameName: "Blades in the Dark",
      language: "en",
      revision: 1,
      formatVersion: 1,
      createdAt: "2026-07-24T00:00:00.000Z",
      updatedAt: "2026-07-24T00:00:00.000Z",
      crewTypeName: "Assassins",
      name: "",
      lair: "",
      reputation: "",
      huntingGrounds: "",
      tier: 0,
      hold: "strong",
      heat: { current: 0, max: 9 },
      wanted: { current: 0, max: 4 },
      rep: { current: 0, max: 12 },
      experience: { points: 0, max: 8 },
      specialAbilities: [],
      upgrades: [],
      cohorts: [],
      contacts: [],
      factions: [],
      coin: 0,
      stash: 0,
      notes: "",
      turf: 0,
      claimedClaimIds: [],
      claimOverrides: [],
    };

    const opResult = {
      ok: true,
      crew: crewData,
      applied: { op: "crew.create" },
      sideEffects: [],
      error: null,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(opResult),
    });

    const result = await Effect.runPromise(
      createCrew("blades-in-the-dark", "Assassins"),
    );
    expect(result.id).toBe("8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2");
    expect(result.crewTypeName).toBe("Assassins");
    expect(global.fetch).toHaveBeenCalledWith("/api/crews", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        gameStem: "blades-in-the-dark",
        crewType: "Assassins",
      }),
    });
  });

  it("exposes ApiError when POST fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => "Bad Request",
      status: 400,
    });

    const result = await Effect.runPromise(
      Effect.either(createCrew("blades-in-the-dark", "Assassins")),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(400);
    }
  });

  it("exposes DecodeError when response is not valid OperationResult", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ invalid: "data" }),
    });

    const result = await Effect.runPromise(
      Effect.either(createCrew("blades-in-the-dark", "Assassins")),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(DecodeError);
    }
  });
});

describe("stressAdd", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/characters/{id}/ops/stress.add with delta and If-Match header, decodes character from OperationResult", async () => {
    const characterId = "c46ba7cb-993b-4fc7-974d-fb95eacd5446";
    const characterData = {
      kind: "character",
      id: characterId,
      gameStem: "blades-in-the-dark",
      gameName: "Blades in the Dark",
      language: "en",
      revision: 13,
      formatVersion: 1,
      createdAt: "2026-07-22T00:00:00.000Z",
      updatedAt: "2026-07-24T00:00:00.000Z",
      isRetired: false,
      isDeadish: false,
      traumaPending: false,
      isOutOfAction: false,
      stressClearPending: false,
      dossier: {
        name: "Brenda Hilton",
        crewId: "8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2",
        alias: "Webweaver",
        look: "Keen and calculating",
        notes: "Spider operative",
        background: { name: "Urchin", description: "" },
        heritage: { name: "Akorosi", description: "" },
        vice: { name: "Gambling", description: "", purveyor: { name: "Mother Narya", description: "House of the Weeping Lady, Six Towers" } },
      },
      monitor: {
        stress: { current: 4, max: 9 },
        trauma: { traumas: ["Haunted"], max: 4 },
        harm: {
          lesser: [],
          moderate: [],
          severe: [],
          fatal: [],
          healingClock: { segments: 0, size: 6, rollover: 0 },
        },
        armor: {
          standardUsed: false,
          heavyUsed: false,
          specialUsed: false,
          hasStandard: true,
          hasHeavy: false,
          hasSpecial: false,
        },
      },
      talent: { attributes: [] },
      playbook: { name: "Spider", experience: { points: 4, max: 8 }, abilities: [] },
      gear: {
        loadout: [],
        availableGear: [],
        commitment: "none",
        isCommitmentLocked: false,
        maxBulk: 8,
      },
      fund: { satchel: { coins: 0, max: 2 }, stash: { coins: 0, max: 8 } },
      rolodex: { friends: [] },
      session: { playbookExpressions: 0, characterExpressions: 0, struggleExpressions: 0, max: 3 },
      notebook: "",
    };

    const opResult = {
      ok: true,
      character: characterData,
      applied: { op: "stress.add", requested: 1, effective: 1 },
      sideEffects: [],
      error: null,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(opResult),
    });

    const result = await Effect.runPromise(
      stressAdd(characterId, 1, 12),
    );
    expect(result.id).toBe(characterId);
    expect(result.monitor.stress.current).toBe(4);
    expect(global.fetch).toHaveBeenCalledWith(`/api/characters/${characterId}/ops/stress.add`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "If-Match": "12",
      },
      body: JSON.stringify({ delta: 1 }),
    });
  });

  it("exposes StaleRevisionError when API returns 409 with STALE_REVISION error code", async () => {
    const characterId = "c46ba7cb-993b-4fc7-974d-fb95eacd5446";
    const errorResponse = {
      ok: false,
      applied: { op: "stress.add" },
      sideEffects: [],
      error: {
        code: "STALE_REVISION",
        status: 409,
        message: "Character revision mismatch",
        retryable: true,
        recovery: "Refresh the sheet and retry.",
        details: { currentRevision: 15 },
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => JSON.stringify(errorResponse),
      status: 409,
    });

    const result = await Effect.runPromise(
      Effect.either(stressAdd(characterId, 1, 12)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
      if (result.left instanceof StaleRevisionError) {
        expect(result.left.currentRevision).toBe(15);
      }
    }
  });

  it("exposes ApiError when POST fails with non-409 status", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => "Not Found",
      status: 404,
    });

    const result = await Effect.runPromise(
      Effect.either(stressAdd("nonexistent-id", 1, 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(404);
    }
  });

  it("exposes DecodeError when response is not valid OperationResult", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ invalid: "data" }),
    });

    const result = await Effect.runPromise(
      Effect.either(stressAdd("some-id", 1, 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(DecodeError);
    }
  });

  it("exposes ApiError (not DecodeError) when 409 response body is malformed", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => "not json",
      status: 409,
    });

    const result = await Effect.runPromise(
      Effect.either(stressAdd("some-id", 1, 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(ApiError);
      if (result.left instanceof ApiError) {
        expect(result.left.status).toBe(409);
      }
    }
  });
});

describe("undoCrew", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/crews/{id}/undo and decodes crew from OperationResult on success", async () => {
    const crewId = "8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2";
    const crewData = {
      kind: "crew",
      id: crewId,
      gameStem: "blades-in-the-dark",
      gameName: "Blades in the Dark",
      language: "en",
      revision: 6,
      formatVersion: 1,
      createdAt: "2026-07-22T00:00:00.000Z",
      updatedAt: "2026-07-24T00:00:00.000Z",
      crewTypeName: "Assassins",
      name: "The Red Sashes",
      lair: "Northside safehouse",
      reputation: "ruthless",
      huntingGrounds: "The Docks",
      tier: 1,
      hold: "strong",
      heat: { current: 2, max: 9 },
      wanted: { current: 1, max: 4 },
      rep: { current: 3, max: 12 },
      experience: { points: 2, max: 8 },
      specialAbilities: [],
      upgrades: [],
      cohorts: [],
      contacts: [],
      factions: [],
      coin: 0,
      stash: 2,
      notes: "Up-and-coming crew",
      turf: 0,
      claimedClaimIds: [],
      claimOverrides: [],
    };

    const opResult = {
      ok: true,
      crew: crewData,
      applied: { op: "crew.undo" },
      sideEffects: [],
      error: null,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(opResult),
    });

    const result = await Effect.runPromise(
      undoCrew(crewId, 5),
    );
    expect(result.crew.id).toBe(crewId);
    expect(result.crew.heat.current).toBe(2);
    // P19/FV-019: destructive undo carries If-Match with the current revision.
    expect(global.fetch).toHaveBeenCalledWith(`/api/crews/${crewId}/undo`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "If-Match": "5",
      },
      body: JSON.stringify({}),
    });
  });

  it("exposes ApiError when server returns NO_HISTORY error code", async () => {
    const crewId = "8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2";
    const errorResponse = {
      ok: false,
      applied: { op: "crew.undo" },
      sideEffects: [],
      error: {
        code: "NO_HISTORY",
        status: 200,
        message: "No history to undo",
        retryable: false,
        recovery: "refresh the crew",
        details: {},
        entity: goldenCrew,
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(errorResponse),
      status: 200,
    });

    const result = await Effect.runPromise(
      Effect.either(undoCrew(crewId, 5)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      // FV-024: op-level failures are typed OpErrors carrying the decoded union.
      expect(result.left).toBeInstanceOf(OpError);
      expect(result.left).toBeInstanceOf(ApiError);
      if (result.left instanceof OpError) {
        expect(result.left.status).toBe(200);
        expect(result.left.error.code).toBe("NO_HISTORY");
      }
    }
  });

  it("exposes StaleRevisionError when API returns 409 with STALE_REVISION error code", async () => {
    const crewId = "8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2";
    const errorResponse = {
      ok: false,
      applied: { op: "crew.undo" },
      sideEffects: [],
      error: {
        code: "STALE_REVISION",
        status: 409,
        message: "Crew revision mismatch",
        retryable: true,
        recovery: "Refresh the sheet and retry.",
        details: { currentRevision: 7 },
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => JSON.stringify(errorResponse),
      status: 409,
    });

    const result = await Effect.runPromise(
      Effect.either(undoCrew(crewId, 5)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
      if (result.left instanceof StaleRevisionError) {
        expect(result.left.currentRevision).toBe(7);
      }
    }
  });

  it("exposes ApiError when POST fails with non-409 status", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => "Not Found",
      status: 404,
    });

    const result = await Effect.runPromise(
      Effect.either(undoCrew("nonexistent-id", 5)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(404);
    }
  });

  it("exposes DecodeError when response is not valid OperationResult", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ invalid: "data" }),
    });

    const result = await Effect.runPromise(
      Effect.either(undoCrew("some-id", 5)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(DecodeError);
    }
  });

  it("exposes ApiError (not DecodeError) when 409 response body is malformed", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => "not json",
      status: 409,
    });

    const result = await Effect.runPromise(
      Effect.either(undoCrew("some-id", 5)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(ApiError);
      if (result.left instanceof ApiError) {
        expect(result.left.status).toBe(409);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// F2m client methods — dossierUpdate, stressClear, traumaAdd, traumaRemove, getGame
// ---------------------------------------------------------------------------

function makeChar(overrides: Record<string, unknown> = {}) {
  return {
    kind: "character",
    id: "c46ba7cb-993b-4fc7-974d-fb95eacd5446",
    gameStem: "blades-in-the-dark",
    gameName: "Blades in the Dark",
    language: "en",
    revision: 12,
    formatVersion: 1,
    createdAt: "2026-07-22T00:00:00.000Z",
    updatedAt: "2026-07-22T00:00:00.000Z",
    isRetired: false,
    isDeadish: false,
    traumaPending: false,
    isOutOfAction: false,
    stressClearPending: false,
    dossier: {
      name: "Brenda Hilton",
      crewId: "8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2",
      alias: "Webweaver",
      look: "Keen and calculating",
      notes: "Spider operative",
      background: { name: "Urchin", description: "" },
      heritage: { name: "Akorosi", description: "" },
      vice: { name: "Gambling", description: "", purveyor: { name: "Mother Narya", description: "House of the Weeping Lady, Six Towers" } },
    },
    monitor: {
      stress: { current: 3, max: 9 },
      trauma: { traumas: ["Haunted"], max: 4 },
      harm: {
        lesser: [],
        moderate: [],
        severe: [],
        fatal: [],
        healingClock: { segments: 0, size: 6, rollover: 0 },
      },
      armor: {
        standardUsed: false,
        heavyUsed: false,
        specialUsed: false,
        hasStandard: true,
        hasHeavy: false,
        hasSpecial: false,
      },
    },
    talent: { attributes: [] },
    playbook: { name: "Spider", experience: { points: 4, max: 8 }, abilities: [] },
    gear: {
      loadout: [],
      availableGear: [],
      commitment: "none",
      isCommitmentLocked: false,
      maxBulk: 8,
    },
    fund: { satchel: { coins: 0, max: 2 }, stash: { coins: 0, max: 8 } },
    rolodex: { friends: [] },
    session: { playbookExpressions: 0, characterExpressions: 0, struggleExpressions: 0, max: 3 },
    notebook: "",
    ...overrides,
  };
}

function opOk(character: unknown) {
  return {
    ok: true,
    character,
    applied: { op: "dossier.update" },
    sideEffects: [],
    error: null,
  };
}

function staleResp(opName: string, currentRevision: number) {
  // Full frozen-shape whole-error (SC-F1): status/retryable/recovery are
  // required on the new-shape branch, and details rejects the legacy branch.
  return {
    ok: false,
    applied: { op: opName },
    sideEffects: [],
    error: {
      code: "STALE_REVISION",
      status: 409,
      message: "Revision mismatch",
      retryable: true,
      recovery: "Refresh the sheet and retry.",
      details: { currentRevision },
    },
  };
}

describe("dossierUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/characters/{id}/ops/dossier.update with partial fields and If-Match", async () => {
    const updated = makeChar({
      revision: 13,
      dossier: {
        name: "Renamed",
        crewId: "8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2",
        alias: "NewAlias",
        look: "",
        notes: "",
        background: { name: "Labor", description: "" },
        heritage: { name: "Tycherosi", description: "" },
        vice: { name: "Gambling", description: "", purveyor: { name: "Mother Narya", description: "House of the Weeping Lady, Six Towers" } },
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(opOk(updated)),
    });

    const result = await Effect.runPromise(
      dossierUpdate("c46ba7cb-993b-4fc7-974d-fb95eacd5446", { name: "Renamed", alias: "NewAlias" }, 12),
    );
    expect(result.dossier.name).toBe("Renamed");
    expect(result.dossier.alias).toBe("NewAlias");
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/characters/c46ba7cb-993b-4fc7-974d-fb95eacd5446/ops/dossier.update",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "12",
        },
        body: JSON.stringify({ name: "Renamed", alias: "NewAlias" }),
      },
    );
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("dossier.update", 15)),
    });

    const result = await Effect.runPromise(
      Effect.either(dossierUpdate("some-id", { name: "X" }, 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
      if (result.left instanceof StaleRevisionError) {
        expect(result.left.currentRevision).toBe(15);
      }
    }
  });

  it("exposes ApiError on non-409 failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "bad request",
    });

    const result = await Effect.runPromise(
      Effect.either(dossierUpdate("some-id", { name: "X" }, 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(400);
    }
  });
});

describe("stressClear", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/characters/{id}/ops/stress.clear with If-Match", async () => {
    const cleared = makeChar({
      revision: 13,
      monitor: {
        ...makeChar().monitor,
        stress: { current: 0, max: 9 },
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(opOk(cleared)),
    });

    const result = await Effect.runPromise(
      stressClear("c46ba7cb-993b-4fc7-974d-fb95eacd5446", 12),
    );
    expect(result.monitor.stress.current).toBe(0);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/characters/c46ba7cb-993b-4fc7-974d-fb95eacd5446/ops/stress.clear",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "12",
        },
        body: "{}",
      },
    );
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("stress.clear", 15)),
    });

    const result = await Effect.runPromise(
      Effect.either(stressClear("some-id", 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });

  it("exposes ApiError on non-409 failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "not found",
    });

    const result = await Effect.runPromise(
      Effect.either(stressClear("nonexistent", 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(404);
    }
  });
});

describe("traumaAdd", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/characters/{id}/ops/trauma.add with trauma name and If-Match", async () => {
    const withTrauma = makeChar({
      revision: 13,
      monitor: {
        ...makeChar().monitor,
        trauma: { traumas: ["Haunted", "Cold"], max: 4 },
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(opOk(withTrauma)),
    });

    const result = await Effect.runPromise(
      traumaAdd("c46ba7cb-993b-4fc7-974d-fb95eacd5446", "Cold", 12),
    );
    expect(result.monitor.trauma.traumas).toContain("Cold");
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/characters/c46ba7cb-993b-4fc7-974d-fb95eacd5446/ops/trauma.add",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "12",
        },
        body: JSON.stringify({ trauma: "Cold" }),
      },
    );
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("trauma.add", 15)),
    });

    const result = await Effect.runPromise(
      Effect.either(traumaAdd("some-id", "Cold", 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });

  it("exposes ApiError on non-409 failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "not found",
    });

    const result = await Effect.runPromise(
      Effect.either(traumaAdd("nonexistent", "Cold", 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(404);
    }
  });
});

describe("traumaRemove", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/characters/{id}/ops/trauma.remove with trauma name and If-Match", async () => {
    const withoutTrauma = makeChar({
      revision: 13,
      monitor: {
        ...makeChar().monitor,
        trauma: { traumas: [], max: 4 },
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(opOk(withoutTrauma)),
    });

    const result = await Effect.runPromise(
      traumaRemove("c46ba7cb-993b-4fc7-974d-fb95eacd5446", "Haunted", 12),
    );
    expect(result.monitor.trauma.traumas).not.toContain("Haunted");
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/characters/c46ba7cb-993b-4fc7-974d-fb95eacd5446/ops/trauma.remove",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "12",
        },
        body: JSON.stringify({ trauma: "Haunted" }),
      },
    );
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("trauma.remove", 15)),
    });

    const result = await Effect.runPromise(
      Effect.either(traumaRemove("some-id", "Cold", 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });
});

describe("getGame", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches /api/games/{stem} and returns raw game-settings JSON", async () => {
    const gameData = {
      Name: "Blades in the Dark",
      Traumas: ["Cold", "Haunted", "Obsessed"],
      StressMax: 9,
      TraumaMax: 4,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(gameData),
    });

    const result = await Effect.runPromise(getGame("blades-in-the-dark"));
    expect(result).toEqual(gameData);
    expect(global.fetch).toHaveBeenCalledWith("/api/games/blades-in-the-dark", {
      headers: { Accept: "application/json" },
    });
  });

  it("exposes ApiError when fetch fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "Not Found",
    });

    const result = await Effect.runPromise(
      Effect.either(getGame("nonexistent")),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(404);
    }
  });
});

describe("undoCharacter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/characters/{id}/undo and decodes character from OperationResult on success", async () => {
    const characterId = "c46ba7cb-993b-4fc7-974d-fb95eacd5446";
    const characterData = {
      kind: "character",
      id: characterId,
      gameStem: "blades-in-the-dark",
      gameName: "Blades in the Dark",
      language: "en",
      revision: 13,
      formatVersion: 1,
      createdAt: "2026-07-22T00:00:00.000Z",
      updatedAt: "2026-07-24T00:00:00.000Z",
      isRetired: false,
      isDeadish: false,
      traumaPending: false,
      isOutOfAction: false,
      stressClearPending: false,
      dossier: {
        name: "Brenda Hilton",
        crewId: "8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2",
        alias: "Webweaver",
        look: "Keen and calculating",
        notes: "Spider operative",
        background: { name: "Urchin", description: "" },
        heritage: { name: "Akorosi", description: "" },
        vice: { name: "Gambling", description: "", purveyor: { name: "Mother Narya", description: "House of the Weeping Lady, Six Towers" } },
      },
      monitor: {
        stress: { current: 2, max: 9 },
        trauma: { traumas: ["Haunted"], max: 4 },
        harm: {
          lesser: [],
          moderate: [],
          severe: [],
          fatal: [],
          healingClock: { segments: 0, size: 6, rollover: 0 },
        },
        armor: {
          standardUsed: false,
          heavyUsed: false,
          specialUsed: false,
          hasStandard: true,
          hasHeavy: false,
          hasSpecial: false,
        },
      },
      talent: { attributes: [] },
      playbook: { name: "Spider", experience: { points: 4, max: 8 }, abilities: [] },
      gear: {
        loadout: [],
        availableGear: [],
        commitment: "none",
        isCommitmentLocked: false,
        maxBulk: 8,
      },
      fund: { satchel: { coins: 0, max: 2 }, stash: { coins: 0, max: 8 } },
      rolodex: { friends: [] },
      session: { playbookExpressions: 0, characterExpressions: 0, struggleExpressions: 0, max: 3 },
      notebook: "",
    };

    const opResult = {
      ok: true,
      character: characterData,
      applied: { op: "character.undo" },
      sideEffects: [],
      error: null,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(opResult),
    });

    const result = await Effect.runPromise(
      undoCharacter(characterId, 12),
    );
    expect(result.character.id).toBe(characterId);
    expect(result.character.monitor.stress.current).toBe(2);
    // P19/FV-019: destructive undo carries If-Match with the current revision.
    expect(global.fetch).toHaveBeenCalledWith(`/api/characters/${characterId}/undo`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "If-Match": "12",
      },
      body: JSON.stringify({}),
    });
  });

  it("exposes ApiError when server returns NO_HISTORY error code", async () => {
    const characterId = "c46ba7cb-993b-4fc7-974d-fb95eacd5446";
    const errorResponse = {
      ok: false,
      applied: { op: "character.undo" },
      sideEffects: [],
      error: {
        code: "NO_HISTORY",
        status: 200,
        message: "No history to undo",
        retryable: false,
        recovery: "refresh the character",
        details: {},
        entity: goldenCharacter,
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(errorResponse),
      status: 200,
    });

    const result = await Effect.runPromise(
      Effect.either(undoCharacter(characterId, 12)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      // FV-024: op-level failures are typed OpErrors carrying the decoded union.
      expect(result.left).toBeInstanceOf(OpError);
      expect(result.left).toBeInstanceOf(ApiError);
      if (result.left instanceof OpError) {
        expect(result.left.status).toBe(200);
        expect(result.left.error.code).toBe("NO_HISTORY");
      }
    }
  });

  it("exposes StaleRevisionError when API returns 409 with STALE_REVISION error code", async () => {
    const characterId = "c46ba7cb-993b-4fc7-974d-fb95eacd5446";
    const errorResponse = {
      ok: false,
      applied: { op: "character.undo" },
      sideEffects: [],
      error: {
        code: "STALE_REVISION",
        status: 409,
        message: "Character revision mismatch",
        retryable: true,
        recovery: "Refresh the sheet and retry.",
        details: { currentRevision: 15 },
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => JSON.stringify(errorResponse),
      status: 409,
    });

    const result = await Effect.runPromise(
      Effect.either(undoCharacter(characterId, 12)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
      if (result.left instanceof StaleRevisionError) {
        expect(result.left.currentRevision).toBe(15);
      }
    }
  });

  it("exposes ApiError when POST fails with non-409 status", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => "Not Found",
      status: 404,
    });

    const result = await Effect.runPromise(
      Effect.either(undoCharacter("nonexistent-id", 12)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(404);
    }
  });

  it("exposes DecodeError when response is not valid OperationResult", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ invalid: "data" }),
    });

    const result = await Effect.runPromise(
      Effect.either(undoCharacter("some-id", 12)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(DecodeError);
    }
  });

  it("exposes ApiError (not DecodeError) when 409 response body is malformed", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => "not json",
      status: 409,
    });

    const result = await Effect.runPromise(
      Effect.either(undoCharacter("some-id", 12)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(ApiError);
      if (result.left instanceof ApiError) {
        expect(result.left.status).toBe(409);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// F4 client methods — retireCharacter, endScore, deleteCharacter
// ---------------------------------------------------------------------------

describe("retireCharacter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts confirm:true to /characters/{id}/retire with If-Match and returns the retired character", async () => {
    const characterId = "c46ba7cb-993b-4fc7-974d-fb95eacd5446";
    const retired = makeChar({
      revision: 13,
      isRetired: true,
      monitor: {
        ...makeChar().monitor,
        stress: { current: 0, max: 9 },
        harm: { lesser: [], moderate: [], severe: [], fatal: [], healingClock: { segments: 0, size: 6, rollover: 0 } },
        armor: { standardUsed: false, heavyUsed: false, specialUsed: false, hasStandard: true, hasHeavy: false, hasSpecial: false },
      },
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ ok: true, character: retired, applied: { op: "retire" }, sideEffects: [], error: null }),
    });

    const result = await Effect.runPromise(retireCharacter(characterId, 12));
    expect(result.isRetired).toBe(true);
    expect(result.monitor.stress.current).toBe(0);
    expect(global.fetch).toHaveBeenCalledWith(`/api/characters/${characterId}/retire`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "If-Match": "12",
      },
      body: JSON.stringify({ confirm: true }),
    });
  });

  it("surfaces OpError when the server rejects with RETIRED (already retired)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        ok: false,
        applied: { op: "retire" },
        sideEffects: [],
        error: { code: "RETIRED", status: 200, message: "already retired", retryable: false, recovery: "", details: {} },
      }),
      status: 200,
    });
    const result = await Effect.runPromise(Effect.either(retireCharacter("some-id", 12)));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof OpError) {
      expect(result.left.error.code).toBe("RETIRED");
    }
  });
});

describe("endScore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts an omitted/empty body to /characters/{id}/end-score and returns the cleared character", async () => {
    const characterId = "c46ba7cb-993b-4fc7-974d-fb95eacd5446";
    const ended = makeChar({
      revision: 13,
      monitor: {
        ...makeChar().monitor,
        stress: { current: 0, max: 9 },
      },
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ ok: true, character: ended, applied: { op: "end-score" }, sideEffects: [], error: null }),
    });

    const result = await Effect.runPromise(endScore(characterId, 12));
    expect(result.monitor.stress.current).toBe(0);
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(String(init.body))).toEqual({});
  });

  it("passes the optional cleanup flags through unchanged", async () => {
    const characterId = "c46ba7cb-993b-4fc7-974d-fb95eacd5446";
    const ended = makeChar({ revision: 13 });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ ok: true, character: ended, applied: { op: "end-score" }, sideEffects: [], error: null }),
    });

    await Effect.runPromise(
      endScore(characterId, 12, { clearArmorUsed: true, resetLoadoutCommitment: true }),
    );
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(String(init.body))).toEqual({ clearArmorUsed: true, resetLoadoutCommitment: true });
  });

  it("surfaces TRAUMA_REQUIRED while a trauma is pending", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        ok: false,
        applied: { op: "end-score" },
        sideEffects: [],
        error: { code: "TRAUMA_REQUIRED", status: 200, message: "resolve pending trauma", retryable: false, recovery: "", details: {} },
      }),
      status: 200,
    });
    const result = await Effect.runPromise(Effect.either(endScore("some-id", 12)));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof OpError) {
      expect(result.left.error.code).toBe("TRAUMA_REQUIRED");
    }
  });
});

describe("deleteCharacter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts confirm:true to /characters/{id}/delete with the revision as If-Match and resolves to void", async () => {
    const characterId = "c46ba7cb-993b-4fc7-974d-fb95eacd5446";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ ok: true, applied: { op: "deleteCharacter" }, sideEffects: [], error: null }),
    });

    const result = await Effect.runPromise(deleteCharacter(characterId, "12"));
    expect(result).toBeUndefined();
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.headers["If-Match"]).toBe("12");
    expect(JSON.parse(String(init.body))).toEqual({ confirm: true });
  });

  it("accepts a degraded-entity delete token as If-Match", async () => {
    const characterId = "c46ba7cb-993b-4fc7-974d-fb95eacd5446";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ ok: true, applied: { op: "deleteCharacter" }, sideEffects: [], error: null }),
    });
    const token = `sha256:${"a".repeat(64)}`;
    await Effect.runPromise(deleteCharacter(characterId, token));
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.headers["If-Match"]).toBe(token);
  });
});

// ---------------------------------------------------------------------------
// F2n client methods — harmAdd, harmHeal, harmRemove, harmHealingClock, armorSet
// ---------------------------------------------------------------------------

function harmOpOk(character: unknown, opName: string, overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    character,
    applied: { op: opName, ...overrides },
    sideEffects: [],
    error: null,
  };
}

describe("harmAdd", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/characters/{id}/ops/harm.add with description, intensity, and If-Match", async () => {
    const withLesser = makeChar({
      revision: 13,
      monitor: {
        ...makeChar().monitor,
        harm: {
          lesser: ["Battered"],
          moderate: [],
          severe: [],
          fatal: [],
          healingClock: { segments: 0, size: 6, rollover: 0 },
        },
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(harmOpOk(withLesser, "harm.add")),
    });

    const result = await Effect.runPromise(
      harmAdd("c46ba7cb-993b-4fc7-974d-fb95eacd5446", "Battered", "lesser", 12),
    );
    expect(result.character.monitor.harm.lesser).toContain("Battered");
    expect(result.landedIntensity).toBeNull();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/characters/c46ba7cb-993b-4fc7-974d-fb95eacd5446/ops/harm.add",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "12",
        },
        body: JSON.stringify({ description: "Battered", intensity: "lesser" }),
      },
    );
  });

  it("returns landedIntensity when spillover occurs", async () => {
    // When a lesser harm spills to moderate because lesser slots are full,
    // the API reports applied.landedIntensity that differs from the request.
    const withSpilled = makeChar({
      revision: 13,
      monitor: {
        ...makeChar().monitor,
        harm: {
          lesser: ["A", "B"],
          moderate: ["Stabbed"],
          severe: [],
          fatal: [],
          healingClock: { segments: 0, size: 6, rollover: 0 },
        },
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(harmOpOk(withSpilled, "harm.add", { landedIntensity: "moderate" })),
    });

    const result = await Effect.runPromise(
      harmAdd("c46ba7cb-993b-4fc7-974d-fb95eacd5446", "Stabbed", "lesser", 12),
    );
    expect(result.character.monitor.harm.moderate).toContain("Stabbed");
    expect(result.landedIntensity).toBe("moderate");
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("harm.add", 15)),
    });

    const result = await Effect.runPromise(
      Effect.either(harmAdd("some-id", "ouch", "lesser", 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });

  it("exposes ApiError on non-409 failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => "SLOT_FULL_FATAL",
    });

    const result = await Effect.runPromise(
      Effect.either(harmAdd("some-id", "ouch", "fatal", 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(422);
    }
  });
});

describe("harmHeal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/characters/{id}/ops/harm.heal with intensity + description and If-Match", async () => {
    const healed = makeChar({
      revision: 13,
      monitor: {
        ...makeChar().monitor,
        harm: {
          lesser: [],
          moderate: [],
          severe: [],
          fatal: [],
          healingClock: { segments: 0, size: 6, rollover: 0 },
        },
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(harmOpOk(healed, "harm.heal")),
    });

    const result = await Effect.runPromise(
      harmHeal("c46ba7cb-993b-4fc7-974d-fb95eacd5446", "lesser", "Battered", 12),
    );
    expect(result.monitor.harm.lesser).not.toContain("Battered");
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/characters/c46ba7cb-993b-4fc7-974d-fb95eacd5446/ops/harm.heal",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "12",
        },
        body: JSON.stringify({ intensity: "lesser", description: "Battered" }),
      },
    );
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("harm.heal", 15)),
    });

    const result = await Effect.runPromise(
      Effect.either(harmHeal("some-id", "lesser", "Battered", 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });

  it("exposes ApiError on non-409 failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => "CANNOT_HEAL",
    });

    const result = await Effect.runPromise(
      Effect.either(harmHeal("some-id", "lesser", "Battered", 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(422);
    }
  });
});

// ---------------------------------------------------------------------------
// F2ab client methods — noteAdd, noteRemove, listCrews
// ---------------------------------------------------------------------------

describe("noteAdd", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/characters/{id}/ops/note.add with text and If-Match", async () => {
    const withNotes = makeChar({
      revision: 13,
      dossier: { ...makeChar().dossier, notes: ["Spider operative", "Watch the Lamplighters"] },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(harmOpOk(withNotes, "note.add")),
    });

    const result = await Effect.runPromise(
      noteAdd("c46ba7cb-993b-4fc7-974d-fb95eacd5446", "Watch the Lamplighters", 12),
    );
    expect(result.dossier.notes).toHaveLength(2);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/characters/c46ba7cb-993b-4fc7-974d-fb95eacd5446/ops/note.add",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "12",
        },
        body: JSON.stringify({ text: "Watch the Lamplighters" }),
      },
    );
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("note.add", 15)),
    });

    const result = await Effect.runPromise(
      Effect.either(noteAdd("some-id", "hello", 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });
});

describe("noteRemove", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/characters/{id}/ops/note.remove with the 0-based index and If-Match", async () => {
    const afterRemove = makeChar({
      revision: 13,
      dossier: { ...makeChar().dossier, notes: ["Second note"] },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(harmOpOk(afterRemove, "note.remove")),
    });

    const result = await Effect.runPromise(
      noteRemove("c46ba7cb-993b-4fc7-974d-fb95eacd5446", 0, 12),
    );
    expect(result.dossier.notes).toEqual(["Second note"]);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/characters/c46ba7cb-993b-4fc7-974d-fb95eacd5446/ops/note.remove",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "12",
        },
        body: JSON.stringify({ index: 0 }),
      },
    );
  });

  it("exposes ApiError when the server reports NOT_FOUND", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        ok: false,
        applied: { op: "note.remove" },
        sideEffects: [],
        error: {
          code: "NOT_FOUND",
          status: 404,
          message: "no note at index 99",
          retryable: false,
          recovery: "refresh the character",
          details: {},
        },
      }),
    });

    const result = await Effect.runPromise(
      Effect.either(noteRemove("some-id", 99, 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("NOT_FOUND");
    }
  });
});

describe("listCrews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches /api/crews and decodes crew summaries", async () => {
    const crewsData = [
      {
        // SC-F1 frozen decoder requires the summary discriminant.
        kind: "crew",
        id: "8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2",
        name: "The Red Sashes",
        crewType: "Assassins",
        gameStem: "blades-in-the-dark",
        tier: 0,
        heat: 4,
        wanted: 1,
        rep: 3,
        hold: "strong",
        memberCount: 1,
        revision: 5,
        isReadable: true,
        isRepairable: false,
        isComplete: true,
        deleteToken: "",
        canUndo: false,
        historyCount: 0,
      },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(crewsData),
    });

    const result = await Effect.runPromise(listCrews());
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("The Red Sashes");
    expect(global.fetch).toHaveBeenCalledWith("/api/crews", {
      headers: { Accept: "application/json" },
    });
  });

  it("exposes DecodeError when the response is not crew summaries", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ not: "a list" }),
    });

    const result = await Effect.runPromise(
      Effect.either(listCrews()),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(DecodeError);
    }
  });
});

describe("harmRemove", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/characters/{id}/ops/harm.remove with description, intensity, and If-Match", async () => {
    const removed = makeChar({
      revision: 13,
      monitor: {
        ...makeChar().monitor,
        harm: {
          lesser: [],
          moderate: [],
          severe: [],
          fatal: [],
          healingClock: { segments: 0, size: 6, rollover: 0 },
        },
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(harmOpOk(removed, "harm.remove")),
    });

    const result = await Effect.runPromise(
      harmRemove("c46ba7cb-993b-4fc7-974d-fb95eacd5446", "Battered", "lesser", 12),
    );
    expect(result.monitor.harm.lesser).not.toContain("Battered");
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/characters/c46ba7cb-993b-4fc7-974d-fb95eacd5446/ops/harm.remove",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "12",
        },
        body: JSON.stringify({ description: "Battered", intensity: "lesser" }),
      },
    );
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("harm.remove", 15)),
    });

    const result = await Effect.runPromise(
      Effect.either(harmRemove("some-id", "ouch", "lesser", 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });
});

describe("harmHealingClock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/characters/{id}/ops/harm.healing-clock with segments and If-Match", async () => {
    const ticked = makeChar({
      revision: 13,
      monitor: {
        ...makeChar().monitor,
        harm: {
          lesser: ["Battered"],
          moderate: [],
          severe: [],
          fatal: [],
          healingClock: { segments: 2, size: 6, rollover: 0 },
        },
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(harmOpOk(ticked, "harm.healing-clock")),
    });

    const result = await Effect.runPromise(
      harmHealingClock("c46ba7cb-993b-4fc7-974d-fb95eacd5446", 2, 12),
    );
    expect(result.monitor.harm.healingClock.segments).toBe(2);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/characters/c46ba7cb-993b-4fc7-974d-fb95eacd5446/ops/harm.healing-clock",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "12",
        },
        body: JSON.stringify({ segments: 2 }),
      },
    );
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("harm.healing-clock", 15)),
    });

    const result = await Effect.runPromise(
      Effect.either(harmHealingClock("some-id", 1, 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });
});

describe("armorSet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/characters/{id}/ops/armor.set with armor kind, used flag, and If-Match", async () => {
    const armorOn = makeChar({
      revision: 13,
      monitor: {
        ...makeChar().monitor,
        armor: {
          standardUsed: true,
          heavyUsed: false,
          specialUsed: false,
          hasStandard: true,
          hasHeavy: false,
          hasSpecial: false,
        },
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(harmOpOk(armorOn, "armor.set")),
    });

    const result = await Effect.runPromise(
      armorSet("c46ba7cb-993b-4fc7-974d-fb95eacd5446", "standard", true, 12),
    );
    expect(result.monitor.armor.standardUsed).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/characters/c46ba7cb-993b-4fc7-974d-fb95eacd5446/ops/armor.set",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "12",
        },
        body: JSON.stringify({ armor: "standard", used: true }),
      },
    );
  });

  it("sends used=false to uncheck armor", async () => {
    const armorOff = makeChar({
      revision: 13,
      monitor: {
        ...makeChar().monitor,
        armor: {
          standardUsed: false,
          heavyUsed: false,
          specialUsed: false,
          hasStandard: true,
          hasHeavy: false,
          hasSpecial: false,
        },
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(harmOpOk(armorOff, "armor.set")),
    });

    const result = await Effect.runPromise(
      armorSet("c46ba7cb-993b-4fc7-974d-fb95eacd5446", "standard", false, 12),
    );
    expect(result.monitor.armor.standardUsed).toBe(false);
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("armor.set", 15)),
    });

    const result = await Effect.runPromise(
      Effect.either(armorSet("some-id", "standard", true, 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });

  it("exposes ApiError on non-409 failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => "ARMOR_NOT_AVAILABLE",
    });

    const result = await Effect.runPromise(
      Effect.either(armorSet("some-id", "heavy", true, 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(422);
    }
  });
});


// ---------------------------------------------------------------------------
// F2y crew operations — crewContactAdd, crewContactRemove, factionSetStatus, factionRemove
// ---------------------------------------------------------------------------

function makeCrew(overrides: Record<string, unknown> = {}) {
  return {
    kind: "crew",
    id: "8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2",
    gameStem: "blades-in-the-dark",
    gameName: "Blades in the Dark",
    language: "en",
    revision: 5,
    formatVersion: 1,
    createdAt: "2026-07-22T00:00:00.000Z",
    updatedAt: "2026-07-22T00:00:00.000Z",
    crewTypeName: "Assassins",
    name: "The Red Sashes",
    lair: "Northside safehouse",
    reputation: "ruthless",
    huntingGrounds: "The Docks",
    tier: 1,
    hold: "strong",
    heat: { current: 4, max: 9 },
    wanted: { current: 1, max: 4 },
    rep: { current: 3, max: 12 },
    experience: { points: 2, max: 8 },
    specialAbilities: [],
    upgrades: [],
    cohorts: [],
    contacts: [],
    factions: [],
    coin: 0,
    stash: 2,
    notes: "Up-and-coming crew",
    turf: 0,
    claimedClaimIds: [],
    claimOverrides: [],
    ...overrides,
  };
}

function crewOpOk(crew: unknown, opName: string, appliedOverrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    crew,
    applied: { op: opName, ...appliedOverrides },
    sideEffects: [],
    error: null,
  };
}

function crewOpErr(opName: string, code: string, message: string, crew: unknown) {
  return {
    ok: false,
    applied: { op: opName },
    sideEffects: [],
    error: { code, message },
    crew,
  };
}

function charOpErr(opName: string, code: string, message: string, character: unknown) {
  return {
    ok: false,
    applied: { op: opName },
    sideEffects: [],
    error: { code, message },
    character,
  };
}

const CREW_ID_F2Y = "8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2";

describe("crewContactAdd", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/crews/{id}/ops/contact.add with name, profession, and If-Match, decodes crew from OperationResult", async () => {
    const withContact = makeCrew({
      revision: 6,
      contacts: [{ name: "Rolan Wott", profession: "magistrate" }],
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(crewOpOk(withContact, "contact.add")),
    });

    const result = await Effect.runPromise(
      crewContactAdd(CREW_ID_F2Y, "Rolan Wott", "magistrate", 5),
    );
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts?.[0]?.name).toBe("Rolan Wott");
    expect(result.contacts?.[0]?.profession).toBe("magistrate");
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/crews/${CREW_ID_F2Y}/ops/contact.add`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "5",
        },
        body: JSON.stringify({ name: "Rolan Wott", profession: "magistrate" }),
      },
    );
  });

  it("exposes ApiError with DUPLICATE code when the op result is ok:false", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(crewOpErr("contact.add", "DUPLICATE", "contact already exists", makeCrew())),
    });

    const result = await Effect.runPromise(
      Effect.either(crewContactAdd(CREW_ID_F2Y, "Rolan Wott", "spy", 5)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("DUPLICATE");
    }
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("contact.add", 7)),
    });

    const result = await Effect.runPromise(
      Effect.either(crewContactAdd(CREW_ID_F2Y, "Rolan Wott", "magistrate", 5)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });
});

describe("crewContactRemove", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/crews/{id}/ops/contact.remove with name and If-Match, decodes crew from OperationResult", async () => {
    const removed = makeCrew({ revision: 6, contacts: [] });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(crewOpOk(removed, "contact.remove")),
    });

    const result = await Effect.runPromise(
      crewContactRemove(CREW_ID_F2Y, "Rolan Wott", 5),
    );
    expect(result.contacts).toHaveLength(0);
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/crews/${CREW_ID_F2Y}/ops/contact.remove`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "5",
        },
        body: JSON.stringify({ name: "Rolan Wott" }),
      },
    );
  });

  it("exposes ApiError with NOT_FOUND code when the op result is ok:false", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(crewOpErr("contact.remove", "NOT_FOUND", "contact not found", makeCrew())),
    });

    const result = await Effect.runPromise(
      Effect.either(crewContactRemove(CREW_ID_F2Y, "Nobody", 5)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("NOT_FOUND");
    }
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("contact.remove", 7)),
    });

    const result = await Effect.runPromise(
      Effect.either(crewContactRemove(CREW_ID_F2Y, "Rolan Wott", 5)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });
});

describe("factionSetStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/crews/{id}/ops/faction.set-status with name, status, and If-Match, returns applied requested/effective", async () => {
    const withFaction = makeCrew({
      revision: 6,
      factions: [{ name: "The Crows", status: 9 }],
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(crewOpOk(withFaction, "faction.set-status", { requested: 999, effective: 9 })),
    });

    const result = await Effect.runPromise(
      factionSetStatus(CREW_ID_F2Y, "The Crows", 999, 5),
    );
    expect(result.crew.factions?.[0]?.status).toBe(9);
    expect(result.requested).toBe(999);
    expect(result.effective).toBe(9);
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/crews/${CREW_ID_F2Y}/ops/faction.set-status`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "5",
        },
        body: JSON.stringify({ name: "The Crows", status: 999 }),
      },
    );
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("faction.set-status", 7)),
    });

    const result = await Effect.runPromise(
      Effect.either(factionSetStatus(CREW_ID_F2Y, "The Crows", 3, 5)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });

  it("exposes ApiError on non-409 failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => "VALIDATION: invalid status",
    });

    const result = await Effect.runPromise(
      Effect.either(factionSetStatus(CREW_ID_F2Y, "The Crows", 3, 5)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(422);
    }
  });
});

describe("factionRemove", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/crews/{id}/ops/faction.remove with name and If-Match, decodes crew from OperationResult", async () => {
    const removed = makeCrew({ revision: 6, factions: [] });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(crewOpOk(removed, "faction.remove")),
    });

    const result = await Effect.runPromise(
      factionRemove(CREW_ID_F2Y, "The Crows", 5),
    );
    expect(result.factions).toHaveLength(0);
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/crews/${CREW_ID_F2Y}/ops/faction.remove`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "5",
        },
        body: JSON.stringify({ name: "The Crows" }),
      },
    );
  });

  it("exposes ApiError with NOT_FOUND code when the op result is ok:false", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(crewOpErr("faction.remove", "NOT_FOUND", "faction not found", makeCrew())),
    });

    const result = await Effect.runPromise(
      Effect.either(factionRemove(CREW_ID_F2Y, "Nobody", 5)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("NOT_FOUND");
    }
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("faction.remove", 7)),
    });

    const result = await Effect.runPromise(
      Effect.either(factionRemove(CREW_ID_F2Y, "The Crows", 5)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });
});

// ---------------------------------------------------------------------------
// F2u crew operations — crewFieldsUpdate, crewRepAdd, crewHeatAdd,
// crewWantedAdd, crewTierAdd, crewHoldSet, crewCoinAdd, crewStashAdd
// ---------------------------------------------------------------------------

describe("crewFieldsUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/crews/{id}/ops/fields.update with the provided fields and If-Match, decodes crew from OperationResult", async () => {
    const updated = makeCrew({ revision: 6, name: "Renamed Crew", lair: "New lair" });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(crewOpOk(updated, "fields.update")),
    });

    const result = await Effect.runPromise(
      crewFieldsUpdate(CREW_ID_F2Y, { name: "Renamed Crew", lair: "New lair" }, 5),
    );
    expect(result.name).toBe("Renamed Crew");
    expect(result.lair).toBe("New lair");
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/crews/${CREW_ID_F2Y}/ops/fields.update`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "5",
        },
        body: JSON.stringify({ name: "Renamed Crew", lair: "New lair" }),
      },
    );
  });

  it("exposes ApiError with VALIDATION code when the op result is ok:false", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(crewOpErr("fields.update", "VALIDATION", "unknown field", makeCrew())),
    });

    const result = await Effect.runPromise(
      Effect.either(crewFieldsUpdate(CREW_ID_F2Y, { name: "" }, 5)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("VALIDATION");
    }
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("fields.update", 7)),
    });

    const result = await Effect.runPromise(
      Effect.either(crewFieldsUpdate(CREW_ID_F2Y, { name: "x" }, 5)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });
});

describe("crewRepAdd", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/crews/{id}/ops/rep.add with delta and If-Match, decodes crew from OperationResult", async () => {
    const withRep = makeCrew({ revision: 6, rep: { current: 5, max: 12 } });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(crewOpOk(withRep, "rep.add")),
    });

    const result = await Effect.runPromise(crewRepAdd(CREW_ID_F2Y, 2, 5));
    expect(result.crew.rep.current).toBe(5);
    expect(result.requested).toBe(2);
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/crews/${CREW_ID_F2Y}/ops/rep.add`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "5",
        },
        body: JSON.stringify({ delta: 2 }),
      },
    );
  });

  it("exposes ApiError when the op result is ok:false", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(crewOpErr("rep.add", "VALIDATION", "bad delta", makeCrew())),
    });

    const result = await Effect.runPromise(Effect.either(crewRepAdd(CREW_ID_F2Y, 1, 5)));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("VALIDATION");
    }
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("rep.add", 7)),
    });

    const result = await Effect.runPromise(Effect.either(crewRepAdd(CREW_ID_F2Y, 1, 5)));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });
});

describe("crewHeatAdd", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/crews/{id}/ops/heat.add with delta and If-Match, decodes crew from OperationResult", async () => {
    const withHeat = makeCrew({ revision: 6, heat: { current: 6, max: 9 } });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(crewOpOk(withHeat, "heat.add")),
    });

    const result = await Effect.runPromise(crewHeatAdd(CREW_ID_F2Y, 2, 5));
    expect(result.crew.heat.current).toBe(6);
    expect(result.requested).toBe(2);
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/crews/${CREW_ID_F2Y}/ops/heat.add`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "5",
        },
        body: JSON.stringify({ delta: 2 }),
      },
    );
  });

  it("exposes ApiError when the op result is ok:false", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(crewOpErr("heat.add", "VALIDATION", "bad delta", makeCrew())),
    });

    const result = await Effect.runPromise(Effect.either(crewHeatAdd(CREW_ID_F2Y, 1, 5)));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("VALIDATION");
    }
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("heat.add", 7)),
    });

    const result = await Effect.runPromise(Effect.either(crewHeatAdd(CREW_ID_F2Y, 1, 5)));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });
});

describe("crewWantedAdd", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/crews/{id}/ops/wanted.add with delta and If-Match, decodes crew from OperationResult", async () => {
    const withWanted = makeCrew({ revision: 6, wanted: { current: 3, max: 4 } });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(crewOpOk(withWanted, "wanted.add")),
    });

    const result = await Effect.runPromise(crewWantedAdd(CREW_ID_F2Y, 2, 5));
    expect(result.crew.wanted.current).toBe(3);
    expect(result.requested).toBe(2);
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/crews/${CREW_ID_F2Y}/ops/wanted.add`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "5",
        },
        body: JSON.stringify({ delta: 2 }),
      },
    );
  });

  it("exposes ApiError when the op result is ok:false", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(crewOpErr("wanted.add", "VALIDATION", "bad delta", makeCrew())),
    });

    const result = await Effect.runPromise(Effect.either(crewWantedAdd(CREW_ID_F2Y, 1, 5)));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("VALIDATION");
    }
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("wanted.add", 7)),
    });

    const result = await Effect.runPromise(Effect.either(crewWantedAdd(CREW_ID_F2Y, 1, 5)));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });
});

describe("crewTierAdd", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/crews/{id}/ops/tier.add with delta and If-Match, decodes crew from OperationResult", async () => {
    const withTier = makeCrew({ revision: 6, tier: 2 });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(crewOpOk(withTier, "tier.add")),
    });

    const result = await Effect.runPromise(crewTierAdd(CREW_ID_F2Y, 1, 5));
    expect(result.crew.tier).toBe(2);
    expect(result.requested).toBe(1);
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/crews/${CREW_ID_F2Y}/ops/tier.add`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "5",
        },
        body: JSON.stringify({ delta: 1 }),
      },
    );
  });

  it("exposes ApiError when the op result is ok:false", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(crewOpErr("tier.add", "VALIDATION", "bad delta", makeCrew())),
    });

    const result = await Effect.runPromise(Effect.either(crewTierAdd(CREW_ID_F2Y, 1, 5)));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("VALIDATION");
    }
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("tier.add", 7)),
    });

    const result = await Effect.runPromise(Effect.either(crewTierAdd(CREW_ID_F2Y, 1, 5)));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });
});

describe("crewHoldSet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/crews/{id}/ops/hold.set with hold and If-Match, decodes crew from OperationResult", async () => {
    const withHold = makeCrew({ revision: 6, hold: "weak" });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(crewOpOk(withHold, "hold.set")),
    });

    const result = await Effect.runPromise(crewHoldSet(CREW_ID_F2Y, "weak", 5));
    expect(result.hold).toBe("weak");
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/crews/${CREW_ID_F2Y}/ops/hold.set`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "5",
        },
        body: JSON.stringify({ hold: "weak" }),
      },
    );
  });

  it("exposes ApiError when the op result is ok:false", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(crewOpErr("hold.set", "VALIDATION", "bad hold", makeCrew())),
    });

    const result = await Effect.runPromise(Effect.either(crewHoldSet(CREW_ID_F2Y, "weak", 5)));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("VALIDATION");
    }
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("hold.set", 7)),
    });

    const result = await Effect.runPromise(Effect.either(crewHoldSet(CREW_ID_F2Y, "weak", 5)));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });
});

describe("crewCoinAdd", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/crews/{id}/ops/coin.add with delta and If-Match, decodes crew from OperationResult", async () => {
    const withCoin = makeCrew({ revision: 6, coin: 4 });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(crewOpOk(withCoin, "coin.add")),
    });

    const result = await Effect.runPromise(crewCoinAdd(CREW_ID_F2Y, 4, 5));
    expect(result.crew.coin).toBe(4);
    expect(result.requested).toBe(4);
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/crews/${CREW_ID_F2Y}/ops/coin.add`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "5",
        },
        body: JSON.stringify({ delta: 4 }),
      },
    );
  });

  it("exposes ApiError when the op result is ok:false", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(crewOpErr("coin.add", "VALIDATION", "bad delta", makeCrew())),
    });

    const result = await Effect.runPromise(Effect.either(crewCoinAdd(CREW_ID_F2Y, 1, 5)));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("VALIDATION");
    }
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("coin.add", 7)),
    });

    const result = await Effect.runPromise(Effect.either(crewCoinAdd(CREW_ID_F2Y, 1, 5)));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });
});

describe("crewStashAdd", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/crews/{id}/ops/stash.add with delta and If-Match, decodes crew from OperationResult", async () => {
    const withStash = makeCrew({ revision: 6, stash: 6 });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(crewOpOk(withStash, "stash.add")),
    });

    const result = await Effect.runPromise(crewStashAdd(CREW_ID_F2Y, 4, 5));
    expect(result.crew.stash).toBe(6);
    expect(result.requested).toBe(4);
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/crews/${CREW_ID_F2Y}/ops/stash.add`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "5",
        },
        body: JSON.stringify({ delta: 4 }),
      },
    );
  });

  it("exposes ApiError when the op result is ok:false", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(crewOpErr("stash.add", "VALIDATION", "bad delta", makeCrew())),
    });

    const result = await Effect.runPromise(Effect.either(crewStashAdd(CREW_ID_F2Y, 1, 5)));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("VALIDATION");
    }
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("stash.add", 7)),
    });

    const result = await Effect.runPromise(Effect.either(crewStashAdd(CREW_ID_F2Y, 1, 5)));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });
});

// ---------------------------------------------------------------------------
// F2v crew operations — crewAbilityTake, crewAbilityRemove, upgradeMark,
// upgradeUnmark, getCrewType, getCrewTypes
// ---------------------------------------------------------------------------

describe("crewAbilityTake", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/crews/{id}/ops/ability.take with name and If-Match, decodes crew from OperationResult", async () => {
    const withAbility = makeCrew({
      revision: 6,
      specialAbilities: [
        { name: "Predators", timesTaken: 1 },
      ],
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(crewOpOk(withAbility, "ability.take")),
    });

    const result = await Effect.runPromise(crewAbilityTake(CREW_ID_F2Y, "Predators", 5));
    expect(result.specialAbilities).toEqual([{ name: "Predators", timesTaken: 1 }]);
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/crews/${CREW_ID_F2Y}/ops/ability.take`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "5",
        },
        body: JSON.stringify({ name: "Predators" }),
      },
    );
  });

  it("exposes ApiError when the op result is ok:false (ABILITY_MAXED)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(crewOpErr("ability.take", "ABILITY_MAXED", "already at limit", makeCrew())),
    });

    const result = await Effect.runPromise(Effect.either(crewAbilityTake(CREW_ID_F2Y, "Predators", 5)));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("ABILITY_MAXED");
    }
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("ability.take", 7)),
    });

    const result = await Effect.runPromise(Effect.either(crewAbilityTake(CREW_ID_F2Y, "Predators", 5)));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });
});

describe("crewAbilityRemove", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/crews/{id}/ops/ability.remove with name and If-Match, decodes crew from OperationResult", async () => {
    const withoutAbility = makeCrew({ revision: 6, specialAbilities: [] });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(crewOpOk(withoutAbility, "ability.remove")),
    });

    const result = await Effect.runPromise(crewAbilityRemove(CREW_ID_F2Y, "Predators", 5));
    expect(result.specialAbilities).toEqual([]);
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/crews/${CREW_ID_F2Y}/ops/ability.remove`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "5",
        },
        body: JSON.stringify({ name: "Predators" }),
      },
    );
  });

  it("exposes ApiError when the op result is ok:false (NOT_FOUND)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(crewOpErr("ability.remove", "NOT_FOUND", "not on sheet", makeCrew())),
    });

    const result = await Effect.runPromise(Effect.either(crewAbilityRemove(CREW_ID_F2Y, "Predators", 5)));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("NOT_FOUND");
    }
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("ability.remove", 7)),
    });

    const result = await Effect.runPromise(Effect.either(crewAbilityRemove(CREW_ID_F2Y, "Predators", 5)));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });
});

describe("upgradeMark", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/crews/{id}/ops/upgrade.mark with name and If-Match, decodes crew from OperationResult", async () => {
    const withMark = makeCrew({
      revision: 6,
      upgrades: [{ name: "Secure Lair", boxesMarked: 1 }],
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(crewOpOk(withMark, "upgrade.mark")),
    });

    const result = await Effect.runPromise(upgradeMark(CREW_ID_F2Y, "Secure Lair", 5));
    expect(result.upgrades).toEqual([{ name: "Secure Lair", boxesMarked: 1 }]);
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/crews/${CREW_ID_F2Y}/ops/upgrade.mark`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "5",
        },
        body: JSON.stringify({ name: "Secure Lair" }),
      },
    );
  });

  it("exposes ApiError when the op result is ok:false (UPGRADE_MAXED)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(crewOpErr("upgrade.mark", "UPGRADE_MAXED", "all boxes marked", makeCrew())),
    });

    const result = await Effect.runPromise(Effect.either(upgradeMark(CREW_ID_F2Y, "Secure Lair", 5)));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("UPGRADE_MAXED");
    }
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("upgrade.mark", 7)),
    });

    const result = await Effect.runPromise(Effect.either(upgradeMark(CREW_ID_F2Y, "Secure Lair", 5)));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });
});

describe("upgradeUnmark", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/crews/{id}/ops/upgrade.unmark with name and If-Match, decodes crew from OperationResult", async () => {
    const withUnmark = makeCrew({ revision: 6, upgrades: [] });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(crewOpOk(withUnmark, "upgrade.unmark")),
    });

    const result = await Effect.runPromise(upgradeUnmark(CREW_ID_F2Y, "Secure Lair", 5));
    expect(result.upgrades).toEqual([]);
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/crews/${CREW_ID_F2Y}/ops/upgrade.unmark`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "5",
        },
        body: JSON.stringify({ name: "Secure Lair" }),
      },
    );
  });

  it("exposes ApiError when the op result is ok:false (NOT_FOUND)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(crewOpErr("upgrade.unmark", "NOT_FOUND", "not on sheet", makeCrew())),
    });

    const result = await Effect.runPromise(Effect.either(upgradeUnmark(CREW_ID_F2Y, "Secure Lair", 5)));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("NOT_FOUND");
    }
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("upgrade.unmark", 7)),
    });

    const result = await Effect.runPromise(Effect.either(upgradeUnmark(CREW_ID_F2Y, "Secure Lair", 5)));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });
});

describe("getCrewType", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches /api/games/{stem}/crews/{crewType} and returns the raw crew type settings object", async () => {
    const crewTypeData = {
      Name: "Assassins",
      Hook: "You're professional murderers.",
      SpecialAbilities: [{ Name: "Predators", TimesTakeable: 1, Description: "take +1d" }],
      Upgrades: [{ Name: "Secure Lair", TotalBoxes: 2, Description: "locks" }],
      StartingUpgrades: [],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(crewTypeData),
    });

    const result = await Effect.runPromise(getCrewType("blades-in-the-dark", "Assassins"));
    expect(result.SpecialAbilities).toHaveLength(1);
    expect(result.Upgrades).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/games/blades-in-the-dark/crews/Assassins",
      { headers: { Accept: "application/json" } },
    );
  });

  it("exposes ApiError when fetch fails (e.g. 404 from backend without per-crew-type GET)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => "games.crew: NOT_FOUND",
      status: 404,
    });

    const result = await Effect.runPromise(
      Effect.either(getCrewType("blades-in-the-dark", "Ghosts")),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(404);
    }
  });
});

describe("getCrewTypes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches /api/games/{stem}/crews and decodes the CrewTypes array of settings objects", async () => {
    const crewsData = {
      Name: "Blades in the Dark",
      Language: "en",
      CrewTypes: [
        { Name: "Assassins", SpecialAbilities: [], Upgrades: [], StartingUpgrades: [] },
        { Name: "Bravos", SpecialAbilities: [], Upgrades: [], StartingUpgrades: [] },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(crewsData),
    });

    const result = await Effect.runPromise(getCrewTypes("blades-in-the-dark"));
    expect(result.map((ct) => ct.Name)).toEqual(["Assassins", "Bravos"]);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/games/blades-in-the-dark/crews",
      { headers: { Accept: "application/json" } },
    );
  });

  it("exposes ApiError when fetch fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => "Not Found",
      status: 404,
    });

    const result = await Effect.runPromise(Effect.either(getCrewTypes("nonexistent-game")));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(404);
    }
  });

  it("exposes DecodeError when response lacks a CrewTypes array", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ invalid: "data" }),
    });

    const result = await Effect.runPromise(Effect.either(getCrewTypes("blades-in-the-dark")));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(DecodeError);
    }
  });
});

// ---------------------------------------------------------------------------
// F2o operations — actionSetRating, attributeXpAdd, attributeXpClear,
// attributeLevelup, sessionSet, getPlaybook
// ---------------------------------------------------------------------------

/** Character DTO with a populated talent section (3 attributes, 4 actions each). */
function talentChar(overrides: Record<string, unknown> = {}) {
  return makeChar({
    revision: 13,
    talent: {
      attributes: [
        {
          name: "Insight",
          experience: { points: 2, max: 6 },
          actions: [
            { name: "Hunt", rating: 1, maxRating: 4 },
            { name: "Study", rating: 2, maxRating: 4 },
            { name: "Survey", rating: 0, maxRating: 4 },
            { name: "Tinker", rating: 1, maxRating: 4 },
          ],
        },
        {
          name: "Prowess",
          experience: { points: 6, max: 6 },
          actions: [
            { name: "Finesse", rating: 2, maxRating: 4 },
            { name: "Prowl", rating: 0, maxRating: 4 },
            { name: "Skirmish", rating: 1, maxRating: 4 },
            { name: "Wreck", rating: 0, maxRating: 4 },
          ],
        },
        {
          name: "Resolve",
          experience: { points: 0, max: 6 },
          actions: [
            { name: "Attune", rating: 0, maxRating: 4 },
            { name: "Command", rating: 2, maxRating: 4 },
            { name: "Consort", rating: 1, maxRating: 4 },
            { name: "Sway", rating: 0, maxRating: 4 },
          ],
        },
      ],
    },
    ...overrides,
  });
}

describe("actionSetRating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/characters/{id}/ops/action.set-rating with action, rating, and If-Match", async () => {
    const updated = talentChar({
      talent: {
        attributes: [
          {
            name: "Insight",
            experience: { points: 2, max: 6 },
            actions: [
              { name: "Hunt", rating: 3, maxRating: 4 },
              { name: "Study", rating: 2, maxRating: 4 },
              { name: "Survey", rating: 0, maxRating: 4 },
              { name: "Tinker", rating: 1, maxRating: 4 },
            ],
          },
        ],
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(opOk(updated)),
    });

    const result = await Effect.runPromise(
      actionSetRating("c46ba7cb-993b-4fc7-974d-fb95eacd5446", "Hunt", 3, 12),
    );
    const hunt = result.talent.attributes[0]?.actions[0];
    expect(hunt?.name).toBe("Hunt");
    expect(hunt?.rating).toBe(3);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/characters/c46ba7cb-993b-4fc7-974d-fb95eacd5446/ops/action.set-rating",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "12",
        },
        body: JSON.stringify({ action: "Hunt", rating: 3 }),
      },
    );
  });

  it("exposes ApiError with the error code when the op result is ok:false (server clamp/validation failure)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(charOpErr("action.set-rating", "VALIDATION", "unknown action", talentChar())),
    });

    const result = await Effect.runPromise(
      Effect.either(actionSetRating("c46ba7cb-993b-4fc7-974d-fb95eacd5446", "Nope", 1, 12)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("VALIDATION");
    }
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("action.set-rating", 15)),
    });

    const result = await Effect.runPromise(
      Effect.either(actionSetRating("some-id", "Hunt", 2, 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });

  it("exposes ApiError on non-409 failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => "RATING_MAXED",
    });

    const result = await Effect.runPromise(
      Effect.either(actionSetRating("some-id", "Hunt", 9, 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(422);
    }
  });
});

describe("attributeXpAdd", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/characters/{id}/ops/attribute-xp.add with attribute, delta, and If-Match", async () => {
    const updated = talentChar({
      talent: {
        attributes: [
          {
            name: "Insight",
            experience: { points: 3, max: 6 },
            actions: [
              { name: "Hunt", rating: 1, maxRating: 4 },
              { name: "Study", rating: 2, maxRating: 4 },
              { name: "Survey", rating: 0, maxRating: 4 },
              { name: "Tinker", rating: 1, maxRating: 4 },
            ],
          },
        ],
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(opOk(updated)),
    });

    const result = await Effect.runPromise(
      attributeXpAdd("c46ba7cb-993b-4fc7-974d-fb95eacd5446", "Insight", 1, 12),
    );
    expect(result.talent.attributes[0]?.experience.points).toBe(3);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/characters/c46ba7cb-993b-4fc7-974d-fb95eacd5446/ops/attribute-xp.add",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "12",
        },
        body: JSON.stringify({ attribute: "Insight", delta: 1 }),
      },
    );
  });

  it("exposes ApiError with the error code when the op result is ok:false", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(charOpErr("attribute-xp.add", "VALIDATION", "unknown attribute", talentChar())),
    });

    const result = await Effect.runPromise(
      Effect.either(attributeXpAdd("c46ba7cb-993b-4fc7-974d-fb95eacd5446", "Nope", 1, 12)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("VALIDATION");
    }
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("attribute-xp.add", 15)),
    });

    const result = await Effect.runPromise(
      Effect.either(attributeXpAdd("some-id", "Insight", 1, 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });

  it("exposes ApiError on non-409 failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "bad request",
    });

    const result = await Effect.runPromise(
      Effect.either(attributeXpAdd("some-id", "Insight", 1, 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(400);
    }
  });
});

describe("attributeXpClear", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/characters/{id}/ops/attribute-xp.clear with attribute and If-Match", async () => {
    const updated = talentChar({
      talent: {
        attributes: [
          {
            name: "Insight",
            experience: { points: 0, max: 6 },
            actions: [
              { name: "Hunt", rating: 1, maxRating: 4 },
              { name: "Study", rating: 2, maxRating: 4 },
              { name: "Survey", rating: 0, maxRating: 4 },
              { name: "Tinker", rating: 1, maxRating: 4 },
            ],
          },
        ],
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(opOk(updated)),
    });

    const result = await Effect.runPromise(
      attributeXpClear("c46ba7cb-993b-4fc7-974d-fb95eacd5446", "Insight", 12),
    );
    expect(result.talent.attributes[0]?.experience.points).toBe(0);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/characters/c46ba7cb-993b-4fc7-974d-fb95eacd5446/ops/attribute-xp.clear",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "12",
        },
        body: JSON.stringify({ attribute: "Insight" }),
      },
    );
  });

  it("exposes ApiError with the error code when the op result is ok:false", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(charOpErr("attribute-xp.clear", "VALIDATION", "unknown attribute", talentChar())),
    });

    const result = await Effect.runPromise(
      Effect.either(attributeXpClear("c46ba7cb-993b-4fc7-974d-fb95eacd5446", "Nope", 12)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("VALIDATION");
    }
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("attribute-xp.clear", 15)),
    });

    const result = await Effect.runPromise(
      Effect.either(attributeXpClear("some-id", "Insight", 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });
});

describe("attributeLevelup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/characters/{id}/ops/attribute.levelup with attribute, action, and If-Match", async () => {
    const updated = talentChar({
      talent: {
        attributes: [
          {
            name: "Prowess",
            experience: { points: 0, max: 6 },
            actions: [
              { name: "Finesse", rating: 3, maxRating: 4 },
              { name: "Prowl", rating: 0, maxRating: 4 },
              { name: "Skirmish", rating: 1, maxRating: 4 },
              { name: "Wreck", rating: 0, maxRating: 4 },
            ],
          },
        ],
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(opOk(updated)),
    });

    const result = await Effect.runPromise(
      attributeLevelup("c46ba7cb-993b-4fc7-974d-fb95eacd5446", "Prowess", "Finesse", 12),
    );
    const finesse = result.talent.attributes[0]?.actions[0];
    expect(finesse?.rating).toBe(3);
    expect(result.talent.attributes[0]?.experience.points).toBe(0);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/characters/c46ba7cb-993b-4fc7-974d-fb95eacd5446/ops/attribute.levelup",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "12",
        },
        body: JSON.stringify({ attribute: "Prowess", action: "Finesse" }),
      },
    );
  });

  it("exposes ApiError with CANNOT_LEVEL_UP code when the op result is ok:false", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(charOpErr("attribute.levelup", "CANNOT_LEVEL_UP", "XP track not full", talentChar())),
    });

    const result = await Effect.runPromise(
      Effect.either(attributeLevelup("c46ba7cb-993b-4fc7-974d-fb95eacd5446", "Insight", "Hunt", 12)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("CANNOT_LEVEL_UP");
    }
  });

  it("exposes ApiError with RATING_MAXED code when the action is already at max", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(charOpErr("attribute.levelup", "RATING_MAXED", "action at max rating", talentChar())),
    });

    const result = await Effect.runPromise(
      Effect.either(attributeLevelup("c46ba7cb-993b-4fc7-974d-fb95eacd5446", "Prowess", "Finesse", 12)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("RATING_MAXED");
    }
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("attribute.levelup", 15)),
    });

    const result = await Effect.runPromise(
      Effect.either(attributeLevelup("some-id", "Prowess", "Finesse", 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });
});

describe("sessionSet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts only the changed field to /api/characters/{id}/ops/session.set with If-Match", async () => {
    const updated = makeChar({
      revision: 13,
      session: { playbookExpressions: 2, characterExpressions: 0, struggleExpressions: 0, max: 3 },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(opOk(updated)),
    });

    const result = await Effect.runPromise(
      sessionSet("c46ba7cb-993b-4fc7-974d-fb95eacd5446", { playbookExpressions: 2 }, 12),
    );
    expect(result.session.playbookExpressions).toBe(2);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/characters/c46ba7cb-993b-4fc7-974d-fb95eacd5446/ops/session.set",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "12",
        },
        body: JSON.stringify({ playbookExpressions: 2 }),
      },
    );
  });

  it("posts multiple changed fields when provided", async () => {
    const updated = makeChar({
      revision: 13,
      session: { playbookExpressions: 1, characterExpressions: 1, struggleExpressions: 0, max: 3 },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(opOk(updated)),
    });

    const result = await Effect.runPromise(
      sessionSet("c46ba7cb-993b-4fc7-974d-fb95eacd5446", { playbookExpressions: 1, characterExpressions: 1 }, 12),
    );
    expect(result.session.playbookExpressions).toBe(1);
    expect(result.session.characterExpressions).toBe(1);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/characters/c46ba7cb-993b-4fc7-974d-fb95eacd5446/ops/session.set",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "12",
        },
        body: JSON.stringify({ playbookExpressions: 1, characterExpressions: 1 }),
      },
    );
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("session.set", 15)),
    });

    const result = await Effect.runPromise(
      Effect.either(sessionSet("some-id", { playbookExpressions: 1 }, 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });

  it("exposes ApiError on non-409 failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => "VALIDATION",
    });

    const result = await Effect.runPromise(
      Effect.either(sessionSet("some-id", { playbookExpressions: 1 }, 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(422);
    }
  });
});

describe("getPlaybook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches /api/games/{stem}/playbooks/{name} and returns the raw playbook settings object", async () => {
    const playbookData = {
      Name: "Spider",
      Hook: "Spiders are good at masterminding maneuvers.",
      ExperienceCondition: "You addressed a challenge with calculation or conspiracy",
      SpecialAbilities: [],
      Items: [],
      Rolodex: { Name: "Shrewd Friends", Friends: [] },
      DefaultActionPoints: [],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(playbookData),
    });

    const result = await Effect.runPromise(getPlaybook("blades-in-the-dark", "Spider"));
    expect(result.ExperienceCondition).toBe("You addressed a challenge with calculation or conspiracy");
    expect(global.fetch).toHaveBeenCalledWith("/api/games/blades-in-the-dark/playbooks/Spider", {
      headers: { Accept: "application/json" },
    });
  });

  it("exposes ApiError when fetch fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => "Not Found",
      status: 404,
    });

    const result = await Effect.runPromise(
      Effect.either(getPlaybook("blades-in-the-dark", "Ghost")),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(404);
    }
  });
});

// ---------------------------------------------------------------------------
// F2p operations — playbookXpAdd, playbookXpClear, abilityTake, abilityRemove
// ---------------------------------------------------------------------------

describe("playbookXpAdd", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/characters/{id}/ops/playbook-xp.add with delta and If-Match, decodes character from OperationResult", async () => {
    const updated = makeChar({
      revision: 13,
      playbook: {
        name: "Spider",
        experience: { points: 5, max: 8 },
        abilities: [],
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(opOk(updated)),
    });

    const result = await Effect.runPromise(
      playbookXpAdd("c46ba7cb-993b-4fc7-974d-fb95eacd5446", 1, 12),
    );
    expect(result.playbook.experience.points).toBe(5);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/characters/c46ba7cb-993b-4fc7-974d-fb95eacd5446/ops/playbook-xp.add",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "12",
        },
        body: JSON.stringify({ delta: 1 }),
      },
    );
  });

  it("exposes ApiError with the error code when the op result is ok:false", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(charOpErr("playbook-xp.add", "VALIDATION", "delta out of range", makeChar())),
    });

    const result = await Effect.runPromise(
      Effect.either(playbookXpAdd("c46ba7cb-993b-4fc7-974d-fb95eacd5446", -5, 12)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("VALIDATION");
    }
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("playbook-xp.add", 15)),
    });

    const result = await Effect.runPromise(
      Effect.either(playbookXpAdd("some-id", 1, 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });

  it("exposes ApiError on non-409 failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "bad request",
    });

    const result = await Effect.runPromise(
      Effect.either(playbookXpAdd("some-id", 1, 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(400);
    }
  });
});

describe("playbookXpClear", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/characters/{id}/ops/playbook-xp.clear with no body and If-Match", async () => {
    const updated = makeChar({
      revision: 13,
      playbook: {
        name: "Spider",
        experience: { points: 0, max: 8 },
        abilities: [],
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(opOk(updated)),
    });

    const result = await Effect.runPromise(
      playbookXpClear("c46ba7cb-993b-4fc7-974d-fb95eacd5446", 12),
    );
    expect(result.playbook.experience.points).toBe(0);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/characters/c46ba7cb-993b-4fc7-974d-fb95eacd5446/ops/playbook-xp.clear",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "12",
        },
        body: JSON.stringify({}),
      },
    );
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("playbook-xp.clear", 15)),
    });

    const result = await Effect.runPromise(
      Effect.either(playbookXpClear("some-id", 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });

  it("exposes ApiError on non-409 failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => "VALIDATION",
    });

    const result = await Effect.runPromise(
      Effect.either(playbookXpClear("some-id", 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(422);
    }
  });
});

describe("abilityTake", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/characters/{id}/ops/ability.take with name and If-Match", async () => {
    const updated = makeChar({
      revision: 13,
      playbook: {
        name: "Spider",
        experience: { points: 4, max: 8 },
        abilities: [
          { name: "Calculated", description: "When you calculate.", timesTaken: 1 },
        ],
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(opOk(updated)),
    });

    const result = await Effect.runPromise(
      abilityTake("c46ba7cb-993b-4fc7-974d-fb95eacd5446", "Calculated", 12),
    );
    expect(result.playbook.abilities).toHaveLength(1);
    expect(result.playbook.abilities[0]?.name).toBe("Calculated");
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/characters/c46ba7cb-993b-4fc7-974d-fb95eacd5446/ops/ability.take",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "12",
        },
        body: JSON.stringify({ name: "Calculated" }),
      },
    );
  });

  it("exposes ApiError with ABILITY_MAXED code when the op result is ok:false", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(charOpErr("ability.take", "ABILITY_MAXED", "already taken to its limit", makeChar())),
    });

    const result = await Effect.runPromise(
      Effect.either(abilityTake("c46ba7cb-993b-4fc7-974d-fb95eacd5446", "Veteran", 12)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("ABILITY_MAXED");
    }
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("ability.take", 15)),
    });

    const result = await Effect.runPromise(
      Effect.either(abilityTake("some-id", "Veteran", 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });

  it("exposes ApiError on non-409 failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "bad request",
    });

    const result = await Effect.runPromise(
      Effect.either(abilityTake("some-id", "Veteran", 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(400);
    }
  });
});

describe("abilityRemove", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/characters/{id}/ops/ability.remove with name and If-Match", async () => {
    const updated = makeChar({
      revision: 13,
      playbook: {
        name: "Spider",
        experience: { points: 4, max: 8 },
        abilities: [],
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(opOk(updated)),
    });

    const result = await Effect.runPromise(
      abilityRemove("c46ba7cb-993b-4fc7-974d-fb95eacd5446", "Calculated", 12),
    );
    expect(result.playbook.abilities).toHaveLength(0);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/characters/c46ba7cb-993b-4fc7-974d-fb95eacd5446/ops/ability.remove",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "12",
        },
        body: JSON.stringify({ name: "Calculated" }),
      },
    );
  });

  it("exposes ApiError with NOT_FOUND code when the op result is ok:false", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(charOpErr("ability.remove", "NOT_FOUND", "no such ability", makeChar())),
    });

    const result = await Effect.runPromise(
      Effect.either(abilityRemove("c46ba7cb-993b-4fc7-974d-fb95eacd5446", "Nope", 12)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("NOT_FOUND");
    }
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("ability.remove", 15)),
    });

    const result = await Effect.runPromise(
      Effect.either(abilityRemove("some-id", "Calculated", 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });

  it("exposes ApiError on non-409 failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "bad request",
    });

    const result = await Effect.runPromise(
      Effect.either(abilityRemove("some-id", "Calculated", 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(400);
    }
  });
});

describe("gearAdd", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/characters/{id}/ops/gear.add with name+bulk and If-Match", async () => {
    const updated = makeChar({
      revision: 13,
      gear: {
        loadout: [],
        availableGear: [{ name: "A Blade or Two", bulk: 1 }],
        commitment: "none",
        isCommitmentLocked: false,
        maxBulk: 8,
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(opOk(updated)),
    });

    const result = await Effect.runPromise(
      gearAdd("c46ba7cb-993b-4fc7-974d-fb95eacd5446", "A Blade or Two", 1, 12),
    );
    expect(result.gear.availableGear).toHaveLength(1);
    expect(result.gear.availableGear[0]?.name).toBe("A Blade or Two");
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/characters/c46ba7cb-993b-4fc7-974d-fb95eacd5446/ops/gear.add",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "12",
        },
        body: JSON.stringify({ name: "A Blade or Two", bulk: 1 }),
      },
    );
  });

  it("exposes ApiError with VALIDATION code when the op result is ok:false", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(charOpErr("gear.add", "VALIDATION", "bulk must be >= 0", makeChar())),
    });

    const result = await Effect.runPromise(
      Effect.either(gearAdd("c46ba7cb-993b-4fc7-974d-fb95eacd5446", "Nope", -1, 12)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("VALIDATION");
    }
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("gear.add", 15)),
    });

    const result = await Effect.runPromise(
      Effect.either(gearAdd("some-id", "A Blade or Two", 1, 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });

  it("exposes ApiError on non-409 failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "bad request",
    });

    const result = await Effect.runPromise(
      Effect.either(gearAdd("some-id", "A Blade or Two", 1, 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(400);
    }
  });
});

describe("gearRemove", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/characters/{id}/ops/gear.remove with name and If-Match", async () => {
    const updated = makeChar({
      revision: 13,
      gear: {
        loadout: [],
        availableGear: [],
        commitment: "none",
        isCommitmentLocked: false,
        maxBulk: 8,
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(opOk(updated)),
    });

    const result = await Effect.runPromise(
      gearRemove("c46ba7cb-993b-4fc7-974d-fb95eacd5446", "A Blade or Two", 12),
    );
    expect(result.gear.availableGear).toHaveLength(0);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/characters/c46ba7cb-993b-4fc7-974d-fb95eacd5446/ops/gear.remove",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "12",
        },
        body: JSON.stringify({ name: "A Blade or Two" }),
      },
    );
  });

  it("exposes ApiError with NOT_FOUND code when the op result is ok:false", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(charOpErr("gear.remove", "NOT_FOUND", "no such item", makeChar())),
    });

    const result = await Effect.runPromise(
      Effect.either(gearRemove("c46ba7cb-993b-4fc7-974d-fb95eacd5446", "Nope", 12)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("NOT_FOUND");
    }
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("gear.remove", 15)),
    });

    const result = await Effect.runPromise(
      Effect.either(gearRemove("some-id", "A Blade or Two", 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });

  it("exposes ApiError on non-409 failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "bad request",
    });

    const result = await Effect.runPromise(
      Effect.either(gearRemove("some-id", "A Blade or Two", 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(400);
    }
  });
});

describe("gearCommit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/characters/{id}/ops/gear.commit with name and If-Match", async () => {
    const updated = makeChar({
      revision: 13,
      gear: {
        loadout: [{ name: "A Blade or Two", bulk: 1 }],
        availableGear: [{ name: "A Blade or Two", bulk: 1 }],
        commitment: "normal",
        isCommitmentLocked: true,
        maxBulk: 5,
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(opOk(updated)),
    });

    const result = await Effect.runPromise(
      gearCommit("c46ba7cb-993b-4fc7-974d-fb95eacd5446", "A Blade or Two", 12),
    );
    expect(result.gear.loadout).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/characters/c46ba7cb-993b-4fc7-974d-fb95eacd5446/ops/gear.commit",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "12",
        },
        body: JSON.stringify({ name: "A Blade or Two" }),
      },
    );
  });

  it("exposes ApiError with OVER_BULK code when the op result is ok:false", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(charOpErr("gear.commit", "OVER_BULK", "too heavy", makeChar())),
    });

    const result = await Effect.runPromise(
      Effect.either(gearCommit("c46ba7cb-993b-4fc7-974d-fb95eacd5446", "A Large Weapon", 12)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("OVER_BULK");
    }
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("gear.commit", 15)),
    });

    const result = await Effect.runPromise(
      Effect.either(gearCommit("some-id", "A Blade or Two", 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });

  it("exposes ApiError on non-409 failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "bad request",
    });

    const result = await Effect.runPromise(
      Effect.either(gearCommit("some-id", "A Blade or Two", 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(400);
    }
  });
});

describe("gearUncommit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/characters/{id}/ops/gear.uncommit with name and If-Match", async () => {
    const updated = makeChar({
      revision: 13,
      gear: {
        loadout: [],
        availableGear: [{ name: "A Blade or Two", bulk: 1 }],
        commitment: "normal",
        isCommitmentLocked: true,
        maxBulk: 5,
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(opOk(updated)),
    });

    const result = await Effect.runPromise(
      gearUncommit("c46ba7cb-993b-4fc7-974d-fb95eacd5446", "A Blade or Two", 12),
    );
    expect(result.gear.loadout).toHaveLength(0);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/characters/c46ba7cb-993b-4fc7-974d-fb95eacd5446/ops/gear.uncommit",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "12",
        },
        body: JSON.stringify({ name: "A Blade or Two" }),
      },
    );
  });

  it("exposes ApiError with COMMITMENT_LOCKED code when the op result is ok:false", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(charOpErr("gear.uncommit", "COMMITMENT_LOCKED", "locked", makeChar())),
    });

    const result = await Effect.runPromise(
      Effect.either(gearUncommit("c46ba7cb-993b-4fc7-974d-fb95eacd5446", "A Blade or Two", 12)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("COMMITMENT_LOCKED");
    }
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("gear.uncommit", 15)),
    });

    const result = await Effect.runPromise(
      Effect.either(gearUncommit("some-id", "A Blade or Two", 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });

  it("exposes ApiError on non-409 failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "bad request",
    });

    const result = await Effect.runPromise(
      Effect.either(gearUncommit("some-id", "A Blade or Two", 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(400);
    }
  });
});

describe("gearLock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/characters/{id}/ops/gear.lock with no body and If-Match", async () => {
    const updated = makeChar({
      revision: 13,
      gear: {
        loadout: [],
        availableGear: [],
        commitment: "normal",
        isCommitmentLocked: true,
        maxBulk: 5,
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(opOk(updated)),
    });

    const result = await Effect.runPromise(
      gearLock("c46ba7cb-993b-4fc7-974d-fb95eacd5446", 12),
    );
    expect(result.gear.isCommitmentLocked).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/characters/c46ba7cb-993b-4fc7-974d-fb95eacd5446/ops/gear.lock",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "12",
        },
        body: JSON.stringify({}),
      },
    );
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("gear.lock", 15)),
    });

    const result = await Effect.runPromise(
      Effect.either(gearLock("some-id", 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });

  it("exposes ApiError on non-409 failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "bad request",
    });

    const result = await Effect.runPromise(
      Effect.either(gearLock("some-id", 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(400);
    }
  });
});

describe("gearUnlock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/characters/{id}/ops/gear.unlock with no body and If-Match", async () => {
    const updated = makeChar({
      revision: 13,
      gear: {
        loadout: [],
        availableGear: [],
        commitment: "normal",
        isCommitmentLocked: false,
        maxBulk: 5,
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(opOk(updated)),
    });

    const result = await Effect.runPromise(
      gearUnlock("c46ba7cb-993b-4fc7-974d-fb95eacd5446", 12),
    );
    expect(result.gear.isCommitmentLocked).toBe(false);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/characters/c46ba7cb-993b-4fc7-974d-fb95eacd5446/ops/gear.unlock",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "12",
        },
        body: JSON.stringify({}),
      },
    );
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("gear.unlock", 15)),
    });

    const result = await Effect.runPromise(
      Effect.either(gearUnlock("some-id", 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });

  it("exposes ApiError on non-409 failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "bad request",
    });

    const result = await Effect.runPromise(
      Effect.either(gearUnlock("some-id", 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(400);
    }
  });
});

describe("gearSetCommitment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/characters/{id}/ops/gear.set-commitment with commitment and If-Match", async () => {
    const updated = makeChar({
      revision: 13,
      gear: {
        loadout: [],
        availableGear: [],
        commitment: "heavy",
        isCommitmentLocked: false,
        maxBulk: 6,
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(opOk(updated)),
    });

    const result = await Effect.runPromise(
      gearSetCommitment("c46ba7cb-993b-4fc7-974d-fb95eacd5446", "heavy", 12),
    );
    expect(result.gear.commitment).toBe("heavy");
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/characters/c46ba7cb-993b-4fc7-974d-fb95eacd5446/ops/gear.set-commitment",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "12",
        },
        body: JSON.stringify({ commitment: "heavy" }),
      },
    );
  });

  it("exposes ApiError with COMMITMENT_LOCKED code when the op result is ok:false", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(charOpErr("gear.set-commitment", "COMMITMENT_LOCKED", "commitment is locked", makeChar())),
    });

    const result = await Effect.runPromise(
      Effect.either(gearSetCommitment("c46ba7cb-993b-4fc7-974d-fb95eacd5446", "heavy", 12)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("COMMITMENT_LOCKED");
    }
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("gear.set-commitment", 15)),
    });

    const result = await Effect.runPromise(
      Effect.either(gearSetCommitment("some-id", "heavy", 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });

  it("exposes ApiError on non-409 failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "bad request",
    });

    const result = await Effect.runPromise(
      Effect.either(gearSetCommitment("some-id", "heavy", 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(400);
    }
  });
});

describe("gearClearCommitments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/characters/{id}/ops/gear.clear-commitments with no body and If-Match", async () => {
    const updated = makeChar({
      revision: 13,
      gear: {
        loadout: [],
        availableGear: [],
        commitment: "none",
        isCommitmentLocked: false,
        maxBulk: 0,
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(opOk(updated)),
    });

    const result = await Effect.runPromise(
      gearClearCommitments("c46ba7cb-993b-4fc7-974d-fb95eacd5446", 12),
    );
    expect(result.gear.commitment).toBe("none");
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/characters/c46ba7cb-993b-4fc7-974d-fb95eacd5446/ops/gear.clear-commitments",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "12",
        },
        body: JSON.stringify({}),
      },
    );
  });

  it("exposes ApiError with COMMITMENT_LOCKED code when the op result is ok:false", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(charOpErr("gear.clear-commitments", "COMMITMENT_LOCKED", "locked", makeChar())),
    });

    const result = await Effect.runPromise(
      Effect.either(gearClearCommitments("c46ba7cb-993b-4fc7-974d-fb95eacd5446", 12)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("COMMITMENT_LOCKED");
    }
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("gear.clear-commitments", 15)),
    });

    const result = await Effect.runPromise(
      Effect.either(gearClearCommitments("some-id", 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });

  it("exposes ApiError on non-409 failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "bad request",
    });

    const result = await Effect.runPromise(
      Effect.either(gearClearCommitments("some-id", 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(400);
    }
  });
});

// ---------------------------------------------------------------------------
// F2s operations — fundGain, fundSpend, fundLiquidate, listClocks,
// createClock, clockProgress, clockReset, deleteClock
// ---------------------------------------------------------------------------

/** A minimal valid Clock DTO (mirrors the frozen contract clock.json). */
function makeClock(overrides: Record<string, unknown> = {}) {
  return {
    kind: "clock",
    id: "b0b1c2d3-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
    revision: 2,
    formatVersion: 1,
    createdAt: "2026-07-24T00:00:00.000Z",
    updatedAt: "2026-07-24T00:00:00.000Z",
    name: "Infiltrate the Bluecoats",
    ownerKind: "campaign",
    ownerId: "",
    purpose: "custom",
    relatedClockIds: [],
    behavior: "bounded",
    segments: 2,
    size: 6,
    rollover: 0,
    ...overrides,
  };
}

/** A clockSummary list row (mirrors campaign.json#/$defs/clockSummary). */
function makeClockSummary(overrides: Record<string, unknown> = {}) {
  return {
    kind: "clock",
    id: "b0b1c2d3-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
    name: "Infiltrate the Bluecoats",
    ownerKind: "campaign",
    ownerId: "",
    purpose: "custom",
    behavior: "bounded",
    segments: 2,
    size: 6,
    rollover: 0,
    relatedClockIds: [],
    isReadable: true,
    isRepairable: true,
    isComplete: true,
    deleteToken: "",
    ...overrides,
  };
}

function clockOpOk(clock: unknown, opName: string) {
  return {
    ok: true,
    clock,
    applied: { op: opName },
    sideEffects: [],
    error: null,
  };
}

function clockOpErr(opName: string, code: string, message: string, clock?: unknown) {
  return {
    ok: false,
    ...(clock ? { clock } : {}),
    applied: { op: opName },
    sideEffects: [],
    error: { code, message },
  };
}

function fundOpOk(character: unknown, opName: string, requested: number, effective: number) {
  return {
    ok: true,
    character,
    applied: { op: opName, requested, effective },
    sideEffects: [],
    error: null,
  };
}

describe("fundGain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/characters/{id}/ops/fund.gain with coins + If-Match and decodes requested/effective", async () => {
    const updated = makeChar({
      revision: 13,
      fund: { satchel: { coins: 2, max: 2 }, stash: { coins: 1, max: 8 } },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(fundOpOk(updated, "fund.gain", 3, 3)),
    });

    const result = await Effect.runPromise(
      fundGain("c46ba7cb-993b-4fc7-974d-fb95eacd5446", 3, 12),
    );
    expect(result.character.fund.satchel.coins).toBe(2);
    expect(result.requested).toBe(3);
    expect(result.effective).toBe(3);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/characters/c46ba7cb-993b-4fc7-974d-fb95eacd5446/ops/fund.gain",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "12",
        },
        body: JSON.stringify({ coins: 3 }),
      },
    );
  });

  it("reports clamped overflow via applied.effective when the server stored fewer coins", async () => {
    const updated = makeChar({
      revision: 13,
      fund: { satchel: { coins: 2, max: 2 }, stash: { coins: 8, max: 8 } },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(fundOpOk(updated, "fund.gain", 5, 2)),
    });

    const result = await Effect.runPromise(
      fundGain("c46ba7cb-993b-4fc7-974d-fb95eacd5446", 5, 12),
    );
    expect(result.effective).toBe(2);
    expect(result.effective).toBeLessThan(result.requested);
  });

  it("exposes ApiError with VALIDATION code when the op result is ok:false", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(clockOpErr("fund.gain", "VALIDATION", "coins required", makeChar())),
    });

    const result = await Effect.runPromise(
      Effect.either(fundGain("some-id", -1, 12)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("VALIDATION");
    }
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("fund.gain", 15)),
    });

    const result = await Effect.runPromise(
      Effect.either(fundGain("some-id", 1, 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });

  it("exposes ApiError on non-409 failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "bad request",
    });

    const result = await Effect.runPromise(
      Effect.either(fundGain("some-id", 1, 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(400);
    }
  });
});

describe("fundSpend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/characters/{id}/ops/fund.spend with coins + If-Match", async () => {
    const updated = makeChar({
      revision: 13,
      fund: { satchel: { coins: 1, max: 2 }, stash: { coins: 0, max: 8 } },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(fundOpOk(updated, "fund.spend", 1, 1)),
    });

    const result = await Effect.runPromise(
      fundSpend("c46ba7cb-993b-4fc7-974d-fb95eacd5446", 1, 12),
    );
    expect(result.character.fund.satchel.coins).toBe(1);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/characters/c46ba7cb-993b-4fc7-974d-fb95eacd5446/ops/fund.spend",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "12",
        },
        body: JSON.stringify({ coins: 1 }),
      },
    );
  });

  it("exposes ApiError with INSUFFICIENT_FUNDS code when the op result is ok:false", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(clockOpErr("fund.spend", "INSUFFICIENT_FUNDS", "not enough coins", makeChar())),
    });

    const result = await Effect.runPromise(
      Effect.either(fundSpend("some-id", 99, 12)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("INSUFFICIENT_FUNDS");
    }
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("fund.spend", 15)),
    });

    const result = await Effect.runPromise(
      Effect.either(fundSpend("some-id", 1, 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });

  it("exposes ApiError on non-409 failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "bad request",
    });

    const result = await Effect.runPromise(
      Effect.either(fundSpend("some-id", 1, 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(400);
    }
  });
});

describe("fundLiquidate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/characters/{id}/ops/fund.liquidate with coins + If-Match", async () => {
    const updated = makeChar({
      revision: 13,
      fund: { satchel: { coins: 1, max: 2 }, stash: { coins: 6, max: 8 } },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(fundOpOk(updated, "fund.liquidate", 1, 1)),
    });

    const result = await Effect.runPromise(
      fundLiquidate("c46ba7cb-993b-4fc7-974d-fb95eacd5446", 1, 12),
    );
    expect(result.character.fund.stash.coins).toBe(6);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/characters/c46ba7cb-993b-4fc7-974d-fb95eacd5446/ops/fund.liquidate",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "12",
        },
        body: JSON.stringify({ coins: 1 }),
      },
    );
  });

  it("exposes ApiError with SATCHEL_FULL code when the op result is ok:false", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(clockOpErr("fund.liquidate", "SATCHEL_FULL", "satchel is full", makeChar())),
    });

    const result = await Effect.runPromise(
      Effect.either(fundLiquidate("some-id", 1, 12)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("SATCHEL_FULL");
    }
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("fund.liquidate", 15)),
    });

    const result = await Effect.runPromise(
      Effect.either(fundLiquidate("some-id", 1, 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });

  it("exposes ApiError on non-409 failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "bad request",
    });

    const result = await Effect.runPromise(
      Effect.either(fundLiquidate("some-id", 1, 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(400);
    }
  });
});



describe("listClocks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches /api/clocks and decodes an array of clockSummary rows", async () => {
    const clocks = [
      makeClockSummary({ id: "b0b1c2d3-4e5f-4a6b-8c7d-9e0f1a2b3c4d", name: "Infiltrate the Bluecoats", behavior: "bounded", segments: 3, size: 8 }),
      makeClockSummary({ id: "c0c1d2e3-4f5a-4b6c-9d8e-7f0a1b2c3d4e", name: "Tempest Approaches", behavior: "rollover", segments: 4, size: 4, rollover: 2 }),
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(clocks),
    });

    const result = await Effect.runPromise(listClocks());
    expect(result).toHaveLength(2);
    expect(result[0]?.name).toBe("Infiltrate the Bluecoats");
    expect(result[0]?.behavior).toBe("bounded");
    expect(result[1]?.behavior).toBe("rollover");
    expect(global.fetch).toHaveBeenCalledWith("/api/clocks", {
      headers: { Accept: "application/json" },
    });
  });

  it("exposes ApiError when the fetch fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "boom",
    });

    const result = await Effect.runPromise(Effect.either(listClocks()));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(500);
    }
  });

  it("exposes DecodeError when the response is not a clockSummary array", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ clocks: [] }),
    });

    const result = await Effect.runPromise(Effect.either(listClocks()));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(DecodeError);
    }
  });

  it("rejects a full Clock DTO row (revision is not a clockSummary field)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify([makeClock()]),
    });

    const result = await Effect.runPromise(Effect.either(listClocks()));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(DecodeError);
    }
  });
});

describe("createClock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts the complete current clock-create shape and decodes the OperationResult clock", async () => {
    const created = makeClock({
      id: "d0d1e2f3-4a5b-4c6d-8e7f-9a0b1c2d3e4f",
      name: "Secure the Docks",
      behavior: "rollover",
      segments: 0,
      size: 6,
      revision: 1,
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(clockOpOk(created, "clock.create")),
    });

    const result = await Effect.runPromise(
      createClock("Secure the Docks", "rollover", 6),
    );
    expect(result.id).toBe("d0d1e2f3-4a5b-4c6d-8e7f-9a0b1c2d3e4f");
    expect(result.behavior).toBe("rollover");
    expect(result.size).toBe(6);
    // create has no If-Match: no revision precondition on a new entity
    expect(global.fetch).toHaveBeenCalledWith("/api/clocks", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Secure the Docks",
        ownerKind: "campaign",
        ownerId: "",
        purpose: "custom",
        behavior: "rollover",
        size: 6,
        relatedClockIds: [],
      }),
    });
  });

  it("exposes ApiError with VALIDATION code when the op result is ok:false", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(clockOpErr("clock.create", "VALIDATION", "name is required")),
    });

    const result = await Effect.runPromise(
      Effect.either(createClock("", "bounded", 4)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("VALIDATION");
    }
  });

  it("exposes ApiError when the POST fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "bad request",
    });

    const result = await Effect.runPromise(
      Effect.either(createClock("X", "bounded", 4)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(400);
    }
  });

  it("exposes DecodeError when the response is not a valid OperationResult", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ invalid: "data" }),
    });

    const result = await Effect.runPromise(
      Effect.either(createClock("X", "bounded", 4)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(DecodeError);
    }
  });
});

describe("clockProgress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/clocks/{id}/ops/clock.progress with segments + If-Match and decodes the clock", async () => {
    const progressed = makeClock({ revision: 3, segments: 3 });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(clockOpOk(progressed, "clock.progress")),
    });

    const result = await Effect.runPromise(
      clockProgress("b0b1c2d3-4e5f-4a6b-8c7d-9e0f1a2b3c4d", 1, "2"),
    );
    expect(result.segments).toBe(3);
    expect(result.revision).toBe(3);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/clocks/b0b1c2d3-4e5f-4a6b-8c7d-9e0f1a2b3c4d/ops/clock.progress",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "2",
        },
        body: JSON.stringify({ segments: 1 }),
      },
    );
  });

  it("exposes ApiError with VALIDATION code when the op result is ok:false", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(clockOpErr("clock.progress", "VALIDATION", "segments required", makeClock())),
    });

    const result = await Effect.runPromise(
      Effect.either(clockProgress("some-id", NaN, "1")),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("VALIDATION");
    }
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("clock.progress", 7)),
    });

    const result = await Effect.runPromise(
      Effect.either(clockProgress("some-id", 1, "2")),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });

  it("exposes ApiError on non-409 failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "bad request",
    });

    const result = await Effect.runPromise(
      Effect.either(clockProgress("some-id", 1, "2")),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(400);
    }
  });
});

describe("clockReset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/clocks/{id}/ops/clock.reset with If-Match and no body, decodes the clock", async () => {
    const reset = makeClock({ revision: 3, segments: 0, rollover: 0 });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(clockOpOk(reset, "clock.reset")),
    });

    const result = await Effect.runPromise(
      clockReset("b0b1c2d3-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "2"),
    );
    expect(result.segments).toBe(0);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/clocks/b0b1c2d3-4e5f-4a6b-8c7d-9e0f1a2b3c4d/ops/clock.reset",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "2",
        },
        body: JSON.stringify({}),
      },
    );
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("clock.reset", 7)),
    });

    const result = await Effect.runPromise(
      Effect.either(clockReset("some-id", "2")),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });

  it("exposes ApiError on non-409 failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "not found",
    });

    const result = await Effect.runPromise(
      Effect.either(clockReset("some-id", "2")),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(404);
    }
  });
});

describe("deleteClock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/clocks/{id}/delete with confirm + If-Match and decodes the deleted clock", async () => {
    const deleted = makeClock({ revision: 3 });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(clockOpOk(deleted, "delete")),
    });

    const result = await Effect.runPromise(
      deleteClock("b0b1c2d3-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "2"),
    );
    expect(result).not.toBeNull();
    expect(result?.id).toBe("b0b1c2d3-4e5f-4a6b-8c7d-9e0f1a2b3c4d");
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/clocks/b0b1c2d3-4e5f-4a6b-8c7d-9e0f1a2b3c4d/delete",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "2",
        },
        body: JSON.stringify({ confirm: true }),
      },
    );
  });

  it("posts the deleteToken (sha256 content token) as If-Match for a degraded row", async () => {
    const token = "sha256:" + "a".repeat(64);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        ok: true,
        applied: { op: "delete" },
        sideEffects: [],
        error: null,
      }),
    });

    const result = await Effect.runPromise(
      deleteClock("b0b1c2d3-4e5f-4a6b-8c7d-9e0f1a2b3c4d", token),
    );
    expect(result).toBeNull();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/clocks/b0b1c2d3-4e5f-4a6b-8c7d-9e0f1a2b3c4d/delete",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": token,
        },
        body: JSON.stringify({ confirm: true }),
      },
    );
  });

  it("omits the If-Match header when the row has no if-match value (readable row)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(clockOpOk(makeClock({ revision: 3 }), "clock.progress")),
    });

    await Effect.runPromise(
      clockProgress("b0b1c2d3-4e5f-4a6b-8c7d-9e0f1a2b3c4d", 1, ""),
    );
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/clocks/b0b1c2d3-4e5f-4a6b-8c7d-9e0f1a2b3c4d/ops/clock.progress",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ segments: 1 }),
      },
    );
  });

  it("returns null when the OperationResult omits the clock", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        ok: true,
        applied: { op: "delete" },
        sideEffects: [],
        error: null,
      }),
    });

    const result = await Effect.runPromise(
      deleteClock("b0b1c2d3-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "2"),
    );
    expect(result).toBeNull();
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("delete", 7)),
    });

    const result = await Effect.runPromise(
      Effect.either(deleteClock("some-id", "2")),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });

  it("exposes ApiError on non-409 failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "not found",
    });

    const result = await Effect.runPromise(
      Effect.either(deleteClock("some-id", "2")),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(404);
    }
  });
});

// ---------------------------------------------------------------------------
// F2w crew operations — cohortAdd, cohortRemove, cohortUpdate
// ---------------------------------------------------------------------------

describe("cohortAdd", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/crews/{id}/ops/cohort.add with cohortKind and optional fields, decodes crew", async () => {
    const withCohort = makeCrew({
      revision: 6,
      cohorts: [
        {
          id: "b1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
          cohortKind: "gang",
          gangType: "Bravos",
          expertType: "",
          quality: 2,
          scale: 1,
          hasArmor: true,
          edges: ["Tough", "Savage"],
          flaws: ["Loud"],
          harm: "healthy",
          description: "Street toughs who love a fight",
        },
      ],
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(crewOpOk(withCohort, "cohort.add")),
    });

    const result = await Effect.runPromise(
      cohortAdd(CREW_ID_F2Y, {
        cohortKind: "gang",
        gangType: "Bravos",
        quality: 2,
        scale: 1,
        hasArmor: true,
        edges: ["Tough", "Savage"],
        flaws: ["Loud"],
        description: "Street toughs who love a fight",
      }, 5),
    );
    expect(result.cohorts).toHaveLength(1);
    expect(result.cohorts[0]?.cohortKind).toBe("gang");
    expect(result.cohorts[0]?.gangType).toBe("Bravos");
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/crews/${CREW_ID_F2Y}/ops/cohort.add`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "5",
        },
        body: JSON.stringify({
          cohortKind: "gang",
          gangType: "Bravos",
          quality: 2,
          scale: 1,
          hasArmor: true,
          edges: ["Tough", "Savage"],
          flaws: ["Loud"],
          description: "Street toughs who love a fight",
        }),
      },
    );
  });

  it("exposes ApiError with VALIDATION code when the op result is ok:false", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(crewOpErr("cohort.add", "VALIDATION", "bad cohortKind", makeCrew())),
    });

    const result = await Effect.runPromise(
      Effect.either(cohortAdd(CREW_ID_F2Y, { cohortKind: "weird" as never }, 5)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("VALIDATION");
    }
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("cohort.add", 7)),
    });

    const result = await Effect.runPromise(
      Effect.either(cohortAdd(CREW_ID_F2Y, { cohortKind: "gang" }, 5)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });
});

describe("cohortRemove", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/crews/{id}/ops/cohort.remove with cohortId and If-Match, decodes crew", async () => {
    const removed = makeCrew({ revision: 6, cohorts: [] });
    const COHORT_ID = "b1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(crewOpOk(removed, "cohort.remove")),
    });

    const result = await Effect.runPromise(cohortRemove(CREW_ID_F2Y, COHORT_ID, 5));
    expect(result.cohorts).toHaveLength(0);
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/crews/${CREW_ID_F2Y}/ops/cohort.remove`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "5",
        },
        body: JSON.stringify({ cohortId: COHORT_ID }),
      },
    );
  });

  it("exposes ApiError with NOT_FOUND code when the op result is ok:false", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(crewOpErr("cohort.remove", "NOT_FOUND", "cohort not found", makeCrew())),
    });

    const result = await Effect.runPromise(
      Effect.either(cohortRemove(CREW_ID_F2Y, "missing-id", 5)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("NOT_FOUND");
    }
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("cohort.remove", 7)),
    });

    const result = await Effect.runPromise(
      Effect.either(cohortRemove(CREW_ID_F2Y, "some-id", 5)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });
});

describe("cohortUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/crews/{id}/ops/cohort.update with cohortId and only the changed fields", async () => {
    const COHORT_ID = "b1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
    const updated = makeCrew({
      revision: 6,
      cohorts: [
        {
          id: COHORT_ID,
          cohortKind: "gang",
          gangType: "Bravos",
          expertType: "",
          quality: 3,
          scale: 1,
          hasArmor: true,
          edges: ["Tough", "Savage"],
          flaws: ["Loud"],
          harm: "weakened",
          description: "Street toughs who love a fight",
        },
      ],
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(crewOpOk(updated, "cohort.update")),
    });

    const result = await Effect.runPromise(
      cohortUpdate(CREW_ID_F2Y, {
        cohortId: COHORT_ID,
        quality: 3,
        harm: "weakened",
        hasArmor: true,
      }, 5),
    );
    expect(result.cohorts[0]?.quality).toBe(3);
    expect(result.cohorts[0]?.harm).toBe("weakened");
    expect(result.cohorts[0]?.hasArmor).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/crews/${CREW_ID_F2Y}/ops/cohort.update`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "5",
        },
        body: JSON.stringify({ cohortId: COHORT_ID, quality: 3, harm: "weakened", hasArmor: true }),
      },
    );
  });

  it("exposes ApiError with VALIDATION code when the op result is ok:false", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(crewOpErr("cohort.update", "VALIDATION", "unknown field", makeCrew())),
    });

    const result = await Effect.runPromise(
      Effect.either(cohortUpdate(CREW_ID_F2Y, { cohortId: "some-id", quality: -1 }, 5)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("VALIDATION");
    }
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("cohort.update", 7)),
    });

    const result = await Effect.runPromise(
      Effect.either(cohortUpdate(CREW_ID_F2Y, { cohortId: "some-id", quality: 2 }, 5)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });
});

// ---------------------------------------------------------------------------
// F2x crew operations — crewXpAdd, crewXpClear
// ---------------------------------------------------------------------------

describe("crewXpAdd", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/crews/{id}/ops/xp.add with delta and If-Match, decodes crew from OperationResult", async () => {
    const gained = makeCrew({ revision: 6, experience: { points: 3, max: 8 } });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(crewOpOk(gained, "xp.add")),
    });

    const result = await Effect.runPromise(crewXpAdd(CREW_ID_F2Y, 1, 5));
    expect(result.crew.experience.points).toBe(3);
    expect(result.requested).toBe(1);
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/crews/${CREW_ID_F2Y}/ops/xp.add`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "5",
        },
        body: JSON.stringify({ delta: 1 }),
      },
    );
  });

  it("exposes ApiError when the op result is ok:false (VALIDATION)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(crewOpErr("xp.add", "VALIDATION", "delta out of range", makeCrew())),
    });

    const result = await Effect.runPromise(Effect.either(crewXpAdd(CREW_ID_F2Y, 99, 5)));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("VALIDATION");
    }
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("xp.add", 7)),
    });

    const result = await Effect.runPromise(Effect.either(crewXpAdd(CREW_ID_F2Y, 1, 5)));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });
});

describe("crewXpClear", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/crews/{id}/ops/xp.clear with empty body and If-Match, decodes crew", async () => {
    const cleared = makeCrew({ revision: 6, experience: { points: 0, max: 8 } });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(crewOpOk(cleared, "xp.clear")),
    });

    const result = await Effect.runPromise(crewXpClear(CREW_ID_F2Y, 5));
    expect(result.experience.points).toBe(0);
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/crews/${CREW_ID_F2Y}/ops/xp.clear`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "5",
        },
        body: "{}",
      },
    );
  });

  it("exposes ApiError when the op result is ok:false (VALIDATION)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(crewOpErr("xp.clear", "VALIDATION", "nothing to clear", makeCrew())),
    });

    const result = await Effect.runPromise(Effect.either(crewXpClear(CREW_ID_F2Y, 5)));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("VALIDATION");
    }
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("xp.clear", 7)),
    });

    const result = await Effect.runPromise(Effect.either(crewXpClear(CREW_ID_F2Y, 5)));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });
});

// ---------------------------------------------------------------------------
// F2ac crew operations — crewNoteAdd, crewNoteRemove, crewTurfAdd,
// getCrewGameData (raw crew game-data file for cohort type menus)
// ---------------------------------------------------------------------------

describe("crewNoteAdd", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/crews/{id}/ops/note.add with text and If-Match, decodes crew", async () => {
    const noted = makeCrew({ revision: 6, notes: ["first", "second"] });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(crewOpOk(noted, "note.add")),
    });

    const result = await Effect.runPromise(crewNoteAdd(CREW_ID_F2Y, "second", 5));
    expect(result.notes).toEqual(["first", "second"]);
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/crews/${CREW_ID_F2Y}/ops/note.add`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "5",
        },
        body: JSON.stringify({ text: "second" }),
      },
    );
  });

  it("exposes ApiError when the op result is ok:false", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(crewOpErr("note.add", "VALIDATION", "empty text", makeCrew())),
    });

    const result = await Effect.runPromise(Effect.either(crewNoteAdd(CREW_ID_F2Y, "", 5)));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("VALIDATION");
    }
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("note.add", 7)),
    });

    const result = await Effect.runPromise(Effect.either(crewNoteAdd(CREW_ID_F2Y, "x", 5)));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });
});

describe("crewNoteRemove", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/crews/{id}/ops/note.remove with the 0-based index", async () => {
    const trimmed = makeCrew({ revision: 6, notes: ["second"] });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(crewOpOk(trimmed, "note.remove")),
    });

    const result = await Effect.runPromise(crewNoteRemove(CREW_ID_F2Y, 0, 5));
    expect(result.notes).toEqual(["second"]);
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/crews/${CREW_ID_F2Y}/ops/note.remove`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "5",
        },
        body: JSON.stringify({ index: 0 }),
      },
    );
  });

  it("exposes ApiError when the note index is out of range (NOT_FOUND)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(crewOpErr("note.remove", "NOT_FOUND", "note index out of range", makeCrew())),
    });

    const result = await Effect.runPromise(Effect.either(crewNoteRemove(CREW_ID_F2Y, 9, 5)));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.body).toContain("NOT_FOUND");
    }
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("note.remove", 7)),
    });

    const result = await Effect.runPromise(Effect.either(crewNoteRemove(CREW_ID_F2Y, 0, 5)));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });
});

describe("crewTurfAdd", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/crews/{id}/ops/turf.add with delta and If-Match, decodes crew", async () => {
    const withTurf = makeCrew({ revision: 6, turf: 3 });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(crewOpOk(withTurf, "turf.add")),
    });

    const result = await Effect.runPromise(crewTurfAdd(CREW_ID_F2Y, 1, 5));
    expect(result.crew.turf).toBe(3);
    expect(result.requested).toBe(1);
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/crews/${CREW_ID_F2Y}/ops/turf.add`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "If-Match": "5",
        },
        body: JSON.stringify({ delta: 1 }),
      },
    );
  });

  it("sends a negative delta to reduce turf", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(crewOpOk(makeCrew({ revision: 6, turf: 1 }), "turf.add")),
    });

    await Effect.runPromise(crewTurfAdd(CREW_ID_F2Y, -1, 5));
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/crews/${CREW_ID_F2Y}/ops/turf.add`,
      expect.objectContaining({ body: JSON.stringify({ delta: -1 }) }),
    );
  });

  it("exposes StaleRevisionError on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(staleResp("turf.add", 7)),
    });

    const result = await Effect.runPromise(Effect.either(crewTurfAdd(CREW_ID_F2Y, 1, 5)));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(StaleRevisionError);
    }
  });
});

describe("getCrewGameData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches /api/games/{stem}/crews and returns the raw crews file object", async () => {
    const crewsData = {
      Name: "Blades in the Dark",
      Language: "en",
      CrewTypes: [{ Name: "Assassins", SpecialAbilities: [] }],
      CohortGangTypes: ["Adepts", "Rooks"],
      CohortExpertTypes: ["Doctor", "Custom"],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(crewsData),
    });

    const result = await Effect.runPromise(getCrewGameData("blades-in-the-dark"));
    expect(result.CohortGangTypes).toEqual(["Adepts", "Rooks"]);
    expect(result.CohortExpertTypes).toEqual(["Doctor", "Custom"]);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/games/blades-in-the-dark/crews",
      { headers: { Accept: "application/json" } },
    );
  });

  it("exposes ApiError when fetch fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => "Not Found",
      status: 404,
    });

    const result = await Effect.runPromise(Effect.either(getCrewGameData("nonexistent-game")));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(404);
    }
  });

  it("exposes DecodeError when the response is not an object", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify([1, 2, 3]),
    });

    const result = await Effect.runPromise(Effect.either(getCrewGameData("blades-in-the-dark")));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(DecodeError);
    }
  });
});

// ---------------------------------------------------------------------------
// P23/FV-023 — transport classification
// ---------------------------------------------------------------------------

describe("fetchJson transport classification (FV-023)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("classifies malformed 200 JSON as DecodeError, never a status-0 ApiError, without leaking parser text", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "not json at all",
    });

    const result = await Effect.runPromise(Effect.either(getRoster()));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(DecodeError);
      expect(result.left).not.toBeInstanceOf(ApiError);
      if (result.left instanceof DecodeError) {
        // Distinct friendly copy; no parser message ("Unexpected token…") leaks.
        expect(decodeErrorText(result.left)).toBe(
          "The server answered in an unexpected format — refresh the sheet and try again.",
        );
        expect(decodeErrorText(result.left)).not.toContain("token");
      }
    }
  });

  it("classifies a thrown fetch as a network ApiError with friendly copy", async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));

    const result = await Effect.runPromise(Effect.either(getRoster()));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(0);
      expect(result.left.body).toBe(NETWORK_ERROR_COPY);
      expect(result.left.message).not.toContain("fetch failed");
    }
  });

  it("classifies rejected HTTP as an ApiError, not DecodeError", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "service unavailable",
    });

    const result = await Effect.runPromise(Effect.either(getRoster()));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(ApiError);
      expect(result.left).not.toBeInstanceOf(DecodeError);
      if (result.left instanceof ApiError) {
        expect(result.left.status).toBe(503);
        // Distinct friendly copy per class (FV-023), never the raw body.
        expect(transportErrorText(result.left)).toBe("The server returned an error (503).");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// P24/FV-024 — typed operation-error copy
// ---------------------------------------------------------------------------

describe("op-level error copy (FV-024)", () => {
  it("maps known codes to user copy and surfaces the recovery instruction", () => {
    const err = new OpError(200, {
      code: "RETIRED",
      status: 200,
      message: "character is retired",
      retryable: false,
      recovery: "Retirement can be undone from the history view.",
      details: {},
    });
    const text = opErrorFriendlyText(err);
    expect(text).toContain("This character has retired");
    expect(text).toContain("Retirement can be undone from the history view.");
    expect(text).not.toContain("RETIRED");
    expect(text).not.toContain("character is retired");
  });

  it("gives a concise fallback for an unknown code without leaking it raw", () => {
    // Defensive path: a future server code that shipped before the client
    // copy table caught up. The frozen union type can't express it, so the
    // fixture escapes through a typed boundary cast.
    const unknownError = {
      code: "UNKNOWN_NEW_CODE",
      status: 200,
      message: "server internals",
      retryable: false,
      recovery: "",
      details: {},
    } as unknown as ConstructorParameters<typeof OpError>[1];
    const err = new OpError(200, unknownError);
    const text = opErrorFriendlyText(err);
    expect(text).toBe(
      "That action couldn't be completed — the sheet refreshes with the server state.",
    );
    expect(text).not.toContain("UNKNOWN_NEW_CODE");
    expect(text).not.toContain("server internals");
  });
});

// ---------------------------------------------------------------------------
// SC-F3 capability projections + tracker clamp reporting
// ---------------------------------------------------------------------------

describe("getCharacterCapabilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches /api/characters/{id}/capabilities and decodes the projection", async () => {
    const projection = {
      characterId: "c46ba7cb-993b-4fc7-974d-fb95eacd5446",
      effectiveActionCaps: [
        { action: "Hunt", maxRating: 4, effectiveMax: 3, masteryTotalBoxes: 3, masteryMarkedBoxes: 0 },
      ],
      harmCapacities: [
        { level: "lesser", capacity: 2, remaining: 2 },
        { level: "moderate", capacity: 2, remaining: 2 },
        { level: "severe", capacity: 1, remaining: 1 },
        { level: "fatal", capacity: 1, remaining: 1 },
      ],
      loadLimits: [
        { commitment: "light", maxBulk: 5, remainingBulk: 5 },
        { commitment: "normal", maxBulk: 6, remainingBulk: 4 },
      ],
      availableAbilityTakes: [{ name: "Rook's Gambit", timesTaken: 1, maxTakes: 2, remaining: 1 }],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(projection),
    });

    const result = await Effect.runPromise(
      getCharacterCapabilities("c46ba7cb-993b-4fc7-974d-fb95eacd5446"),
    );
    expect(result.effectiveActionCaps[0].effectiveMax).toBe(3);
    expect(result.harmCapacities.find((h) => h.level === "severe")?.capacity).toBe(1);
    expect(result.loadLimits[1].remainingBulk).toBe(4);
    expect(result.availableAbilityTakes[0].remaining).toBe(1);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/characters/c46ba7cb-993b-4fc7-974d-fb95eacd5446/capabilities",
      expect.objectContaining({ headers: expect.objectContaining({ Accept: "application/json" }) }),
    );
  });

  it("surfaces DecodeError for a malformed projection body", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "not-json",
    });
    const result = await Effect.runPromise(Effect.either(getCharacterCapabilities("some-id")));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(DecodeError);
    }
  });
});

describe("getCrewCapabilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches /api/crews/{id}/capabilities and decodes the catalog", async () => {
    const projection = {
      crewId: "8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2",
      upgrades: [
        { name: "Quality", totalBoxes: 4, marked: 4, remaining: 0 },
        { name: "Lair", totalBoxes: 3, marked: 1, remaining: 2 },
      ],
      abilities: [{ name: "Captain", maxTakes: 1, taken: 0, remaining: 1 }],
      effectiveTurf: 2,
      developThreshold: 10,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(projection),
    });

    const result = await Effect.runPromise(
      getCrewCapabilities("8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2"),
    );
    expect(result.upgrades[0].remaining).toBe(0);
    expect(result.upgrades[1].marked).toBe(1);
    expect(result.abilities[0].remaining).toBe(1);
    expect(result.effectiveTurf).toBe(2);
    expect(result.developThreshold).toBe(10);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/crews/8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2/capabilities",
      expect.anything(),
    );
  });
});

describe("crewRepAdd clamp reporting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports requested/effective when the server applies less than requested", async () => {
    const clamped = makeCrew({ revision: 6, rep: { current: 12, max: 12 } });
    // rep at max: requested +2, effective +0 (clamped).
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify(crewOpOk(clamped, "rep.add", { requested: 2, effective: 0 })),
    });

    const result = await Effect.runPromise(crewRepAdd(CREW_ID_F2Y, 2, 5));
    expect(result.crew.rep.current).toBe(12);
    expect(result.requested).toBe(2);
    expect(result.effective).toBe(0);
    expect(result.effective).not.toBe(result.requested);
  });

  it("keeps requested equal to effective when the full delta is applied", async () => {
    const gained = makeCrew({ revision: 6, rep: { current: 5, max: 12 } });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(crewOpOk(gained, "rep.add", { requested: 2, effective: 2 })),
    });
    const result = await Effect.runPromise(crewRepAdd(CREW_ID_F2Y, 2, 5));
    expect(result.requested).toBe(2);
    expect(result.effective).toBe(2);
  });
});
