import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import readline from "node:readline";

export interface StdioShimOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  host?: string;
  port?: number;
}

export interface StdioRequest {
  id: string;
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

export interface StdioResponse {
  id: string;
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
}

interface RunningShim {
  port: number;
  close: () => Promise<void>;
  process: ChildProcessWithoutNullStreams;
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function jsonBody(raw: string): unknown {
  if (raw.trim() === "") return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function writeResponse(response: ServerResponse, result: StdioResponse): void {
  const headers = { "content-type": "application/json", ...(result.headers ?? {}) };
  response.writeHead(result.status, headers);
  response.end(result.body === undefined ? "" : JSON.stringify(result.body));
}

export async function startHttpStdioShim(options: StdioShimOptions): Promise<RunningShim> {
  const child = spawn(options.command, options.args ?? [], {
    cwd: options.cwd,
    env: { ...process.env, ...(options.env ?? {}) },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const lines = readline.createInterface({ input: child.stdout });
  const pending = new Map<string, { resolve: (value: StdioResponse) => void; reject: (error: Error) => void }>();
  let childError: Error | undefined;

  lines.on("line", (line) => {
    try {
      const result = JSON.parse(line) as StdioResponse;
      const waiter = pending.get(result.id);
      if (waiter) {
        pending.delete(result.id);
        waiter.resolve(result);
      }
    } catch (error) {
      childError = error instanceof Error ? error : new Error(String(error));
    }
  });
  child.on("error", (error) => {
    childError = error;
    for (const waiter of pending.values()) waiter.reject(error);
    pending.clear();
  });
  child.on("exit", () => {
    const error = childError ?? new Error("stdio backend exited before responding");
    for (const waiter of pending.values()) waiter.reject(error);
    pending.clear();
  });

  const server: Server = createServer(async (request, response) => {
    try {
      const id = randomUUID();
      const message: StdioRequest = {
        id,
        method: request.method ?? "GET",
        path: request.url ?? "/",
        headers: request.headers,
        body: jsonBody(await readBody(request)),
      };
      const result = await new Promise<StdioResponse>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        child.stdin.write(JSON.stringify(message) + "\n");
      });
      writeResponse(response, result);
    } catch (error) {
      writeResponse(response, {
        id: "shim-error",
        status: 502,
        body: { error: error instanceof Error ? error.message : String(error) },
      });
    }
  });

  server.listen(options.port ?? 0, options.host ?? "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    child.kill();
    throw new Error("HTTP shim did not receive a TCP address");
  }

  return {
    port: address.port,
    process: child,
    close: async () => {
      lines.close();
      if (!child.killed) child.kill();
      await new Promise<void>((resolve) => {
        if (server.listening) server.close(() => resolve());
        else resolve();
      });
    },
  };
}
