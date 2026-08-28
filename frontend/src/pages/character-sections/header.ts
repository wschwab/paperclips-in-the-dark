/**
 * renderHeaderSection (ARCH-02): header section controller, extracted verbatim from the
 * character-detail page's render pass. DOM output is unchanged.
 */
import { el } from "../../lib/dom.js";
import type { SectionCtx } from "./context.js";

export function renderHeaderSection(ctx: SectionCtx): HTMLElement {
  const { c, status } = ctx;
  // Header — masthead carries name, alias, and the playbook/game kicker
  // (Design Audit F-23: identity metadata belongs with the name, not in
  // an orphaned eleventh card).
return   el(
    "div",
    { className: "character-header torn-foot torn-foot-lg", "data-section": "header" },
    el("p", { className: "character-kicker" }, `${c.playbook.name} · ${c.gameName}`),
    el("h1", {}, `${c.dossier.name || `Unnamed ${c.playbook.name}`}${status}`),
    el("p", { className: "alias uneven" }, c.dossier.alias),
    el(
      "nav",
      { className: "character-nav" },
      el("a", { href: `/character/${c.id}/history` }, "History"),
    ),
  );

}
