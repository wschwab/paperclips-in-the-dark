import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildChildEnv,
  childExitCode,
  defaultPaths,
  isSubpath,
  parseArgs,
  pickPort,
  PORT_RETRY_ATTEMPTS,
  seedDataDir,
  signalExitCode,
  usage,
} from "../scripts/managed-browser-smoke.mjs";

// ---------------------------------------------------------------------------
// Wave-0 tooling tests: the managed browser-smoke launcher. These are pure tests:
// they exercise the launcher's parsing, child-env construction, path-safety, and
// exit-code helpers plus byte-exact seeding against temp fixtures — never a live
// server, never real campaign-data. The launcher's server lifecycle is shared with
// managed-run.mjs and exercised by that suite; the browser-smoke unit surface here is
// the option grammar, the three-variable child environment contract, and the path/exit
// helpers that keep the launcher's owned cleanup exact.
// ---------------------------------------------------------------------------

describe("Wave-0 managed browser-smoke launcher", () => {
  it("[TOOLING-BROWSER-001] parses options before the first -- and the command after it verbatim", () => {
    // The first -- separates launcher options from the required command.
    const opts = parseArgs(["--server", "srv", "--seed", "a", "--seed", "b", "--timeout", "5000", "--keep", "--", "cmd", "--flag", "arg"]);
    expect(opts.server).toBe("srv");
    expect(opts.seeds).toEqual(["a", "b"]);
    expect(opts.timeoutMs).toBe(5000);
    expect(opts.keep).toBe(true);
    expect(opts.build).toBe(false);
    // Everything after the first -- is the command verbatim, including further --
    // tokens (the command's own flags).
    expect(opts.command).toEqual(["cmd", "--flag", "arg"]);
  });

  it("[TOOLING-BROWSER-002] a required -- command and option validation are enforced", () => {
    expect(parseArgs([]).command).toEqual([]);
    // The command only exists after a --; without one there is no command (and
    // no launcher options are recognized either).
    expect(parseArgs(["--server", "x"]).command).toEqual([]);
    expect(parseArgs(["--keep"]).command).toEqual([]);
    const byDefault = parseArgs(["--keep", "--", "cmd"]);
    expect(byDefault.timeoutMs).toBe(30_000);
    expect(byDefault.server).toBe(null);
    expect(byDefault.keep).toBe(true);
    expect(byDefault.command).toEqual(["cmd"]);
    // A missed value and an unknown option are rejected.
    expect(() => parseArgs(["--server", "--", "cmd"])).toThrow(/missing value/);
    expect(() => parseArgs(["--bogus", "--", "cmd"])).toThrow(/unknown launcher option/);
    expect(() => parseArgs(["--timeout", "0", "--", "cmd"])).toThrow(/positive integer/);
  });

  it("[TOOLING-BROWSER-003] usage documents the -- command contract and default paths sit inside the temp root", () => {
    const u = usage();
    expect(u).toContain("-- <command>");
    expect(u).toContain("--keep");
    expect(u).toContain("BASE_URL");
    expect(u).toContain("PITD_DATA_DIR");
    expect(defaultPaths().managedRoot).toBe(join(tmpdir(), "pitd-managed"));
    expect(defaultPaths().server).toContain(join("backend-ada", "server"));
  });

  it("[TOOLING-BROWSER-004] the child env carries the base URL and data dir under the three documented variables", () => {
    const env = buildChildEnv({ baseUrl: "http://127.0.0.1:9999", dataDir: "/tmp/run/data" });
    expect(env).toEqual({
      BASE_URL: "http://127.0.0.1:9999",
      CONFORMANCE_BASE_URL: "http://127.0.0.1:9999",
      PITD_DATA_DIR: "/tmp/run/data",
    });
  });

  it("[TOOLING-BROWSER-005] isSubpath treats the separator as a plain string, never matching a sibling prefix", () => {
    const root = join(tmpdir(), "pitd-managed");
    // The separator is a literal string, so a sibling whose name merely starts with
    // root + something-other-than-sep is NOT inside root.
    expect(isSubpath(root, join(root, "run-123", "data"))).toBe(true);
    expect(isSubpath(root, `${root}${sep}run-123`)).toBe(true);
    expect(isSubpath(root, `${root}-other`)).toBe(false);
    // Equality is not "inside".
    expect(isSubpath(root, root)).toBe(false);
    expect(isSubpath(root, resolve(root))).toBe(false);
    // Relative and dot segments are resolved before comparing.
    expect(isSubpath(join(tmpdir(), "a"), join(tmpdir(), "a", "..", "a", "b"))).toBe(true);
  });

  it("[TOOLING-BROWSER-006] exit helpers translate signals and codes into launcher exit codes", () => {
    expect(signalExitCode("SIGINT")).toBe(130);
    expect(signalExitCode("SIGTERM")).toBe(143);
    expect(signalExitCode("SIGKILL")).toBe(137);
    // Unknown signals fall back to 128+1.
    expect(signalExitCode("SIGBOGUS")).toBe(129);
    expect(childExitCode(0, null)).toBe(0);
    expect(childExitCode(3, null)).toBe(3);
    expect(childExitCode(null, "SIGINT")).toBe(130);
    expect(childExitCode(null, null)).toBe(1);
  });

  it("[TOOLING-BROWSER-007] seeding copies exact bytes for files and directories into a temp data dir", async () => {
    const root = await mkdtemp(join(tmpdir(), "wave0-browser-seed-"));
    try {
      const fixtureSet = join(root, "fixture-set");
      const nested = join(fixtureSet, "characters", "00000000-0000-4000-8000-000000000000");
      await mkdir(nested, { recursive: true });
      await writeFile(join(fixtureSet, "campaign.json"), '{"kind":"campaign","formatVersion":1}\n');
      await writeFile(join(nested, "character.json"), Buffer.from([0x00, 0x7f, 0x80, 0xff, 0x0a]));
      const extraFile = join(root, "extra-file.bin");
      await writeFile(extraFile, Buffer.from([0x01, 0x02, 0x03, 0x00, 0xff]));

      const dataDir = join(root, "data");
      const seeded = await seedDataDir(dataDir, [fixtureSet, extraFile]);
      expect(seeded).toHaveLength(2);
      expect(await readFile(join(dataDir, "campaign.json"), "utf8")).toBe('{"kind":"campaign","formatVersion":1}\n');
      expect(await readFile(join(dataDir, "characters", "00000000-0000-4000-8000-000000000000", "character.json"))).toEqual(
        Buffer.from([0x00, 0x7f, 0x80, 0xff, 0x0a]),
      );
      expect(await readFile(join(dataDir, "extra-file.bin"))).toEqual(Buffer.from([0x01, 0x02, 0x03, 0x00, 0xff]));
      await expect(seedDataDir(dataDir, [join(root, "missing-source")])).rejects.toThrow(/not found/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("[TOOLING-BROWSER-008] port probing yields distinct unused loopback ports", async () => {
    const ports = await Promise.all(Array.from({ length: 5 }, () => pickPort()));
    for (const port of ports) {
      expect(Number.isInteger(port)).toBe(true);
      expect(port).toBeGreaterThan(0);
      expect(port).toBeLessThanOrEqual(65_535);
    }
    expect(new Set(ports).size).toBeGreaterThan(1);
    expect(PORT_RETRY_ATTEMPTS).toBeGreaterThan(0);
  });
});
