import { Effect } from "effect";
import {
  ApiError,
  DecodeError,
  getRoster,
  repairCharacterApply,
  repairCharacterPreview,
  repairCrewApply,
  repairCrewPreview,
} from "../api/client.js";
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
  // Kind-bound opId exports (repairCharacterPreview/Apply for characters,
  // repairCrewPreview/Apply for crews) drive the degraded-row controls so the
  // reachable human repair path runs through the operationId-named client API.
  const ops =
    kind === "character"
      ? { preview: repairCharacterPreview, apply: repairCharacterApply }
      : { preview: repairCrewPreview, apply: repairCrewApply };
  mountDegradedControls(controlsEl, {
    kind,
    id: row.id,
    isRepairable: row.isRepairable,
    deleteToken: row.deleteToken,
    onChanged,
    ...ops,
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
  // OPT-008: search/filter input. Filters by name/alias/playbook (characters)
  // or name/crewType (crews). Degraded rows stay visible — their id is the
  // only text and they remain reachable regardless of filter.
  const searchInput = el("input", {
    type: "search",
    className: "roster-search",
    placeholder: "Search roster…",
    "aria-label": "Filter roster by name, alias, or playbook",
    autocomplete: "off",
  }) as HTMLInputElement;

  // OPT-008: narrow aria-live to a status region that announces count
  // changes only, not every DOM mutation in the roster.
  const statusRegion = el("div", {
    "aria-live": "polite",
    className: "roster-status visually-hidden",
  }, `Characters: ${roster.characters.length}. Crews: ${roster.crews.length}.`);

  const charactersList =
    roster.characters.length === 0
      ? el("p", { className: "empty uneven" }, "No characters yet.")
      : el(
          "ul",
          { className: "character-list" },
          ...roster.characters.map((c) => renderCharacter(c, onChanged)),
        );

  const crewsList =
    roster.crews.length === 0
      ? el("p", { className: "empty uneven" }, "No crews yet.")
      : el(
          "ul",
          { className: "crew-list" },
          ...roster.crews.map((cr) => renderCrew(cr, onChanged)),
        );

  const refreshBtn = el("button", {
    type: "button",
    className: "btn-secondary roster-refresh",
    title: "Refresh the roster",
  }, "Refresh");
  refreshBtn.addEventListener("click", onChanged);

  const section = el(
    "section",
    { className: "roster" },
    el(
      "div",
      { className: "roster-header", style: "display: flex; align-items: center; gap: 0.75em; flex-wrap: wrap;" },
      el("h1", { className: "page-title" }, "Roster"),
      searchInput,
      refreshBtn,
    ),
    statusRegion,
    el(
      "div",
      { className: "roster-characters torn-foot" },
      el("h2", {}, `Characters (${roster.characters.length})`),
      charactersList,
      el("a", { href: "/character/create", className: "btn-primary" }, "+ Create Character"),
    ),
    el(
      "div",
      { className: "roster-crews torn-foot" },
      el("h2", {}, `Crews (${roster.crews.length})`),
      crewsList,
      el("a", { href: "/crew/create", className: "btn-primary" }, "+ Create Crew"),
    ),
  );

  // OPT-008: filter handler — hide non-matching rows, keep degraded rows
  // visible (they have no name text to match). Queries within the section
  // element (not the root container) to avoid scope leakage.
  const applyFilter = () => {
    const q = searchInput.value.trim().toLowerCase();
    section.querySelectorAll("[data-character-id], [data-crew-id]").forEach((node) => {
      const e = node as HTMLElement;
      if (!q) { e.style.display = ""; return; }
      const text = (e.textContent || "").toLowerCase();
      e.style.display = text.includes(q) ? "" : "none";
    });
  };
  searchInput.addEventListener("input", applyFilter);

  return section;
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
  // OPT-008: aria-live moved to a narrow status region inside renderRoster.
  // The root no longer carries aria-live (FV-031: a broad aria-live on the
  // root announces every DOM mutation to AT users).

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
