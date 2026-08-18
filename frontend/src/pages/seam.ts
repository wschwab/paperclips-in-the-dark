/**
 * Test-only helper for FV-031: verifying that a create/history route root's
 * first h1 clears the torn seam under the app bar.
 *
 * happy-dom does not lay out the page, so genuine overlap can't be measured
 * with getBoundingClientRect. The geometric contract is carried by computed
 * style: the route root gets a top gutter (--gutter: 24px) while its h1 has
 * zero margin (base.css), so the h1 starts at the gutter below the seam. The
 * seam (--torn-depth: 14px) is shorter than that gutter, which is exactly the
 * "no overlap" guarantee. We load the real stylesheets so the computed values
 * reflect production CSS.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const CSS_FILES = [
  resolve(here, "../styles/theme.css"),
  resolve(here, "../styles/base.css"),
  resolve(here, "../styles/components.css"),
];

const STYLE_ID = "seam-styles";

/** Load the real stylesheets into the DOM so computed style reflects CSS. */
export function loadStylesheets(doc: Document = document): void {
  // Guard per document: each test file gets its own happy-dom document, so a
  // module-level flag would wrongly skip the later files.
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS_FILES.map((p) => readFileSync(p, "utf8")).join("\n");
  doc.head.appendChild(style);
}

/** The computed --torn-depth token (seam height) from the loaded theme. */
export function tornSeamDepth(doc: Document = document): number {
  return (
    parseFloat(
      getComputedStyle(doc.documentElement).getPropertyValue("--torn-depth"),
    ) || 0
  );
}

/**
 * The computed top gutter of the route root that owns the scope's first h1.
 * NaN if no h1 (or no wrapping section) is present.
 */
export function firstH1TopPadding(scope: HTMLElement): number {
  const h1 = scope.querySelector("h1");
  if (!h1) return Number.NaN;
  const section = h1.closest("section") as HTMLElement | null;
  if (!section) return Number.NaN;
  return parseFloat(getComputedStyle(section).paddingTop) || 0;
}

/**
 * FV-031 contract: the first h1 must sit on a top gutter strictly greater
 * than the seam depth (so its zero-margin glyphs cannot overlap the seam).
 */
export function assertFirstH1ClearsSeam(scope: HTMLElement): void {
  const top = firstH1TopPadding(scope);
  const seam = tornSeamDepth();
  if (Number.isNaN(top)) {
    throw new Error("assertFirstH1ClearsSeam: no route-root section/h1 found");
  }
  if (!(top > seam)) {
    throw new Error(
      `first h1 top gutter ${top}px does not clear the ${seam}px torn seam`,
    );
  }
}
