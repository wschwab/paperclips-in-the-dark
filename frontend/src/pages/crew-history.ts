import { Effect } from "effect";
import { ApiError, DecodeError, getCrew, getCrewHistory } from "../api/client.js";
import { el, setChildren } from "../lib/dom.js";
import type { HistoryEntry } from "../schema/campaign.js";
import type { Crew } from "../schema/crew.js";

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString();
}

function renderHistoryEntry(entry: HistoryEntry): HTMLElement {
  return el(
    "li",
    { className: "history-entry" },
    el("div", { className: "history-metadata" },
      el("span", { className: "history-op" }, entry.op),
      el("span", { className: "history-timestamp" }, formatDate(entry.takenAt)),
    ),
    el("div", { className: "history-snapshotid" }, `Snapshot: ${entry.snapshotId}`),
  );
}

function renderCrewHistory(crew: Crew, history: readonly HistoryEntry[]): HTMLElement {
  return el(
    "section",
    { className: "crew-history" },
    el(
      "div",
      { className: "history-header" },
      el("h1", {}, `${crew.name} — History`),
    ),
    el(
      "div",
      { className: "history-content" },
      history.length === 0
        ? el("p", { className: "no-history" }, "(no history snapshots)")
        : el(
            "ul",
            { className: "history-list" },
            ...Array.from(history).map(renderHistoryEntry),
          ),
    ),
  );
}

function renderError(message: string): HTMLElement {
  return el(
    "section",
    { className: "crew-history-error" },
    el("h1", {}, "Crew History"),
    el("p", { className: "error", role: "alert" }, message),
  );
}

function renderLoading(): HTMLElement {
  return el(
    "section",
    { className: "crew-history-loading" },
    el("h1", {}, "Crew History"),
    el("p", {}, "Loading…"),
  );
}

/**
 * Mount the crew history page into `root` for the given ID.
 * Returns a disposer.
 */
export function mountCrewHistoryPage(
  root: HTMLElement,
  crewId: string,
): () => void {
  let cancelled = false;
  root.setAttribute("aria-live", "polite");
  root.setAttribute("aria-busy", "true");
  setChildren(root, renderLoading());

  const program = Effect.gen(function* () {
    const crew = yield* getCrew(crewId);
    const history = yield* getCrewHistory(crewId);
    return { crew, history };
  });

  void Effect.runPromise(
    Effect.match(program, {
      onFailure: (err) => {
        if (cancelled) return;
        root.setAttribute("aria-busy", "false");
        const msg =
          err instanceof ApiError
            ? `Failed to reach API for crew ${crewId} (${err.status}): ${err.body}`
            : err instanceof DecodeError
              ? `Invalid API response: ${err.message}`
              : String(err);
        setChildren(root, renderError(msg));
      },
      onSuccess: ({ crew, history }) => {
        if (cancelled) return;
        root.setAttribute("aria-busy", "false");
        setChildren(root, renderCrewHistory(crew, history));
      },
    }),
  );

  return () => {
    cancelled = true;
  };
}
