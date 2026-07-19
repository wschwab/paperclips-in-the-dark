import { startHttpStdioShim } from "./stdio-shim.js";

function option(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const command = option("--command");
if (!command) {
  console.error("usage: pitd-http-stdio-shim --command <stdio-backend> [--port <port>] [-- <args...>]");
  process.exit(2);
}

const separator = process.argv.indexOf("--");
const args = separator >= 0 ? process.argv.slice(separator + 1) : [];
const shim = await startHttpStdioShim({
  command,
  args,
  port: Number(option("--port", "9657")),
  host: option("--host", "127.0.0.1"),
});
console.log(JSON.stringify({ status: "listening", port: shim.port }));
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await shim.close();
    process.exit(0);
  });
}
await new Promise<void>(() => undefined);
