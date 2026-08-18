import { Effect } from "effect";
import {
  importPreview,
  NormalizationRequiredError,
  NeedsInputError,
  InvalidEntryError,
  InvalidEntityError,
  StaleStateError,
  NotFoundError,
  type EntityKind,
  type Issue,
} from "../api/import-repair.js";
import { ApiError, DecodeError, importCharacter, importCrew } from "../api/client.js";
import type { ApplyResult } from "../api/import-repair.js";
import { el, setChildren } from "../lib/dom.js";
import { renderPreviewPanel } from "../components/normalization-preview.js";

/**
 * import.ts — partial-document import flow for an existing entity.
 *
 * Preview → (warnings / every fill-conversion-correction-removal) → confirm →
 * apply. Needs-input pointers surface as editable fields whose values are
 * merged back into the document and re-previewed; a stale preview token
 * (STALE_REVISION) recovers with a friendly re-preview, never a raw dump.
 * The normalized document is never rendered verbatim — only the change
 * list, warnings, and failure copy are.
 */

const KIND_LABEL: Record<EntityKind, string> = {
  character: "Character",
  crew: "Crew",
};

/** Review text rendering of a friendly-typed failure (never raw JSON). */
function friendlyFailure(
  headline: string,
  note: string,
  actions: Array<HTMLElement | null>,
): HTMLElement {
  return el(
    "section",
    { className: "import-error", role: "alert" },
    el("h2", {}, headline),
    el("p", { className: "import-error-note" }, note),
    el("div", { className: "form-actions" }, ...actions.filter((a) => a !== null)),
  );
}

function renderIssues(issues: Issue[]): HTMLElement {
  return el(
    "ul",
    { className: "import-issues" },
    ...issues.map((issue) => {
      const pointer = issue.pointer || "(document)";
      return el(
        "li",
        {},
        el("code", {}, pointer),
        " — ",
        el("span", {}, issue.reason),
        issue.expected ? el("span", { className: "import-issue-expected" }, ` (expected: ${issue.expected})`) : null,
      );
    }),
  );
}

function entityLabel(result: ApplyResult): { name: string; href: string } | null {
  return { name: result.name || "the entry", href: `/${result.kind}/${result.id}` };
}

/**
 * Mount the import page into `root` for the entity `{kind, id}`. `ifMatch` is
 * the entity revision (readable row) or the degraded content token; the
 * confirming apply sends it as the If-Match header. Returns a disposer.
 */
