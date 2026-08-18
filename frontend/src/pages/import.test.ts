// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mountImportPage } from "./import.js";

const ID = "c46ba7cb-993b-4fc7-974d-fb95eacd5446";

const json = (status: number, data: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(data),
});

const PREVIEW_URL = `/api/characters/${ID}/import?preview=1`;

const preview200 = (token = "tok-1") =>
  json(200, { changes: [], warnings: [], canonical: true, previewToken: token, document: {} });

const applySuccess = () =>
  json(200, {
    ok: true,
    applied: { op: "importCharacter" },
    sideEffects: [],
    character: { id: ID, revision: 13, dossier: { name: "Sable Verity" } },
    error: null,
  });

const normalization409 = (preview: Record<string, unknown>, warnings = ["legacy notes converted"]) =>
  json(409, {
    ok: false,
    error: {
      code: "NORMALIZATION_REQUIRED",
      status: 409,
      message: "Normalization required",
      retryable: true,
      recovery: "Confirm the preview",
      details: { warnings, previewToken: "tok-1" },
      preview: { changes: [], warnings, previewToken: "tok-1", canonical: false, document: {}, ...preview },
      token: "tok-1",
    },
  });

const stale409 = (details: Record<string, unknown>) =>
  json(409, {
    ok: false,
    error: {
      code: "STALE_REVISION",
      status: 409,
      message: "Stale revision",
      retryable: true,
      recovery: "Re-preview",
      details,
      entity: null,
    },
  });

const invalidEntry400 = () =>
  json(400, {
    ok: false,
    error: {
      code: "INVALID_ENTRY",
      status: 400,
      message: "Invalid entry",
      retryable: true,
      recovery: "Fix the submitted fields",
      details: {
        issues: [{ pointer: "/dossier/name", reason: "A character needs a name", expected: "a non-empty string" }],
      },
    },
  });

const invalidEntity422 = () =>
  json(422, {
    ok: false,
    error: {
      code: "INVALID_ENTITY",
      status: 422,
      message: "Stored bytes cannot be normalized",
      retryable: false,
      recovery: "This entry can only be deleted",
      details: { issues: [{ pointer: "", reason: "unparseable", expected: "a character object" }] },
    },
  });

function clickText(root: HTMLElement, text: string): void {
  const nodes = root.querySelectorAll("button");
  const btn = Array.from(nodes).find((b) => b.textContent?.trim() === text);
  if (!btn) throw new Error(`button "${text}" not found`);
  (btn as HTMLButtonElement).click();
}

