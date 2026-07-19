/**
 * Theme controller — manual light/dark/auto + high-contrast toggle.
 *
 * Persistence is localStorage so the choice survives reloads; `auto`
 * clears the manual override and defers to prefers-color-scheme (via
 * the CSS in styles/theme.css).
 *
 * Data attributes written on <html>:
 *   data-theme="light|dark|auto"   (auto ≡ attribute removed)
 *   data-contrast="high"           (removed when normal)
 */

const STORAGE_THEME = "pitd.theme";
const STORAGE_CONTRAST = "pitd.contrast";

export type ThemeMode = "light" | "dark" | "auto";
export type ContrastMode = "normal" | "high";

function readStoredTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_THEME);
    if (v === "light" || v === "dark" || v === "auto") return v;
  } catch {
    /* private mode / SSR */
  }
  return "auto";
}

function readStoredContrast(): ContrastMode {
  try {
    if (localStorage.getItem(STORAGE_CONTRAST) === "high") return "high";
  } catch {
    /* private mode / SSR */
  }
  return "normal";
}

function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement;
  if (mode === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", mode);
}

function applyContrast(mode: ContrastMode): void {
  const root = document.documentElement;
  if (mode === "high") root.setAttribute("data-contrast", "high");
  else root.removeAttribute("data-contrast");
}

export function getTheme(): ThemeMode {
  return readStoredTheme();
}

export function getContrast(): ContrastMode {
  return readStoredContrast();
}

export function setTheme(mode: ThemeMode): void {
  try {
    if (mode === "auto") localStorage.removeItem(STORAGE_THEME);
    else localStorage.setItem(STORAGE_THEME, mode);
  } catch {
    /* ignore */
  }
  applyTheme(mode);
}

export function setContrast(mode: ContrastMode): void {
  try {
    if (mode === "normal") localStorage.removeItem(STORAGE_CONTRAST);
    else localStorage.setItem(STORAGE_CONTRAST, mode);
  } catch {
    /* ignore */
  }
  applyContrast(mode);
}

/** Apply stored preferences on boot (call once from main). */
export function initTheme(): void {
  applyTheme(readStoredTheme());
  applyContrast(readStoredContrast());
}

/**
 * Build the theme / contrast control pair used in the app bar.
 * Returns a <div.theme-controls> that reflects and changes state.
 */
export function mountThemeControls(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "theme-controls";
  wrap.setAttribute("role", "group");
  wrap.setAttribute("aria-label", "Theme");

  const modes: Array<{ id: ThemeMode; label: string }> = [
    { id: "auto", label: "Auto" },
    { id: "light", label: "Light" },
    { id: "dark", label: "Dark" },
  ];

  const buttons = new Map<ThemeMode, HTMLButtonElement>();

  for (const m of modes) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = m.label;
    b.dataset.theme = m.id;
    b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => {
      setTheme(m.id);
      refresh();
    });
    buttons.set(m.id, b);
    wrap.append(b);
  }

  const contrastBtn = document.createElement("button");
  contrastBtn.type = "button";
  contrastBtn.textContent = "Hi-C";
  contrastBtn.title = "Toggle high contrast";
  contrastBtn.setAttribute("aria-pressed", "false");
  contrastBtn.addEventListener("click", () => {
    setContrast(getContrast() === "high" ? "normal" : "high");
    refresh();
  });
  wrap.append(contrastBtn);

  function refresh(): void {
    const current = getTheme();
    for (const [id, b] of buttons) {
      b.setAttribute("aria-pressed", id === current ? "true" : "false");
    }
    contrastBtn.setAttribute(
      "aria-pressed",
      getContrast() === "high" ? "true" : "false",
    );
  }
  refresh();
  return wrap;
}
