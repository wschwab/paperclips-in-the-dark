import { spawn } from "node:child_process";

const cwd = new URL("./stdio-child-attempt-20260721T1756-560795/", import.meta.url).pathname;
const child = spawn("./run.sh", [], { cwd, stdio: ["pipe", "pipe", "pipe"] });
const childPid = child.pid;
let output = "";
let stderr = "";
child.stdout.on("data", (chunk) => { output += chunk; });
child.stderr.on("data", (chunk) => { stderr += chunk; });
child.stdin.on("error", () => {});
child.stdin.write('{"id":"stream-1","method":"GET","path":"/api/health","headers":{},"body":null}\n');
await new Promise((resolve) => setTimeout(resolve, 2000));
const beforeClose = output;
if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
await new Promise((resolve) => setTimeout(resolve, 200));
console.log(JSON.stringify({ childPid, beforeClose, stderr, stopped: child.exitCode !== null || child.signalCode !== null }));
