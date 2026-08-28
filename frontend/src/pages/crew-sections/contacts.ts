/**
 * renderCrewContactsSection (ARCH-02): Contacts & Factions section controller, extracted verbatim from
 * the crew-detail page's render pass. DOM output is unchanged.
 */
import { el } from "../../lib/dom.js";
import type { RenderState } from "../crew-detail.js";

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
  const contactProfessionInput = el("input", {
    type: "text",
    "aria-label": "Contact profession",
    disabled: state.anyLoading,
    placeholder: "profession",
  });
  const addContactBtn = el("button", {
    type: "button",
    disabled: state.anyLoading,
    title: "Add contact",
  }, state.isContactLoading ? "…" : "+");
  addContactBtn.addEventListener("click", handlers.onContactAdd);

  const factionEntries = factions.map((faction) => {
    const statusInput = el("input", {
      type: "number",
      "aria-label": `Set status for ${faction.name}`,
      disabled: state.anyLoading,
      value: String(faction.status),
    }) as HTMLInputElement;
    const setBtn = el("button", {
      type: "button",
      disabled: state.anyLoading,
      title: `Set status for ${faction.name}`,
    }, state.isFactionLoading ? "…" : "Set");
    setBtn.addEventListener("click", () => {
      const parsed = Number.parseInt(statusInput.value, 10);
      if (Number.isNaN(parsed)) return;
      handlers.onFactionSetStatus(faction.name, parsed);
    });
    const removeBtn = el("button", {
      type: "button",
      disabled: state.anyLoading,
      title: `Remove faction: ${faction.name}`,
    }, "✕");
    removeBtn.addEventListener("click", () => handlers.onFactionRemove(faction.name));
    return el(
      "div",
      { className: "faction-entry", style: "display: flex; align-items: center; gap: 0.5em;" },
      el("span", { className: "faction-name" }, faction.name),
      el("span", { className: "faction-status" }, String(faction.status)),
      statusInput,
      setBtn,
      removeBtn,
    );
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
      factions.length === 0
        ? el("p", {}, "(no factions)")
        : el("div", { className: "faction-list" }, ...factionEntries),
    );
}
