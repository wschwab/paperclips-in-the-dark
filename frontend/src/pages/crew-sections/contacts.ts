/** Contacts and manual faction records; optional stock controls appear only when world data is present. */
import { el } from "../../lib/dom.js";
import type { RenderState } from "../crew-detail.js";
import { doskvolDistrictsDisclosure, stockFactionPicker } from "./doskvol-world.js";

export function renderCrewContactsSection(state: RenderState): HTMLElement {
  const { c, handlers } = state;
  // -- Contacts & Factions (F2y) ---------------------------------------------

  const contacts = c.contacts ?? [];
  const factions = c.factions ?? [];

  const contactEntries = contacts.map((contact) =>
    el(
      "div",
      { className: "contact-entry", style: "display: flex; align-items: center; gap: 0.5em;" },
      el("span", { className: "contact-name" }, contact.name),
      el("span", { className: "contact-profession" }, contact.profession || ""),
      el("button", {
        type: "button",
        disabled: state.anyLoading,
        title: `Remove contact: ${contact.name}`,
      }, "✕"),
    ),
  );
  contactEntries.forEach((entry, idx) => {
    const btn = entry.querySelector("button");
    if (btn) {
      btn.addEventListener("click", () => handlers.onContactRemove(contacts[idx]!.name));
    }
  });

  const contactNameInput = el("input", {
    type: "text",
    "aria-label": "Contact name",
    disabled: state.anyLoading,
    placeholder: "name",
  });
  (contactNameInput as HTMLInputElement).value = state.contactDraft.name;
  contactNameInput.addEventListener("input", () => { state.contactDraft.name = (contactNameInput as HTMLInputElement).value; });
  const contactProfessionInput = el("input", {
    type: "text",
    "aria-label": "Contact profession",
    disabled: state.anyLoading,
    placeholder: "profession",
  });
  (contactProfessionInput as HTMLInputElement).value = state.contactDraft.profession;
  contactProfessionInput.addEventListener("input", () => { state.contactDraft.profession = (contactProfessionInput as HTMLInputElement).value; });
  const addContactBtn = el("button", {
    type: "button",
    disabled: state.anyLoading,
    title: "Add contact",
  }, state.isContactLoading ? "…" : "+");
  addContactBtn.addEventListener("click", handlers.onContactAdd);

  const drafts = state.factionDrafts;
  const validation = el("p", { className: "faction-validation", role: "alert", hidden: !drafts.error }, drafts.error ?? "");
  const submitFaction = (name: string, tierText: string, statusText: string, adding = false) => {
    const tier = tierText.trim() === "" ? null : Number(tierText);
    const status = statusText.trim() === "" ? NaN : Number(statusText);
    const message = !name.trim() ? "Enter a faction name." :
      (tier !== null && (!Number.isSafeInteger(tier) || tier < 0)) ? "Tier must be a nonnegative integer, or blank to clear." :
      !Number.isSafeInteger(status) ? "Status must be an integer." : null;
    drafts.error = message;
    validation.textContent = message ?? "";
    validation.hidden = message === null;
    if (message) return;
    if (adding) drafts.add = { name: name.trim(), tier: tierText, status: statusText };
    else drafts.rows.set(name, { tier: tierText, status: statusText });
    handlers.onFactionSetStatus(adding ? name.trim() : name, status, tier, adding);
  };
  const factionEntries = factions.map((faction) => {
    const draft = drafts.rows.get(faction.name) ?? { tier: faction.tier === undefined ? "" : String(faction.tier), status: String(faction.status) };
    const tierInput = el("input", {
      type: "number", min: "0", step: "1",
      "aria-label": `Set tier for ${faction.name}`,
      disabled: state.anyLoading, value: draft.tier,
    });
    const statusInput = el("input", {
      type: "number", step: "1",
      min: state.factionBounds?.min, max: state.factionBounds?.max,
      "aria-label": `Set status for ${faction.name}`,
      disabled: state.anyLoading, value: draft.status,
    });
    for (const [input, key] of [[tierInput, "tier"], [statusInput, "status"]] as const) {
      input.addEventListener("input", () => {
        draft[key] = input.value;
        drafts.rows.set(faction.name, draft);
      });
    }
    const setBtn = el("button", {
      type: "button", disabled: state.anyLoading,
      title: `Set status for ${faction.name}`,
    }, state.isFactionLoading ? "Saving…" : "Set");
    setBtn.addEventListener("click", () => submitFaction(faction.name, tierInput.value, statusInput.value));
    const removeBtn = el("button", {
      type: "button", disabled: state.anyLoading,
      title: `Remove faction: ${faction.name}`, "aria-label": `Remove faction: ${faction.name}`,
    }, "Remove");
    removeBtn.addEventListener("click", () => handlers.onFactionRemove(faction.name));
    return el("div", { className: "faction-entry" },
      el("span", { className: "faction-name" }, faction.name),
      el("span", { className: "faction-status" }, `Status ${faction.status}`),
      el("label", { className: "faction-field" }, "Tier", tierInput),
      el("label", { className: "faction-field" }, "Status", statusInput),
      setBtn, removeBtn,
    );
  });
  const nameInput = el("input", { type: "text", "aria-label": "Faction name", disabled: state.anyLoading, value: drafts.add.name });
  const tierInput = el("input", { type: "number", min: "0", step: "1", "aria-label": "Faction tier", disabled: state.anyLoading, value: drafts.add.tier });
  const statusInput = el("input", { type: "number", step: "1", min: state.factionBounds?.min, max: state.factionBounds?.max, "aria-label": "Faction status", disabled: state.anyLoading, value: drafts.add.status });
  for (const [input, key] of [[nameInput, "name"], [tierInput, "tier"], [statusInput, "status"]] as const) {
    input.addEventListener("input", () => { drafts.add[key] = input.value; });
  }
  const addFactionBtn = el("button", { type: "button", title: "Add faction", disabled: state.anyLoading }, state.isFactionLoading ? "Saving…" : "Add");
  addFactionBtn.addEventListener("click", () => submitFaction(nameInput.value, tierInput.value, statusInput.value, true));
  const stockPicker = stockFactionPicker((f) => {
    nameInput.value = f.name;
    tierInput.value = String(f.tier);
    drafts.add.name = f.name;
    drafts.add.tier = String(f.tier);
  }, state.anyLoading);
  const starting = drafts.starting ?? { ally: c.startingFactions?.ally ?? "", rival: c.startingFactions?.rival ?? "" };
  const startingPickers = (["ally", "rival"] as const).map((role) => {
    const select = el("select", { "aria-label": `Starting ${role}`, disabled: state.anyLoading },
      el("option", { value: "" }, "None"),
      ...factions.map((faction) => el("option", { value: faction.name }, faction.name)),
    );
    // A stale refresh can remove a drafted choice. Retain and label it rather
    // than silently replacing it with blank and saving a different pair.
    if (starting[role] && !factions.some((faction) => faction.name === starting[role])) {
      select.append(el("option", { value: starting[role], disabled: true }, `${starting[role]} (no longer tracked)`));
    }
    select.value = starting[role];
    select.addEventListener("change", () => {
      starting[role] = select.value;
      drafts.starting = starting;
    });
    return el("label", { className: "faction-field" }, `Starting ${role}`, select);
  });
  const saveStartingBtn = el("button", { type: "button", title: "Save starting factions", disabled: state.anyLoading }, state.isFactionLoading ? "Saving…" : "Save starting factions");
  saveStartingBtn.addEventListener("click", () => {
    if ([starting.ally, starting.rival].some((name) => name !== "" && !factions.some((faction) => faction.name === name))) {
      drafts.error = "A starting choice is no longer tracked. Choose another faction or None.";
      validation.textContent = drafts.error;
      validation.hidden = false;
      return;
    }
    drafts.starting = starting;
    handlers.onFactionSetStarting(starting.ally, starting.rival);
  });


return el(
      "div",
      { className: "crew-contacts-factions", "data-section": "contacts" },
      el("h2", {}, "Contacts & Factions"),
      el("h3", { className: "lbl" }, "Contacts"),
      contacts.length === 0
        ? el("p", {}, "(no contacts)")
        : el("div", { className: "contact-list" }, ...contactEntries),
      el("div", { className: "contact-add-row", style: "display: flex; gap: 0.5em; margin-top: 0.5em; align-items: center;" },
        contactNameInput,
        contactProfessionInput,
        addContactBtn,
      ),
      el("h3", { className: "lbl", style: "margin-top: 1em;" }, "Factions"),
      el("div", { className: "starting-factions-current" },
        el("p", {}, el("strong", {}, "Starting ally: "), c.startingFactions ? c.startingFactions.ally || "None" : "Unrecorded"),
        el("p", {}, el("strong", {}, "Starting rival: "), c.startingFactions ? c.startingFactions.rival || "None" : "Unrecorded"),
      ),
      el("p", { className: "rules-note" }, "Starting relationships are explicit records, independent of current status. Saving them does not spend coin or change status."),
      el("div", { className: "starting-factions-edit" }, ...startingPickers, saveStartingBtn),
      el("p", { className: "rules-note faction-bounds" }, state.factionBounds
        ? `Status range: ${state.factionBounds.min} to ${state.factionBounds.max}. The server applies these bounds.`
        : "Status bounds unavailable. You can still enter an integer; the server applies the game’s bounds."),
      el("div", { className: "faction-add-row" },
        stockPicker ? el("label", { className: "faction-field faction-stock-field" }, "Stock", stockPicker) : null,
        el("label", { className: "faction-field faction-name-field" }, "Name", nameInput),
        el("label", { className: "faction-field" }, "Tier (optional)", tierInput),
        el("label", { className: "faction-field" }, "Status", statusInput),
        addFactionBtn,
      ),
      validation,
      factions.length === 0
        ? el("p", { className: "empty" }, "No tracked factions. Add a faction by name, then choose starting relationships from your list.")
        : el("div", { className: "faction-list" }, ...factionEntries),
      doskvolDistrictsDisclosure(),
    );
}
