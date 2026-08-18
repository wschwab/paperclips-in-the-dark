/**
 * degraded-row.ts — the roster's degraded-row repair/delete controls.
 *
 * A repairable row (isRepairable) gets a Repair affordance that runs the
 * repair-preview → confirm → apply flow inline; needs-input pointers render as
 * editable fields whose values are passed back to repair-preview. An
 * unreadable row (not repairable) is delete-only: the row's deleteToken is the
 * If-Match value. A 409 STALE_REVISION surfaces as friendly "refresh / re-token"
 * copy and asks the roster to re-fetch — never raw JSON.
 */

import { Effect } from "effect";
import {
  repairPreview,
  repairApply,
  deleteEntity,
  NormalizationRequiredError,
  NeedsInputError,
  InvalidEntityError,
  StaleStateError,
  NotFoundError,
  type EntityKind,
  type PreviewView,
} from "../api/import-repair.js";
import { ApiError, DecodeError } from "../api/client.js";
import { el, setChildren } from "../lib/dom.js";
import { renderPreviewPanel } from "./normalization-preview.js";

export interface DegradedRowOptions {
  kind: EntityKind;
  id: string;
  isRepairable: boolean;
  deleteToken: string;
  /** Called after a successful repair/delete, or when a stale token needs a fresh roster fetch. */
  onChanged: () => void;
}

const KIND_LABEL: Record<EntityKind, string> = { character: "character", crew: "crew" };

function friendlyNote(err: unknown): string {
  if (err instanceof StaleStateError) return "This entry changed since you opened it. Refresh the roster to get its current state, then try again.";
  if (err instanceof InvalidEntityError) return err.message;
  if (err instanceof NotFoundError) return err.message;
  if (err instanceof ApiError) return `The server couldn't process this request (HTTP ${err.status}).`;
  if (err instanceof DecodeError) return "The server returned an unexpected response.";
  return "Something went wrong.";
}

function renderFailure(container: HTMLElement, headline: string, note: string, actions: HTMLElement[]): void {
  setChildren(
    container,
    el(
      "div",
      { className: "degraded-failure", role: "alert" },
      el("p", { className: "degraded-failure-head" }, headline),
      el("p", { className: "degraded-failure-note" }, note),
      el("div", { className: "form-actions" }, ...actions),
    ),
  );
}

function button(label: string, className: string, action: () => void): HTMLButtonElement {
  const b = el("button", { type: "button", className }, label) as HTMLButtonElement;
  b.addEventListener("click", action);
  return b;
}

function startRepair(container: HTMLElement, opts: DegradedRowOptions, values?: Record<string, unknown>): void {
  const { kind, id, deleteToken } = opts;
  setChildren(container, el("p", { className: "degraded-busy" }, "Preparing repair preview…"));

  const program = Effect.gen(function* () {
    return yield* repairPreview(kind, id, deleteToken, values);
  });

  void Effect.runPromise(
    Effect.match(program, {
      onFailure: (err) => {
        if (err instanceof NeedsInputError) {
          renderPreviewPanel(container, err.preview, {
            confirmLabel: "Continue",
            onProvideValues: (vals) => startRepair(container, opts, vals),
            onCancel: () => setChildren(container),
          });
          return;
        }
        if (err instanceof NormalizationRequiredError) {
          renderPreviewPanel(container, err.preview, {
            confirmLabel: "Confirm repair",
            onConfirm: () => applyRepair(container, opts, err.preview),
            onCancel: () => setChildren(container),
          });
          return;
        }
        if (err instanceof InvalidEntityError) {
          renderFailure(
            container,
            "This entry can't be repaired.",
            `${err.message} It can only be deleted.`,
            [button("Delete instead", "btn-secondary", () => startDelete(container, opts))],
          );
          return;
        }
        renderFailure(
          container,
          "The repair preview couldn't be prepared.",
          friendlyNote(err),
          [button("Try again", "btn-primary", () => startRepair(container, opts))],
        );
      },
      onSuccess: (view: PreviewView) => {
        renderPreviewPanel(container, view, {
          confirmLabel: "Confirm repair",
          onConfirm: () => applyRepair(container, opts, view),
          onCancel: () => setChildren(container),
        });
      },
    }),
  );
}

function applyRepair(container: HTMLElement, opts: DegradedRowOptions, view: PreviewView): void {
  if (!view.previewToken) return;
  const { kind, id, deleteToken } = opts;
  setChildren(container, el("p", { className: "degraded-busy" }, "Applying repair…"));

  const program = Effect.gen(function* () {
    return yield* repairApply(kind, id, deleteToken, view.previewToken as string);
  });

  void Effect.runPromise(
    Effect.match(program, {
      onFailure: (err) => {
        if (err instanceof StaleStateError) {
          renderFailure(
            container,
            "This entry changed while you were repairing it.",
            friendlyNote(err),
            [button("Refresh roster", "btn-primary", opts.onChanged)],
          );
          return;
        }
        if (err instanceof NormalizationRequiredError) {
          renderFailure(
            container,
            "A fresh preview is needed.",
            "The stored entry changed since the preview. Re-preview before confirming.",
            [button("Re-preview", "btn-primary", () => startRepair(container, opts))],
          );
          return;
        }
        renderFailure(
          container,
          "The repair couldn't be applied.",
          friendlyNote(err),
          [button("Try again", "btn-primary", () => startRepair(container, opts))],
        );
      },
      onSuccess: () => {
        setChildren(container, el("p", { className: "degraded-success" }, "Repaired."));
        opts.onChanged();
      },
    }),
  );
}

function startDelete(container: HTMLElement, opts: DegradedRowOptions): void {
  const { kind, id, deleteToken } = opts;
  setChildren(
    container,
    el(
      "div",
      { className: "degraded-delete-confirm" },
      el("p", {}, `Delete this unreadable ${KIND_LABEL[kind]}? This can't be undone.`),
      el(
        "div",
        { className: "form-actions" },
        button("Delete", "btn-danger", () => {
          setChildren(container, el("p", { className: "degraded-busy" }, "Deleting…"));
          const program = Effect.gen(function* () {
            yield* deleteEntity(kind, id, deleteToken);
          });
          void Effect.runPromise(
            Effect.match(program, {
              onFailure: (err) => {
                if (err instanceof StaleStateError) {
                  renderFailure(
                    container,
                    "This entry changed since you opened it.",
                    friendlyNote(err),
                    [button("Refresh roster", "btn-primary", opts.onChanged)],
                  );
                  return;
                }
                renderFailure(
                  container,
                  "The entry couldn't be deleted.",
                  friendlyNote(err),
                  [button("Try again", "btn-primary", () => startDelete(container, opts))],
                );
              },
              onSuccess: () => {
                setChildren(container, el("p", { className: "degraded-success" }, "Deleted."));
                opts.onChanged();
              },
            }),
          );
        }),
        button("Cancel", "btn-secondary", () => setChildren(container)),
      ),
    ),
  );
}

/**
 * Renders the degraded-row controls into `container`: Repair (when
 * repairable) and Delete. The flow runs inline inside `container`; `onChanged`
 * is invoked to re-fetch the roster after a successful repair/delete or a stale
 * refresh.
 */
export function mountDegradedControls(
  container: HTMLElement,
  opts: DegradedRowOptions,
): void {
  const controls = el("div", { className: "degraded-controls" });
  if (opts.isRepairable) {
    controls.append(button("Repair", "btn-secondary", () => startRepair(container, opts)));
  }
  controls.append(button("Delete", "btn-secondary", () => startDelete(container, opts)));
  setChildren(container, controls);
}
