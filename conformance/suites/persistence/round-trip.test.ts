import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { decode, Schemas } from "../../src/schemas.js";
import { testCase } from "../../src/test-case.js";
import { newCharacter, newCrew } from "../../src/suite-helpers.js";

describe("persistence round-trip identity", () => {
  testCase("PERSISTENCE-ROUND-TRIP-001", "character GET and download export are byte-identical", async () => {
    const character = await newCharacter();
    const current = await api.get(`characters/${character.id}`);
    const download = await api.get(`characters/${character.id}?download=1`);
    expect(current.status).toBe(200);
    expect(download.status).toBe(200);
    await decode(Schemas.Character, current.body);
    await decode(Schemas.Character, download.body);
    expect(download.rawBody).toBe(current.rawBody);
    expect(download.headers.get("content-disposition")).toContain("attachment");
  });

  testCase("PERSISTENCE-ROUND-TRIP-002", "crew GET and download export preserve the full DTO", async () => {
    const crew = await newCrew();
    const current = await api.get(`crews/${crew.id}`);
    const download = await api.get(`crews/${crew.id}?download=1`);
    expect(current.status).toBe(200);
    expect(download.status).toBe(200);
    await decode(Schemas.Crew, current.body);
    expect(download.rawBody).toBe(current.rawBody);
  });
});
