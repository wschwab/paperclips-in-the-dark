import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { decode, Schemas } from "../../src/schemas.js";
import { testCase } from "../../src/test-case.js";

describe("contract DTO decoders", () => {
  testCase("CONTRACT-SCHEMA-CHARACTER-001", "character golden document decodes", async () => {
    await api.get("health");
    const fixture = (await import("../../fixtures/golden-character.json", { with: { type: "json" } })).default;
    await decode(Schemas.Character, fixture);
    expect(fixture.kind).toBe("character");
  });

  testCase("CONTRACT-SCHEMA-CREW-001", "crew golden document decodes", async () => {
    await api.get("health");
    const fixture = (await import("../../fixtures/golden-crew.json", { with: { type: "json" } })).default;
    await decode(Schemas.Crew, fixture);
    expect(fixture.kind).toBe("crew");
  });

  testCase("CONTRACT-SCHEMA-CLOCK-001", "clock golden document decodes", async () => {
    await api.get("health");
    const fixture = (await import("../../fixtures/golden-clock.json", { with: { type: "json" } })).default;
    await decode(Schemas.Clock, fixture);
    expect(fixture.kind).toBe("clock");
  });
});
