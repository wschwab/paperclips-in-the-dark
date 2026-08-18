// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Effect, Either } from "effect";
import {
  importPreview,
  importApply,
  repairPreview,
  repairApply,
  deleteEntity,
  NormalizationRequiredError,
  NeedsInputError,
  InvalidEntryError,
  InvalidEntityError,
  StaleStateError,
  NotFoundError,
} from "./import-repair.js";

const ID = "c46ba7cb-993b-4fc7-974d-fb95eacd5446";

const json = (status: number, data: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(data),
});

const run = <E, A>(effect: Effect.Effect<A, E>) =>
  Effect.runPromise(Effect.either(effect));

function errorBody(code: string, status: number, details: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  return { ok: false, error: { code, status, message: `${code} msg`, retryable: true, recovery: "recover", details, ...extra } };
}

describe("import-repair client (SC-F2)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("importPreview decodes a 200 PreviewResult with a token", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      json(200, { changes: [], warnings: [], canonical: true, previewToken: "tok", document: {} }),
    );
    const res = await run(importPreview("character", ID, { dossier: {} }));
    expect(Either.isRight(res)).toBe(true);
    if (Either.isRight(res)) {
      expect(res.right.canonical).toBe(true);
      expect(res.right.previewToken).toBe("tok");
    }
  });

  it("importPreview turns a NORMALIZATION_REQUIRED 409 into a NormalizationRequiredError carrying warnings", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      json(409, errorBody("NORMALIZATION_REQUIRED", 409, { warnings: ["w1"], previewToken: "tok" }, {
        preview: { changes: [], warnings: ["w1"], previewToken: "tok", canonical: false, document: {} },
        token: "tok",
      })),
    );
    const res = await run(importPreview("character", ID, { dossier: {} }));
    expect(Either.isLeft(res)).toBe(true);
    if (Either.isLeft(res)) {
      expect(res.left).toBeInstanceOf(NormalizationRequiredError);
      expect((res.left as NormalizationRequiredError).preview.warnings).toEqual(["w1"]);
      expect((res.left as NormalizationRequiredError).preview.previewToken).toBe("tok");
    }
  });

  it("importPreview turns a needs-input preview into a NeedsInputError listing pointers", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      json(409, errorBody("NORMALIZATION_REQUIRED", 409, { warnings: [], previewToken: "tok" }, {
        preview: { changes: [], warnings: [], needsInputPointers: ["/dossier/name"], previewToken: "tok", canonical: false, document: {} },
        token: "tok",
      })),
    );
    const res = await run(importPreview("character", ID, { dossier: {} }));
    expect(Either.isLeft(res)).toBe(true);
    if (Either.isLeft(res)) {
      expect(res.left).toBeInstanceOf(NeedsInputError);
      expect((res.left as NeedsInputError).pointers).toEqual(["/dossier/name"]);
    }
  });

  it("importPreview surfaces INVALID_ENTRY issues from a 400", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      json(400, errorBody("INVALID_ENTRY", 400, { issues: [{ pointer: "/dossier/name", reason: "r", expected: "e" }] })),
    );
    const res = await run(importPreview("character", ID, {}));
    expect(Either.isLeft(res)).toBe(true);
    if (Either.isLeft(res)) {
      expect(res.left).toBeInstanceOf(InvalidEntryError);
      expect((res.left as InvalidEntryError).issues[0]?.pointer).toBe("/dossier/name");
    }
  });

  it("importApply returns an ApplyResult on 200", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      json(200, { ok: true, applied: { op: "importCharacter" }, sideEffects: [], character: { id: ID, revision: 13, dossier: { name: "Sable" } }, error: null }),
    );
    const res = await run(importApply("character", ID, { dossier: {} }, "12", "tok"));
    expect(Either.isRight(res)).toBe(true);
    if (Either.isRight(res)) {
      expect(res.right.name).toBe("Sable");
      expect(res.right.id).toBe(ID);
      expect(res.right.revision).toBe(13);
    }
  });

  it("importApply maps a 409 STALE_REVISION to StaleStateError with currentContentToken", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      json(409, errorBody("STALE_REVISION", 409, { currentContentToken: `sha256:${"c".repeat(64)}` })),
    );
    const res = await run(importApply("character", ID, { dossier: {} }, "tok", "old-token"));
    expect(Either.isLeft(res)).toBe(true);
    if (Either.isLeft(res)) {
      expect(res.left).toBeInstanceOf(StaleStateError);
      expect((res.left as StaleStateError).currentContentToken).toBe(`sha256:${"c".repeat(64)}`);
    }
  });

  it("repairPreview maps a 422 unreadable row to InvalidEntityError", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      json(422, errorBody("INVALID_ENTITY", 422, { issues: [{ pointer: "", reason: "unparseable", expected: "object" }] })),
    );
    const res = await run(repairPreview("character", ID, `sha256:${"a".repeat(64)}`));
    expect(Either.isLeft(res)).toBe(true);
    if (Either.isLeft(res)) {
      expect(res.left).toBeInstanceOf(InvalidEntityError);
    }
  });

  it("repairApply returns an ApplyResult on 200", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      json(200, { ok: true, applied: { op: "repairCharacter" }, sideEffects: [], character: { id: ID, revision: 14, dossier: { name: "Sable" } }, error: null }),
    );
    const res = await run(repairApply("character", ID, `sha256:${"a".repeat(64)}`, "tok-r"));
    expect(Either.isRight(res)).toBe(true);
    if (Either.isRight(res)) {
      expect(res.right.revision).toBe(14);
    }
  });

  it("deleteEntity resolves on 200 and maps 404 to NotFoundError", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(json(200, { ok: true, applied: { op: "deleteCharacter" }, sideEffects: [], error: null }));
    const okRes = await run(deleteEntity("character", ID, `sha256:${"a".repeat(64)}`));
    expect(Either.isRight(okRes)).toBe(true);

    global.fetch = vi.fn().mockResolvedValue(json(404, errorBody("NOT_FOUND", 404)));
    const nfRes = await run(deleteEntity("character", ID, `sha256:${"a".repeat(64)}`));
    expect(Either.isLeft(nfRes)).toBe(true);
    if (Either.isLeft(nfRes)) {
      expect(nfRes.left).toBeInstanceOf(NotFoundError);
    }
  });

  it("deleteEntity sends the deleteToken as If-Match with confirm:true", async () => {
    const mockFetch = vi.fn().mockResolvedValue(json(200, { ok: true, applied: { op: "deleteCharacter" }, sideEffects: [], error: null }));
    global.fetch = mockFetch as unknown as typeof fetch;
    await run(deleteEntity("character", ID, `sha256:${"a".repeat(64)}`));
    const call = mockFetch.mock.calls[0];
    expect((call[1]?.headers as Record<string, string> | undefined)?.["If-Match"]).toBe(`sha256:${"a".repeat(64)}`);
    expect(JSON.parse(String(call[1]?.body))).toEqual({ confirm: true });
  });
});
