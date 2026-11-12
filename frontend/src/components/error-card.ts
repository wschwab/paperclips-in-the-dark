/**
 * error-card.ts — the designed, recoverable error state (Design Audit F-01).
 *
 * Replaces the raw schema-trace dump that pages previously rendered in place
 * of a whole screen. A sheet that fails to load now shows a plain-language
 * headline, a recovery button, a way back to the roster, and the technical detail
 * folded into a collapsed <details> so it never appears as primary content.
 *
 * All pages (character / crew detail, history, roster) share this surface so
 * the failure voice stays consistent across the app.
 */

import { el } from "../lib/dom.js";

export interface ErrorCardOptions {
  /** Page name used in the headline, e.g. "This crew sheet could not be loaded." */
  headline: string;
  /** Back-navigation target; defaults to the roster. */
  backHref?: string;
  backLabel?: string;
  /** Called when the user hits Retry. */
  onRetry?: () => void;
  /** Reloads the document for an outdated client, instead of retrying in place. */
  onReload?: () => void;
  /** Technical detail, folded into a collapsed <details> by default. */
  detail?: string;
}

export function errorCard(opts: ErrorCardOptions): HTMLElement {
  const backLabel = opts.backLabel ?? "Back to roster";
  const onRecover = opts.onReload ?? opts.onRetry;
  const section = el(
    "section",
    { className: "error-card" },
    el(
      "h1",
      { className: "error-card-head uneven", "aria-live": "polite", "aria-atomic": "true" },
      opts.headline,
    ),
    el(
      "div",
      { className: "error-card-actions" },
      onRecover
        ? el("button", { className: "btn-primary" }, opts.onReload ? "Reload" : "Retry")
        : null,
      el("a", { className: "btn-secondary", href: opts.backHref ?? "/roster" }, backLabel),
    ),
    opts.detail
      ? el(
          "details",
          { className: "error-card-detail" },
          el("summary", {}, "Technical detail"),
          el("pre", {}, opts.detail),
        )
      : null,
  );
  if (onRecover) {
    section.querySelector("button")?.addEventListener("click", onRecover);
  }
  return section;
}
