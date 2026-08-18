import { Effect } from "effect";
import { ApiError, DecodeError, getCrew, getCrewHistory } from "../api/client.js";
import { el, setChildren } from "../lib/dom.js";
import { errorCard } from "../components/error-card.js";
import type { HistoryEntry } from "../schema/campaign.js";
import type { Crew } from "../schema/crew.js";

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString();
}

function renderHistoryEntry(entry: HistoryEntry): HTMLElement {
  // Design Audit F-20: show a shortened snapshot id; full id in title + a
  // visually-hidden span for AT.
  const short = entry.snapshotId.slice(0, 8);
  return el(
    "li",
    { className: "history-entry" },
    el("div", { className: "history-metadata" },
      el("span", { className: "history-op" }, entry.op),
      el("span", { className: "history-timestamp" }, formatDate(entry.takenAt)),
    ),
    el("div", { className: "history-snapshotid", title: entry.snapshotId },
      `Snapshot: ${short}…`,
      el("span", { className: "visually-hidden" }, ` (${entry.snapshotId})`),
    ),
  );
}

function renderCrewHistory(crew: Crew, history: readonly HistoryEntry[]): HTMLElement {
  return el(
    "section",
    { className: "crew-history" },
    el(
      "div",
      { className: "history-header" },
      el(
        "a",
        { className: "btn-secondary history-back", href: `/crew/${crew.id}` },
        "Back to sheet",
      ),
      el("h1", {}, `${crew.name} — History`),
    ),
    el(
      "div",
      { className: "history-content" },
      history.length === 0
        ? el(
            "p",
            { className: "no-history" },
            "No history snapshots yet. Changes you make to this crew will appear here as a snapshot.",
          )
        : el(
            "ul",
            { className: "history-list" },
            ...Array.from(history).map(renderHistoryEntry),
          ),
    ),
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

  const startLoad = () => {
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
          setChildren(
            root,
            errorCard({
              headline: "This history could not be loaded.",
              backHref: `/crew/${crewId}`,
              backLabel: "Back to sheet",
              detail: msg,
              onRetry: startLoad,
            }),
          );
        },
        onSuccess: ({ crew, history }) => {
          if (cancelled) return;
          root.setAttribute("aria-busy", "false");
          setChildren(root, renderCrewHistory(crew, history));
        },
      }),
    );
  };

  startLoad();

  return () => {
    cancelled = true;
  };
}
