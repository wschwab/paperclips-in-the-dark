import { Effect } from "effect";
import { ApiError, DecodeError, getRoster } from "../api/client.js";
import { el, setChildren } from "../lib/dom.js";
import type { Roster, CharacterSummary, CrewSummary } from "../schema/campaign.js";

function renderCharacter(c: CharacterSummary): HTMLElement {
  const status = c.isRetired ? " (retired)" : c.isDeadish ? " (deadish)" : "";
  return el(
    "li",
    { "data-character-id": c.id },
    el(
      "a",
      { href: `/character/${c.id}` },
      el("strong", {}, c.name),
      el("span", {}, ` ${c.alias} • ${c.playbook}${status}`),
    ),
  );
}

function renderCrew(cr: CrewSummary): HTMLElement {
  return el(
    "li",
    { "data-crew-id": cr.id },
    el("strong", {}, cr.name),
    el(
      "span",
      {},
      ` ${cr.crewType} • tier ${cr.tier} • heat ${cr.heat} • ${cr.memberCount} members`,
    ),
  );
}

function renderRoster(roster: Roster): HTMLElement {
  const charactersSection =
    roster.characters.length === 0
      ? el("p", { className: "empty" }, "No characters yet.")
      : el(
          "ul",
          { className: "character-list" },
          ...roster.characters.map(renderCharacter),
        );

  const crewsSection =
    roster.crews.length === 0
      ? el("p", { className: "empty" }, "No crews yet.")
      : el(
          "ul",
          { className: "crew-list" },
          ...roster.crews.map(renderCrew),
        );

  return el(
    "section",
    { className: "roster" },
    el(
      "div",
      { className: "roster-characters" },
      el("h2", {}, `Characters (${roster.characters.length})`),
      charactersSection,
    ),
    el(
      "div",
      { className: "roster-crews" },
      el("h2", {}, `Crews (${roster.crews.length})`),
      crewsSection,
    ),
  );
}

function renderError(message: string): HTMLElement {
  return el(
    "section",
    { className: "roster-error" },
    el("h2", {}, "Roster"),
    el("p", { className: "error", role: "alert" }, message),
  );
}

function renderLoading(): HTMLElement {
  return el(
    "section",
    { className: "roster-loading" },
    el("h2", {}, "Roster"),
    el("p", {}, "Loading…"),
  );
}

/**
 * Mount the roster page into `root`. Returns a disposer.
 * Fetches `/api/campaign/roster` once on mount.
 */
export function mountRosterPage(root: HTMLElement): () => void {
  let cancelled = false;
  root.setAttribute("aria-live", "polite");
  root.setAttribute("aria-busy", "true");
  setChildren(root, renderLoading());

  const program = Effect.gen(function* () {
    const roster = yield* getRoster();
    return roster;
  });

  void Effect.runPromise(
    Effect.match(program, {
      onFailure: (err) => {
        if (cancelled) return;
        root.setAttribute("aria-busy", "false");
        const msg =
          err instanceof ApiError
            ? `Failed to reach /api/campaign/roster (${err.status}): ${err.body}`
            : err instanceof DecodeError
              ? `Invalid roster response: ${err.message}`
              : String(err);
        setChildren(root, renderError(msg));
      },
      onSuccess: (roster) => {
        if (cancelled) return;
        root.setAttribute("aria-busy", "false");
        setChildren(root, renderRoster(roster));
      },
    }),
  );

  return () => {
    cancelled = true;
  };
}
