/**
 * renderCrewClaimsSection (ARCH-02): Claims map section controller, extracted verbatim from
 * the crew-detail page's render pass. DOM output is unchanged.
 */
import { el } from "../../lib/dom.js";
import { extractCrewClaims } from "../crew-domain.js";
import { claimsGraph } from "../crew-domain.js";
import { effectiveClaim } from "../crew-domain.js";
import type { ClaimNode } from "../crew-domain.js";
import type { RenderState } from "../crew-detail.js";

export function renderCrewClaimsSection(state: RenderState): HTMLElement {
  const { c, handlers } = state;
  return (() => {
    const claims = extractCrewClaims(state.crewTypeData, state.crewTypesData, c.crewTypeName);
    if (!claims) {
      return el(
        "section",
        { className: "crew-claims", "data-section": "claims" },
        el("h2", {}, "Claims"),
        el("p", { className: "lbl" }, "No claims map available for this crew type."),
      );
    }
    const graph = claimsGraph(claims);
    const controlled = new Set(c.claimedClaimIds);
    const overrides = c.claimOverrides;
    const effective = graph.nodes.map((n) => effectiveClaim(n, overrides));
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));

    // adjacency: every node's neighbors (undirected, no degree cap)
    const neighbors = new Map<string, Set<string>>();
    for (const e of graph.edges) {
      if (!neighbors.has(e.from)) neighbors.set(e.from, new Set());
      if (!neighbors.has(e.to)) neighbors.set(e.to, new Set());
      neighbors.get(e.from)!.add(e.to);
      neighbors.get(e.to)!.add(e.from);
    }
    const anchored = new Set(["lair", ...controlled]);
    const connected = new Set<string>();
    for (const id of anchored) {
      for (const n of neighbors.get(id) ?? []) connected.add(n);
    }

    // CREW-02 (UX-008): every acquisition asks first — a clearly worded
    // dialog is the primary interaction for connecting a claim node;
    // disconnecting one (relinquish) additionally requires the explicit
    // claim-edit mode. Out-of-sequence acquisition remains permitted via its
    // dedicated warning (contract allows acquiring past missing links).
    const acquireMessage = (name: string, benefit: string, isConnected: boolean): string =>
      isConnected
        ? `Acquire the claim "${name}"${benefit ? ` — ${benefit}` : ""}?`
        : `WARNING — out-of-sequence acquisition. "${name}" is NOT connected to your controlled network ` +
          `(the Lair or any acquired claim), and crews usually expand claim by claim.\n\n` +
          `Acquire "${name}" anyway?`;

    const relinquishMessage = (name: string): string =>
      `Relinquish "${name}"? This removes the claim from your crew and its benefit stops applying. ` +
      `If it was linking further territory, that ground may become unreachable. You can re-acquire it later.`;
    const onCustomize = (claimId: string) => {
      if (state.anyLoading) return;
      handlers.onClaimCustomize(claimId);
    };
    const onReset = (claimId: string) => {
      if (state.anyLoading) return;
      handlers.onClaimReset(claimId);
    };

    const cellStyle = (n: ClaimNode) =>
      `grid-column: ${n.column}; grid-row: ${n.row};`;

    const cells = effective.map(({ node, name, description, customized }) => {
      const isClaimed = controlled.has(node.id);
      const isLair = node.kind === "lair";
      const isConnected = !isClaimed && !isLair && connected.has(node.id);
      const classes = ["claim-cell", "claim-node"];
      if (isLair) classes.push("claim-lair");
      if (isClaimed) classes.push("claim-owned");
      if (isConnected) classes.push("claim-connected");
      if (customized) classes.push("claim-customized");
      if (isLair) {
        return el("div", { className: classes.join(" "), style: cellStyle(node) },
          el("strong", {}, "Lair"),
          el("span", {}, "Always controlled"),
        );
      }
      // Normal mode keeps acquisition front and center; an owned cell is
      // inert until claim-edit mode reveals removal.
      const removalLocked = isClaimed && !state.claimsEditMode;
      const btn = el("button", {
        className: classes.join(" "),
        style: cellStyle(node),
        "aria-pressed": isClaimed ? "true" : "false",
        disabled: state.anyLoading || removalLocked,
        title: removalLocked
          ? 'Enable "Edit claims" to relinquish'
          : isClaimed
            ? "Relinquish claim"
            : isConnected
              ? "Acquire claim"
              : "Acquire claim — not connected to your network",
      },
        el("strong", {}, name),
        description ? el("span", {}, description) : null,
        // CREW-02 #2: the disconnection warning is visible before clicking,
        // not only in the confirmation dialog.
        !isConnected ? el("span", { className: "claim-not-connected lbl" }, "not connected") : null,
        customized ? el("em", { className: "claim-custom-badge" }, "custom") : null,
      );
      btn.addEventListener("click", () => {
        if (state.anyLoading) return;
        if (isClaimed) {
          if (!state.claimsEditMode) return;
          if (window.confirm(relinquishMessage(name))) handlers.onClaimToggle(node.id, false);
        } else {
          if (window.confirm(acquireMessage(name, description, isConnected))) handlers.onClaimToggle(node.id, true);
        }
      });
      return btn;
    });

    // SVG edge layer (one line per edge, no degree cap). Rendered INSIDE the
    // grid spanning all tracks so its box matches the uniform 1fr cells;
    // viewBox is the grid's (cols×rows) so a node at (col,row) centers at
    // (col-0.5, row-0.5) in viewBox units.
    const edgeSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    edgeSvg.setAttribute("class", "claim-edges");
    edgeSvg.setAttribute("viewBox", `0 0 ${graph.columns} ${graph.rows}`);
    edgeSvg.setAttribute("preserveAspectRatio", "none");
    edgeSvg.setAttribute("aria-hidden", "true");
    for (const e of graph.edges) {
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      if (!a || !b) continue;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", String(a.column - 0.5));
      line.setAttribute("y1", String(a.row - 0.5));
      line.setAttribute("x2", String(b.column - 0.5));
      line.setAttribute("y2", String(b.row - 0.5));
      edgeSvg.appendChild(line);
    }

    const activeList = effective.filter((e) => controlled.has(e.node.id) && e.node.kind !== "lair");

    // CREW-02: session-local claim-edit mode; removal exists only while on.
    const editToggleBtn = el("button", {
      className: "claims-edit-toggle",
      "aria-pressed": state.claimsEditMode ? "true" : "false",
      disabled: state.anyLoading,
      title: state.claimsEditMode
        ? "Leave claim-edit mode"
        : "Enter claim-edit mode to relinquish acquired claims",
    }, state.claimsEditMode ? "Done editing" : "Edit claims");
    editToggleBtn.addEventListener("click", () => handlers.onClaimsEditToggle());

    return el(
      "section",
      { className: "crew-claims", "data-section": "claims" },
      el("h2", {}, "Claims"),
      editToggleBtn,
      el("p", { className: "rules-note", style: "margin-top: 0.35em;" },
        "Click a claim to acquire it — every acquisition asks first, and a claim not connected to your network warns before joining. Relinquishing an acquired claim lives inside Edit claims.",
      ),
      el("div", { className: "claims-map", style: "position: relative;" },
        el("div", {
          className: "claims-grid",
          style: `display: grid; grid-template-columns: repeat(${graph.columns}, 1fr); grid-template-rows: repeat(${graph.rows}, 1fr); gap: 18px;`,
        }, edgeSvg, ...cells),
      ),
      el("div", { className: "active-claims" },
        el("h3", { className: "lbl", style: "margin-top: 0.75em;" }, "Active claim benefits"),
        activeList.length === 0
          ? el("p", {}, "(no claims acquired)")
          : el("ul", { className: "active-claim-list" }, ...activeList.map((e) => {
              const li = el("li", { key: e.node.id },
                el("strong", {}, e.name),
                e.description ? el("span", {}, ` — ${e.description}`) : null,
              );
              const customizeBtn = el("button", { disabled: state.anyLoading }, "Customize");
              customizeBtn.addEventListener("click", () => onCustomize(e.node.id));
              li.appendChild(customizeBtn);
              if (overrides.some((o) => o.claimId === e.node.id)) {
                const resetBtn = el("button", { disabled: state.anyLoading }, "Reset to default");
                resetBtn.addEventListener("click", () => onReset(e.node.id));
                li.appendChild(resetBtn);
              }
              // CREW-02: removal only inside claim-edit mode, with its own
              // strong confirmation.
              if (state.claimsEditMode) {
                const relBtn = el("button", { disabled: state.anyLoading }, "Relinquish");
                relBtn.addEventListener("click", () => {
                  if (window.confirm(relinquishMessage(e.name))) handlers.onClaimToggle(e.node.id, false);
                });
                li.appendChild(relBtn);
              }
              return li;
            })),
      ),
    );
  })();

}
