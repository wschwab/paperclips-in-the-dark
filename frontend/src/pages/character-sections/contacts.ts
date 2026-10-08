/**
 * renderContactsSection (ARCH-02): contacts section controller, extracted verbatim from the
 * character-detail page's render pass. DOM output is unchanged.
 */
import { el } from "../../lib/dom.js";
import { extractContactNameSuggestions } from "../character-domain.js";
import type { ContactCloseness } from "../../schema/common.js";
import type { SectionCtx } from "./context.js";

export function renderContactsSection(ctx: SectionCtx): HTMLElement {
  const { state, c, handlers, playbookData, anyLoading } = ctx;
  // CONTRACT-05: per-scoundrel Contacts. Add suggestions come from the
  // playbook's BitS rolodex names (data, not code); free text stays valid.
return   (() => {
    const contacts = c.contacts ?? [];
    // Bold, bordered, white-text badges: each level has its own fill, and every
    // fill keeps white text above 4.5:1 (measured in Chromium; see PLAYTEST-UI-02 records).
    const badgeBase = "font-weight: 700; border: 2px solid; padding: 0.15em 0.6em; cursor: pointer; color: #fff;";
    const badgeStyle: Record<ContactCloseness, string> = {
      enemy: `${badgeBase} background: #7a1212; border-color: #3d0909;`,
      rival: `${badgeBase} background: #9b2c2c; border-color: #5c1818;`,
      contact: `${badgeBase} background: #4a5568; border-color: #2d3748;`,
      friend: `${badgeBase} background: #2f855a; border-color: #1c4f36;`,
      confidante: `${badgeBase} background: #1a4f8b; border-color: #0d2b4d;`,
    };
    const rows = contacts.map((contact) => {
      const cycle = el("button", {
        type: "button",
        className: "btn-secondary contact-closeness",
        disabled: anyLoading,
        title: `Cycle closeness for ${contact.name}`,
        style: badgeStyle[contact.closeness],
      }, contact.closeness);
      cycle.addEventListener("click", () => handlers.onContactCycle(contact.name, contact.closeness));
      const rm = el("button", {
        type: "button",
        disabled: anyLoading,
        title: `Remove ${contact.name}`,
      }, "✕");
      rm.addEventListener("click", () => handlers.onContactRemove(contact.name));
      return el("li", {
        className: "contact-entry",
        style: "display: flex; gap: 0.5em; align-items: center;",
      },
        el("span", { style: "flex: 1;" }, contact.name),
        cycle,
        rm,
      );
    });
    const nameInput = el("input", {
      type: "text",
      "aria-label": "New contact",
      list: "contact-name-suggestions",
      disabled: anyLoading,
      placeholder: "add a contact",
    }) as HTMLInputElement;
    nameInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        handlers.onContactAdd();
      }
    });
    const datalist = el("datalist", { id: "contact-name-suggestions" },
      ...extractContactNameSuggestions(playbookData).map((n) => el("option", { value: n })),
    );
    const addBtn = el("button", {
      type: "button",
      disabled: anyLoading,
      title: "Add contact",
    }, state.isContactsLoading ? "…" : "+ Add");
    addBtn.addEventListener("click", handlers.onContactAdd);

    return el(
      "div",
      { className: "character-contacts", "data-section": "contacts" },
      el("h2", {}, "Contacts"),
      contacts.length > 0
        ? el("ul", { className: "contact-list" }, ...rows)
        : el("p", {}, "(no contacts)"),
      el("div", {
        className: "contact-add-row",
        style: "display: flex; gap: 0.5em; margin-top: 0.5em; align-items: center;",
      },
        nameInput,
        datalist,
        addBtn,
      ),
      state.contactsNotice
        ? el("p", { className: "notice", style: "margin-top: 0.5em;" }, state.contactsNotice)
        : null,
    );
  })();

}
