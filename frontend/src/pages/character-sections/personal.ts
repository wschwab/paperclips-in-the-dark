/**
 * renderPersonalSection (ARCH-02): personal section controller, extracted verbatim from the
 * character-detail page's render pass. DOM output is unchanged.
 */
import { el } from "../../lib/dom.js";
import { gameDataDescription } from "../character-domain.js";
import { gameDataOptions } from "../character-domain.js";
import type { DossierField } from "../character-domain.js";
import type { SectionCtx } from "./context.js";

export function renderPersonalSection(ctx: SectionCtx): HTMLElement {
  const { state, c, handlers, gameData, editing, namedEditor, anyLoading } = ctx;
  // -- Personal section -----------------------------------------------------

  function renderField(label: string, field: DossierField, displayValue: string) {
    const isEditing = editing !== null &&
      (typeof field === "string" ? editing.field === field : false);
    // For named fields, compare key
    const isNamedEditing = editing !== null && typeof field !== "string" &&
      typeof editing.field !== "string" &&
      editing.field.key === field.key;
    const isThisEditing = isEditing || isNamedEditing;

    const editBtn = el("button", {
      type: "button",
      disabled: anyLoading || editing !== null,
      title: `Edit ${label}`,
    }, "✎");

    if (isThisEditing) {
      const input = el("input", {
        type: "text",
        value: editing!.value,
        "aria-label": label,
      }) as HTMLInputElement;
      // F2aa: keep the typed text in the editing state, and let ENTER save /
      // ESC cancel without a form-submit reload. TAB flows naturally through
      // input → ✓ → ✕ in document order (no form wrapper to trap it).
      input.addEventListener("input", () => {
        editing!.value = input.value;
      });
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          handlers.onDossierSave();
        } else if (ev.key === "Escape") {
          ev.preventDefault();
          handlers.onDossierCancel();
        }
      });

      const saveBtn = el("button", { type: "button", title: "Save" }, "✓");
      saveBtn.addEventListener("click", handlers.onDossierSave);
      const cancelBtn = el("button", { type: "button", title: "Cancel" }, "✕");
      cancelBtn.addEventListener("click", handlers.onDossierCancel);

      return el("div", {
        className: "field-editing",
        "data-focus-key": `dossier-${typeof field === "string" ? field : field.key}`,
        style: "display: flex; gap: 0.5em; align-items: center;",
      },
        el("span", { className: "lbl" }, `${label}: `),
        input,
        saveBtn,
        cancelBtn,
      );
    }

    editBtn.addEventListener("click", () => handlers.onDossierEdit(field));

    return el("div", {
      className: "field-read",
      "data-focus-key": `dossier-${typeof field === "string" ? field : field.key}`,
      style: "display: flex; gap: 0.5em; align-items: center;",
    },
      el("span", { className: "lbl" }, `${label}: `),
      el("span", {}, displayValue || "(not set)"),
      editBtn,
    );
  }

  /**
   * F2ab: heritage / background rendered as a game-data dropdown. Read mode
   * shows the name plus the game-data description (heritage Description,
   * background Example) when the name matches; edit mode offers the options
   * plus a "Custom…" branch with a free-text name.
   */
  function renderNamedField(label: string, key: "heritage" | "background") {
    const name = c.dossier[key].name;
    const dtoDesc = c.dossier[key].description;
    const gameDesc = gameDataDescription(gameData, key, name);
    const desc = gameDesc ?? dtoDesc;
    const isEditing = namedEditor?.key === key;

    if (isEditing) {
      const editor = namedEditor!;
      const optionNames = gameDataOptions(gameData, key).map((o) => String(o.Name));
      const isCustom = editor.option === "__custom__" || !optionNames.includes(editor.option);
      const select = el("select", {
        "aria-label": `${label} (choose)`,
        disabled: anyLoading,
      },
        ...optionNames.map((n) => el("option", { value: n }, n)),
        el("option", { value: "__custom__" }, "Custom…"),
      ) as HTMLSelectElement;
      select.value = isCustom ? "__custom__" : editor.option;
      select.addEventListener("change", () => {
        editor.option = select.value;
        state.rerender();
      });

      const customInput = el("input", {
        type: "text",
        "aria-label": `${label} custom name`,
        value: editor.customName,
      }) as HTMLInputElement;
      customInput.addEventListener("input", () => {
        editor.customName = customInput.value;
      });

      const saveBtn = el("button", { type: "button", title: "Save" }, "✓");
      saveBtn.addEventListener("click", handlers.onNamedSave);
      const cancelBtn = el("button", { type: "button", title: "Cancel" }, "✕");
      cancelBtn.addEventListener("click", handlers.onNamedCancel);

      const hint = isCustom
        ? el("span", { className: "serif", style: "font-size: 0.9em;" },
            "Custom — saved without a game description")
        : gameDesc
          ? el("span", { className: "serif", style: "font-size: 0.9em;" }, gameDesc)
          : null;

      return el("div", {
        className: "field-editing",
        "data-focus-key": `named-${key}`,
        style: "display: flex; gap: 0.5em; align-items: center; flex-wrap: wrap;",
      },
        el("span", { className: "lbl" }, `${label}: `),
        select,
        isCustom ? customInput : null,
        hint,
        saveBtn,
        cancelBtn,
      );
    }

    const editBtn = el("button", {
      type: "button",
      disabled: anyLoading || editing !== null || namedEditor !== null,
      title: `Edit ${label}`,
    }, "✎");
    editBtn.addEventListener("click", () => handlers.onNamedEdit(key));

    return el("div", {
      className: "field-read",
      "data-focus-key": `named-${key}`,
      style: "display: flex; gap: 0.5em; align-items: center; flex-wrap: wrap;",
    },
      el("span", { className: "lbl" }, `${label}: `),
      el("span", {}, name || "(not set)"),
      desc ? el("span", { className: "serif", style: "font-size: 0.9em;" }, desc) : null,
      editBtn,
    );
  }


  // Personal (Dossier) — inline editable
