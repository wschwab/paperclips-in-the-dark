/**
 * renderCrewPlaybookSection (ARCH-02): Playbook (abilities, upgrades, lair chart) section controller, extracted verbatim from
 * the crew-detail page's render pass. DOM output is unchanged.
 */
import { el } from "../../lib/dom.js";
import { extractCrewAbilities } from "../crew-domain.js";
import { extractCrewUpgrades } from "../crew-domain.js";
import { upgradeTotalBoxes } from "../crew-domain.js";
import { upgradeDescription } from "../crew-domain.js";
import type { RenderState } from "../crew-detail.js";

export function renderCrewPlaybookSection(state: RenderState): HTMLElement {
  const { c, handlers } = state;
  return (() => {
    const { anyLoading } = state;

    // CREW-02/CREW-04 shared pattern (CONTRACT-03): session-local edit-mode
    // toggle that reveals removal/decrement controls only while it is on.
    const advancementToggleBtn = el("button", {
      className: "advancement-toggle",
      "aria-pressed": state.advancementEdit ? "true" : "false",
      disabled: anyLoading,
    }, state.advancementEdit ? "Done editing" : "Edit advancements");
    advancementToggleBtn.addEventListener("click", () => handlers.onAdvancementEditToggle());

    // Game-data sources: per-crew-type endpoint preferred, CrewTypes list
    // fallback (both fetched in parallel on load; see mountCrewDetailPage).
    const specialAbilities = extractCrewAbilities(
      state.crewTypeData,
      state.crewTypesData,
      c.crewTypeName,
    );
    const upgradesData = extractCrewUpgrades(
      state.crewTypeData,
      state.crewTypesData,
      c.crewTypeName,
    );

    // SC-F3: take/box limits come from the server-computed capability catalog
    // (the client never joins settings + DTO state to find an enforced cap).
    // Game data remains a display-only lookup for descriptions.
    const upgradeCapByName = new Map(
      (state.crewCaps?.upgrades ?? []).map((u) => [u.name, u]),
    );

    // -- Special abilities --------------------------------------------------

    const takenByName = new Map(c.specialAbilities.map((a) => [a.name, a]));
    const abilityTimesTakeable = (sa: Record<string, unknown>) =>
      typeof sa.TimesTakeable === "number" ? sa.TimesTakeable : 1;
    const abilityDescription = (name: string) => {
      const sa = specialAbilities.find((x) => String(x.Name) === name);
      return sa && typeof sa.Description === "string" && sa.Description.length > 0
        ? sa.Description
        : "No description available.";
    };

    // Eligible = a catalog ability with remaining takes; the server enforces
    // ABILITY_MAXED at 0. Falls back to the game-data join when the
    // capability projection is unavailable.
    const eligible = state.crewCaps
      ? state.crewCaps.abilities
          .filter((a) => a.remaining > 0)
          .map((a) => ({ Name: a.name }))
      : specialAbilities.filter((sa) => {
          const name = String(sa.Name);
          const taken = takenByName.get(name);
          return !taken || taken.timesTaken < abilityTimesTakeable(sa);
        });

    const abilityEntries = c.specialAbilities.map((a) =>
      el("div", {
        className: "ability-entry",
        "data-ability": a.name,
        style: "display: flex; align-items: flex-start; gap: 0.5em; margin: 0.35em 0;",
      },
        el("span", { className: "lbl", style: "min-width: 8em;" },
          a.name,
          a.timesTaken > 1
            ? el("span", { className: "ability-times" }, ` ×${a.timesTaken}`)
            : null,
        ),
        el("p", { className: "serif", style: "flex: 1; margin: 0; font-size: 0.95em;" },
          abilityDescription(a.name),
        ),
        // CREW-04: removal only exists in advancement-edit mode.
        state.advancementEdit
          ? el("button", {
              type: "button",
              disabled: anyLoading,
              title: `Remove ability: ${a.name}`,
            }, "✕")
          : null,
      ),
    );
    abilityEntries.forEach((entry, idx) => {
      const btn = entry.querySelector("button");
      if (btn) {
        btn.addEventListener("click", () =>
          handlers.onAbilityRemove(c.specialAbilities[idx]!.name),
        );
      }
    });

    const abilitySelect = el("select", {
      "aria-label": "Take ability",
      disabled: anyLoading || eligible.length === 0,
    },
      el("option", { value: "" }, "Ability"),
      ...eligible.map((sa) => el("option", { value: String(sa.Name) }, String(sa.Name))),
    ) as HTMLSelectElement;
    // CREW-04 (UX-010): native <select> picker; its description block lives
    // BELOW this row (see abilityDetails below).
    // CREW-04 (UX-010): the selected ability's description renders as a
    // full-width block BELOW the picker row — not inside the picker flex row,
    // and without repeating the name the select already shows.
    const abilityDetails = el("p", {
      className: "ability-description",
      style: "width: 100%; margin: 0.25em 0 0; font-size: 0.95em;",
    });
    const showAbilityDescription = (name: string) => {
      abilityDetails.textContent = abilityDescription(name);
      abilityDetails.hidden = name === "";
    };
    abilitySelect.addEventListener("change", () => showAbilityDescription(abilitySelect.value));
    if (eligible.length > 0) {
      abilitySelect.value = String(eligible[0]!.Name);
    }
    showAbilityDescription(abilitySelect.value);

    const takeBtn = el("button", {
      type: "button",
      disabled: anyLoading || eligible.length === 0,
      title: "Take ability",
    }, state.isAbilityLoading ? "…" : "+");
    takeBtn.addEventListener("click", handlers.onAbilityTake);

    // -- Upgrades ------------------------------------------------------------

    const markedByName = new Map(c.upgrades.map((u) => [u.name, u.boxesMarked]));
    const findUpgrade = (name: string) =>
      upgradesData.find((u) => String(u.Name) === name);

    // Total boxes per upgrade come from the capability catalog (SC-F3),
    // falling back to crew-type game data when the projection is unavailable.
    const totalFor = (name: string): number =>
      upgradeCapByName.get(name)?.totalBoxes ?? upgradeTotalBoxes(findUpgrade(name));

    // List rows come from the DTO (name + boxesMarked); total and description
    // come from the capability catalog / game data — never hardcoded.
    const upgradeEntries = c.upgrades.map((u) => {
      const game = findUpgrade(u.name);
      const total = totalFor(u.name);
      const atMax = u.boxesMarked >= total;
      // CREW-04: unmarking a box only exists in advancement-edit mode.
      const unmarkBtn = state.advancementEdit
        ? el("button", {
            type: "button",
            disabled: anyLoading || u.boxesMarked <= 0,
            title: `Unmark upgrade: ${u.name}`,
          }, "−")
        : null;
      if (unmarkBtn) {
        unmarkBtn.addEventListener("click", () => handlers.onUpgradeUnmark(u.name));
      }
      const markBtn = el("button", {
        type: "button",
        disabled: anyLoading || atMax,
        title: `Mark upgrade: ${u.name}`,
      }, state.isUpgradeLoading ? "…" : "+");
      markBtn.addEventListener("click", () => handlers.onUpgradeMark(u.name));
      return el("div", {
        className: "upgrade-entry",
        "data-upgrade": u.name,
        style: "display: flex; align-items: flex-start; gap: 0.5em; margin: 0.35em 0;",
      },
        el("span", { className: "lbl", style: "min-width: 8em;" }, u.name),
        el("span", { className: "upgrade-count" }, `${u.boxesMarked} / ${total}`),
        el("p", { className: "serif", style: "flex: 1; margin: 0; font-size: 0.95em;" },
          upgradeDescription(game, u.name),
        ),
        unmarkBtn,
        markBtn,
      );
    });

    // Mark menu: native <select> of catalog upgrades not yet full — the way
    // to start a new upgrade (the DTO list only shows already-marked ones).
    const markable = state.crewCaps
      ? state.crewCaps.upgrades
          .filter((u) => u.remaining > 0)
          .map((u) => ({ Name: u.name }))
      : upgradesData.filter(
          (u) => (markedByName.get(String(u.Name)) ?? 0) < upgradeTotalBoxes(u),
        );
    const markSelect = el("select", {
      "aria-label": "Mark upgrade",
      disabled: anyLoading || markable.length === 0,
    },
      el("option", { value: "" }, "Upgrade"),
      ...markable.map((u) => el("option", { value: String(u.Name) }, String(u.Name))),
    ) as HTMLSelectElement;
    const markBtn = el("button", {
      type: "button",
      disabled: anyLoading || markable.length === 0,
      title: "Mark selected upgrade",
    }, state.isUpgradeLoading ? "…" : "+");
    markBtn.addEventListener("click", handlers.onUpgradeMarkMenu);

    // -- Lair chart ----------------------------------------------------------
    //
    // Per f2-sheet-plan.mdx the lair advancement chart is a RENDERING of the
    // same playbook-specific Upgrades data — no separate domain concept, no
    // hardcoded upgrade names. Rows: every game-data upgrade (in data order)
    // plus any DTO-only upgrades (older snapshots) appended. Clicking a box
    // marks/unmarks one box (upgrade.mark/upgrade.unmark are +1/−1 ops; there
    // is no set-to-N op).
    const chartRows = state.crewCaps
      ? state.crewCaps.upgrades.map((u) => ({
          name: u.name,
          total: u.totalBoxes,
          marked: u.marked,
        }))
      : [
          ...upgradesData.map((u) => ({
            name: String(u.Name),
            total: upgradeTotalBoxes(u),
            marked: markedByName.get(String(u.Name)) ?? 0,
          })),
          ...c.upgrades
            .filter((u) => !upgradesData.some((g) => String(g.Name) === u.name))
            .map((u) => ({
              name: u.name,
              total: Math.max(u.boxesMarked, 1),
              marked: u.boxesMarked,
            })),
        ];
    const chartRowsEl = chartRows.map((row) => {
      const boxes = [];
      for (let i = 1; i <= row.total; i++) {
        const filled = i <= row.marked;
        // CREW-04: a filled chart box is an unmark in disguise — inert until
        // advancement-edit mode is on.
        const box = el("button", {
          type: "button",
          className: "chart-box",
          "data-stress": filled ? "1" : "0",
          "data-index": String(i),
          "aria-label": `${row.name} box ${i}`,
          "aria-pressed": filled ? "true" : "false",
          disabled: anyLoading || (filled && !state.advancementEdit),
          title: filled
            ? (state.advancementEdit ? `Unmark ${row.name}` : `${row.name} box ${i}`)
            : `Mark ${row.name}`,
        });
        box.addEventListener("click", () => handlers.onChartBox(row.name, i));
        boxes.push(box);
      }
      return el("div", {
        className: "chart-row",
        "data-upgrade": row.name,
        style: "display: flex; align-items: center; gap: 0.6em; margin: 0.25em 0;",
      },
        el("span", { className: "lbl", style: "min-width: 8em;" }, row.name),
        el("span", { className: "chart-boxes", style: "display: inline-flex; gap: 4px;" }, ...boxes),
        el("span", { className: "chart-count" }, `${row.marked} / ${row.total}`),
      );
    });

    return el("div", { className: "crew-playbook", "data-section": "playbook" },
      el("div", { style: "display: flex; gap: 0.75em; align-items: baseline; flex-wrap: wrap;" },
        el("h2", {}, "Playbook"),
        // CREW-02/CREW-04 pattern (CONTRACT-03): session-local edit-mode
        // toggle; removal/decrement controls exist only while it's on.
        advancementToggleBtn,
      ),
      el("h3", { className: "lbl", style: "margin-top: 0.5em;" }, "Special Abilities"),
      c.specialAbilities.length === 0
        ? el("p", {}, "(none)")
        : el("div", { style: "display: flex; flex-direction: column;" }, ...abilityEntries),
      el("div", { className: "ability-picker-row", style: "display: flex; gap: 0.5em; margin-top: 0.5em; align-items: center; flex-wrap: wrap;" },
        abilitySelect,
        takeBtn,
      ),
      abilityDetails,
      el("div", { className: "crew-upgrades" },
        el("h3", { className: "lbl", style: "margin-top: 1em;" }, "Upgrades"),
        c.upgrades.length === 0
          ? el("p", {}, "(none)")
          : el("div", { style: "display: flex; flex-direction: column;" }, ...upgradeEntries),
        el("div", { style: "display: flex; gap: 0.5em; margin-top: 0.5em; align-items: center; flex-wrap: wrap;" },
          markSelect,
          markBtn,
        ),
      ),
      el("h3", { className: "lbl", style: "margin-top: 1em;" }, "Lair Chart"),
      el("p", { className: "rules-note", style: "margin-top: 0.35em;" },
        "The lair chart is a rendering of the crew type's Upgrades data (mark/unmark one box per click).",
      ),
      el("div", { className: "lair-chart", style: "display: flex; flex-direction: column;" },
        ...chartRowsEl,
      ),
    );
  })();

}
