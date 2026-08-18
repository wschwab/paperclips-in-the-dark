/**
 * normalization-preview.ts — renders a decoded normalization PreviewView into
 * a container: the warnings, the ordered change list (every fill/conversion/
 * correction/removal), ready-to-confirm controls, or—when the preview ends in
 * needs-input pointers—a set of editable fields whose values are returned to
 * the caller for a re-preview. Shared by the import page and the roster
 * degraded-row repair flow so the failure voice and layout stay consistent.
 *
 * It never renders the raw normalized document: the change list and warnings
 * are the human-readable view of what would be written.
 */

import { el, setChildren } from "../lib/dom.js";
import type { PreviewView, Change } from "../api/import-repair.js";

export interface PreviewPanelOptions {
  /** Label for the confirm button, e.g. "Confirm import" / "Confirm repair". */
  confirmLabel: string;
  /**
   * Called when the preview is ready (no needs-input pointers) and the user
   * confirms.
   */
  onConfirm?: () => void;
  /**
   * Needs-input path: the user filled the required fields and a re-preview
   * must run with those values keyed by JSON pointer (import merges them into
   * the document; repair passes them as the repair-preview body).
   */
  onProvideValues?: (values: Record<string, string>) => void;
  onCancel?: () => void;
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "∅";
  if (typeof v === "string") return v.length === 0 ? "(empty)" : v;
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return "(value)";
    }
  }
  return String(v);
}

function renderChange(change: Change): HTMLElement {
  const removal = change.reason.toLowerCase().includes("remov");
  const row = el(
    "li",
    { className: "norm-change" },
    el("code", { className: "norm-pointer" }, change.pointer || "(document)"),
    el("span", { className: "norm-reason" }, change.reason),
  );
  // Show the before → after pair; removals read as "the value will be removed".
  const before = el("span", { className: "norm-before" }, formatValue(change.previous));
  const arrow = el("span", { className: "norm-arrow" }, removal ? " → removed" : " → ");
  const after = removal ? null : el("span", { className: "norm-after" }, formatValue(change.replacement));
  row.append(el("div", { className: "norm-pair" }, before, arrow, after));
  return row;
}

function pointerLabel(pointer: string): string {
  const trimmed = pointer.replace(/^\//, "");
  return trimmed.length === 0 ? "Root" : trimmed.replace(/\//g, " › ");
}

/**
 * Renders the preview state into `container` (replacing its contents). The
 * caller re-invokes this each time the preview state changes (initial
 * preview, a needs-input re-preview, or a stale recovery).
 */
export function renderPreviewPanel(
  container: HTMLElement,
  view: PreviewView,
  opts: PreviewPanelOptions,
): void {
  const section = el("section", { className: "norm-preview" });

  const warnings =
    view.warnings.length > 0
      ? el(
          "ul",
          { className: "norm-warnings", "aria-label": "Normalization warnings" },
          ...view.warnings.map((w) => el("li", {}, w)),
        )
      : null;

  const changesSection =
    view.changes.length > 0
      ? el(
          "div",
          {},
          el("h3", {}, "What will change"),
          el("ul", { className: "norm-changes" }, ...view.changes.map(renderChange)),
        )
      : view.canonical
        ? el("p", { className: "norm-canonical" }, "This document is already in canonical form — nothing changes.")
        : null;

  section.append(
    el("h3", {}, "Preview"),
    warnings ?? el("p", { className: "norm-none" }, "No normalization warnings."),
    changesSection ?? el("p", { className: "norm-none" }, "No changes to apply."),
  );

  // Needs-input path: every awaited pointer becomes an editable field; the
  // user provides values which the caller re-previews.
  if (view.needsInputPointers.length > 0) {
    const fieldContainer = el("div", { className: "norm-inputs" });
    for (const pointer of view.needsInputPointers) {
      fieldContainer.append(
        el(
          "label",
          { className: "norm-input", htmlFor: `ni-${pointer.replace(/[^A-Za-z0-9-]/g, "-")}` },
          el("span", {}, `${pointerLabel(pointer)} (${pointer})`),
          el("input", {
            id: `ni-${pointer.replace(/[^A-Za-z0-9-]/g, "-")}`,
            type: "text",
            className: "form-input",
          }),
        ),
      );
    }
    const rePreview = el("button", { type: "button", className: "btn-primary" }, opts.confirmLabel);
    rePreview.addEventListener("click", () => {
      const values: Record<string, string> = {};
      for (const pointer of view.needsInputPointers) {
        const input = fieldContainer.querySelector(`#ni-${pointer.replace(/[^A-Za-z0-9-]/g, "-")}`) as HTMLInputElement | null;
        values[pointer] = input?.value ?? "";
      }
      opts.onProvideValues?.(values);
    });
    const actions = el("div", { className: "form-actions" }, rePreview);
    if (opts.onCancel) {
      const cancel = el("button", { type: "button", className: "btn-secondary" }, "Cancel");
      cancel.addEventListener("click", () => opts.onCancel?.());
      actions.append(cancel);
    }
    section.append(el("p", { className: "norm-needs-input" }, "A few fields need your input before this can be applied."), fieldContainer, actions);
  } else {
    const confirm = el("button", { type: "button", className: "btn-primary" }, opts.confirmLabel);
    confirm.addEventListener("click", () => opts.onConfirm?.());
    const actions = el("div", { className: "form-actions" }, confirm);
    if (opts.onCancel) {
      const cancel = el("button", { type: "button", className: "btn-secondary" }, "Cancel");
      cancel.addEventListener("click", () => opts.onCancel?.());
      actions.append(cancel);
    }
    section.append(actions);
  }

  setChildren(container, section);
}
