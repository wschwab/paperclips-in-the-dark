import { describe, expect, it } from "vitest";
import { validate } from "./contract-validator.js";

const uuid = "3f9c1c9a-2f6b-4e7f-8a1b-1c2d3e4f5a6b";
const timestamp = "2026-08-21T12:00:00Z";

/** A structurally valid characterSummary (all required fields, correct types/bounds). */
function makeCharacterSummary(overrides: Record<string, unknown> = {}) {
  return {
    kind: "character",
    id: uuid,
    name: "The Falcon",
    alias: "Fal",
    playbook: "Cutter",
    gameStem: "blades-in-the-dark",
    crewId: uuid,
    stress: 0,
    traumas: [],
    isRetired: false,
    isDeadish: false,
    revision: 1,
    isReadable: true,
    isRepairable: false,
    isComplete: true,
    deleteToken: "",
    canUndo: false,
    historyCount: 0,
    ...overrides,
  };
}

/** A structurally valid crewSummary (all required fields, correct types/bounds). */
function makeCrewSummary(overrides: Record<string, unknown> = {}) {
  return {
    kind: "crew",
    id: uuid,
    name: "The Vipers",
    crewType: "Hunters",
    gameStem: "blades-in-the-dark",
    tier: 1,
    heat: 0,
    wanted: 0,
    rep: 1,
    hold: "strong",
    memberCount: 1,
    revision: 1,
    isReadable: true,
    isRepairable: false,
    isComplete: true,
    deleteToken: "",
    canUndo: false,
    historyCount: 0,
    ...overrides,
  };
}

describe("contract-validator oracle calibration", () => {
  it("[ORACLE-CAL-001] rejects a summary missing a required property (crewSummary without canUndo)", () => {
    const value = makeCrewSummary();
    const { canUndo: _omit, ...withoutCanUndo } = value;
    const result = validate("crewSummary", withoutCanUndo);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => JSON.stringify(e).includes("canUndo"))).toBe(true);
  });


  it("[ORACLE-CAL-002] rejects an excess property (characterSummary with extra 'foo')", () => {
    const value = makeCharacterSummary({ foo: "bar" });
    const result = validate("characterSummary", value);
    expect(result.valid).toBe(false);
  });

  it("[ORACLE-CAL-003] rejects a wrong nested primitive type (stress as string)", () => {
    const value = makeCharacterSummary({ stress: "0" });
    const result = validate("characterSummary", value);
    expect(result.valid).toBe(false);
  });

  it("[ORACLE-CAL-004] rejects a wrong enum (hold as 'medium')", () => {
    const value = makeCrewSummary({ hold: "medium" });
    const result = validate("crewSummary", value);
    expect(result.valid).toBe(false);
  });

  it("[ORACLE-CAL-005] rejects an out-of-bound number (stress -1)", () => {
    const value = makeCharacterSummary({ stress: -1 });
    const result = validate("characterSummary", value);
    expect(result.valid).toBe(false);
  });

  it("[ORACLE-CAL-006] rejects a full character DTO where a summary is declared", () => {
    const value = makeCharacterSummary({ dossier: {}, monitor: {}, talent: {} });
    const result = validate("characterSummary", value);
    expect(result.valid).toBe(false);
  });

  it("[ORACLE-CAL-007] rejects an unknown error branch (operationError with code UNKNOWN_CODE)", () => {
    const value = {
      code: "UNKNOWN_CODE",
      status: 400,
      message: "boom",
      retryable: false,
      recovery: "retry",
      details: {},
    };
    const result = validate("operationError", value);
    expect(result.valid).toBe(false);
  });

  it("[ORACLE-CAL-008] accepts a valid characterSummary (positive control)", () => {
    const result = validate("characterSummary", makeCharacterSummary());
    expect(result.valid).toBe(true);
  });

  it("[ORACLE-CAL-009] accepts a valid crewSummary with canUndo:true, historyCount:1 (positive control)", () => {
    const value = makeCrewSummary({ canUndo: true, historyCount: 1 });
    const result = validate("crewSummary", value);
    expect(result.valid).toBe(true);
  });

  it("[ORACLE-CAL-010] rejects a campaign missing formatVersion", () => {
    const value = { kind: "campaign", name: "You and Yours", gameStem: "blades-in-the-dark", createdAt: timestamp };
    const result = validate("campaign", value);
    expect(result.valid).toBe(false);
  });

  it("[ORACLE-CAL-011] rejects a malformed UUID", () => {
    const value = makeCharacterSummary({ id: "not-a-uuid" });
    const result = validate("characterSummary", value);
    expect(result.valid).toBe(false);
  });

  it("[ORACLE-CAL-012] rejects a malformed timestamp (space separator instead of T)", () => {
    const validCampaign = {
      kind: "campaign",
      name: "You and Yours",
      gameStem: "blades-in-the-dark",
      createdAt: "2026-08-21T12:00:00Z",
      formatVersion: 1,
    };
    expect(validate("campaign", validCampaign).valid).toBe(true);
    const malformed = { ...validCampaign, createdAt: "2026-08-21 12:00:00Z" };
    const result = validate("campaign", malformed);
    expect(result.valid).toBe(false);
  });
});
