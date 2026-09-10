import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { newCrew } from "../../src/suite-helpers.js";

// Use the ordinary, unretried HTTP client: transport failures must remain visible.
// Do not serialize, retry, or reduce the burst to fit AWS's old five-line budget.
describe("AWS connection admission", () => {
  testCase("AWS-BURST-001", "all 64 concurrent requests receive HTTP responses without socket resets", async () => {
    const crew = await newCrew();
    const count = 64;
    const responses = await Promise.allSettled(Array.from({ length: count }, () =>
      api.post("campaign/batch", { ops: [
        { entity: "crew", id: crew.id, op: "coin.add", args: { delta: 1 } },
      ] }),
    ));
    const transportFailures = responses.flatMap((response) => response.status === "rejected"
      ? [response.reason instanceof Error
        ? { message: response.reason.message, cause: response.reason.cause }
        : response.reason]
      : []);
    expect(transportFailures, "every request must receive an HTTP response, with no transport retry").toEqual([]);
    expect(responses).toHaveLength(count);
    for (const response of responses) {
      if (response.status !== "fulfilled") throw response.reason;
      expect(response.value.status).toBe(200);
      expect((await api.operation(response.value)).ok).toBe(true);
    }
    const current = await api.crew(crew.id);
    expect(current.coin).toBe(crew.coin + count);
    expect(current.revision).toBe(crew.revision + count);
  });
});
