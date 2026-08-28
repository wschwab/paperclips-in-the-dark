/**
 * renderCrewCohortsSection (ARCH-02): Cohorts section controller, extracted verbatim from
 * the crew-detail page's render pass. DOM output is unchanged.
 */
import { el } from "../../lib/dom.js";
import { extractCohortGangTypes } from "../crew-domain.js";
import { extractCohortExpertTypes } from "../crew-domain.js";
import { splitList } from "../crew-domain.js";
import { arraysEqual } from "../crew-domain.js";
import { CohortHarm } from "../../schema/common.js";
import { CohortType } from "../../schema/common.js";
import type { RenderState } from "../crew-detail.js";

export function renderCrewCohortsSection(state: RenderState): HTMLElement {
  const { c, handlers } = state;
  // -- Cohorts (F2w) ---------------------------------------------------------
  // Vehicles are cohorts (sheet plan decision 3): a vehicle is a cohort whose
  // description carries the edges/flaws text. Kind (gang|expert) and harm
  // values come from the contract enums (schema literals CohortType /
  // CohortHarm mirror contract/schemas/common.json $defs — never hardcoded).

  const cohortEntries = c.cohorts.map((cohort) => {
    const isEditing = state.editingCohortId === cohort.id;
    const kindLabel = cohort.cohortKind === "gang" ? "Gang" : "Expert";
    const typeField = cohort.cohortKind === "gang" ? "gangType" : "expertType";
    const typeValue = cohort[typeField] || "(no type)";
    const title = `cohort: ${typeValue}`;
    const shown = (values: readonly string[]) =>
      values.length === 0 ? "(none)" : values.join(", ");

    if (isEditing) {
      // F2ac: kind-specific type dropdown from game data (canonical
      // fallback). The current type is preserved even when it is not in the
      // data lists (older snapshots / homebrew): gangs get the extra value
      // appended as an option; experts map onto the Custom path (Custom
      // reveals a free-text input).
      const gangTypes = extractCohortGangTypes(state.crewGameData);
      const expertTypes = extractCohortExpertTypes(state.crewGameData);
      let typeControl: HTMLElement;
      let readType: () => string;
      if (cohort.cohortKind === "gang") {
        const options = gangTypes.includes(cohort.gangType)
          ? gangTypes
          : [...gangTypes, cohort.gangType];
        const gangSelect = el("select", {
          "aria-label": "Edit gang type",
          disabled: state.anyLoading,
        }) as HTMLSelectElement;
        for (const value of options) {
          gangSelect.append(el("option", { value }, value) as HTMLOptionElement);
        }
        // Set via the select value after append: happy-dom does not honour
        // option.selected set before the option is attached.
        gangSelect.value = cohort.gangType;
        typeControl = gangSelect;
        readType = () => gangSelect.value;
      } else {
        const isCustom =
          cohort.expertType === "Custom" || !expertTypes.includes(cohort.expertType);
        const expertSelect = el("select", {
          "aria-label": "Edit expert type",
          disabled: state.anyLoading,
        }) as HTMLSelectElement;
        for (const value of expertTypes) {
          expertSelect.append(el("option", { value }, value) as HTMLOptionElement);
        }
        expertSelect.value = isCustom ? "Custom" : cohort.expertType;
        const customInput = el("input", {
          type: "text",
          "aria-label": "Edit expert custom type",
          disabled: state.anyLoading,
          placeholder: "custom type",
        });
        customInput.value =
          isCustom && cohort.expertType !== "Custom" ? cohort.expertType : "";
        const toggleCustom = () => {
          customInput.hidden = expertSelect.value !== "Custom";
        };
        expertSelect.addEventListener("change", toggleCustom);
        toggleCustom();
        typeControl = el(
          "span",
          { style: "display: inline-flex; gap: 0.5em; align-items: center;" },
          expertSelect,
          customInput,
        );
        readType = () =>
          expertSelect.value === "Custom"
            ? customInput.value.trim() || "Custom"
            : expertSelect.value;
      }
      const qualityInput = el("input", {
        type: "number",
        value: String(cohort.quality),
        "aria-label": "Edit quality",
        disabled: state.anyLoading,
      });
      const scaleInput = el("input", {
        type: "number",
        value: String(cohort.scale),
        "aria-label": "Edit scale",
        disabled: state.anyLoading,
      });
      const armorInput = el("input", {
        type: "checkbox",
        "aria-label": "Edit armor",
        checked: cohort.hasArmor,
        disabled: state.anyLoading,
      });
      const edgesInput = el("input", {
        type: "text",
        value: cohort.edges.join(", "),
        "aria-label": "Edit edges",
        disabled: state.anyLoading,
      });
      const flawsInput = el("input", {
        type: "text",
        value: cohort.flaws.join(", "),
        "aria-label": "Edit flaws",
        disabled: state.anyLoading,
      });
      const harmSelect = el("select", {
        "aria-label": "Edit harm",
        disabled: state.anyLoading,
      }) as HTMLSelectElement;
      for (const value of CohortHarm.literals) {
        const option = el("option", { value }, value) as HTMLOptionElement;
        if (value === cohort.harm) option.selected = true;
        harmSelect.append(option);
      }
      const descInput = el("input", {
        type: "text",
        value: cohort.description,
        "aria-label": "Edit description",
        disabled: state.anyLoading,
      });

      const saveBtn = el("button", {
        type: "button",
        disabled: state.anyLoading,
        title: `Save ${title}`,
      }, state.isCohortLoading ? "…" : "✓");
      // cohort.update sends only the fields that actually changed.
      saveBtn.addEventListener("click", () => {
        const fields: Record<string, unknown> = {};
        const typeValue = readType();
        if (typeValue !== cohort[typeField]) fields[typeField] = typeValue;
        const quality = Number.parseInt(qualityInput.value, 10);
        if (!Number.isNaN(quality) && quality !== cohort.quality) fields.quality = quality;
        const scale = Number.parseInt(scaleInput.value, 10);
        if (!Number.isNaN(scale) && scale !== cohort.scale) fields.scale = scale;
        if (armorInput.checked !== cohort.hasArmor) fields.hasArmor = armorInput.checked;
        const edges = splitList(edgesInput.value);
        if (!arraysEqual(edges, cohort.edges)) fields.edges = edges;
        const flaws = splitList(flawsInput.value);
        if (!arraysEqual(flaws, cohort.flaws)) fields.flaws = flaws;
        if (harmSelect.value !== cohort.harm) fields.harm = harmSelect.value;
        if (descInput.value !== cohort.description) fields.description = descInput.value;
        if (Object.keys(fields).length > 0) {
          handlers.onCohortUpdate(cohort.id, fields);
        } else {
          handlers.onCohortCancel();
        }
      });
      const cancelBtn = el("button", {
        type: "button",
        disabled: state.anyLoading,
        title: "Cancel",
      }, "✕");
      cancelBtn.addEventListener("click", handlers.onCohortCancel);

      return el(
        "div",
        { className: "cohort-entry editing", "data-cohort-id": cohort.id, "data-cohort-kind": cohort.cohortKind, "data-focus-key": `cohort-${cohort.id}` },
        el("span", { className: "cohort-kind-badge" }, kindLabel),
        el("div", { className: "cohort-edit-fields", style: "display: flex; flex-wrap: wrap; gap: 0.5em; align-items: center;" },
          el("label", { className: "lbl" }, `${kindLabel} type:`, typeControl),
          el("label", { className: "lbl" }, "Quality:", qualityInput),
          el("label", { className: "lbl" }, "Scale:", scaleInput),
          el("label", { className: "lbl" }, "Armor:", armorInput),
          el("label", { className: "lbl" }, "Edges:", edgesInput),
          el("label", { className: "lbl" }, "Flaws:", flawsInput),
          el("label", { className: "lbl" }, "Harm:", harmSelect),
          el("label", { className: "lbl" }, "Description:", descInput),
        ),
        el("div", { style: "display: flex; gap: 0.5em;" }, saveBtn, cancelBtn),
      );
    }

    const editBtn = el("button", {
      type: "button",
      disabled: state.anyLoading || state.editingCohortId !== null,
      title: `Edit ${title}`,
    }, "✎");
    editBtn.addEventListener("click", () => handlers.onCohortEdit(cohort.id));
    const removeBtn = el("button", {
      type: "button",
      disabled: state.anyLoading,
      title: `Remove ${title}`,
    }, "✕");
    removeBtn.addEventListener("click", () => handlers.onCohortRemove(cohort.id));

    return el(
      "div",
      { className: "cohort-entry", "data-cohort-id": cohort.id, "data-cohort-kind": cohort.cohortKind, "data-focus-key": `cohort-${cohort.id}` },
      el("span", { className: "cohort-kind-badge" }, kindLabel),
      el("span", { className: "cohort-type" }, typeValue),
      el("span", { className: "cohort-quality" }, `Quality ${cohort.quality}`),
      el("span", { className: "cohort-scale" }, `Scale ${cohort.scale}`),
      el("span", { className: "cohort-armor" }, cohort.hasArmor ? "Armored" : "No armor"),
      el("span", { className: "cohort-edges" }, `Edges: ${shown(cohort.edges)}`),
      el("span", { className: "cohort-flaws" }, `Flaws: ${shown(cohort.flaws)}`),
      el("span", { className: "cohort-harm" }, `Harm: ${cohort.harm}`),
      el("span", { className: "cohort-description" }, cohort.description || "(no description)"),
      editBtn,
      removeBtn,
    );
  });

  // Add form: cohort kind from the contract enum (CohortType literal mirrors
  // cohortType $defs). Optional fields are sent only when filled.
  const cohortKindSelect = el("select", {
    "aria-label": "Cohort kind",
    // CREW-05: cohortKind is the only field openapi requires on cohort.add;
    // mark it, and gate Add only on contract requirements (never on invented
    // ones — the backend is authoritative).
    "aria-required": "true",
    disabled: state.anyLoading,
  }) as HTMLSelectElement;
  for (const value of CohortType.literals) {
    const option = el("option", { value }, value) as HTMLOptionElement;
    if (value === "gang") option.selected = true;
    cohortKindSelect.append(option);
  }
  // F2ac: kind-conditional type dropdowns from game data (canonical
  // fallback). The gang select shows only when cohortKind=gang, the expert
  // select only when cohortKind=expert — toggled locally so the rest of the
  // form keeps its typed values. "Custom" (expert) reveals a free-text input.
  const gangTypeSelect = el("select", {
    "aria-label": "Cohort gang type",
    disabled: state.anyLoading,
  }, el("option", { value: "" }, "Gang type")) as HTMLSelectElement;
  for (const value of extractCohortGangTypes(state.crewGameData)) {
    gangTypeSelect.append(el("option", { value }, value) as HTMLOptionElement);
  }
  gangTypeSelect.value = "";
  const expertTypeSelect = el("select", {
    "aria-label": "Cohort expert type",
    disabled: state.anyLoading,
  }, el("option", { value: "" }, "Expert type")) as HTMLSelectElement;
  for (const value of extractCohortExpertTypes(state.crewGameData)) {
    expertTypeSelect.append(el("option", { value }, value) as HTMLOptionElement);
  }
  expertTypeSelect.value = "";
  const expertCustomInput = el("input", {
    type: "text",
    "aria-label": "Cohort expert custom type",
    disabled: state.anyLoading,
  });
  const qualityInput = el("input", {
    type: "number",
    "aria-label": "Cohort quality",
    disabled: state.anyLoading,
  });
  const scaleInput = el("input", {
    type: "number",
    "aria-label": "Cohort scale",
    disabled: state.anyLoading,
  });
  const armorInput = el("input", {
    type: "checkbox",
    "aria-label": "Cohort armor",
    disabled: state.anyLoading,
  });
  const edgesInput = el("input", {
    type: "text",
    "aria-label": "Cohort edges",
    disabled: state.anyLoading,
    placeholder: "e.g. Fearsome, Independent",
  });
  const flawsInput = el("input", {
    type: "text",
    "aria-label": "Cohort flaws",
    disabled: state.anyLoading,
    placeholder: "e.g. Wild, Overconfident",
  });
  const descInput = el("input", {
    type: "text",
    "aria-label": "Cohort description",
    disabled: state.anyLoading,
  });
  // F-10: persistent labels over ruled blanks; placeholders kept only as
  // genuine format examples. A label + control pair reads as sheet furniture.
  const cohortField = (label: string, control: HTMLElement) =>
    el(
      "label",
      { className: "cohort-field" },
      el("span", { className: "lbl" }, label),
      control,
    );
  // Kind-conditional fields: wrap each control with its label so the
  // toggle hides label+control together (not a stray empty label).
  const gangTypeField = cohortField("Type", gangTypeSelect);
  const expertTypeField = cohortField("Type", expertTypeSelect);
  const expertCustomField = cohortField("Custom type", expertCustomInput);
  const toggleCohortKindFields = () => {
    const kind = cohortKindSelect.value;
    gangTypeField.hidden = kind !== "gang";
    expertTypeField.hidden = kind !== "expert";
    expertCustomField.hidden =
      kind !== "expert" || expertTypeSelect.value !== "Custom";
  };
  cohortKindSelect.addEventListener("change", toggleCohortKindFields);
  expertTypeSelect.addEventListener("change", () => {
    if (cohortKindSelect.value === "expert") {
      expertCustomField.hidden = expertTypeSelect.value !== "Custom";
    }
  });
  const addCohortBtn = el("button", {
    type: "button",
    disabled: state.anyLoading,
    title: "Add cohort",
  }, state.isCohortLoading ? "…" : "+");
  addCohortBtn.addEventListener("click", handlers.onCohortAdd);

  const cohortsSection = el(
    "div",
    { className: "crew-cohorts", "data-section": "cohorts" },
    el("h2", {}, "Cohorts"),
    c.cohorts.length === 0
      ? el("p", {}, "(no cohorts)")
      : el("div", { className: "cohort-list" }, ...cohortEntries),
    el("h3", { className: "lbl", style: "margin-top: 1em;" }, "Add Cohort"),
    el("div", { className: "cohort-add", style: "display: flex; flex-wrap: wrap; gap: 0.75em; align-items: flex-end;" },
      el(
        "label",
        { className: "cohort-field" },
        el(
          "span",
          { className: "lbl" },
          "Kind",
          el("span", {
            className: "required-marker",
            title: "Required by the contract (cohort.add)",
            "aria-hidden": "true",
          }, "*"),
        ),
        cohortKindSelect,
      ),
      gangTypeField,
      expertTypeField,
      expertCustomField,
      cohortField("Quality", qualityInput),
      cohortField("Scale", scaleInput),
      cohortField("Armor", armorInput),
      cohortField("Edges", edgesInput),
      cohortField("Flaws", flawsInput),
      cohortField("Description", descInput),
      addCohortBtn,
    ),
  );
  // Initial field visibility: run after the form is assembled so every
  // label+control pair hides together.
  toggleCohortKindFields();


  return cohortsSection;
}
