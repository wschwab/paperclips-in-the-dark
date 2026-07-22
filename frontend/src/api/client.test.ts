import { Effect } from "effect";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRoster, ApiError, DecodeError } from "./client.js";

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
