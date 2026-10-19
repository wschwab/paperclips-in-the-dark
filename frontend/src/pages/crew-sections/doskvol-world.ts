/**
 * Doskvol stock data for the crew sheet. Faction names, tiers and holds come from the
 * campaign sheet; district summaries are app-written. See data/world/doskvol.json.
 * Choosing a stock row only fills the manual entry: the crew keeps its own records.
 */
import { el } from "../../lib/dom.js";
import worldData from "../../../../data/world/doskvol.json";

export interface StockFaction { name: string; group: string; tier: number; hold: string }
export interface StockLocation { name: string; description: string; descriptionAuthor: string; sources: readonly string[] }
export interface StockDistrict { name: string; tier: number; hold: string; summary: string; summaryAuthor: string; locations: StockLocation[] }

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI"];
export const DOSKVOL_FACTIONS: readonly StockFaction[] = worldData.factions;
export const DOSKVOL_DISTRICTS: readonly StockDistrict[] = worldData.districts;

/** Stock picker: one optgroup per sheet group; a blank placeholder keeps manual entry the default. */
export function stockFactionPicker(onPick: (faction: StockFaction) => void, disabled: boolean): HTMLSelectElement {
  const select = el(
    "select",
    { "aria-label": "Stock faction", disabled },
    el("option", { value: "" }, "Stock faction…"),
  );
  for (const group of worldData.groups) {
    const rows = DOSKVOL_FACTIONS.filter((f) => f.group === group);
    if (rows.length === 0) continue;
    const optgroup = el("optgroup", { label: group });
    for (const f of rows) optgroup.append(el("option", { value: f.name }, `${f.name} (tier ${ROMAN[f.tier] ?? f.tier})`));
    select.append(optgroup);
  }
  select.addEventListener("change", () => {
    const picked = DOSKVOL_FACTIONS.find((f) => f.name === select.value);
    if (picked) onPick(picked);
  });
  return select;
}

/** Collapsed disclosure listing each district with its summary and nested locations. */
export function doskvolDistrictsDisclosure(): HTMLElement {
  return el(
    "details",
    { className: "doskvol-districts" },
    el("summary", {}, `Doskvol districts (${DOSKVOL_DISTRICTS.length})`),
    el("p", { className: "rules-note" }, "Descriptions are written for this app. Canonical district and place names are sourced in the setting-content register."),
    ...DOSKVOL_DISTRICTS.map((d) =>
      el(
        "div",
        { className: "doskvol-district" },
        el("h4", {}, d.name),
        el("p", { className: "doskvol-meta" }, `Tier ${ROMAN[d.tier] ?? d.tier} · ${d.hold} hold`),
        el("p", { className: "doskvol-summary" }, d.summary),
        d.locations.length === 0
          ? el("p", { className: "doskvol-locations" }, "No confirmed locations available.")
          : el("ul", { className: "doskvol-locations" }, ...d.locations.map((loc) =>
            el("li", {}, el("strong", {}, loc.name), " — ", el("span", { className: "doskvol-location-description" }, loc.description)))),
      ),
    ),
  );
}
