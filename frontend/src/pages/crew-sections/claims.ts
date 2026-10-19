/**
 * renderCrewClaimsSection: Claims map section controller. CREW-CLAIMS-EDIT-01:
 * one click acquires or relinquishes a claim. While the claim editor is open
 * (`state.claimEditor`), a click selects the claim to rename or rewrite instead.
 */
import { el } from "../../lib/dom.js";
import { extractCrewClaims } from "../crew-domain.js";
import { claimsGraph } from "../crew-domain.js";
import { effectiveClaim } from "../crew-domain.js";
import type { ClaimNode } from "../crew-domain.js";
import type { ClaimEditor, RenderState } from "../crew-detail.js";

export function renderCrewClaimsSection(state: RenderState): HTMLElement {
  const { c, handlers } = state;
  const editor = state.claimEditor;
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

    // CREW-02 (UX-008): every acquisition asks first. Out-of-sequence
    // acquisition remains permitted via its dedicated warning (contract allows
    // acquiring past missing links). Relinquish also asks first.
    const acquireMessage = (name: string, benefit: string, isConnected: boolean): string =>
      isConnected
        ? `Acquire the claim "${name}"${benefit ? ` — ${benefit}` : ""}?`
        : `WARNING — out-of-sequence acquisition. "${name}" is NOT connected to your controlled network ` +
          `(the Lair or any acquired claim), and crews usually expand claim by claim.\n\n` +
          `Acquire "${name}" anyway?`;

    const relinquishMessage = (name: string): string =>
      `Relinquish "${name}"? This removes the claim from your crew and its benefit stops applying. ` +
      `If it was linking further territory, that ground may become unreachable. You can re-acquire it later.`;

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
      const btn = el("button", {
        className: classes.join(" "),
        style: cellStyle(node),
        "aria-pressed": isClaimed ? "true" : "false",
        disabled: state.anyLoading,
        title: editor
          ? "Choose this claim to edit its name and text"
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
        !isClaimed && !isConnected ? el("span", { className: "claim-not-connected lbl" }, "not connected") : null,
        customized ? el("em", { className: "claim-custom-badge" }, "custom") : null,
      );
      btn.addEventListener("click", () => {
        if (state.anyLoading) return;
        if (editor) {
          handlers.onClaimEditSelect(node.id);
          return;
        }
        if (isClaimed) {
          if (window.confirm(relinquishMessage(name))) handlers.onClaimToggle(node.id, false);
        } else if (window.confirm(acquireMessage(name, description, isConnected))) {
          handlers.onClaimToggle(node.id, true);
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

    // Active benefits are read-only text: no per-claim buttons.
    const activeList = effective.filter((e) => controlled.has(e.node.id) && e.node.kind !== "lair");

    const editAction = el("button", {
      className: "claim-edit-start",
      disabled: state.anyLoading,
      title: "Choose a claim to rename or rewrite its text",
    }, "Edit claim");
    editAction.addEventListener("click", () => handlers.onClaimEditStart());

    const editPanel = !editor
      ? null
      : editor.kind === "choose"
        ? claimChooser(state)
        : claimEditForm(state, editor, overrides.some((o) => o.claimId === editor.claimId));

    return el(
      "section",
      { className: "crew-claims", "data-section": "claims" },
      el("h2", {}, "Claims"),
      el("p", { className: "rules-note", style: "margin-top: 0.35em;" },
        "Click a claim to acquire it. Every acquisition asks first, and a claim not connected to your network warns before joining. Click an acquired claim to relinquish it. Edit claim renames a claim or rewrites its text.",
      ),
      editor ? null : editAction,
      el("div", { className: "claims-map", style: "position: relative;" },
        el("div", {
          className: "claims-grid",
          style: `display: grid; grid-template-columns: repeat(${graph.columns}, minmax(0, 1fr)); grid-template-rows: repeat(${graph.rows}, 1fr); gap: 18px;`,
        }, edgeSvg, ...cells),
      ),
      editPanel,
      el("div", { className: "active-claims" },
        el("h3", { className: "lbl", style: "margin-top: 0.75em;" }, "Active claim benefits"),
        activeList.length === 0
          ? el("p", {}, "(no claims acquired)")
          : el("ul", { className: "active-claim-list" }, ...activeList.map((e) =>
              el("li", { key: e.node.id },
                el("strong", {}, e.name),
                e.description ? el("span", {}, ` — ${e.description}`) : null,
              ),
            )),
      ),
    );
  })();

}

/** Choose mode: the next claim click selects that claim for editing. */
function claimChooser(state: RenderState): HTMLElement {
  const cancel = el("button", { type: "button", disabled: state.anyLoading }, "Cancel");
  cancel.addEventListener("click", () => state.handlers.onClaimEditCancel());
  return el("div", { className: "claim-chooser" },
    el("p", { className: "rules-note" }, "Click a claim to edit its name and text. Choosing a claim does not change ownership."),
    cancel,
  );
}

/** Edit mode: an inline form for one claim. Drafts are written back to the editor object. */
function claimEditForm(
  state: RenderState,
  editor: Extract<ClaimEditor, { kind: "edit" }>,
  hasOverride: boolean,
): HTMLFormElement {
  const { handlers } = state;
  const busy = state.anyLoading;
  const nameInput = el("input", { type: "text", "aria-label": "Claim name", disabled: busy }) as HTMLInputElement;
  nameInput.value = editor.name;
  nameInput.addEventListener("input", () => { editor.name = nameInput.value; });
  const textInput = el("textarea", { "aria-label": "Claim text", rows: "3", disabled: busy }) as HTMLTextAreaElement;
  textInput.value = editor.description;
  textInput.addEventListener("input", () => { editor.description = textInput.value; });
  const save = el("button", { type: "submit", disabled: busy }, "Save");
  const reset = el("button", { type: "button", disabled: busy }, "Reset to default");
  reset.addEventListener("click", () => handlers.onClaimReset(editor.claimId));
  const cancel = el("button", { type: "button", disabled: busy }, "Cancel");
  cancel.addEventListener("click", () => handlers.onClaimEditCancel());
  const form = el("form", { className: "claim-editor" },
    el("h3", { className: "lbl" }, "Edit this claim"),
    el("label", { className: "lbl" }, "Name", nameInput),
    el("label", { className: "lbl" }, "Text", textInput),
    el("span", { className: "claim-editor-actions" }, save, hasOverride ? reset : null, cancel),
  ) as HTMLFormElement;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (busy) return;
    handlers.onClaimSave();
  });
  return form;
}
