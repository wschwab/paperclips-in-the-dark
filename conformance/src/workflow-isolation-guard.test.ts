// @vitest-environment node
import { describe, it, expect } from "vitest";
import { checkCommand } from "../scripts/workflow-isolation-guard.mjs";

describe("workflow-isolation-guard", () => {
  it("passes when --data points to a temp directory", () => {
    const result = checkCommand(["pitd", "--data", "/tmp/pitd-test-123", "--port", "9670"]);
    expect(result.ok).toBe(true);
    expect(result.reason).toContain("managed temp directory");
  });

  it("fails when --data is not present", () => {
    const result = checkCommand(["pitd", "--port", "9670"]);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("no --data argument");
  });

  it("fails when --data points to data/games", () => {
    const result = checkCommand(["pitd", "--data", "data/games", "--port", "9670"]);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("forbidden default path");
  });

  it("fails when --data points to campaign-data", () => {
    const result = checkCommand(["pitd", "--data", "campaign-data", "--port", "9670"]);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("forbidden default path");
  });

  it("fails when --data=<path> form points to forbidden path", () => {
    const result = checkCommand(["pitd", "--data=data/games", "--port", "9670"]);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("forbidden default path");
  });

  it("passes in manual mode even with forbidden path", () => {
    const result = checkCommand(["pitd", "--data", "data/games"], { manual: true });
    expect(result.ok).toBe(true);
    expect(result.reason).toBe("manual mode");
  });

  it("passes when --data points to a subdirectory of /tmp", () => {
    const result = checkCommand(["pitd", "--data", "/tmp/pitd-managed/run-1"]);
    expect(result.ok).toBe(true);
  });
});
