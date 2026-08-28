/**
 * renderGearSection (ARCH-02): gear section controller, extracted verbatim from the
 * character-detail page's render pass. DOM output is unchanged.
 */
import { el } from "../../lib/dom.js";
import { extractGearMenu } from "../character-domain.js";
import type { SectionCtx } from "./context.js";

export function renderGearSection(ctx: SectionCtx): HTMLElement {
  const { state, c, handlers, gameData, playbookData, gameplayDisabled, loadLimitByCommitment } = ctx;
  // -- Gear (F2r) ---------------------------------------------------------

return   (() => {
    const gear = c.gear;
    const loadoutBulk = gear.loadout.reduce((sum, item) => sum + item.bulk, 0);
    // SC-F3: the load cap for the current commitment comes from the
    // server-computed capability projection (loadLimits; abilities such as
    // Mule raise it) — never a local formula. Falls back to the DTO value.
    const loadCap = loadLimitByCommitment.get(gear.commitment)?.maxBulk ?? gear.maxBulk;
    // Load headroom is derived, display-only: the cap minus the bulk sum of
    // committed items. Never hardcoded.
    const headroom = loadCap - loadoutBulk;

    // Loadout list: name + bulk per item, remove per item (gear.remove also
    // drops it from available gear, per the contract's sideEffect).
    const loadoutEntries = gear.loadout.map((item) =>
      el("div", {
        className: "gear-loadout-entry",
        "data-gear-item": item.name,
      },
        el("span", { className: "lbl" }, item.name),
        el("span", { className: "gear-item-bulk" }, `${item.bulk} bulk`),
        el("button", {
          type: "button",
          disabled: gameplayDisabled,
          title: `Remove gear: ${item.name}`,
        }, "✕"),
      ),
    );
    loadoutEntries.forEach((entry, idx) => {
      const btn = entry.querySelector("button");
      if (btn) {
        btn.addEventListener("click", () => handlers.onGearRemove(gear.loadout[idx]!.name));
      }
    });

    // Add menu: native <select> from playbook Items + SharedItems (game data
    // only, deduped by name), bulk shown, add button → gearAdd(name, bulk).
    // Per the plan idiom the menu lives in a <details>/<summary>.
    const gearMenu = extractGearMenu(playbookData, gameData, c.playbook.name);
    const addSelect = el("select", {
      "aria-label": "Add gear item",
      disabled: gameplayDisabled || gearMenu.length === 0,
    },
      el("option", { value: "" }, "Item"),
      ...gearMenu.map((m) => el("option", { value: m.name }, `${m.name} (bulk ${m.bulk})`)),
    );
    const addBtn = el("button", {
      type: "button",
      disabled: gameplayDisabled || gearMenu.length === 0,
      title: "Add gear item",
    }, state.isGearLoading ? "…" : "+");
    addBtn.addEventListener("click", handlers.onGearAdd);
    const addMenuDetails = el("details", { className: "gear-add-menu" },
      el("summary", {}, "Add item…"),
      el("div", { className: "gear-add-row", style: "display: flex; gap: 0.5em; align-items: center; margin-top: 0.35em;" },
        addSelect,
        addBtn,
      ),
    );

    // Commitment (load level) selector: contract commitment options. The
    // per-option maxima live server-side in game settings; the DTO carries
    // only the current commitment's maxBulk, so the summary above shows it.
    const commitmentOptions = ["light", "normal", "heavy", "encumbered"];
    const commitmentSelect = el("select", {
      "aria-label": "Set commitment",
      disabled: gameplayDisabled,
    },
      ...commitmentOptions.map((opt) => el("option", { value: opt }, opt)),
    ) as HTMLSelectElement;
    if (commitmentOptions.includes(gear.commitment)) {
      commitmentSelect.value = gear.commitment;
    }
    const commitmentBtn = el("button", {
      type: "button",
      disabled: gameplayDisabled,
      title: "Set commitment",
    }, state.isGearCommitmentLoading ? "…" : "set");
    commitmentBtn.addEventListener("click", handlers.onGearSetCommitment);

    // Lock toggle: gear.lock / gear.unlock. While locked the server rejects
    // set-commitment / commit / clear-commitments with COMMITMENT_LOCKED,
    // which surfaces through the op-error notice.
    const lockBtn = el("button", {
      type: "button",
      disabled: gameplayDisabled,
      title: gear.isCommitmentLocked ? "Unlock commitment" : "Lock commitment",
    }, state.isGearLockLoading ? "…" : gear.isCommitmentLocked ? "unlock" : "lock");
    lockBtn.addEventListener("click", handlers.onGearToggleLock);

    const clearBtn = el("button", {
      type: "button",
      disabled: gameplayDisabled || (gear.loadout.length === 0 && gear.commitment === "none"),
      title: "Clear commitments",
    }, state.isGearCommitmentLoading ? "…" : "clear");
    clearBtn.addEventListener("click", handlers.onGearClearCommitments);

    // Loadout selector: commit / uncommit buttons over available gear.
    // Committed items are marked "(in loadout)".
    const loadoutNames = new Set(gear.loadout.map((item) => item.name));
    const gearSelect = el("select", {
      "aria-label": "Select gear item",
      disabled: gameplayDisabled || gear.availableGear.length === 0,
    },
      el("option", { value: "" }, "Item"),
      ...gear.availableGear.map((item) =>
        el("option", { value: item.name }, `${item.name} (bulk ${item.bulk})${loadoutNames.has(item.name) ? " — in loadout" : ""}`)),
    );
    const commitBtn = el("button", {
      type: "button",
      disabled: gameplayDisabled || gear.availableGear.length === 0,
      title: "Commit selected gear",
    }, state.isGearLoading ? "…" : "commit");
    commitBtn.addEventListener("click", handlers.onGearCommit);
    const uncommitBtn = el("button", {
      type: "button",
      disabled: gameplayDisabled || gear.availableGear.length === 0,
      title: "Uncommit selected gear",
    }, state.isGearLoading ? "…" : "uncommit");
    uncommitBtn.addEventListener("click", handlers.onGearUncommit);

    return el("div", { className: "character-gear", "data-section": "gear" },
      el("h2", {}, "Gear"),
      el("div", { className: "gear-summary", style: "display: flex; align-items: center; gap: 0.5em; flex-wrap: wrap; margin: 0.35em 0;" },
        el("span", { className: "lbl" }, "Load:"),
        el("span", { className: "gear-bulk-sum" }, `${loadoutBulk} / ${loadCap}`),
        el("span", { className: "gear-headroom" }, `headroom ${headroom}`),
      ),
      el("h3", { className: "lbl", style: "margin-top: 0.5em;" }, "Loadout"),
      gear.loadout.length === 0
        ? el("p", { className: "gear-empty" }, "(nothing committed)")
        : el("div", { style: "display: flex; flex-direction: column;" }, ...loadoutEntries),
      addMenuDetails,
      el("h3", { className: "lbl", style: "margin-top: 1em;" }, "Commitment"),
      el("div", { className: "gear-commitment-row", style: "display: flex; gap: 0.5em; align-items: center; flex-wrap: wrap; margin: 0.35em 0;" },
        commitmentSelect,
        commitmentBtn,
        lockBtn,
        clearBtn,
      ),
      el("div", { className: "gear-select-row", style: "display: flex; gap: 0.5em; align-items: center; flex-wrap: wrap; margin: 0.35em 0;" },
        gearSelect,
        commitBtn,
        uncommitBtn,
      ),
    );
  })();

}
