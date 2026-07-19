import { Effect } from "effect";
import { ApiError, DecodeError, getHealth } from "../api/client.js";
import { el, setChildren } from "../lib/dom.js";
import type { Health } from "../schema/campaign.js";

function row(label: string, value: string): HTMLElement {
  return el(
    "tr",
    {},
    el("th", { scope: "row" }, label),
    el("td", { "data-field": label.toLowerCase() }, value),
  );
}

function renderHealth(h: Health): HTMLElement {
  return el(
    "section",
    { className: "health", "data-status": h.status },
    el("h2", {}, "API health"),
    el(
      "table",
      {},
      el(
        "tbody",
        {},
        row("status", h.status),
        row("implementation", h.implementation),
        row("version", h.version),
        row("dataDir", h.dataDir),
      ),
    ),
  );
}

function renderError(message: string): HTMLElement {
  return el(
    "section",
    { className: "health-error" },
    el("h2", {}, "API health"),
    el("p", { className: "error", role: "alert" }, message),
  );
}

function renderLoading(): HTMLElement {
  return el(
    "section",
    { className: "health-loading" },
    el("h2", {}, "API health"),
    el("p", {}, "Loading…"),
  );
}

/**
 * Mount the health-check page into `root`. Returns a disposer.
 * Fetches `/api/health` once on mount.
 */
export function mountHealthPage(root: HTMLElement): () => void {
  let cancelled = false;
  setChildren(root, renderLoading());

  const program = Effect.gen(function* () {
    const health = yield* getHealth();
    return health;
  });

  void Effect.runPromise(
    Effect.match(program, {
      onFailure: (err) => {
        if (cancelled) return;
        const msg =
          err instanceof ApiError
            ? `Failed to reach /api/health (${err.status}): ${err.body}`
            : err instanceof DecodeError
              ? `Invalid health response: ${err.message}`
              : String(err);
        setChildren(root, renderError(msg));
      },
      onSuccess: (health) => {
        if (cancelled) return;
        setChildren(root, renderHealth(health));
      },
    }),
  );

  return () => {
    cancelled = true;
  };
}
