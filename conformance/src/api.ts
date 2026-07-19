import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { decode, Schemas, type CharacterDto, type ClockDto, type CrewDto, type OperationResultDto } from "./schemas.js";

export interface HttpResponse {
  status: number;
  headers: Headers;
  body: unknown;
  rawBody: string;
}

export class HttpRequestError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "HttpRequestError";
  }
}

function apiRoot(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
}

function jsonParse(raw: string): unknown {
  if (raw.trim() === "") return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function requestErrorDetail(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const nested = "cause" in error ? error.cause : undefined;
  if (nested && typeof nested === "object" && "code" in nested) {
    return `${error.message} (${String(nested.code)})`;
  }
  return error.message;
}

export class PitdApi {
  readonly baseUrl: string;
  constructor(baseUrl = process.env.CONFORMANCE_BASE_URL ?? process.env.BASE_URL ?? "http://localhost:9657") {
    this.baseUrl = apiRoot(baseUrl);
  }

  async request(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<HttpResponse> {
    const url = `${this.baseUrl}/${path.replace(/^\/+/, "")}`;
    const requestHeaders = new Headers({ accept: "application/json", ...headers });
    const init: RequestInit = { method, headers: requestHeaders };
    if (body !== undefined) {
      requestHeaders.set("content-type", "application/json");
      init.body = JSON.stringify(body);
    }

    const effect = Effect.tryPromise({
      try: async () => {
        const response = await fetch(url, init);
        const rawBody = await response.text();
        return { status: response.status, headers: response.headers, body: jsonParse(rawBody), rawBody };
      },
      catch: (error) => new HttpRequestError(`${method} ${url}: ${requestErrorDetail(error)}`, error),
    });
    return Effect.runPromise(effect);
  }

  async get(path: string, headers: Record<string, string> = {}): Promise<HttpResponse> {
    return this.request("GET", path, undefined, headers);
  }

  async post(path: string, body?: unknown, headers: Record<string, string> = {}): Promise<HttpResponse> {
    return this.request("POST", path, body, headers);
  }

  async health(): Promise<Schema.Schema.Type<typeof Schemas.Health>> {
    const response = await this.get("health");
    return decode(Schemas.Health, response.body);
  }

  async operation(response: HttpResponse): Promise<OperationResultDto> {
    return decode(Schemas.OperationResult, response.body);
  }

  async createCharacter(gameStem: string, playbook: string): Promise<OperationResultDto> {
    return this.operation(await this.post("characters", { gameStem, playbook }));
  }

  async createCrew(gameStem: string, crewType: string): Promise<OperationResultDto> {
    return this.operation(await this.post("crews", { gameStem, crewType }));
  }

  async createClock(name: string, clockKind: "project" | "rollover", size: number): Promise<OperationResultDto> {
    return this.operation(await this.post("clocks", { name, clockKind, size }));
  }

  async character(id: string): Promise<CharacterDto> {
    return decode(Schemas.Character, (await this.get(`characters/${encodeURIComponent(id)}`)).body);
  }

  async crew(id: string): Promise<CrewDto> {
    return decode(Schemas.Crew, (await this.get(`crews/${encodeURIComponent(id)}`)).body);
  }

  async clock(id: string): Promise<ClockDto> {
    return decode(Schemas.Clock, (await this.get(`clocks/${encodeURIComponent(id)}`)).body);
  }

  async characterOp(id: string, operation: string, body?: unknown, revision?: number): Promise<OperationResultDto> {
    const headers: Record<string, string> = revision === undefined ? {} : { "If-Match": String(revision) };
    return this.operation(await this.post(`characters/${encodeURIComponent(id)}/ops/${operation}`, body, headers));
  }

  async crewOp(id: string, operation: string, body?: unknown, revision?: number): Promise<OperationResultDto> {
    const headers: Record<string, string> = revision === undefined ? {} : { "If-Match": String(revision) };
    return this.operation(await this.post(`crews/${encodeURIComponent(id)}/ops/${operation}`, body, headers));
  }
}

export const api = new PitdApi();
