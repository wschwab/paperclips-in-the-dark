// @vitest-environment node
import { describe, it, expect } from "vitest";
import { checkCommand } from "../scripts/workflow-isolation-guard.mjs";

describe("workflow-isolation-guard", () => {
  it("fails when a direct server command points to a temp directory", () => {
    const result = checkCommand(["pitd", "--data", "/tmp/pitd-test-123", "--port", "9670"]);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("managed-run launcher");
  });

  it("fails when --data is not present", () => {
    const result = checkCommand(["pitd", "--port", "9670"]);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("managed-run launcher");
  });

  it("passes for the canonical managed-run launcher without caller-provided --data", () => {
    const result = checkCommand(["conformance/scripts/managed-run.mjs", "pitd", "--port", "9670"]);
    expect(result.ok).toBe(true);
    expect(result.reason).toContain("managed-run launcher");
  });

  it("passes for node invoking the canonical managed-run launcher", () => {
    const result = checkCommand(["node", "conformance/scripts/managed-run.mjs", "--run"]);
    expect(result.ok).toBe(true);
    expect(result.reason).toContain("managed-run launcher");
  });

  it("fails for a lookalike managed-run script without caller-provided --data", () => {
    const result = checkCommand(["conformance/scripts/managed-run-lookalike.mjs", "pitd", "--port", "9670"]);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("managed-run launcher");
  });

  it("fails when --data points to data/games", () => {
    const result = checkCommand(["pitd", "--data", "data/games", "--port", "9670"]);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("managed-run launcher");
  });

  it("fails when --data points to campaign-data", () => {
    const result = checkCommand(["pitd", "--data", "campaign-data", "--port", "9670"]);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("managed-run launcher");
  });

  it("fails when --data=<path> form points to forbidden path", () => {
    const result = checkCommand(["pitd", "--data=data/games", "--port", "9670"]);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("managed-run launcher");
  });

  it("passes in manual mode even with forbidden path", () => {
    const result = checkCommand(["pitd", "--data", "data/games"], { manual: true });
    expect(result.ok).toBe(true);
    expect(result.reason).toBe("manual mode");
  });

  it("fails when a direct server command points to a subdirectory of /tmp", () => {
    const result = checkCommand(["pitd", "--data", "/tmp/pitd-managed/run-1"]);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("managed-run launcher");
  });

  it("fails when a direct server command points to an arbitrary repository path", () => {
    const result = checkCommand(["pitd", "--data", "tmp/pitd-managed/run-1"]);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("managed-run launcher");
  });

  it("fails when a direct server command points to /var/tmp", () => {
    const result = checkCommand(["pitd", "--data", "/var/tmp/pitd-managed/run-1"]);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("managed-run launcher");
  });
});
