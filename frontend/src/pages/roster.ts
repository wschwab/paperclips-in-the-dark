import { Effect } from "effect";
import { ApiError, DecodeError, getRoster } from "../api/client.js";
import { el, setChildren } from "../lib/dom.js";
import { errorCard } from "../components/error-card.js";
import { mountDegradedControls } from "../components/degraded-row.js";
import type { EntityKind } from "../api/import-repair.js";
import type { Roster, CharacterSummary, CrewSummary } from "../schema/campaign.js";

/**
 * E11 total collections: an unreadable row (bytes that cannot be parsed) is
 * listed with canonical empties and a deleteToken; a repairable row is
 * degraded but recoverable. Both render without a detail link (direct GET
 * would 422) and get the degraded repair/delete controls instead.
 */
function renderDegradedRow(
  kind: EntityKind,
  row: Pick<CharacterSummary | CrewSummary, "id" | "isRepairable" | "deleteToken">,
  onChanged: () => void,
): HTMLElement {
  const label = kind === "character" ? "Unreadable character" : "Unreadable crew";
  const attr = kind === "character" ? "data-character-id" : "data-crew-id";
  const controlsEl = el("div", { className: "degraded-controls-container" });
  const li = el(
    "li",
    { [attr]: row.id, "data-degraded": "", className: "degraded-row" },
    el("span", { className: "unnamed" }, label),
    controlsEl,
  );
  mountDegradedControls(controlsEl, {
    kind,
    id: row.id,
    isRepairable: row.isRepairable,
    deleteToken: row.deleteToken,
    onChanged,
  });
  return li;
}

function renderCharacter(c: CharacterSummary, onChanged: () => void): HTMLElement {
  if (!c.isReadable) {
    return renderDegradedRow("character", c, onChanged);
  }
  const status = c.isRetired ? " (retired)" : c.isDeadish ? " (deadish)" : "";
  // Design Audit F-12: a character created without a name must never render
  // as an empty <strong> (a link whose text is punctuation). Fall back to an
  // italic "Unnamed {playbook}" placeholder.
  const nameEl = c.name
    ? el("strong", {}, c.name)
    : el("span", { className: "unnamed" }, `Unnamed ${c.playbook}`);
  return el(
    "li",
    { "data-character-id": c.id },
    el(
      "a",
      { href: `/character/${c.id}` },
      nameEl,
      el("span", {}, ` ${c.alias} • ${c.playbook}${status}`),
    ),
    el("a", { href: `/character/${c.id}/import`, className: "roster-import" }, "Import"),
  );
}

function renderCrew(cr: CrewSummary, onChanged: () => void): HTMLElement {
  if (!cr.isReadable) {
    return renderDegradedRow("crew", cr, onChanged);
  }
  // FV-018: mirror the character fallback (Design Audit F-12) — a crew
  // created without a name must never render as an empty <strong>. Use a
  // deterministic "Unnamed {crewType}" placeholder; href/id stay unchanged.
  const nameEl = cr.name
    ? el("strong", {}, cr.name)
    : el("span", { className: "unnamed" }, `Unnamed ${cr.crewType}`);
  return el(
    "li",
    { "data-crew-id": cr.id },
    el(
      "a",
      { href: `/crew/${cr.id}` },
      nameEl,
      el(
        "span",
        {},
        ` ${cr.crewType} • tier ${cr.tier} • heat ${cr.heat} • ${cr.memberCount} members`,
      ),
    ),
    el("a", { href: `/crew/${cr.id}/import`, className: "roster-import" }, "Import"),
  );
}

function renderRoster(roster: Roster, onChanged: () => void): HTMLElement {
  const charactersSection =
    roster.characters.length === 0
      ? el("p", { className: "empty uneven" }, "No characters yet.")
      : el(
          "ul",
          { className: "character-list" },
          ...roster.characters.map((c) => renderCharacter(c, onChanged)),
        );

  const crewsSection =
    roster.crews.length === 0
      ? el("p", { className: "empty uneven" }, "No crews yet.")
      : el(
          "ul",
          { className: "crew-list" },
          ...roster.crews.map((cr) => renderCrew(cr, onChanged)),
        );

  return el(
    "section",
    { className: "roster" },
    el("h1", { className: "page-title" }, "Roster"),
    el(
      "div",
      { className: "roster-characters torn-foot" },
      el("h2", {}, `Characters (${roster.characters.length})`),
      charactersSection,
      el("a", { href: "/character/create", className: "btn-primary" }, "+ Create Character"),
    ),
    el(
      "div",
      { className: "roster-crews torn-foot" },
      el("h2", {}, `Crews (${roster.crews.length})`),
      crewsSection,
      el("a", { href: "/crew/create", className: "btn-primary" }, "+ Create Crew"),
    ),
  );
}

function renderLoading(): HTMLElement {
  return el(
    "section",
    { className: "roster-loading" },
    el("h1", {}, "Roster"),
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

  const startLoad = () => {
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
          setChildren(
            root,
            errorCard({
              headline: "This roster could not be loaded.",
              backHref: "/roster",
              detail: msg,
              onRetry: startLoad,
            }),
          );
        },
        onSuccess: (roster) => {
          if (cancelled) return;
          root.setAttribute("aria-busy", "false");
          setChildren(root, renderRoster(roster, startLoad));
        },
      }),
    );
  };

  startLoad();

  return () => {
    cancelled = true;
  };
}
