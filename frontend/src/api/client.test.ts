import { Effect } from "effect";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRoster, getCharacter, getCrew, getCharacterHistory, getCrewHistory, getPlaybookList, createCharacter, getCrewTypeList, createCrew, stressAdd, undoCharacter, undoCrew, dossierUpdate, stressClear, traumaAdd, traumaRemove, getGame, harmAdd, harmHeal, harmRemove, harmHealingClock, armorSet, ApiError, DecodeError, StaleRevisionError } from "./client.js";

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
