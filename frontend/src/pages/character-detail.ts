import { Effect } from "effect";
import { ApiError, DecodeError, getCharacter, stressAdd, StaleRevisionError } from "../api/client.js";
import { el, setChildren } from "../lib/dom.js";
import type { Character } from "../schema/character.js";

function renderCharacterDetail(c: Character, onStressAdd: () => void, isStressLoading: boolean, stressError: string | null): HTMLElement {
  const status = c.isRetired ? " (retired)" : c.isDeadish ? " (deadish)" : "";

  const stressButton = el(
    "button",
    {
      disabled: isStressLoading,
      title: "Add 1 stress",
    },
    isStressLoading ? "…" : "+1",
  );
  stressButton.addEventListener("click", onStressAdd);

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
        el("dd", {},
          el("div", { style: "display: flex; gap: 1em; align-items: center;" },
            el("span", {}, `${c.monitor.stress.current} / ${c.monitor.stress.max}`),
            stressButton,
          ),
        ),
        el("dt", {}, "Traumas"),
        el("dd", {},
          c.monitor.trauma.traumas.length === 0
            ? "(none)"
            : c.monitor.trauma.traumas.join(", "),
        ),
      ),
      stressError
        ? el("p", { className: "error", style: "margin-top: 1em;" }, stressError)
        : null,
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
  let currentCharacter: Character | null = null;
  let isStressLoading = false;
  let stressError: string | null = null;

  root.setAttribute("aria-live", "polite");
  root.setAttribute("aria-busy", "true");
  setChildren(root, renderLoading());

  const renderDetail = () => {
    if (currentCharacter) {
      setChildren(root, renderCharacterDetail(currentCharacter, onStressAdd, isStressLoading, stressError));
    }
  };

  const onStressAdd = () => {
    if (!currentCharacter || isStressLoading) return;
    isStressLoading = true;
    stressError = null;
    renderDetail();

    const program = stressAdd(characterId, 1, currentCharacter.revision);

    void Effect.runPromise(
      Effect.match(program, {
        onFailure: (err) => {
          if (cancelled) return;
          isStressLoading = false;
          if (err instanceof StaleRevisionError) {
            stressError = "Sheet is stale — reload the page";
          } else if (err instanceof ApiError) {
            stressError = `API error (${err.status}): ${err.body}`;
          } else if (err instanceof DecodeError) {
            stressError = `Invalid response: ${err.message}`;
          } else {
            stressError = String(err);
          }
          renderDetail();
        },
        onSuccess: (character) => {
          if (cancelled) return;
          isStressLoading = false;
          stressError = null;
          currentCharacter = character;
          renderDetail();
        },
      }),
    );
  };

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
        currentCharacter = character;
        renderDetail();
      },
    }),
  );

  return () => {
    cancelled = true;
  };
}
