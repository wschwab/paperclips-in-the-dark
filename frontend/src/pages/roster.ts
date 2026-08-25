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

// PERF-02: bounded rendering. The readable bulk is mapped into the DOM one
// page at a time; degraded rows are exempt — they are the recovery path, are
// always rendered immediately, and a query never hides them (their only text
// is fallback copy that would otherwise never match). Counts and search
// always run over the FULL result set, never just the rendered window.
export const ROSTER_PAGE_SIZE = 100;

/**
 * PERF-02 committed DOM budget for the sanctioned 1000-row benchmark mix
 * (70% readable / 10% unreadable / ~3% crews), measured against real
 * Chromium. Raising it means editing the pin in roster.test.ts deliberately,
 * not quietly.
 */
export const ROSTER_DOM_BUDGET_NODES = 2000;

/** Fields a roster row is searchable by; mirrors the visible row copy. */
function characterHaystack(c: CharacterSummary): string {
  return `${c.name} ${c.alias} ${c.playbook}`.toLowerCase();
}

function crewHaystack(cr: CrewSummary): string {
  return `${cr.name} ${cr.crewType}`.toLowerCase();
}

/**
 * Count surface shared by the status announcer; no DOM access.
 */
interface PlateCounts {
  readonly shownCount: number;
  matchCount(): number;
}

/**
 * One entity plate (list + pager) as a bounded-rendering controller.
 * The readable bulk is paged; degraded rows are always rendered.
 */
interface RosterPlate<T extends CharacterSummary | CrewSummary> extends PlateCounts {
  readonly listEl: HTMLElement;
  /** No-match message, rendered outside the <ul> for valid list semantics. */
  readonly noteEl: HTMLElement;
  readonly moreBtn: HTMLButtonElement;
  readonly readable: T[];
  readonly degraded: T[];
  /** Rendered window size, clamped to the current match count. */
  readonly shownCount: number;
  matchCount(): number;
  setQuery(q: string): void;
  renderWindow(): void;
}

function createPlate<T extends CharacterSummary | CrewSummary>(
  kind: EntityKind,
  all: readonly T[],
  haystack: (row: T) => string,
  renderRow: (row: T) => HTMLElement,
  onChanged: () => void,
  /** Invoked when this plate's rendered window changes outside a filter
   * cycle (Show more), so the composite announcer can update. */
  onWindowChange: () => void,
): RosterPlate<T> {
  const noun = kind === "character" ? "characters" : "crews";
  const readable: T[] = all.filter((row) => row.isReadable);
  const degraded: T[] = all.filter((row) => !row.isReadable);
  const listEl = el("ul", {
    className: kind === "character" ? "character-list" : "crew-list",
  });
  const moreBtn = el(
    "button",
    { type: "button", className: "btn-secondary roster-more" },
  ) as HTMLButtonElement;
  let shown = ROSTER_PAGE_SIZE;
  // Query lives outside the plate so one keystroke re-plates both kinds.
  const state = { query: "" };

  function matches(): T[] {
    if (!state.query) return readable;
    return readable.filter((row) => haystack(row).includes(state.query));
  }

  function rowFor(row: T): HTMLElement {
    const li = renderRow(row);
    li.tabIndex = -1;
    return li;
  }

  /** No-match note lives OUTSIDE the <ul>: a <p> is invalid as a list
   * child, and the recovery group must keep clean list semantics. */
  const noteEl = el("p", { className: "empty uneven roster-note" });

  /** Rebuild the list: recovery group first, then the rendered window. */
  function renderWindow(): void {
    setChildren(listEl);
    for (const d of degraded) {
      listEl.append(renderDegradedRow(kind, d, onChanged));
    }
    const pool = matches();
    for (const row of pool.slice(0, shown)) listEl.append(rowFor(row));
    if (state.query && pool.length === 0) {
      noteEl.textContent = `No ${noun} match “${state.query}”.`;
      noteEl.hidden = false;
    } else {
      noteEl.textContent = "";
      noteEl.hidden = true;
    }
    syncPager();
  }

  function syncPager(): void {
    const remaining = Math.max(0, matches().length - shown);
    moreBtn.hidden = remaining === 0;
    if (remaining > 0) {
      moreBtn.textContent = `Show ${Math.min(ROSTER_PAGE_SIZE, remaining)} more ${noun}`;
    }
  }

  function showMore(): void {
    const pool = matches();
    const before = Math.min(shown, pool.length);
    shown += ROSTER_PAGE_SIZE;
    const after = Math.min(shown, pool.length);
    let firstNew: HTMLElement | null = null;
    for (const row of pool.slice(before, after)) {
      const li = rowFor(row);
      if (!firstNew) firstNew = li;
      listEl.append(li);
    }
    // PERF-02 accessibility contract: keyboard/SR users land on the first
    // newly revealed row (rows carry tabindex="-1"); the compact status
    // region announces the new window — never the mutation itself.
    firstNew?.focus();
    syncPager();
    onWindowChange();
  }

  moreBtn.addEventListener("click", showMore);

  return {
    listEl,
    noteEl,
    moreBtn,
    readable,
    degraded,
    get shownCount() {
      return Math.min(shown, matches().length);
    },
    matchCount: () => matches().length,
    setQuery(q: string): void {
      state.query = q;
      shown = ROSTER_PAGE_SIZE;
      renderWindow();
    },
    renderWindow,
  };
}


