/**
 * renderHealthSection (ARCH-02): health section controller, extracted verbatim from the
 * character-detail page's render pass. DOM output is unchanged.
 */
import { el } from "../../lib/dom.js";
import { clock } from "../../components/clock.js";
import { harmTable } from "../../components/harm-table.js";
import type { HarmLevel } from "../../components/harm-table.js";
import { activeHarms } from "../character-domain.js";
import type { SectionCtx } from "./context.js";

export function renderHealthSection(ctx: SectionCtx): HTMLElement {
  const { state, c, handlers, gameplayDisabled, harmCapByLevel } = ctx;
  // -- Health (F2n) -------------------------------------------------------

return   el(
    "div",
    { className: "character-health", "data-section": "health" },
    el("h2", {}, "Health"),

    // Harm table — routed through the shared component (Design Audit
    // F-03 / F-05) so the sheet and styleguide render identically.
    (() => {
      const h = c.monitor.harm;
      // SC-F3: harm slot capacities come from the server-computed capability
      // projection (harmCapacities) — never hardcoded, never a local settings
      // join. Falls back to the shared component's canonical default.
      const harmLevels: HarmLevel[] = ["lesser", "moderate", "severe", "fatal"];
      return harmTable({
        caption: "Harm",
        disabled: gameplayDisabled,
        rows: harmLevels.map((level) => {
          const entries = h[level] as readonly string[];
          return {
            level,
            label: level[0]!.toUpperCase() + level.slice(1),
            slots: entries,
            capacity: harmCapByLevel.get(level)?.capacity,
            onRemove: (slotIndex, text) => {
              const desc = text || entries[slotIndex] || "";
              if (desc) handlers.onHarmRemove(desc, level);
            },
          };
        }),
      });
    })(),

    // Harm spillover notice
    state.harmSpillNotice
      ? el("p", { className: "notice", style: "margin-top: 0.5em;" }, state.harmSpillNotice)
      : null,

    // Add harm controls
    el("div", { className: "harm-add-row", style: "display: flex; gap: 0.5em; margin-top: 0.5em; align-items: center;" },
      el("select", { "aria-label": "Harm intensity", disabled: gameplayDisabled },
        el("option", { value: "" }, "Severity"),
        el("option", { value: "lesser" }, "Lesser"),
        el("option", { value: "moderate" }, "Moderate"),
        el("option", { value: "severe" }, "Severe"),
        el("option", { value: "fatal" }, "Fatal"),
      ),
      el("input", {
        type: "text",
        "aria-label": "Harm description",
        disabled: gameplayDisabled,
        placeholder: "injury description",
      }),
      (() => {
        const addBtn = el("button", {
          type: "button",
          disabled: gameplayDisabled,
          title: "Add harm",
        }, state.isHarmLoading ? "…" : "+");
        addBtn.addEventListener("click", handlers.onHarmAdd);
        return addBtn;
      })(),
    ),

    // Armor checkboxes
    (() => {
      const armorKinds = [
        { key: "standard" as const, label: "Standard", has: c.monitor.armor.hasStandard, used: c.monitor.armor.standardUsed },
        { key: "heavy" as const, label: "Heavy", has: c.monitor.armor.hasHeavy, used: c.monitor.armor.heavyUsed },
        { key: "special" as const, label: "Special", has: c.monitor.armor.hasSpecial, used: c.monitor.armor.specialUsed },
      ];
      const armorLabels = armorKinds.map((a) => {
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.dataset.armorKind = a.key;
        cb.disabled = gameplayDisabled || !a.has;
        cb.checked = a.used;
        cb.addEventListener("change", () => {
          handlers.onArmorSet(a.key, cb.checked);
        });
        return el("label", { style: "display: flex; align-items: center; gap: 0.25em;" },
          cb,
          el("span", {}, `${a.label}${!a.has ? " (n/a)" : ""}`),
        );
      });
      return el("div", { style: "margin-top: 1em;" },
        el("h3", { className: "lbl" }, "Armor"),
        el("div", { style: "display: flex; gap: 1em; flex-wrap: wrap;" }, ...armorLabels),
      );
    })(),

    // Healing clock + heal picker (F2ab: harm.heal targets one specific harm)
    (() => {
      const hc = c.monitor.harm.healingClock;
      const clockFull = hc.segments >= hc.size;
      const harms = activeHarms(c);

      const clockEl = clock({
        segments: hc.size,
        value: hc.segments,
        label: "Healing",
        size: 100,
      });

      const addSegmentBtn = el("button", {
        type: "button",
        disabled: gameplayDisabled || state.isClockLoading,
        title: "Add healing segment",
      }, state.isClockLoading ? "…" : "+1 segment");
      addSegmentBtn.addEventListener("click", handlers.onHarmHealingClock);

      const healSelect = el("select", {
        "aria-label": "Harm to heal",
        disabled: gameplayDisabled || harms.length === 0,
      },
        el("option", { value: "" }, "Harm"),
        ...harms.map((h, idx) =>
          el("option", { value: String(idx) }, `${h.intensity}: ${h.description}`)),
      ) as HTMLSelectElement;

      const healBtn = el("button", {
        type: "button",
        disabled: gameplayDisabled || state.isHealLoading || !clockFull || harms.length === 0,
        title: "Heal harm (requires full clock)",
      }, state.isHealLoading ? "…" : "Heal");
      healBtn.addEventListener("click", handlers.onHarmHeal);

      return el("div", { style: "margin-top: 1em;" },
        el("h3", { className: "lbl" }, "Healing Clock"),
        clockEl,
        hc.rollover > 0
          ? el("p", { className: "lbl", style: "margin-top: 0.35em;" },
              `(overflow ${hc.rollover} — carries past the reset)`)
          : null,
        el("div", { style: "display: flex; gap: 0.5em; margin-top: 0.5em; align-items: center; flex-wrap: wrap;" },
          addSegmentBtn,
          healSelect,
          healBtn,
        ),
        clockFull && harms.length === 0
          ? el("p", { className: "lbl", style: "margin-top: 0.35em;" }, "(no harms to heal)")
          : null,
        state.healNotice
          ? el("p", { className: "notice", style: "margin-top: 0.35em;" }, state.healNotice)
          : null,
      );
    })(),
  );

}