return   el(
    "div",
    { className: "character-personal", "data-section": "personal" },
    el("h2", {}, "Personal"),
    renderField("Name", "name", c.dossier.name),
    renderField("Alias", "alias", c.dossier.alias),
    renderNamedField("Background", "background"),
    renderNamedField("Heritage", "heritage"),
    renderField("Look", "look", c.dossier.look),
    // Crew membership (F2ab): show the current crew, join/leave via
    // dossierUpdate {crewId}, and link to the crew creation page.
    (() => {
      const crewId = c.dossier.crewId;
      const crewsList = state.crews ?? [];
      const currentCrew = crewsList.find((cr) => cr.id === crewId) ?? null;
      const crewSelect = el("select", {
        "aria-label": "Join crew",
        disabled: anyLoading || state.crews === null || crewsList.length === 0,
      },
        el("option", { value: "" }, "Crew"),
        ...crewsList.map((cr) => el("option", { value: cr.id }, cr.name)),
      ) as HTMLSelectElement;
      const joinBtn = el("button", {
        type: "button",
        disabled: anyLoading || state.crews === null || crewsList.length === 0,
        title: "Join crew",
      }, state.isCrewsLoading ? "…" : "Join");
      joinBtn.addEventListener("click", handlers.onCrewJoin);
      const leaveBtn = crewId
        ? (() => {
            const b = el("button", {
              type: "button",
              disabled: anyLoading,
              title: "Leave crew",
            }, "Leave");
            b.addEventListener("click", handlers.onCrewLeave);
            return b;
          })()
        : null;
      return el("div", {
        className: "crew-membership",
        style: "display: flex; gap: 0.5em; align-items: center; flex-wrap: wrap; margin-top: 0.35em;",
      },
        el("span", { className: "lbl" }, "Crew:"),
        el("span", { className: "crew-name" },
          currentCrew ? currentCrew.name : crewId ? "(unknown crew)" : "(none)"),
        crewSelect,
        joinBtn,
        leaveBtn,
        el("a", { href: "/crew/create", className: "crew-create-link" }, "+ New crew"),
        state.crewNotice
          ? el("p", { className: "notice", style: "margin: 0; width: 100%;" }, state.crewNotice)
          : null,
      );
    })(),
  );

}
