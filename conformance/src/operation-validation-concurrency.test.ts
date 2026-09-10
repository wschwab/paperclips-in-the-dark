import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("[TOOLING-VALIDATION-CONCURRENCY-001] keeps disjoint valid field sets task-local", () => {
  const cwd = fileURLToPath(new URL("../../backend-ada/server/", import.meta.url));
  const build = spawnSync("alr", [
    "--non-interactive", "exec", "--", "gprbuild", "-p",
    "-P", "validator_concurrency_tests.gpr",
  ], {
    cwd,
    env: { ...process.env, XDG_RUNTIME_DIR: "/tmp" },
    encoding: "utf8",
  });
  expect(build.error, build.stdout + build.stderr).toBeUndefined();
  expect(build.status, build.stdout + build.stderr).toBe(0);

  const run = spawnSync("./bin/validator_concurrency", [], { cwd, encoding: "utf8" });
  expect(run.error, run.stdout + run.stderr).toBeUndefined();
  expect(run.status, run.stdout + run.stderr).toBe(0);
  expect(run.stdout).toContain("validator concurrency: PASS (2 deterministic + 64000 valid checks");
}, 120_000);
