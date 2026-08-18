import { el, setChildren } from "./lib/dom.js";
import { initTheme } from "./lib/theme.js";
import { ApiError, DecodeError, transportErrorText, decodeErrorText, getPlaybookList, getCrewTypeList, getCharacter, getCrew } from "./api/client.js";
import { errorCard } from "./components/error-card.js";
import { mountRosterPage } from "./pages/roster.js";
import { mountImportPage } from "./pages/import.js";
import { mountCharacterDetailPage } from "./pages/character-detail.js";
import { mountCharacterHistoryPage } from "./pages/character-history.js";
import { mountCharacterCreatePage } from "./pages/character-create.js";
import { mountCrewDetailPage } from "./pages/crew-detail.js";
import { mountCrewHistoryPage } from "./pages/crew-history.js";
import { mountCrewCreatePage } from "./pages/crew-create.js";
import { renderShell } from "./pages/shell.js";
import { mountStyleguidePage } from "./pages/styleguide.js";
import { Effect } from "effect";

import "./styles/fonts.css";
import "./styles/theme.css";
import "./styles/base.css";
import "./styles/components.css";

initTheme();

const appEl = document.querySelector<HTMLElement>("#app");
if (!appEl) {
  throw new Error("#app root missing");
}
const app: HTMLElement = appEl;

type Disposer = () => void;
let disposePage: Disposer | undefined;

/**
 * Friendly copy for create-page load failures (FV-020/FV-023): per-class
 * transport/decode text, never raw "ApiError: ..." strings or parser text.
 */
function createLoadErrorText(err: unknown): string {
  if (err instanceof ApiError) return transportErrorText(err);
  if (err instanceof DecodeError) return decodeErrorText(err);
  return "Something went wrong while loading — try again.";
}

/** True when a 422 ApiError body decodes to an INVALID_ENTITY operation error
 * (a degraded/repairable stored entity whose direct GET cannot be read). */
function isInvalidEntity(err: ApiError): boolean {
  if (err.status !== 422) return false;
  try {
    const parsed = JSON.parse(err.body) as { error?: { code?: string } };
    return parsed?.error?.code === "INVALID_ENTITY";
  } catch {
    return false;
  }
}

/**
 * Friendly copy for import-route load failures (FV-020/SC-F2): a repairable
 * stored entity points the user at the roster's repair controls instead of
 * dumping the raw 422 JSON/parser payload; everything else gets per-class
 * transport/decode text.
 */
function importLoadErrorText(err: unknown): string {
  if (err instanceof ApiError && isInvalidEntity(err)) {
    return "This entry's stored data needs repair — open the roster to repair it, then try the import again.";
  }
  return createLoadErrorText(err);
}

function currentPath(): string {
  return window.location.pathname.replace(/\/+$/, "") || "/";
}

/**
 * FV-013: after a client-side route change, move focus to the new page's
 * <main> landmark (tabindex=-1, the same target as the skip link) so
 * keyboard/AT users are not dropped back to BODY after every navigation.
 * The initial page load is untouched: focus stays on BODY there, which is
 * exactly what makes the skip link meaningful for fresh loads.
 */
function focusRouteTarget(): void {
  document.querySelector<HTMLElement>("#main")?.focus();
}

function navigate(path: string): void {
  if (path !== currentPath()) {
    window.history.pushState({}, "", path);
  }
  render();
  focusRouteTarget();
}