describe("import page (SC-F2)", () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement("div");
    vi.clearAllMocks();
  });

  const setDoc = (doc: unknown) => {
    const ta = root.querySelector("#import-doc") as HTMLTextAreaElement;
    ta.value = JSON.stringify(doc);
  };

  it("previews then applies an import, showing a success state with the entity (never the raw document)", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) =>
      url === PREVIEW_URL ? Promise.resolve(preview200()) : Promise.resolve(applySuccess()),
    );

    mountImportPage(root, "character", ID, "12");
    setDoc({ dossier: { name: "Sable Verity" } });

    clickText(root, "Preview import");
    await vi.waitFor(() => expect(root.querySelector(".norm-preview")).not.toBeNull());

    // The normalized document is never rendered verbatim, only the panel.
    expect(root.querySelector(".norm-preview")?.textContent).not.toContain("Sable Verity");

    clickText(root, "Confirm import");
    await vi.waitFor(() => expect(root.querySelector(".import-success")).not.toBeNull());
    expect(root.querySelector(".import-success")?.textContent).toContain("Successfully imported Sable Verity");
    expect(root.querySelector(".import-success a.btn-primary")?.getAttribute("href")).toBe(`/character/${ID}`);
  });

  it("surfaces normalization warnings and changes before confirmation", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      normalization409({
        changes: [{ pointer: "/dossier/notes", reason: "legacy conversion", previous: "legacy note", replacement: ["legacy note"] }],
      }),
    );

    mountImportPage(root, "character", ID, "12");
    setDoc({ dossier: { name: "Sable", notes: "legacy note" } });
    clickText(root, "Preview import");

    await vi.waitFor(() => {
      const panel = root.querySelector(".norm-preview");
      expect(panel).not.toBeNull();
      expect(root.querySelector(".norm-warnings")?.textContent).toContain("legacy notes converted");
      expect(root.querySelector(".norm-changes")?.textContent).toContain("/dossier/notes");
      expect(root.querySelector(".norm-changes")?.textContent).toContain("legacy conversion");
      expect(root.querySelector(".norm-preview .btn-primary")?.textContent).toContain("Confirm import");
    });
  });

  it("renders needs-input pointers as editable fields, re-previews with merged values, then applies", async () => {
    let previewCalls = 0;
    const previewBodies: Array<Record<string, unknown>> = [];
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url === PREVIEW_URL) {
        previewCalls += 1;
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        previewBodies.push(body);
        return Promise.resolve(
          previewCalls === 1
            ? normalization409({ needsInputPointers: ["/dossier/name"] }, [])
            : preview200("tok-2"),
        );
      }
      return Promise.resolve(applySuccess());
    });

    mountImportPage(root, "character", ID, "12");
    setDoc({ dossier: { alias: "Webweaver" } });
    clickText(root, "Preview import");

    await vi.waitFor(() => expect(root.querySelector(".norm-inputs")).not.toBeNull());
    const input = root.querySelector("#ni--dossier-name") as HTMLInputElement;
    expect(input).not.toBeNull();

    input.value = "Adrika";
    clickText(root, "Continue");

    // Re-preview (merge) → ready → confirm → apply
    await vi.waitFor(() => expect(root.querySelector(".norm-preview .btn-primary")?.textContent).toContain("Confirm import"));
    clickText(root, "Confirm import");
    await vi.waitFor(() => expect(root.querySelector(".import-success")).not.toBeNull());
    // The merged value traveled through the re-preview entity, not shown raw.
    const rePreviewEntity = previewBodies[1]?.entity as Record<string, unknown> | undefined;
    const reReDossier = rePreviewEntity?.dossier as Record<string, unknown> | undefined;
    expect(reReDossier?.name).toBe("Adrika");
  });

  it("recovers from a stale preview token with friendly re-preview copy, then re-previews and applies", async () => {
    let previewCalls = 0;
    let applyCalls = 0;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === PREVIEW_URL) {
        previewCalls += 1;
        return Promise.resolve(preview200(`tok-${previewCalls}`));
      }
      applyCalls += 1;
      // First apply goes stale; the re-preview refreshes the token and the
      // second apply succeeds.
      return Promise.resolve(applyCalls === 1 ? stale409({ currentRevision: 19 }) : applySuccess());
    });

    mountImportPage(root, "character", ID, "12");
    setDoc({ dossier: { name: "Sable" } });
    clickText(root, "Preview import");
    await vi.waitFor(() => expect(root.querySelector(".norm-preview")).not.toBeNull());

    clickText(root, "Confirm import");
    await vi.waitFor(() =>
      expect(root.querySelector(".import-error")?.textContent).toContain("changed since you previewed"),
    );
    // Friendly copy, not raw JSON.
    expect(root.querySelector(".import-error")?.textContent).not.toContain("STALE_REVISION");

    clickText(root, "Re-preview");
    await vi.waitFor(() => expect(root.querySelector(".norm-preview .btn-primary")?.textContent).toContain("Confirm import"));
    clickText(root, "Confirm import");
    await vi.waitFor(() => expect(root.querySelector(".import-success")).not.toBeNull());
  });

  it("surfaces INVALID_ENTRY pointer issues as a readable list without raw result JSON", async () => {
    global.fetch = vi.fn().mockResolvedValue(invalidEntry400());

    mountImportPage(root, "character", ID, "12");
    setDoc({ dossier: { name: "" } });
    clickText(root, "Preview import");

    await vi.waitFor(() => expect(root.querySelector(".import-issues")).not.toBeNull());
    expect(root.querySelector(".import-issues")?.textContent).toContain("/dossier/name");
    expect(root.querySelector(".import-issues")?.textContent).toContain("A character needs a name");
    expect(root.querySelector(".import-issues")?.textContent).toContain("expected: a non-empty string");
    // Raw error shape is folded away — no INVALID_ENTRY code in the visible list.
    expect(root.querySelector(".import-issues")?.textContent).not.toContain("INVALID_ENTRY");
  });

  it("shows a friendly message when an unrepairable stored entity rejects the import", async () => {
    global.fetch = vi.fn().mockResolvedValue(invalidEntity422());

    mountImportPage(root, "character", ID, "12");
    setDoc({ dossier: { name: "Sable" } });
    clickText(root, "Preview import");

    await vi.waitFor(() =>
      expect(root.querySelector(".import-error")?.textContent).toContain("couldn't be previewed"),
    );
    expect(root.querySelector(".import-error")?.textContent).toContain("Stored bytes cannot be normalized");
  });

  it("rejects malformed JSON in the textarea with a friendly message", async () => {
    global.fetch = vi.fn();
    mountImportPage(root, "character", ID, "12");
    const ta = root.querySelector("#import-doc") as HTMLTextAreaElement;
    ta.value = "{ not json";
    clickText(root, "Preview import");

    await vi.waitFor(() =>
      expect(root.querySelector(".import-status")?.textContent).toContain("isn't valid JSON"),
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
