import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { decode, Schemas } from "../../src/schemas.js";
import { testCase } from "../../src/test-case.js";
import { newCharacter, newCrew } from "../../src/suite-helpers.js";

describe("persistence history and undo", () => {
  testCase("PERSISTENCE-HISTORY-001", "snapshot-worthy character mutations create history entries", async () => {
    const character = await newCharacter();
    const changed = await api.characterOp(character.id, "stress.add", { delta: 1 });
    expect(changed.ok).toBe(true);
    const response = await api.get(`characters/${character.id}/history`);
    expect(response.status).toBe(200);
    const history = await decode(Schemas.History, response.body);
    expect(history.length).toBeGreaterThan(0);
    expect(history[0]?.op).toBe("stress.add");
  });

  testCase("PERSISTENCE-HISTORY-002", "undo restores the pre-operation character and consumes the snapshot", async () => {
    const character = await newCharacter();
    const changed = await api.characterOp(character.id, "stress.add", { delta: 1 });
    expect(changed.ok).toBe(true);
    const undone = await api.post(`characters/${character.id}/undo`);
    expect(undone.status).toBe(200);
    const result = await api.operation(undone);
    expect(result.ok).toBe(true);
    expect(result.character?.monitor.stress.current).toBe(character.monitor.stress.current);
    const history = await api.get(`characters/${character.id}/history`);
    expect((await decode(Schemas.History, history.body)).length).toBe(0);
  });

  testCase("PERSISTENCE-HISTORY-003", "crew history is entity-scoped", async () => {
    const crew = await newCrew();
    const changed = await api.crewOp(crew.id, "heat.add", { delta: 1 });
    expect(changed.ok).toBe(true);
    const history = await api.get(`crews/${crew.id}/history`);
    expect(history.status).toBe(200);
    expect((await decode(Schemas.History, history.body)).length).toBeGreaterThan(0);
  });
});