function render(): void {
  disposePage?.();
  disposePage = undefined;

  let path = currentPath();
  // F2aa: the default route lands on the roster. "/" (the old F0 health
  // landing) redirects to /roster so the app opens on the campaign roster.
  if (path === "/") {
    window.history.replaceState({}, "", "/roster");
    path = "/roster";
  }
  const { shell, outlet } = renderShell({ currentPath: path });
  setChildren(app, shell);

  if (path === "/styleguide") {
    document.title = "Style guide — Paperclips in the Dark";
    disposePage = mountStyleguidePage(outlet);
    return;
  }

  if (path === "/roster") {
    document.title = "Roster — Paperclips in the Dark";
    disposePage = mountRosterPage(outlet);
    return;
  }

  if (path === "/character/create") {
    document.title = "Create Character — Paperclips in the Dark";
    const createOutlet = outlet;
    let cancelled = false;

    disposePage = () => {
      cancelled = true;
    };

    // FV-020: a failed game-data load renders the recoverable error card
    // (one h1, Retry, roster escape) instead of plain developer text.
    const loadPlaybooks = () => {
      if (cancelled) return;
      createOutlet.textContent = "Loading playbooks…";
      void Effect.runPromise(
        Effect.match(getPlaybookList("blades-in-the-dark"), {
          onFailure: (err) => {
            if (cancelled) return;
            setChildren(
              createOutlet,
              errorCard({
                headline: "Couldn't load the playbooks",
                detail: createLoadErrorText(err),
                onRetry: loadPlaybooks,
              }),
            );
          },
          onSuccess: (playbooks) => {
            if (cancelled) return;
            const createDisposer = mountCharacterCreatePage(
              createOutlet,
              "blades-in-the-dark",
              Array.from(playbooks),
              (character) => {
                navigate(`/character/${character.id}`);
              },
            );
            disposePage = createDisposer;
          },
        }),
      );
    };
    loadPlaybooks();
    return;
  }

  if (path === "/crew/create") {
    document.title = "Create Crew — Paperclips in the Dark";
    const createOutlet = outlet;
    let cancelled = false;

    disposePage = () => {
      cancelled = true;
    };

    const loadCrewTypes = () => {
      if (cancelled) return;
      createOutlet.textContent = "Loading crew types…";
      void Effect.runPromise(
        Effect.match(getCrewTypeList("blades-in-the-dark"), {
          onFailure: (err) => {
            if (cancelled) return;
            setChildren(
              createOutlet,
              errorCard({
                headline: "Couldn't load the crew types",
                detail: createLoadErrorText(err),
                onRetry: loadCrewTypes,
              }),
            );
          },
          onSuccess: (crewTypes) => {
            if (cancelled) return;
            const createDisposer = mountCrewCreatePage(
              createOutlet,
              "blades-in-the-dark",
              Array.from(crewTypes),
              (crew) => {
                navigate(`/crew/${crew.id}`);
              },
            );
            disposePage = createDisposer;
          },
        }),
      );
    };
    loadCrewTypes();
    return;
  }

  const charImportMatch = path.match(/^\/character\/([A-Za-z0-9-]+)\/import$/);
  if (charImportMatch) {
    const characterId = charImportMatch[1];
    document.title = "Import Character — Paperclips in the Dark";
    setChildren(outlet, el("div", { className: "import-root" }));
    const importOutlet = outlet.firstElementChild as HTMLElement;
    let cancelled = false;
    disposePage = () => {
      cancelled = true;
    };

    // FV-020/SC-F2: a failed load (including a repairable stored entity whose
    // direct GET 422s) renders the recoverable error card with friendly copy —
    // never the raw 422 JSON/parser payload.
    const loadCharacter = () => {
      if (cancelled) return;
      importOutlet.textContent = "Loading character…";
      void Effect.runPromise(
        Effect.match(getCharacter(characterId), {
          onFailure: (err) => {
            if (cancelled) return;
            setChildren(
              importOutlet,
              errorCard({
                headline: "This character could not be loaded for import.",
                detail: importLoadErrorText(err),
                onRetry: loadCharacter,
              }),
            );
          },
          onSuccess: (character) => {
            if (cancelled) return;
            // If-Match for the confirming apply: the current entity revision.
            disposePage = mountImportPage(importOutlet, "character", characterId, String(character.revision));
          },
        }),
      );
    };
    loadCharacter();
    return;
  }

  const charMatch = path.match(/^\/character\/([A-Za-z0-9-]+)$/);
  if (charMatch) {
    const characterId = charMatch[1];
    document.title = "Character — Paperclips in the Dark";
    disposePage = mountCharacterDetailPage(outlet, characterId);
    return;
  }

  const charHistoryMatch = path.match(/^\/character\/([A-Za-z0-9-]+)\/history$/);
  if (charHistoryMatch) {
    const characterId = charHistoryMatch[1];
    document.title = "Character History — Paperclips in the Dark";
    disposePage = mountCharacterHistoryPage(outlet, characterId);
    return;
  }

  const crewImportMatch = path.match(/^\/crew\/([A-Za-z0-9-]+)\/import$/);
  if (crewImportMatch) {
    const crewId = crewImportMatch[1];
    document.title = "Import Crew — Paperclips in the Dark";
    setChildren(outlet, el("div", { className: "import-root" }));
    const importOutlet = outlet.firstElementChild as HTMLElement;
    let cancelled = false;
    disposePage = () => {
      cancelled = true;
    };

    // FV-020/SC-F2: same friendly recovery as the character import route.
    const loadCrew = () => {
      if (cancelled) return;
      importOutlet.textContent = "Loading crew…";
      void Effect.runPromise(
        Effect.match(getCrew(crewId), {
          onFailure: (err) => {
            if (cancelled) return;
            setChildren(
              importOutlet,
              errorCard({
                headline: "This crew could not be loaded for import.",
                detail: importLoadErrorText(err),
                onRetry: loadCrew,
              }),
            );
          },
          onSuccess: (crew) => {
            if (cancelled) return;
            disposePage = mountImportPage(importOutlet, "crew", crewId, String(crew.revision));
          },
        }),
      );
    };
    loadCrew();
    return;
  }

  const crewMatch = path.match(/^\/crew\/([A-Za-z0-9-]+)$/);
  if (crewMatch) {
    const crewId = crewMatch[1];
    document.title = "Crew — Paperclips in the Dark";
    disposePage = mountCrewDetailPage(outlet, crewId);
    return;
  }

  const crewHistoryMatch = path.match(/^\/crew\/([A-Za-z0-9-]+)\/history$/);
  if (crewHistoryMatch) {
    const crewId = crewHistoryMatch[1];
    document.title = "Crew History — Paperclips in the Dark";
    disposePage = mountCrewHistoryPage(outlet, crewId);
    return;
  }

  // FV-030: unknown routes are a real 404 — one page-level h1 and a single
  // roster escape link, never a silent health-page fallback (which would
  // claim HTTP 200 for a nonexistent route). No API fetch happens here.
  document.title = "Page not found — Paperclips in the Dark";
  setChildren(
    outlet,
    el(
      "section",
      { className: "not-found" },
      el("h1", {}, "Page not found"),
      el(
        "p",
        { className: "not-found-hint" },
        "The page you're after doesn't exist or has moved.",
      ),
      el("a", { href: "/roster", className: "btn-primary" }, "Back to roster"),
    ),
  );
  disposePage = undefined;
}

// Intercept same-origin link clicks for client routing (no full reload).
document.addEventListener("click", (ev) => {
  const t = ev.target;
  if (!(t instanceof Element)) return;
  const a = t.closest("a");
  if (!a) return;
  if (a.target === "_blank" || a.hasAttribute("download")) return;
  const href = a.getAttribute("href");
  if (!href || href.startsWith("http") || href.startsWith("mailto:")) return;
  if (href.startsWith("#")) return;
  // only internal paths
  if (!href.startsWith("/")) return;
  ev.preventDefault();
  navigate(href);
});

window.addEventListener("popstate", () => {
  render();
  focusRouteTarget();
});

render();
