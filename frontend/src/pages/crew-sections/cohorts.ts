/**
 * renderCrewCohortsSection (ARCH-02): Cohorts section controller.
 *
 * CREW-COHORTS-01 (SRD cohorts rules): a gang has quality and scale equal to the
 * crew Tier; an expert has quality Tier+1 and scale 0. Quality and scale are
 * therefore shown read-only (derived), never as free inputs. Armor applies to
 * gangs only. Edges and flaws are pickers over the SRD lists (plus Custom),
 * capped at two of each per cohort. Kind (gang|expert) and harm values come from
 * the contract enums (schema literals CohortType / CohortHarm).
 */
import { el } from "../../lib/dom.js";
import type { CohortAddBody } from "../../api/client.js";
import {
  extractCohortEdges,
  extractCohortExpertTypes,
  extractCohortFlaws,
  extractCohortGangTypes,
  arraysEqual,
  type CohortTrait,
} from "../crew-domain.js";
import { CohortHarm, CohortType } from "../../schema/common.js";
import type { RenderState } from "../crew-detail.js";

/** SRD: a cohort has one or two edges and an equal number of flaws. */
const MAX_TRAITS = 2;

/** SRD-derived quality and scale for a cohort of the given kind at a crew Tier. */
export function derivedCohortStats(kind: "gang" | "expert", tier: number): { quality: number; scale: number } {
  return kind === "gang" ? { quality: tier, scale: tier } : { quality: tier + 1, scale: 0 };
}

/** SRD: an equal number of edges and flaws. Returns the explanation while they differ, else null. */
function countMismatchMessage(edges: number, flaws: number): string | null {
  if (edges === flaws) return null;
  return `A cohort needs an equal number of edges and flaws (now ${edges} edge${edges === 1 ? "" : "s"} and ${flaws} flaw${flaws === 1 ? "" : "s"}). Add or remove to match.`;
}

/** Expert type options always end with Custom (free-text entry), exactly once. */
function expertOptions(values: readonly string[]): string[] {
  return values.includes("Custom") ? [...values] : [...values, "Custom"];
}

/** Edge/flaw picker: a select over the SRD list (+ Custom), an Add button, and removable chips.
 * Chips carry the picked value in `data-value`; `read()` returns them in order. */
function traitPicker(
  prefix: string,
  singular: "edge" | "flaw",
  options: CohortTrait[],
  initial: readonly string[],
  disabled: boolean,
  onChange?: () => void,
): { element: HTMLElement; read: () => string[] } {
  const chips = el("span", { className: "cohort-trait-list", "data-list": `${singular}s`, style: "display: inline-flex; gap: 0.35em; flex-wrap: wrap;" });
  const select = el("select", { "aria-label": `${prefix} ${singular}`, disabled }) as HTMLSelectElement;
  select.append(el("option", { value: "" }, `Choose ${singular}`) as HTMLOptionElement);
  for (const trait of options) {
    select.append(el("option", { value: trait.name, title: trait.description }, trait.name) as HTMLOptionElement);
  }
  select.append(el("option", { value: "Custom" }, "Custom") as HTMLOptionElement);
  const hint = el("span", { className: "small", "aria-live": "polite" });
  const customInput = el("input", {
    type: "text",
    "aria-label": `${prefix} custom ${singular}`,
    disabled,
    placeholder: `custom ${singular}`,
  }) as HTMLInputElement;
  customInput.hidden = true;
  const addBtn = el("button", { type: "button", disabled, title: `Add ${singular}` }, "+") as HTMLButtonElement;

  const count = () => chips.querySelectorAll("[data-value]").length;
  const syncAddEnabled = () => {
    addBtn.disabled = disabled || count() >= MAX_TRAITS;
    onChange?.();
  };
  const addChip = (value: string) => {
    if ([...chips.querySelectorAll("[data-value]")].some((c) => c.getAttribute("data-value") === value)) return;
    const remove = el("button", { type: "button", disabled, title: `Remove ${singular} ${value}` }, "✕") as HTMLButtonElement;
    remove.addEventListener("click", () => {
      chip.remove();
      syncAddEnabled();
    });
    const chip = el("span", { className: "cohort-trait-chip", "data-value": value }, value, " ", remove);
    chips.append(chip);
    syncAddEnabled();
  };

  const syncSelect = () => {
    const picked = select.value;
    customInput.hidden = picked !== "Custom";
    const trait = options.find((t) => t.name === picked);
    hint.textContent = trait?.description ?? "";
  };
  select.addEventListener("change", syncSelect);
  addBtn.addEventListener("click", () => {
    const picked = select.value;
    if (!picked || count() >= MAX_TRAITS) return;
    const value = picked === "Custom" ? customInput.value.trim() : picked;
    if (!value) return;
    addChip(value);
    select.value = "";
    customInput.value = "";
    syncSelect();
  });
  for (const value of initial) addChip(value);
  syncSelect();

  const element = el(
    "span",
    { className: "cohort-trait-picker", style: "display: inline-flex; flex-direction: column; gap: 0.25em;" },
    el("span", { className: "cohort-trait-controls" }, select, customInput, addBtn),
    hint,
    chips,
  );
  return {
    element,
    read: () => [...chips.querySelectorAll("[data-value]")].map((c) => c.getAttribute("data-value") ?? ""),
  };
}

