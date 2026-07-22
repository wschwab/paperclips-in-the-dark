import { Effect } from "effect";
import { ApiError, DecodeError, getCharacter, getCharacterHistory } from "../api/client.js";
import { el, setChildren } from "../lib/dom.js";
import type { HistoryEntry } from "../schema/campaign.js";
import type { Character } from "../schema/character.js";

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

function renderCharacterHistory(character: Character, history: readonly HistoryEntry[]): HTMLElement {
  return el(
    "section",
    { className: "character-history" },
    el(
      "div",
      { className: "history-header" },
      el("h1", {}, `${character.dossier.name} — History`),
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
    { className: "character-history-error" },
    el("h1", {}, "Character History"),
    el("p", { className: "error", role: "alert" }, message),
  );
}

function renderLoading(): HTMLElement {
  return el(
    "section",
    { className: "character-history-loading" },
    el("h1", {}, "Character History"),
    el("p", {}, "Loading…"),
  );
}

/**
 * Mount the character history page into `root` for the given ID.
 * Returns a disposer.
 */
export function mountCharacterHistoryPage(
  root: HTMLElement,
  characterId: string,
): () => void {
  let cancelled = false;
  root.setAttribute("aria-live", "polite");
  root.setAttribute("aria-busy", "true");
  setChildren(root, renderLoading());

  const program = Effect.gen(function* () {
    const character = yield* getCharacter(characterId);
    const history = yield* getCharacterHistory(characterId);
    return { character, history };
  });

  void Effect.runPromise(
    Effect.match(program, {
      onFailure: (err) => {
        if (cancelled) return;
        root.setAttribute("aria-busy", "false");
        const msg =
          err instanceof ApiError
            ? `Failed to reach API for character ${characterId} (${err.status}): ${err.body}`
            : err instanceof DecodeError
              ? `Invalid API response: ${err.message}`
              : String(err);
        setChildren(root, renderError(msg));
      },
      onSuccess: ({ character, history }) => {
        if (cancelled) return;
        root.setAttribute("aria-busy", "false");
        setChildren(root, renderCharacterHistory(character, history));
      },
    }),
  );

  return () => {
    cancelled = true;
  };
}
