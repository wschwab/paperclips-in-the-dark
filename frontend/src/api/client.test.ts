import { Effect } from "effect";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRoster, getCharacter, getCrew, ApiError, DecodeError } from "./client.js";

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
