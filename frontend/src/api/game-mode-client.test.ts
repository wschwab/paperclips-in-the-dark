import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  characterDowntimeAdjust,
  characterDowntimeReset,
  characterDowntimeSpend,
  characterModeFlowSet,
  characterModeSet,
} from "./client.js";

const CHARACTER_ID = "c46ba7cb-993b-4fc7-974d-fb95eacd5446";

function okCharacterResult() {
  return {
    ok: true,
    character: { revision: 13, kind: "character", id: CHARACTER_ID },
    applied: { op: "mode.set" },
    sideEffects: [],
    error: null,
  };
}

function mockFetchOk(body: unknown = okCharacterResult()) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GAME-MODE-03 client ops (per-scoundrel mode surface)", () => {
  it("characterModeSet posts {mode} to ops/mode.set with If-Match", async () => {
    const fetchMock = mockFetchOk();
    await Effect.runPromise(Effect.either(characterModeSet(CHARACTER_ID, "score", 12)));
    const [path, init] = fetchMock.mock.calls[0]!;
    expect(path).toBe(`/api/characters/${CHARACTER_ID}/ops/mode.set`);
    expect(init.method).toBe("POST");
    expect(init.headers["If-Match"]).toBe("12");
    expect(JSON.parse(init.body)).toEqual({ mode: "score" });
  });

  it("characterModeFlowSet posts {kind, step} to ops/mode.flow.set", async () => {
    const fetchMock = mockFetchOk();
    await Effect.runPromise(Effect.either(characterModeFlowSet(CHARACTER_ID, "resolution", "payoff", 12)));
    const [path, init] = fetchMock.mock.calls[0]!;
    expect(path).toBe(`/api/characters/${CHARACTER_ID}/ops/mode.flow.set`);
    expect(JSON.parse(init.body)).toEqual({ kind: "resolution", step: "payoff" });
  });

  it("characterDowntimeSpend posts {activity, description} to ops/downtime.spend", async () => {
    const fetchMock = mockFetchOk();
    await Effect.runPromise(Effect.either(characterDowntimeSpend(CHARACTER_ID, "train", "Prowess practice", 12)));
    const [path, init] = fetchMock.mock.calls[0]!;
    expect(path).toBe(`/api/characters/${CHARACTER_ID}/ops/downtime.spend`);
    expect(JSON.parse(init.body)).toEqual({ activity: "train", description: "Prowess practice" });
  });

  it("characterDowntimeAdjust posts {delta, reason} to ops/downtime.adjust", async () => {
    const fetchMock = mockFetchOk();
    await Effect.runPromise(Effect.either(characterDowntimeAdjust(CHARACTER_ID, 1, "gift", 12)));
    const [path, init] = fetchMock.mock.calls[0]!;
    expect(path).toBe(`/api/characters/${CHARACTER_ID}/ops/downtime.adjust`);
    expect(JSON.parse(init.body)).toEqual({ delta: 1, reason: "gift" });
  });

  it("characterDowntimeReset posts an empty body to ops/downtime.reset", async () => {
    const fetchMock = mockFetchOk();
    await Effect.runPromise(Effect.either(characterDowntimeReset(CHARACTER_ID, 12)));
    const [path, init] = fetchMock.mock.calls[0]!;
    expect(path).toBe(`/api/characters/${CHARACTER_ID}/ops/downtime.reset`);
    expect(JSON.parse(init.body)).toEqual({});
  });
});
