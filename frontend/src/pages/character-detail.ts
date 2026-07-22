import { Effect } from "effect";
import { ApiError, DecodeError, getCharacter } from "../api/client.js";
import { el, setChildren } from "../lib/dom.js";
import type { Character } from "../schema/character.js";

function renderCharacterDetail(c: Character): HTMLElement {
  const status = c.isRetired ? " (retired)" : c.isDeadish ? " (deadish)" : "";

  return el(
    "section",
    { className: "character-detail" },
    el(
      "div",
      { className: "character-header" },
      el("h1", {}, `${c.dossier.name}${status}`),
      el("p", { className: "alias" }, c.dossier.alias),
      el(
        "nav",
        { className: "character-nav" },
        el("a", { href: `/character/${c.id}/history` }, "History"),
      ),
    ),
    el(
      "div",
      { className: "character-dossier" },
      el("h2", {}, "Dossier"),
      el("dl", {},
        el("dt", {}, "Playbook"),
        el("dd", {}, c.playbook.name),
        el("dt", {}, "Heritage"),
        el("dd", {}, c.dossier.heritage.name),
        el("dt", {}, "Background"),
        el("dd", {}, c.dossier.background.name),
        el("dt", {}, "Vice"),
        el("dd", {}, c.dossier.vice.name),
        el("dt", {}, "Look"),
        el("dd", {}, c.dossier.look || "(not set)"),
      ),
    ),
    el(
      "div",
      { className: "character-monitor" },
      el("h2", {}, "Status"),
      el("dl", {},
        el("dt", {}, "Stress"),
        el("dd", {}, `${c.monitor.stress.current} / ${c.monitor.stress.max}`),
        el("dt", {}, "Traumas"),
        el("dd", {},
          c.monitor.trauma.traumas.length === 0
            ? "(none)"
            : c.monitor.trauma.traumas.join(", "),
        ),
      ),
    ),
    el(
      "div",
      { className: "character-notes" },
      el("h2", {}, "Notes"),
      el("p", {}, c.dossier.notes || "(no notes)"),
    ),
  );
}

function renderError(message: string): HTMLElement {
  return el(
    "section",
    { className: "character-detail-error" },
    el("h1", {}, "Character"),
    el("p", { className: "error", role: "alert" }, message),
  );
}

function renderLoading(): HTMLElement {
  return el(
    "section",
    { className: "character-detail-loading" },
    el("h1", {}, "Character"),
    el("p", {}, "Loading…"),
  );
}

/**
 * Mount the character detail page into `root` for the given ID.
 * Returns a disposer.
 */
export function mountCharacterDetailPage(
  root: HTMLElement,
  characterId: string,
): () => void {
  let cancelled = false;
  root.setAttribute("aria-live", "polite");
  root.setAttribute("aria-busy", "true");
  setChildren(root, renderLoading());

  const program = Effect.gen(function* () {
    const character = yield* getCharacter(characterId);
    return character;
  });

  void Effect.runPromise(
    Effect.match(program, {
      onFailure: (err) => {
        if (cancelled) return;
        root.setAttribute("aria-busy", "false");
        const msg =
          err instanceof ApiError
            ? `Failed to reach /api/characters/${characterId} (${err.status}): ${err.body}`
            : err instanceof DecodeError
              ? `Invalid character response: ${err.message}`
              : String(err);
        setChildren(root, renderError(msg));
      },
      onSuccess: (character) => {
        if (cancelled) return;
        root.setAttribute("aria-busy", "false");
        setChildren(root, renderCharacterDetail(character));
      },
    }),
  );

  return () => {
    cancelled = true;
  };
}
