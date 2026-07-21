import { spawn } from "node:child_process";

const root = new URL("../../", import.meta.url).pathname;
const command = new URL("./stdio-child-attempt-20260721T1756-560795/run.sh", import.meta.url).pathname;
const port = "19658";
const shim = spawn(process.execPath, [
  "conformance/node_modules/tsx/dist/cli.mjs",
  "conformance/src/stdio-shim-cli.ts",
  "--command", command,
  "--port", port,
], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
let stdout = "";
let stderr = "";
shim.stdout.on("data", (chunk) => { stdout += chunk; });
shim.stderr.on("data", (chunk) => { stderr += chunk; });
await new Promise((resolve) => setTimeout(resolve, 500));
let result = "unobserved";
try {
  await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(2000) });
  result = "response received";
} catch (error) {
  result = error instanceof Error ? error.name + ": " + error.message : String(error);
}
const shimPid = shim.pid;
if (shim.exitCode === null && shim.signalCode === null) shim.kill("SIGTERM");
await new Promise((resolve) => setTimeout(resolve, 300));
console.log(JSON.stringify({ shimPid, result, stdout, stderr, stopped: shim.exitCode !== null || shim.signalCode !== null }));