/** Composite status-line text across both plates (single polite region). */
function statusText(
  charPlate: PlateCounts,
  crewPlate: PlateCounts,
  totalChars: number,
  totalCrews: number,
  query: string,
): string {
  if (query) {
    return `${charPlate.matchCount()} of ${totalChars} characters match. ` +
      `${crewPlate.matchCount()} of ${totalCrews} crews match.`;
  }
  return `Showing ${charPlate.shownCount} of ${totalChars} characters. ` +
    `Showing ${crewPlate.shownCount} of ${totalCrews} crews.`;
}

function renderRoster(roster: Roster, onChanged: () => void): HTMLElement {
  const searchInput = el("input", {
    type: "search",
    className: "roster-search",
    placeholder: "Search roster…",
    "aria-label": "Filter roster by name, alias, or playbook",
    autocomplete: "off",
  }) as HTMLInputElement;

  // OPT-008/PERF-02: narrow aria-live region announcing window/match counts.
  // Never attach aria-live to the root or lists (FV-031: a broad live region
  // announces every DOM mutation to AT users).
  const statusRegion = el("div", {
    "aria-live": "polite",
    className: "roster-status visually-hidden",
  });

  const refreshBtn = el("button", {
    type: "button",
    className: "btn-secondary roster-refresh",
    title: "Refresh the roster",
  }, "Refresh");
  refreshBtn.addEventListener("click", onChanged);

  const charPlate = createPlate(
    "character",
    roster.characters,
    characterHaystack,
    (c) => renderCharacter(c, onChanged),
    onChanged,
    () => syncStatus(),
  );
  const crewPlate = createPlate(
    "crew",
    roster.crews,
    crewHaystack,
    (cr) => renderCrew(cr, onChanged),
    onChanged,
    () => syncStatus(),
  );
  const totalChars = roster.characters.length;
  const totalCrews = roster.crews.length;

  const syncStatus = () => {
    statusRegion.textContent = statusText(charPlate, crewPlate, totalChars, totalCrews, query);
  };

  let query = "";
  const applyFilter = () => {
    query = searchInput.value.trim().toLowerCase();
    charPlate.setQuery(query);
    crewPlate.setQuery(query);
    syncStatus();
  };
  searchInput.addEventListener("input", applyFilter);

  charPlate.renderWindow();
  crewPlate.renderWindow();
  syncStatus();

  return el(
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
      el("h2", {}, `Characters (${totalChars})`),
      totalChars === 0
        ? el("p", { className: "empty uneven" }, "No characters yet.")
        : charPlate.listEl,
      charPlate.noteEl,
      charPlate.moreBtn,
    ),
    el(
      "div",
      { className: "roster-crews torn-foot" },
      el("h2", {}, `Crews (${totalCrews})`),
      totalCrews === 0
        ? el("p", { className: "empty uneven" }, "No crews yet.")
        : crewPlate.listEl,
      crewPlate.noteEl,
      crewPlate.moreBtn,
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
