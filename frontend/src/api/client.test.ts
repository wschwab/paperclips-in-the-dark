import { Effect } from "effect";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRoster, getCharacter, getCrew, getCharacterHistory, getCrewHistory, getPlaybookList, createCharacter, getCrewTypeList, createCrew, stressAdd, undoCharacter, undoCrew, dossierUpdate, stressClear, traumaAdd, traumaRemove, getGame, harmAdd, harmHeal, harmRemove, harmHealingClock, armorSet, crewContactAdd, crewContactRemove, factionSetStatus, factionRemove, actionSetRating, attributeXpAdd, attributeXpClear, attributeLevelup, sessionSet, getPlaybook, playbookXpAdd, playbookXpClear, abilityTake, abilityRemove, ApiError, DecodeError, StaleRevisionError } from "./client.js";

describe("getRoster", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches /api/campaign/roster and decodes a valid roster", async () => {
    const rosterData = {
      characters: [
        {
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
        },
      ],
      crews: [
        {
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
      dossier: {
        name: "Brenda Hilton",
        crewId: "8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2",
        alias: "Webweaver",
        look: "Keen and calculating",
        notes: "Spider operative",
        background: { name: "Urchin", description: "" },
        heritage: { name: "Akorosi", description: "" },
        vice: { name: "Gambling", description: "" },
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
      coin: 0,
      stash: 2,
      notes: "Up-and-coming crew",
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
      dossier: {
        name: "Rowan",
        crewId: "",
        alias: "",
        look: "",
        notes: "",
        background: { name: "Dock Worker", description: "" },
        heritage: { name: "Duskborn", description: "" },
        vice: { name: "Gambling", description: "" },
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
      coin: 0,
      stash: 0,
      notes: "",
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
      dossier: {
        name: "Brenda Hilton",
        crewId: "8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2",
        alias: "Webweaver",
        look: "Keen and calculating",
        notes: "Spider operative",
        background: { name: "Urchin", description: "" },
        heritage: { name: "Akorosi", description: "" },
        vice: { name: "Gambling", description: "" },
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
        message: "Character revision mismatch",
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
      coin: 0,
      stash: 2,
      notes: "Up-and-coming crew",
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
      undoCrew(crewId),
    );
    expect(result.id).toBe(crewId);
    expect(result.heat.current).toBe(2);
    expect(global.fetch).toHaveBeenCalledWith(`/api/crews/${crewId}/undo`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
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
        message: "No history to undo",
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(errorResponse),
      status: 200,
    });

    const result = await Effect.runPromise(
      Effect.either(undoCrew(crewId)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(ApiError);
      if (result.left instanceof ApiError) {
        expect(result.left.status).toBe(200);
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
        message: "Crew revision mismatch",
        details: { currentRevision: 7 },
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => JSON.stringify(errorResponse),
      status: 409,
    });

    const result = await Effect.runPromise(
      Effect.either(undoCrew(crewId)),
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
      Effect.either(undoCrew("nonexistent-id")),
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
      Effect.either(undoCrew("some-id")),
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
      Effect.either(undoCrew("some-id")),
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
    dossier: {
      name: "Brenda Hilton",
      crewId: "8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2",
      alias: "Webweaver",
      look: "Keen and calculating",
      notes: "Spider operative",
      background: { name: "Urchin", description: "" },
      heritage: { name: "Akorosi", description: "" },
      vice: { name: "Gambling", description: "" },
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
  return {
    ok: false,
    applied: { op: opName },
    sideEffects: [],
    error: {
      code: "STALE_REVISION",
      message: "Revision mismatch",
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
        vice: { name: "Gambling", description: "" },
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
      dossier: {
        name: "Brenda Hilton",
        crewId: "8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2",
        alias: "Webweaver",
        look: "Keen and calculating",
        notes: "Spider operative",
        background: { name: "Urchin", description: "" },
        heritage: { name: "Akorosi", description: "" },
        vice: { name: "Gambling", description: "" },
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
      undoCharacter(characterId),
    );
    expect(result.id).toBe(characterId);
    expect(result.monitor.stress.current).toBe(2);
    expect(global.fetch).toHaveBeenCalledWith(`/api/characters/${characterId}/undo`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
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
        message: "No history to undo",
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(errorResponse),
      status: 200,
    });

    const result = await Effect.runPromise(
      Effect.either(undoCharacter(characterId)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(ApiError);
      if (result.left instanceof ApiError) {
        expect(result.left.status).toBe(200);
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
        message: "Character revision mismatch",
        details: { currentRevision: 15 },
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => JSON.stringify(errorResponse),
      status: 409,
    });

    const result = await Effect.runPromise(
      Effect.either(undoCharacter(characterId)),
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
      Effect.either(undoCharacter("nonexistent-id")),
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
      Effect.either(undoCharacter("some-id")),
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
      Effect.either(undoCharacter("some-id")),
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

  it("posts to /api/characters/{id}/ops/harm.heal with no body and If-Match", async () => {
    const healed = makeChar({
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
      text: async () => JSON.stringify(harmOpOk(healed, "harm.heal")),
    });

    const result = await Effect.runPromise(
      harmHeal("c46ba7cb-993b-4fc7-974d-fb95eacd5446", 12),
    );
    expect(result.monitor.harm.lesser).toContain("Battered");
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/characters/c46ba7cb-993b-4fc7-974d-fb95eacd5446/ops/harm.heal",
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
      text: async () => JSON.stringify(staleResp("harm.heal", 15)),
    });

    const result = await Effect.runPromise(
      Effect.either(harmHeal("some-id", 1)),
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
      Effect.either(harmHeal("some-id", 1)),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left" && result.left instanceof ApiError) {
      expect(result.left.status).toBe(422);
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
    coin: 0,
    stash: 2,
    notes: "Up-and-coming crew",
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