export function mountImportPage(
  root: HTMLElement,
  kind: EntityKind,
  id: string,
  ifMatch: string,
): () => void {
  let cancelled = false;
  let doc: unknown = null;
  let previewToken: string | null = null;
  root.setAttribute("aria-live", "polite");

  const textarea = el("textarea", {
    id: "import-doc",
    className: "form-input import-doc",
    rows: 14,
    placeholder: 'Paste a full or partial JSON document, e.g. {\n  "dossier": { "name": "Sable Verity" }\n}',
  });
  const previewBtn = el("button", { type: "button", id: "import-preview-btn", className: "btn-primary" }, "Preview import");
  const previewContainer = el("div", { className: "import-preview" });
  const status = el("p", { className: "import-status", "aria-live": "polite" });

  const form = el(
    "section",
    { className: "import-page" },
    el(
      "div",
      { className: "import-doc-wrap" },
      el("label", { htmlFor: "import-doc" }, "Document to import"),
      textarea,
      el(
        "div",
        { className: "form-actions" },
        previewBtn,
        el("a", { href: `/${kind}/${id}`, className: "btn-secondary" }, "Cancel"),
      ),
    ),
    status,
    previewContainer,
  );

  const renderState = () => {
    setChildren(root, form);
  };

  const editingError = (msg: string) => {
    setChildren(status, el("span", { className: "error", role: "alert" }, msg));
  };

  /** Restore the textarea with the current document (e.g. for re-edit). */
  const restoreDocTextarea = (current: unknown) => {
    textarea.value = JSON.stringify(current, null, 2);
  };

  const renderInvalidEntry = (err: InvalidEntryError) => {
    setChildren(
      previewContainer,
      el("section", { className: "import-error", role: "alert" },
        el("h2", {}, "The submitted document has problems that need fixing."),
        renderIssues(err.issues),
        el("p", { className: "import-error-note" }, "Fix the listed fields in the document above, then preview again."),
        el("div", { className: "form-actions" }, retryButton("Preview again", () => runPreview(currentDocFromTextarea()))),
      ),
    );
  };

  const runPreview = (targetDoc: unknown) => {
    if (cancelled) return;
    root.setAttribute("aria-busy", "true");
    setChildren(status, el("span", {}, "Preparing preview…"));
    setChildren(previewContainer);

    const program = Effect.gen(function* () {
      return yield* importPreview(kind, id, targetDoc);
    });

    void Effect.runPromise(
      Effect.match(program, {
        onFailure: (err) => {
          if (cancelled) return;
          root.setAttribute("aria-busy", "false");
          if (err instanceof NeedsInputError) {
            doc = targetDoc;
            previewToken = err.preview.previewToken;
            renderPreviewPanel(previewContainer, err.preview, {
              confirmLabel: "Continue",
              onProvideValues: (values) => {
                const merged = mergePointers(targetDoc, values);
                restoreDocTextarea(merged);
                runPreview(merged);
              },
              onCancel: () => setChildren(previewContainer),
            });
            setChildren(status, el("span", { className: "notice" }, "Some fields need your input."));
            return;
          }
          if (err instanceof NormalizationRequiredError) {
            doc = targetDoc;
            previewToken = err.preview.previewToken;
            renderPreviewPanel(previewContainer, err.preview, {
              confirmLabel: "Confirm import",
              onConfirm: () => applyImport(),
              onCancel: () => setChildren(previewContainer),
            });
            setChildren(status, el("span", { className: "notice" }, "Preview ready — confirm to write it."));
            return;
          }
          if (err instanceof InvalidEntryError) {
            setChildren(status);
            renderInvalidEntry(err);
            return;
          }
          setChildren(status);
          setChildren(
            previewContainer,
            friendlyFailure(
              "This document couldn't be previewed.",
              importFailureCopy(err),
              [retryButton("Try again", () => runPreview(currentDocFromTextarea()))],
            ),
          );
        },
        onSuccess: (view) => {
          if (cancelled) return;
          root.setAttribute("aria-busy", "false");
          doc = targetDoc;
          previewToken = view.previewToken;
          renderPreviewPanel(previewContainer, view, {
            confirmLabel: "Confirm import",
            onConfirm: () => applyImport(),
            onCancel: () => setChildren(previewContainer),
          });
          setChildren(status, el("span", { className: "notice" }, "Preview ready — confirm to write it."));
        },
      }),
    );
  };

  const retryButton = (label: string, action: () => void): HTMLButtonElement => {
    const b = el("button", { type: "button", className: "btn-primary" }, label) as HTMLButtonElement;
    b.addEventListener("click", action);
    return b;
  };

  const currentDocFromTextarea = (): unknown => {
    try {
      return JSON.parse(textarea.value) as unknown;
    } catch {
      return null;
    }
  };

  const applyImport = () => {
    if (cancelled) return;
    if (previewToken === null || doc === null) return;
    root.setAttribute("aria-busy", "true");
    setChildren(previewContainer);
    setChildren(status, el("span", {}, "Applying…"));

    const program = Effect.gen(function* () {
      if (kind === "character") {
        return yield* importCharacter(id, doc, ifMatch, previewToken as string);
      }
      return yield* importCrew(id, doc, ifMatch, previewToken as string);
    });

    void Effect.runPromise(
      Effect.match(program, {
        onFailure: (err) => {
          if (cancelled) return;
          root.setAttribute("aria-busy", "false");
          if (err instanceof StaleStateError) {
            setChildren(
              previewContainer,
              friendlyFailure(
                "This entry changed since you previewed it.",
                "The document or the stored entry changed, so this preview is no longer valid. Re-preview to get a fresh result before confirming.",
                [retryButton("Re-preview", () => runPreview(doc as unknown))],
              ),
            );
            return;
          }
          if (err instanceof NormalizationRequiredError) {
            setChildren(
              previewContainer,
              friendlyFailure(
                "This import needs a fresh preview.",
                err.message,
                [retryButton("Re-preview", () => runPreview(doc as unknown))],
              ),
            );
            return;
          }
          if (err instanceof InvalidEntryError) {
            renderInvalidEntry(err);
            return;
          }
          setChildren(
            previewContainer,
            friendlyFailure(
              "The import couldn't be applied.",
              importFailureCopy(err),
              [retryButton("Re-preview", () => runPreview(doc as unknown))],
            ),
          );
        },
        onSuccess: (result) => {
          if (cancelled) return;
          root.setAttribute("aria-busy", "false");
          const entity = entityLabel(result);
          setChildren(
            previewContainer,
            el(
              "section",
              { className: "import-success" },
              el("h2", {}, "Import applied."),
              el("p", {}, `Successfully imported ${entity?.name ?? KIND_LABEL[kind].toLowerCase()}.`),
              el(
                "div",
                { className: "form-actions" },
                entity ? el("a", { href: entity.href, className: "btn-primary" }, "Open sheet") : null,
                el("a", { href: "/roster", className: "btn-secondary" }, "Back to roster"),
              ),
            ),
          );
        },
      }),
    );
  };

  previewBtn.addEventListener("click", () => {
    if (cancelled) return;
    const raw = textarea.value;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      editingError("That isn't valid JSON. Fix the document and preview again.");
      return;
    }
    runPreview(parsed);
  });

  renderState();
  return () => {
    cancelled = true;
  };
}

function importFailureCopy(err: unknown): string {
  if (err instanceof InvalidEntryError) return "Some fields in the document couldn't be interpreted. Review the details and try again.";
  if (err instanceof InvalidEntityError) return err.message;
  if (err instanceof NotFoundError) return err.message;
  if (err instanceof StaleStateError) return "This entry changed while you were preparing the import. Re-preview to continue.";
  if (err instanceof ApiError) return `The server couldn't process this request (HTTP ${err.status}).`;
  if (err instanceof DecodeError) return "The server returned an unexpected response.";
  return "Something went wrong while preparing the import.";
}

/** Sets `value` at `pointer` (e.g. "/dossier/name") inside `target`, returning a new root. */
function mergePointers(target: unknown, values: Record<string, string>): unknown {
  const root = JSON.parse(JSON.stringify(target ?? {})) as Record<string, unknown>;
  const normalize = (v: string): unknown => {
    const trimmed = v.trim();
    if (trimmed === "") return "";
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return trimmed;
    }
  };
  for (const [pointer, rawValue] of Object.entries(values)) {
    setPointer(root, pointer, normalize(rawValue));
  }
  return root;
}

function setPointer(target: Record<string, unknown>, pointer: string, value: unknown): void {
  const segments = pointer.split("/").filter((s) => s.length > 0);
  if (segments.length === 0) {
    return;
  }
  let node: Record<string, unknown> = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const key = decodeURIComponent(segments[i]);
    const existing = node[key];
    if (existing === null || typeof existing !== "object" || Array.isArray(existing)) {
      node[key] = {};
    }
    node = node[key] as Record<string, unknown>;
  }
  node[decodeURIComponent(segments[segments.length - 1])] = value;
}
