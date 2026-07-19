import readline from "node:readline";

const input = readline.createInterface({ input: process.stdin });
input.on("line", (line) => {
  const request = JSON.parse(line);
  process.stdout.write(
    JSON.stringify({
      id: request.id,
      status: 200,
      headers: { "content-type": "application/json" },
      body: { ok: true, method: request.method, path: request.path },
    }) + "\n",
  );
});
