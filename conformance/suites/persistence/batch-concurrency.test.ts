import { describe, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { api, type HttpResponse } from "../../src/api.js";
import { decode, Schemas } from "../../src/schemas.js";
import { testCase } from "../../src/test-case.js";
import { newCharacter, newCrew } from "../../src/suite-helpers.js";

// Match the direct concurrent curl probes, avoiding the socket-reset limitation
// already documented by the existing Node-fetch concurrency suite.
async function concurrentPosts(requests: { path: string; body: unknown }[]): Promise<HttpResponse[]> {
  const children = requests.map(({ path, body }) => {
    let resolve!: (response: HttpResponse) => void;
    let reject!: (cause: unknown) => void;
    const promise = new Promise<HttpResponse>((resolveResponse, rejectResponse) => {
      resolve = resolveResponse;
      reject = rejectResponse;
    });
    const child = execFile("curl", ["--silent", "--show-error", "--max-time", "15", "--dump-header", "-",
      "--header", "Content-Type: application/json", "--data-binary", "@-",
      `${api.baseUrl}/${path}`], (error, stdout) => {
      if (error) { reject(error); return; }
      try {
        const boundary = stdout.indexOf("\r\n\r\n");
        const headerLines = stdout.slice(0, boundary).split("\r\n");
        const status = Number(headerLines.shift()!.split(" ")[1]);
        const headers = new Headers();
        for (const line of headerLines) {
          const colon = line.indexOf(":");
          headers.append(line.slice(0, colon), line.slice(colon + 1).trim());
        }
        const rawBody = stdout.slice(boundary + 4);
        resolve({ status, headers, body: JSON.parse(rawBody), rawBody });
      } catch (cause) { reject(cause); }
    });
    return { child, body, promise, spawned: once(child, "spawn") };
  });
  try {
    // Start every curl before releasing any body, so process startup cannot
    // accidentally serialize the requests and hide the read-before-lock race.
    const [, responses] = await Promise.all([
      Promise.all(children.map(({ spawned }) => spawned)).then(() => {
        for (const { child, body } of children) child.stdin!.end(JSON.stringify(body));
      }),
      Promise.all(children.map(({ promise }) => promise)),
    ]);
    return responses;
  } finally {
    for (const { child } of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    }
  }
}

const coinBatch = (id: string) => ({ ops: [{ entity: "crew", id, op: "coin.add", args: { delta: 1 } }] });
async function history(route: string, id: string) {
  return decode(Schemas.History, (await api.get(`${route}/${id}/history`)).body);
}
async function assertBatchSuccess(response: HttpResponse) {
  expect(response.status).toBe(200);
  const result = await api.operation(response);
  expect(result.ok).toBe(true);
  expect(result.batch?.every((item) => item.ok)).toBe(true);
}

describe("batch lock and idempotency scope", () => {
  testCase("BATCH-CONCURRENCY-001", "24 acknowledged concurrent batches preserve all coin increments, revisions, and snapshots", async () => {
    const crew = await newCrew();
    const responses = await concurrentPosts(Array.from({ length: 24 }, () => ({ path: "campaign/batch", body: coinBatch(crew.id) })));
    for (const response of responses) await assertBatchSuccess(response);
    const current = await api.crew(crew.id);
    expect.soft(current.coin).toBe(crew.coin + responses.length);
    expect.soft(current.revision).toBe(crew.revision + responses.length);
    expect.soft(await history("crews", crew.id)).toHaveLength(responses.length);
  });

  testCase("BATCH-CONCURRENCY-002", "batches and single-entity mutations read under the same entity lock", async () => {
    const crew = await newCrew();
    const responses = await concurrentPosts(Array.from({ length: 24 }, (_, index) => index % 2 === 0
      ? { path: "campaign/batch", body: coinBatch(crew.id) }
      : { path: `crews/${crew.id}/ops/coin.add`, body: { delta: 1 } }));
    for (const [index, response] of responses.entries()) {
      if (index % 2 === 0) await assertBatchSuccess(response);
      else expect((await api.operation(response)).ok).toBe(true);
    }
    const current = await api.crew(crew.id);
    expect.soft(current.coin).toBe(crew.coin + responses.length);
    expect.soft(current.revision).toBe(crew.revision + responses.length);
    expect.soft(await history("crews", crew.id)).toHaveLength(responses.length);
  });

  testCase("BATCH-IDEMPOTENCY-001", "sequential exact retry replays original bytes with no extra write or history, while distinct keys apply independently", async () => {
    const crew = await newCrew();
    const headers = { "Idempotency-Key": randomUUID() };
    const first = await api.post("campaign/batch", coinBatch(crew.id), headers);
    await assertBatchSuccess(first);
    const before = await api.get(`crews/${crew.id}`);
    expect.soft((await api.post("campaign/batch", coinBatch(crew.id), headers)).rawBody).toBe(first.rawBody);
    expect.soft((await api.get(`crews/${crew.id}`)).rawBody).toBe(before.rawBody);
    expect.soft(await history("crews", crew.id)).toHaveLength(1);
    await assertBatchSuccess(await api.post("campaign/batch", coinBatch(crew.id), { "Idempotency-Key": randomUUID() }));
    const current = await api.crew(crew.id);
    expect.soft(current.coin).toBe(crew.coin + 2);
    expect.soft(current.revision).toBe(crew.revision + 2);
    expect.soft(await history("crews", crew.id)).toHaveLength(2);
  });

  testCase("BATCH-IDEMPOTENCY-002", "12 concurrent exact keyed retries commit the entire multi-entity batch once", async () => {
    const crews = [await newCrew(), await newCrew()];
    const body = { ops: crews.map((crew) => coinBatch(crew.id).ops[0]!) };
    const headers = { "Idempotency-Key": randomUUID() };
    const responses = await Promise.all(Array.from({ length: 12 }, () => api.post("campaign/batch", body, headers)));
    for (const response of responses) {
      await assertBatchSuccess(response);
      expect.soft(response.rawBody).toBe(responses[0]!.rawBody);
    }
    for (const crew of crews) {
      const current = await api.crew(crew.id);
      expect.soft(current.coin).toBe(crew.coin + 1);
      expect.soft(current.revision).toBe(crew.revision + 1);
      expect.soft(await history("crews", crew.id)).toHaveLength(1);
    }
  });

  testCase("BATCH-IDEMPOTENCY-003", "the same key on a batch and a single route stays independently scoped", async () => {
    const crew = await newCrew();
    const headers = { "Idempotency-Key": randomUUID() };
    const first = await api.post("campaign/batch", coinBatch(crew.id), headers);
    await assertBatchSuccess(first);
    const single = await api.post(`crews/${crew.id}/ops/coin.add`, { delta: 1 }, headers);
    expect((await api.operation(single)).ok).toBe(true);
    expect.soft((await api.post("campaign/batch", coinBatch(crew.id), headers)).rawBody).toBe(first.rawBody);
    expect.soft((await api.post(`crews/${crew.id}/ops/coin.add`, { delta: 1 }, headers)).rawBody).toBe(single.rawBody);
    const current = await api.crew(crew.id);
    expect.soft(current.coin).toBe(crew.coin + 2);
    expect.soft(current.revision).toBe(crew.revision + 2);
    expect.soft(await history("crews", crew.id)).toHaveLength(2);
  });

  testCase("BATCH-IDEMPOTENCY-004", "a failed batch is not cached as a success and its exact retry can succeed after recovery", async () => {
    const crew = await newCrew();
    const character = await newCharacter();
    const body = { ops: [coinBatch(crew.id).ops[0]!, { entity: "character", id: character.id, op: "fund.spend", args: { coins: 4 } }] };
    const headers = { "Idempotency-Key": randomUUID() };
    const failed = await api.operation(await api.post("campaign/batch", body, headers));
    expect(failed.batch?.[1]?.error?.code).toBe("INSUFFICIENT_FUNDS");
    expect((await api.crew(crew.id)).coin).toBe(crew.coin);
    expect(await history("crews", crew.id)).toHaveLength(0);
    expect((await api.operation(await api.post(`characters/${character.id}/ops/fund.gain`, { coins: 4 }))).ok).toBe(true);
    const successful = await api.post("campaign/batch", body, headers);
    await assertBatchSuccess(successful);
    const before = await api.get(`crews/${crew.id}`);
    expect.soft((await api.post("campaign/batch", body, headers)).rawBody).toBe(successful.rawBody);
    expect.soft((await api.get(`crews/${crew.id}`)).rawBody).toBe(before.rawBody);
    expect.soft(await history("crews", crew.id)).toHaveLength(1);
  });
});
