/**
 * renderPlaybookSection (ARCH-02): playbook section controller, extracted verbatim from the
 * character-detail page's render pass. DOM output is unchanged.
 */
import { el } from "../../lib/dom.js";
import { xpBoxes } from "./shared.js";
import { extractSpecialAbilities } from "../character-domain.js";
import { abilityDescription } from "../character-domain.js";
import type { SectionCtx } from "./context.js";

export function renderPlaybookSection(ctx: SectionCtx): HTMLElement {
  const { state, c, handlers, gameData, playbookData, gameplayDisabled } = ctx;
  // -- Playbook (F2p) -----------------------------------------------------

return   (() => {
    const xp = c.playbook.experience;
    const takenByName = new Map(
      c.playbook.abilities.map((a) => [a.name, a]),
    );
    const specialAbilities = extractSpecialAbilities(playbookData, gameData, c.playbook.name);

    // Eligible = a catalog ability with remaining takes; the server enforces
    // ABILITY_MAXED at 0. The capability projection (SC-F3) reports remaining
    // takes only for abilities already taken on the DTO (timesTaken >= 1 per
    // contract), so an empty array means "nothing taken yet", not "nothing
    // takeable". Start from the full game-data catalog and drop any ability
    // whose projection entry shows 0 remaining; fall back to the local join
    // when the projection is unavailable.
    const capRemaining = new Map(
      (state.caps?.availableAbilityTakes ?? []).map((a) => [a.name, a.remaining]),
    );
    const eligible = specialAbilities.filter((sa) => {
      const name = String(sa.Name);
      const projectedRemaining = capRemaining.get(name);
      if (projectedRemaining !== undefined) return projectedRemaining > 0;
      const timesTakeable = typeof sa.TimesTakeable === "number" ? sa.TimesTakeable : 1;
      const taken = takenByName.get(name);
      return !taken || taken.timesTaken < timesTakeable;
    });

    // Playbook XP tracker: points/max with +/− and clear
    const xpMinusBtn = el("button", {
      type: "button",
      disabled: gameplayDisabled || xp.points <= 0,
      title: "Remove 1 playbook XP",
    }, "−1");
    xpMinusBtn.addEventListener("click", () => handlers.onPlaybookXpDelta(-1));
    const xpPlusBtn = el("button", {
      type: "button",
      disabled: gameplayDisabled || xp.points >= xp.max,
      title: "Add 1 playbook XP",
    }, "+1");
    xpPlusBtn.addEventListener("click", () => handlers.onPlaybookXpDelta(1));
    const xpClearBtn = el("button", {
      type: "button",
      disabled: gameplayDisabled || xp.points === 0,
      title: "Clear playbook XP",
    }, "clear");
    xpClearBtn.addEventListener("click", handlers.onPlaybookXpClear);
    // CHAR-06: heavy-box Score XP furniture; box clicks post deltas.
    const xpTrackEl = xpBoxes({
      value: xp.points,
      max: xp.max,
      label: "Playbook XP",
      disabled: gameplayDisabled,
      onChange: (next) => {
        const delta = next - xp.points;
        if (delta !== 0) handlers.onPlaybookXpDelta(delta);
      },
    });

    // Taken abilities from the DTO: name, timesTaken, description, remove
    const abilityEntries = c.playbook.abilities.map((a) =>
      el("div", {
        className: "ability-entry",
        "data-ability": a.name,
        style: "display: flex; align-items: flex-start; gap: 0.5em; margin: 0.35em 0;",
      },
        el("span", { className: "lbl", style: "min-width: 8em;" },
          a.name,
          a.timesTaken > 1 ? el("span", { className: "ability-times" }, ` ×${a.timesTaken}`) : null,
        ),
        // F2ab: taken abilities show their description — the DTO's stored
        // text, falling back to the game-data SpecialAbilities entry.
        el("p", { className: "serif", style: "flex: 1; margin: 0; font-size: 0.95em;" },
          abilityDescription(a, specialAbilities) || "No description available."),
        el("button", {
          type: "button",
          disabled: gameplayDisabled,
          title: `Remove ability: ${a.name}`,
        }, "✕"),
      ),
    );
    abilityEntries.forEach((entry, idx) => {
      const btn = entry.querySelector("button");
      if (btn) {
        btn.addEventListener("click", () => handlers.onAbilityRemove(c.playbook.abilities[idx]!.name));
      }
    });

    // Take menu: native select from game data + <details>/<summary> description
    const abilitySelect = el("select", {
      "aria-label": "Take ability",
      disabled: gameplayDisabled || eligible.length === 0,
    },
      el("option", { value: "" }, "Ability"),
      ...eligible.map((sa) => el("option", { value: String(sa.Name) }, String(sa.Name))),
    ) as HTMLSelectElement;

    const abilityDetails = el("details", { className: "ability-description" },
      el("summary", {}, ""),
      el("p", {}, ""),
    );
    const detailsSummary = abilityDetails.querySelector("summary") as HTMLElement;
    const detailsBody = abilityDetails.querySelector("p") as HTMLElement;
    const showAbilityDescription = (name: string) => {
      const sa = specialAbilities.find((x) => String(x.Name) === name);
      const desc = sa && typeof sa.Description === "string" ? sa.Description : "";
      detailsSummary.textContent = name || "—";
      detailsBody.textContent = desc || "No description available.";
      abilityDetails.hidden = name === "";
    };
    abilitySelect.addEventListener("change", () => showAbilityDescription(abilitySelect.value));
    if (eligible.length > 0) {
      abilitySelect.value = String(eligible[0]!.Name);
    }
    showAbilityDescription(abilitySelect.value);

    const takeBtn = el("button", {
      type: "button",
      disabled: gameplayDisabled || eligible.length === 0,
      title: "Take ability",
    }, state.isPlaybookLoading ? "…" : "+");
    takeBtn.addEventListener("click", handlers.onAbilityTake);

    return el("div", { className: "character-playbook", "data-section": "playbook" },
      el("h2", {}, "Playbook"),
      el("div", {
        className: "playbook-xp",
        style: "display: flex; align-items: center; gap: 0.5em; flex-wrap: wrap;",
      },
        el("span", { className: "lbl" }, "Playbook XP:"),
        el("span", {}, `${xp.points} / ${xp.max}`),
        xpTrackEl,
        xpMinusBtn,
        xpPlusBtn,
        xpClearBtn,
      ),
      el("h3", { className: "lbl", style: "margin-top: 1em;" }, "Special Abilities"),
      c.playbook.abilities.length === 0
        ? el("p", {}, "(none)")
        : el("div", { style: "display: flex; flex-direction: column;" }, ...abilityEntries),
      el("div", { style: "display: flex; gap: 0.5em; margin-top: 0.5em; align-items: center; flex-wrap: wrap;" },
        abilitySelect,
        takeBtn,
        abilityDetails,
      ),
      state.abilityNotice
        ? el("p", { className: "notice", style: "margin-top: 0.5em;" }, state.abilityNotice)
        : null,
    );
  })();

}
