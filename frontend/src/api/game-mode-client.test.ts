import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  characterDowntimeAdjust,
  characterDowntimeReset,
  characterDowntimeSpend,
  characterModeFlowSet,
  characterModeSet,
  getCharacterFlow,
  characterFlowStepComplete,
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

describe("FLOW-API-01 projection and atomic completion client", () => {
  const projection = {
    characterId: CHARACTER_ID, revision: 12, crew: null, mode: "score",
    kind: "resolution", step: "payoff", instanceId: "resolution-one",
    steps: [{ kind: "resolution", step: "payoff", label: "Server Payoff", skippable: true }],
    back: null, next: null, skippable: true, actions: [], guidance: {}, receipt: null,
  };

  it("loads the pure typed flow projection through the same-origin GET route", async () => {
    const fetchMock = mockFetchOk(projection);
    const result = await Effect.runPromise(getCharacterFlow(CHARACTER_ID));
    expect(result).toEqual(projection);
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/characters/${CHARACTER_ID}/flow`);
  });

  it("rejects malformed and excess projection properties instead of rendering guessed flow state", async () => {
    mockFetchOk({ ...projection, revision: "12", invented: true });
    const result = await Effect.runPromise(Effect.either(getCharacterFlow(CHARACTER_ID)));
    expect(result._tag).toBe("Left");
  });

  it("posts one explicit completion request with both observed revisions and a stable replay key", async () => {
    const fetchMock = mockFetchOk();
    const request = {
      completionId: "completion-one", instanceId: "resolution-one",
      kind: "resolution" as const, step: "payoff",
      inputs: { crewRevision: 4, crewCoin: 2, crewRep: 1, myShare: 1 },
    };
    await Effect.runPromise(Effect.either(characterFlowStepComplete(CHARACTER_ID, request, 12, "completion-one")));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = fetchMock.mock.calls[0]!;
    expect(path).toBe(`/api/characters/${CHARACTER_ID}/ops/flow.step.complete`);
    expect(init.method).toBe("POST");
    expect(init.headers["If-Match"]).toBe("12");
    expect(init.headers["Idempotency-Key"]).toBe("completion-one");
    expect(JSON.parse(init.body)).toEqual(request);
  });
});
