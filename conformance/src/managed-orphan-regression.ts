import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "vitest";

// Shared assertion used by the SIGINT worker cleanup check and its controls.
export async function assertOwnedProcessesStopped(pids: number[]): Promise<void> {
  expect(pids, "owned process inventory must not be empty").not.toEqual([]);
  for (const pid of pids) {
    let alive = true;
    try { process.kill(pid, 0); } catch { alive = false; }
    expect(alive, `owned process PID ${pid} survived cleanup`).toBe(false);
  }
}

// Exercise each suite's actual orphan assertion against a launcher-owned live
// server (the leaked-server positive control), then its stopped PID while a
// separately owned process with the old pgrep substring remains alive.
export async function checkOrphanAssertionIsolation(
  launcher: string,
  prefix: string,
  command: string[],
  assertNoOrphanServers: (stdout: string) => Promise<void>,
  unrelatedArgs: string[] = ["pitd-managed-review01-unrelated"],
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "orphan-isolation-"));
  let child: ChildProcess | undefined;
  let childExit: Promise<unknown> | undefined;
  let unrelated: ChildProcess | undefined;
  let unrelatedExit: Promise<unknown> | undefined;
  let stdout = "";
  try {
    const server = join(root, "waiting-server.mjs");
    await writeFile(server, "#!/usr/bin/env node\nsetInterval(() => {}, 1000);\n");
    await chmod(server, 0o755);
    child = spawn(process.execPath, [launcher, "--server", server, "--timeout", "30000", "--", ...command]);
    childExit = once(child, "exit");
    child.stdout!.on("data", (data) => { stdout += data.toString(); });
    child.stderr!.resume();
    const pidPattern = new RegExp(`\\[${prefix}\\] pid=(\\d+)\\r?\\n`);
    await expect.poll(() => pidPattern.test(stdout), { timeout: 10_000 }).toBe(true);
    const pid = Number(pidPattern.exec(stdout)![1]);
    process.kill(pid, 0);
    // A no-op, empty PID set, or unrelated-process-only filter cannot pass this.
    await expect(assertNoOrphanServers(stdout)).rejects.toThrow(String(pid));
    unrelated = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)", ...unrelatedArgs], { stdio: "ignore" });
    unrelatedExit = once(unrelated, "exit");
    await once(unrelated, "spawn");
    child.kill("SIGTERM");
    await childExit;
    process.kill(unrelated.pid!, 0);
    await assertNoOrphanServers(stdout);
    // The assertion must observe, never terminate, the unrelated process.
    process.kill(unrelated.pid!, 0);
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    if (childExit) await childExit;
    if (unrelated && unrelated.exitCode === null && unrelated.signalCode === null) unrelated.kill("SIGTERM");
    if (unrelatedExit) await unrelatedExit;
    await rm(root, { recursive: true, force: true });
  }
}
