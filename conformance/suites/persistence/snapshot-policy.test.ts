import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { decode, Schemas } from "../../src/schemas.js";
import { testCase } from "../../src/test-case.js";
import { newCharacter, revisionHeader } from "../../src/suite-helpers.js";

describe("persistence snapshot policy", () => {
  testCase(
    "PERSISTENCE-SNAPSHOT-001",
    "micro-ops declared x-snapshot:false leave no history entry",
    async () => {
      const character = await newCharacter();
      const empty = await decode(Schemas.History, (await api.get(`characters/${character.id}/history`)).body);
      expect(empty).toEqual([]);

      const response = await api.post(`characters/${character.id}/ops/armor.set`, { armor: "standard", used: false });
      expect(response.status).toBe(200);
      const result = await api.operation(response);
      expect(result.ok).toBe(true);
      expect(result.character?.monitor.armor.standardUsed).toBe(false);
      expect(result.character?.revision).toBe(character.revision + 1);

      const history = await decode(Schemas.History, (await api.get(`characters/${character.id}/history`)).body);
      expect(history).toEqual([]);
    },
  );

  testCase(
    "PERSISTENCE-SNAPSHOT-002",
    "retention keeps the newest 50 snapshots in newest-first order",
    async () => {
      const character = await newCharacter();
      for (let index = 0; index < 55; index += 1) {
        // note.add/dossier.update are both snapshot-worthy and never gate:
        // stress.add would stop snapshotting once stress lands at max (the
        // frozen lifecycle raises traumaPending and gates further adds with
        // TRAUMA_REQUIRED — LIFECYCLE-STRESS-003), which would make the
        // retained count depend on trauma semantics instead of retention.
        const operation = index % 2 === 0 ? "note.add" : "dossier.update";
        const body = operation === "note.add" ? { text: `n${index}` } : { name: `Name ${index}` };
        const response = await api.post(`characters/${character.id}/ops/${operation}`, body);
        expect(response.status).toBe(200);
      }

      const history = await decode(Schemas.History, (await api.get(`characters/${character.id}/history`)).body);
      expect(history).toHaveLength(50);
      expect(new Set(history.map((entry) => entry.snapshotId)).size).toBe(50);
      expect(history[0]?.op).toBe("note.add");
      expect(history[history.length - 1]?.op).toBe("dossier.update");

      const current = await api.character(character.id);
      expect(current.revision).toBe(character.revision + 55);
    },
  );

  testCase(
    "PERSISTENCE-SNAPSHOT-003",
    "consecutive undos restore the last two known states in reverse order",
    async () => {
      const character = await newCharacter();
      const texts = ["a", "b", "c", "d", "e"];
      const states: string[][] = [];
      for (const text of texts) {
        const result = await api.characterOp(character.id, "note.add", { text });
        expect(result.ok).toBe(true);
        if (result.character) states.push([...result.character.dossier.notes]);
      }
      expect(states).toEqual([
        ["a"],
        ["a", "b"],
        ["a", "b", "c"],
        ["a", "b", "c", "d"],
        ["a", "b", "c", "d", "e"],
      ]);

      const firstUndo = await api.post(`characters/${character.id}/undo`, undefined, revisionHeader(character.revision + texts.length));
      expect(firstUndo.status).toBe(200);
      const firstResult = await api.operation(firstUndo);
      expect(firstResult.ok).toBe(true);
      expect(firstResult.character?.dossier.notes).toEqual(states[3]);

      const secondUndo = await api.post(
        `characters/${character.id}/undo`,
        undefined,
        revisionHeader(firstResult.character?.revision ?? character.revision + texts.length + 1),
      );
      expect(secondUndo.status).toBe(200);
      const secondResult = await api.operation(secondUndo);
      expect(secondResult.ok).toBe(true);
      expect(secondResult.character?.dossier.notes).toEqual(states[2]);

      const history = await decode(Schemas.History, (await api.get(`characters/${character.id}/history`)).body);
      expect(history).toHaveLength(3);
    },
  );
});
