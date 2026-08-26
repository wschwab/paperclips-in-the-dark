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
import { mountImportPage } from "./import.js";

/**
 * E11 total collections: an unreadable row (bytes that cannot be parsed) is
 * listed with canonical empties and a deleteToken; a repairable row is
 * degraded but recoverable. Both render without a detail link (direct GET
 * would 422) and get the degraded repair/delete controls instead.
 */
type RecoveryClass = "repairable" | "needs-input" | "unreadable";

const NOUN: Record<EntityKind, string> = { character: "character", crew: "crew" };

/**
 * RECOVERY-01: one line of visible, class-specific recovery copy per
 * degraded state. Rendered into the row's existing label span so the
 * PERF-02 DOM budget never grows with per-row explanation nodes.
 */
function recoveryNote(kind: EntityKind, state: RecoveryClass): string {
  const noun = NOUN[kind];
  switch (state) {
    case "repairable":
      return `Repairable ${noun} — stored data can be normalized once you preview and confirm Repair below.`;
    case "needs-input":
      return `Repairable ${noun} (needs input) — this repair waits for values. Fill in the fields below to continue.`;
    case "unreadable":
      return `Unreadable ${noun} — bytes cannot be parsed or normalized. Delete below, then use the Import ${noun}s action above to re-import.`;
  }
}

function classifyRow(row: Pick<CharacterSummary | CrewSummary, "isRepairable">): RecoveryClass {
  return row.isRepairable ? "repairable" : "unreadable";
}

/**
 * Degraded rows carry a `data-recovery-class` attribute plus matching copy:
 * repairable at rest; needs-input while its mounted controls await caller
 * values; unreadable otherwise.
 */
function renderDegradedRow(
  kind: EntityKind,
  row: Pick<CharacterSummary | CrewSummary, "id" | "isRepairable" | "deleteToken">,
  onChanged: () => void,
): HTMLElement {
  const attr = kind === "character" ? "data-character-id" : "data-crew-id";
  const labelEl = el("span", { className: "unnamed" });
  const controlsEl = el("div", { className: "degraded-controls-container" });
  const li = el(
    "li",
    { [attr]: row.id, "data-degraded": "", className: "degraded-row" },
    labelEl,
    controlsEl,
  );
  let state = classifyRow(row);
  const applyState = (next: RecoveryClass) => {
    state = next;
    li.setAttribute("data-recovery-class", next);
    labelEl.textContent = recoveryNote(kind, next);
  };
  applyState(state);

  // The needs-input state emerges inside the mounted controls when a repair
  // preview demands caller values (a .norm-inputs block) and ends when those
  // controls are cleared. Watch the container and keep the row's visible
  // class in step — including Cancel, stale-token failures, or re-preview.
  new MutationObserver(() => {
    const waitingForValues = !!controlsEl.querySelector(".norm-inputs");
    if (state === (waitingForValues ? "needs-input" : classifyRow(row))) return;
    applyState(waitingForValues ? "needs-input" : classifyRow(row));
  }).observe(controlsEl, { childList: true, subtree: true });

  mountDegradedControls(controlsEl, {
    kind,
    id: row.id,
    isRepairable: row.isRepairable,
    deleteToken: row.deleteToken,
    onChanged,
    preview: kind === "character" ? repairCharacterPreview : repairCrewPreview,
    apply: kind === "character" ? repairCharacterApply : repairCrewApply,
  });
  return li;
}

// RECOVERY-01: per-row Character/Crew Import links are gone — general import
// moved to roster-level panels (createImportPanel below); a readable row
// carries only its detail link.
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


/** Friendly headline for a readable summary row (mirrors the F-12/FV-018 fallbacks). */
function summaryHeadline(row: CharacterSummary | CrewSummary): string {
  if ("crewType" in row) {
    return row.name || `Unnamed ${row.crewType}`;
  }
  return row.name || row.alias || `Unnamed ${row.playbook}`;
}

/**
 * RECOVERY-01 roster-level general import: one disclosure panel per entity
 * kind. The flow — not an ordinary row — decides create vs replace: create
 * links to the existing creation route; replace mounts the shared import
 * page inline against a picked summary (readable rows key the confirming
 * apply by revision, degraded rows by their sha256 content token, so even an
 * unreadable row is re-importable without deleting it first). Options are
 * rebuilt when the disclosure opens, keeping closed-panel rendering inside
 * the PERF-02 DOM budget regardless of row count.
 */
function createImportPanel(
  kind: EntityKind,
  rows: readonly (CharacterSummary | CrewSummary)[],
  flowContainer: HTMLElement,
): HTMLDetailsElement {
  const noun = NOUN[kind];
  const select = el("select", {
    className: "import-target",
    "aria-label": `Choose an existing ${noun} entry to replace`,
  }) as HTMLSelectElement;
  const openBtn = el(
    "button",
    { type: "button", className: "btn-secondary import-open" },
    "Open import",
  ) as HTMLButtonElement;
  // Disabled until a replace target is chosen.
  openBtn.disabled = true;

  select.addEventListener("change", () => {
    openBtn.disabled = select.value === "";
  });

  openBtn.addEventListener("click", () => {
    if (openBtn.disabled) return;
    const target = rows.find((r) => r.id === select.value);
    if (!target) return;
    setChildren(flowContainer);
    // Contract: the confirming apply keys by entity revision for readable
    // targets and by the sha256 raw-byte content token for degraded ones.
    mountImportPage(
      flowContainer,
      kind,
      target.id,
      target.isReadable ? String(target.revision) : target.deleteToken,
    );
  });

  const panel = el(
    "details",
    { className: "roster-import-panel" },
    el("summary", {}, `Import ${noun}s…`),
    el(
      "p",
      { className: "roster-import-hint" },
      `Pick where this document goes — the flow previews it and confirms before writing.`,
      el("br"),
      el("a", { href: kind === "character" ? "/character/create" : "/crew/create" }, `Create a new ${noun}…`),
      " — or replace an existing entry:",
    ),
    select,
    el("div", { className: "form-actions" }, openBtn),
    flowContainer,
  ) as HTMLDetailsElement;

  panel.addEventListener("toggle", () => {
    if (panel.open) {
      setChildren(
        select,
        el("option", { value: "" }, `Replace an existing ${noun}…`),
        ...rows.map((row) =>
          el(
            "option",
            { value: row.id },
            row.isReadable
              ? `${summaryHeadline(row)} — replace (If-Match: revision ${row.revision})`
              : `Unreadable entry (${row.id}) — re-import via its content token`,
          ),
        ),
      );
      openBtn.disabled = select.value === "";
    }
  });

  return panel;
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
  // RECOVERY-01: per-kind general-import panels; flow containers live inside
  // the panels so a re-fetch (onChanged) tears the inline importer away with
  // the rest of the page.
  const charImportFlow = el("div", { className: "plate-import-flow" });
  const crewImportFlow = el("div", { className: "plate-import-flow" });

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
      createImportPanel("character", roster.characters, charImportFlow),
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
      createImportPanel("crew", roster.crews, crewImportFlow),
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