export function renderCrewCohortsSection(state: RenderState): HTMLElement {
  const { c, handlers } = state;
  const tier = c.tier;
  const edgeOptions = extractCohortEdges(state.crewGameData);
  const flawOptions = extractCohortFlaws(state.crewGameData);

  const cohortEntries = c.cohorts.map((cohort) => {
    const isEditing = state.editingCohortId === cohort.id;
    const kindLabel = cohort.cohortKind === "gang" ? "Gang" : "Expert";
    const typeField = cohort.cohortKind === "gang" ? "gangType" : "expertType";
    const typeValue = cohort[typeField] || "(no type)";
    const title = `cohort: ${typeValue}`;
    const shown = (values: readonly string[]) =>
      values.length === 0 ? "(none)" : values.join(", ");

    if (isEditing) {
      // Type: kind-specific dropdown from game data (canonical fallback). The
      // current type is kept even when absent from the lists (older snapshots).
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
        for (const value of expertOptions(expertTypes)) {
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
      const derived = derivedCohortStats(cohort.cohortKind, tier);
      const armorInput = el("input", {
        type: "checkbox",
        "aria-label": "Edit armor",
        checked: cohort.hasArmor,
        disabled: state.anyLoading,
      });
      // Edges and flaws must stay equal (SRD). The pickers report every change, including
      // initial chips, before Save exists, so the gate is bound once Save is created.
      let syncEditGate: (() => void) | undefined;
      const edgesPicker = traitPicker("Edit", "edge", edgeOptions, cohort.edges, state.anyLoading, () => syncEditGate?.());
      const flawsPicker = traitPicker("Edit", "flaw", flawOptions, cohort.flaws, state.anyLoading, () => syncEditGate?.());
      const harmSelect = el("select", {
        "aria-label": "Edit harm",
        disabled: state.anyLoading,
      }) as HTMLSelectElement;
      for (const value of CohortHarm.literals) {
        const option = el("option", { value }, value) as HTMLOptionElement;
        if (value === cohort.harm) option.selected = true;
        harmSelect.append(option);
      }
      const nameInput = el("input", {
        type: "text",
        "aria-label": "Edit name",
        disabled: state.anyLoading,
      }) as HTMLInputElement;
      nameInput.value = cohort.name ?? "";
      const descInput = el("textarea", {
        "aria-label": "Edit description",
        disabled: state.anyLoading,
        rows: "4",
      }) as HTMLTextAreaElement;
      descInput.value = cohort.description;

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
        if (cohort.cohortKind === "gang" && armorInput.checked !== cohort.hasArmor) {
          fields.hasArmor = armorInput.checked;
        }
        const edges = edgesPicker.read();
        if (!arraysEqual(edges, cohort.edges)) fields.edges = edges;
        const flaws = flawsPicker.read();
        if (!arraysEqual(flaws, cohort.flaws)) fields.flaws = flaws;
        if (harmSelect.value !== cohort.harm) fields.harm = harmSelect.value;
        if (descInput.value !== cohort.description) fields.description = descInput.value;
        if (nameInput.value.trim() !== (cohort.name ?? "")) fields.name = nameInput.value.trim();
        if (Object.keys(fields).length > 0) {
          handlers.onCohortUpdate(cohort.id, fields);
        } else {
          handlers.onCohortCancel();
        }
      });
      const editMismatch = el("p", { className: "cohort-count-mismatch lbl", role: "alert" }) as HTMLElement;
      editMismatch.hidden = true;
      syncEditGate = () => {
        const message = countMismatchMessage(edgesPicker.read().length, flawsPicker.read().length);
        editMismatch.hidden = message === null;
        editMismatch.textContent = message ?? "";
        saveBtn.disabled = state.anyLoading || message !== null;
      };
      syncEditGate();
      const cancelBtn = el("button", {
        type: "button",
        disabled: state.anyLoading,
        title: "Cancel",
      }, "✕");
      cancelBtn.addEventListener("click", handlers.onCohortCancel);

      const isGang = cohort.cohortKind === "gang";
      return el(
        "div",
        { className: "cohort-entry editing", "data-cohort-id": cohort.id, "data-cohort-kind": cohort.cohortKind, "data-focus-key": `cohort-${cohort.id}` },
        el("span", { className: "cohort-kind-badge" }, kindLabel),
        el("div", { className: "cohort-edit-fields", style: "display: flex; flex-wrap: wrap; gap: 0.5em; align-items: center;" },
          el("label", { className: "lbl" }, `${kindLabel} type:`, typeControl),
          el("label", { className: "lbl" }, "Name:", nameInput),
          el("span", { className: "lbl cohort-quality-derived" }, `Quality ${derived.quality} (from Tier)`),
          isGang ? el("span", { className: "lbl cohort-scale-derived" }, `Scale ${derived.scale} (from Tier)`) : null,
          isGang ? el("label", { className: "lbl" }, "Armor:", armorInput) : null,
          el("label", { className: "lbl" }, "Edges:", edgesPicker.element),
          el("label", { className: "lbl" }, "Flaws:", flawsPicker.element),
          el("label", { className: "lbl" }, "Harm:", harmSelect),
          el("label", { className: "lbl" }, "Description:", descInput),
        ),
        editMismatch,
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
      cohort.name ? el("span", { className: "cohort-name" }, cohort.name) : null,
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

  // Add form. Kind-specific fields are toggled locally so typed values survive a kind switch.
  const cohortKindSelect = el("select", {
    "aria-label": "Cohort kind",
    // CREW-05: cohortKind is the only field openapi requires on cohort.add.
    "aria-required": "true",
    disabled: state.anyLoading,
  }) as HTMLSelectElement;
  for (const value of CohortType.literals) {
    const option = el("option", { value }, value) as HTMLOptionElement;
    if (value === "gang") option.selected = true;
    cohortKindSelect.append(option);
  }
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
  for (const value of expertOptions(extractCohortExpertTypes(state.crewGameData))) {
    expertTypeSelect.append(el("option", { value }, value) as HTMLOptionElement);
  }
  expertTypeSelect.value = "";
  const expertCustomInput = el("input", {
    type: "text",
    "aria-label": "Cohort expert custom type",
    disabled: state.anyLoading,
  });
  const qualityDerived = el("span", { className: "cohort-quality-derived" });
  const scaleDerived = el("span", { className: "cohort-scale-derived" });
  const armorInput = el("input", {
    type: "checkbox",
    "aria-label": "Cohort armor",
    disabled: state.anyLoading,
  });
  const edgesPicker = traitPicker("Cohort", "edge", edgeOptions, [], state.anyLoading, () => syncAddGate());
  const flawsPicker = traitPicker("Cohort", "flaw", flawOptions, [], state.anyLoading, () => syncAddGate());
  const descInput = el("textarea", {
    "aria-label": "Cohort description",
    disabled: state.anyLoading,
    rows: "4",
  }) as HTMLTextAreaElement;
  const nameInput = el("input", {
    type: "text",
    "aria-label": "Cohort name",
    disabled: state.anyLoading,
  }) as HTMLInputElement;
  // F-10: persistent labels over ruled blanks.
  const cohortField = (label: string, control: HTMLElement) =>
    el(
      "label",
      { className: "cohort-field" },
      el("span", { className: "lbl" }, label),
      control,
    );
  const gangTypeField = cohortField("Type", gangTypeSelect);
  const expertTypeField = cohortField("Type", expertTypeSelect);
  const expertCustomField = cohortField("Custom type", expertCustomInput);
  const qualityField = cohortField("Quality (from Tier)", qualityDerived);
  const scaleField = cohortField("Scale (from Tier)", scaleDerived);
  const armorField = cohortField("Armor", armorInput);
  const toggleCohortKindFields = () => {
    const kind = cohortKindSelect.value === "expert" ? "expert" : "gang";
    const stats = derivedCohortStats(kind, tier);
    gangTypeField.hidden = kind !== "gang";
    expertTypeField.hidden = kind !== "expert";
    expertCustomField.hidden = kind !== "expert" || expertTypeSelect.value !== "Custom";
    qualityDerived.textContent = String(stats.quality);
    scaleDerived.textContent = String(stats.scale);
    scaleField.hidden = kind !== "gang";
    armorField.hidden = kind !== "gang";
  };
  cohortKindSelect.addEventListener("change", toggleCohortKindFields);
  expertTypeSelect.addEventListener("change", () => {
    if (cohortKindSelect.value === "expert") {
      expertCustomField.hidden = expertTypeSelect.value !== "Custom";
    }
  });
  const addCohortBtn = el("button", {
    type: "button",
    className: "cohort-add-submit",
    disabled: state.anyLoading,
    title: "Add cohort",
  }, state.isCohortLoading ? "…" : "+");
  addCohortBtn.addEventListener("click", handlers.onCohortAdd);
  // SRD: an equal number of edges and flaws. Add stays disabled, and says why, while they differ.
  const countMismatch = el("p", { className: "cohort-count-mismatch lbl", role: "alert" }) as HTMLElement;
  countMismatch.hidden = true;
  const syncAddGate = () => {
    const message = countMismatchMessage(edgesPicker.read().length, flawsPicker.read().length);
    countMismatch.hidden = message === null;
    countMismatch.textContent = message ?? "";
    addCohortBtn.disabled = state.anyLoading || message !== null;
  };
  syncAddGate();

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
      cohortField("Name", nameInput),
      gangTypeField,
      expertTypeField,
      expertCustomField,
      qualityField,
      scaleField,
      armorField,
      cohortField("Edges", edgesPicker.element),
      cohortField("Flaws", flawsPicker.element),
      cohortField("Description", descInput),
      addCohortBtn,
    ),
    countMismatch,
  );
  toggleCohortKindFields();

  return cohortsSection;
}

/** Read the Add Cohort form into a cohort.add body. Returns null when no kind is chosen, or
 * when the edge and flaw counts differ (SRD). Quality and scale are derived from the crew Tier, not typed. */
export function readCohortAddBody(root: HTMLElement, tier: number): CohortAddBody | null {
  const kind = (root.querySelector('select[aria-label="Cohort kind"]') as HTMLSelectElement | null)?.value ?? "";
  if (kind !== "gang" && kind !== "expert") return null;
  const cohortKind = kind;
  const body: CohortAddBody = { cohortKind };
  if (cohortKind === "gang") {
    const gangType = (root.querySelector('select[aria-label="Cohort gang type"]') as HTMLSelectElement | null)?.value?.trim() ?? "";
    if (gangType) body.gangType = gangType;
  } else {
    const expertSelect = root.querySelector('select[aria-label="Cohort expert type"]') as HTMLSelectElement | null;
    const expertCustom = root.querySelector('input[aria-label="Cohort expert custom type"]') as HTMLInputElement | null;
    const expertType = expertSelect?.value ?? "";
    if (expertType) {
      body.expertType = expertType === "Custom" ? expertCustom?.value?.trim() || "Custom" : expertType;
    }
  }
  const stats = derivedCohortStats(cohortKind, tier);
  body.quality = stats.quality;
  body.scale = stats.scale;
  body.hasArmor = cohortKind === "gang"
    ? (root.querySelector('input[aria-label="Cohort armor"]') as HTMLInputElement | null)?.checked ?? false
    : false;
  const edges = traitValues(root, "edges");
  if (edges.length > 0) body.edges = edges;
  const flaws = traitValues(root, "flaws");
  if (flaws.length > 0) body.flaws = flaws;
  if (edges.length !== flaws.length) return null;
  const description = (root.querySelector('textarea[aria-label="Cohort description"]') as HTMLTextAreaElement | null)?.value?.trim() ?? "";
  if (description) body.description = description;
  const name = (root.querySelector('input[aria-label="Cohort name"]') as HTMLInputElement | null)?.value?.trim() ?? "";
  if (name) body.name = name;
  return body;
}

function traitValues(root: HTMLElement, list: "edges" | "flaws"): string[] {
  return [...root.querySelectorAll(`.cohort-add .cohort-trait-list[data-list="${list}"] [data-value]`)].map(
    (c) => c.getAttribute("data-value") ?? "",
  );
}
