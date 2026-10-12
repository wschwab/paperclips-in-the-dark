import { describe, expect } from "vitest";
import { readFileSync } from "node:fs";
import { api } from "../../src/api.js";
import { gameSetting, firstPlaybook } from "../../src/game-data.js";
import { validate } from "../../src/contract-validator.js";
import { testCase } from "../../src/test-case.js";

const catalogue = JSON.parse(readFileSync(new URL("../../../data/games/games.json", import.meta.url), "utf8")) as Array<{ Stem: string }>;
const editions = catalogue.map(({ Stem }) => Stem).sort();

describe("registered game edition creation", () => {
  for (const stem of editions) {
    testCase(`FRENCH-CREATE-EDITION-${stem}`, "registered edition creates a schema-valid scoundrel", async () => {
      const response = await api.post("characters", { gameStem: stem, playbook: firstPlaybook(stem) });
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ ok: true, character: { gameStem: stem, gameName: gameSetting(stem).Name } });
      const result = validate("operationResult", response.body);
      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(true);
      const decoded = await api.operation(response);
      expect(decoded.character?.gameStem).toBe(stem);
    });
  }

  testCase("FRENCH-CREATE-ENVELOPE-001", "edition creation errors and invalid-request controls use consistent existing envelopes", async () => {
    const controls = [
      { body: {}, status: 400, code: "VALIDATION", retryable: true },
      { body: { gameStem: "not-an-installed-game", playbook: "unused" }, status: 200, code: "GAME_NOT_FOUND", retryable: true },
    ];
    for (const control of controls) {
      const response = await api.post("characters", control.body);
      expect(response.status).toBe(control.status);
      expect(response.body).toMatchObject({ ok: false, error: { code: control.code, status: control.status, retryable: control.retryable } });
      expect(validate("operationResult", response.body).valid).toBe(true);
    }
    // Covers the original failure transport independently of the success oracle.
    for (const stem of editions) {
      const response = await api.post("characters", { gameStem: stem, playbook: firstPlaybook(stem) });
      const body = response.body as { ok: boolean; error: null | { status: number; code: string; retryable: boolean } };
      if (!body.ok) {
        expect(body.error).not.toBeNull();
        expect(response.status).toBe(body.error!.status);
        expect(body.error!.retryable).toBe(true);
      }
    }
  });

  testCase("FRENCH-CREATE-STEM-001", "registered stems independently validate on an otherwise valid created DTO", async () => {
    const baselineStem = editions.find((stem) => /^[A-Za-z0-9-]+$/.test(stem));
    if (!baselineStem) throw new Error("Registered catalogue has no ASCII baseline for the isolated stem probe");
    const baseline = await api.createCharacter(baselineStem, firstPlaybook(baselineStem));
    expect(baseline.ok).toBe(true);
    for (const stem of editions) {
      const result = validate("character", { ...baseline.character!, gameStem: stem });
      expect(result.errors, `Only gameStem changed to ${stem}`).toEqual([]);
      expect(result.valid).toBe(true);
    }
  });
});
