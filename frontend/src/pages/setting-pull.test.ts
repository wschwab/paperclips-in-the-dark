// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { renderCrewContactsSection } from "./crew-sections/contacts.js";
import { doskvolDistrictsDisclosure, stockFactionPicker } from "./crew-sections/doskvol-world.js";
import { renderPersonalSection } from "./character-sections/personal.js";
import type { RenderState } from "./crew-detail.js";
import type { SectionCtx } from "./character-sections/context.js";

vi.mock("../../../data/world/doskvol.json", () => ({ default: { groups: [], factions: [], districts: [] } }));

describe("SETTING-PULL-01 no-world UI", () => {
  it("omits the stock faction picker when no world factions are supplied", () => {
    expect(stockFactionPicker(vi.fn(), false)).toBeNull();
  });
  it("omits the districts disclosure when no world districts are supplied", () => {
    expect(doskvolDistrictsDisclosure()).toBeNull();
  });
  it("keeps manual faction entry and starting relationships working without stock controls", () => {
    const handlers = { onContactAdd: vi.fn(), onContactRemove: vi.fn(), onFactionSetStatus: vi.fn(), onFactionRemove: vi.fn(), onFactionSetStarting: vi.fn() };
    const state = {
      c: { contacts: [], factions: [{ name: "Our own faction", tier: 2, status: 1 }], startingFactions: { ally: "", rival: "" } },
      anyLoading: false, factionBounds: { min: -3, max: 3 },
      factionDrafts: { add: { name: "", tier: "", status: "0" }, rows: new Map() }, noteDraft: { text: "" }, contactDraft: { name: "", profession: "" }, handlers,
    } as unknown as RenderState;
    const root = renderCrewContactsSection(state);
    expect(root.querySelector('select[aria-label="Stock faction"]')).toBeNull();
    expect(root.querySelector(".faction-stock-field")).toBeNull();
    expect(root.querySelector(".doskvol-districts")).toBeNull();
    for (const [label, value] of [["Faction name", "A new faction"], ["Faction tier", "2"], ["Faction status", "1"]]) {
      const input = root.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
      input.value = value!; input.dispatchEvent(new Event("input"));
    }
    root.querySelector<HTMLButtonElement>('button[title="Add faction"]')!.click();
    expect(handlers.onFactionSetStatus).toHaveBeenCalledWith("A new faction", 1, 2, true);
    const ally = root.querySelector<HTMLSelectElement>('select[aria-label="Starting ally"]')!;
    ally.value = "Our own faction"; ally.dispatchEvent(new Event("change"));
    root.querySelector<HTMLButtonElement>('button[title="Save starting factions"]')!.click();
    expect(handlers.onFactionSetStarting).toHaveBeenCalledWith("Our own faction", "");
  });
});

function personalContext(editing: boolean) {
  const editor = { key: "heritage", option: "__custom__", customName: "Our own heritage" };
  const handlers = { onNamedSave: vi.fn(), onNamedCancel: vi.fn(), onNamedEdit: vi.fn(), onDossierEdit: vi.fn(), onCrewJoin: vi.fn(), onCrewLeave: vi.fn() };
  const ctx = {
    state: { rerender: vi.fn(), crews: [] },
    c: { dossier: { name: "A scoundrel", alias: "", look: "", crewId: "", background: { name: "", description: "" }, heritage: { name: "Our own heritage", description: "Our own family history" } } },
    gameData: { Heritages: [], Backgrounds: [] }, editing: null, namedEditor: editing ? editor : null, anyLoading: false, handlers,
  } as unknown as SectionCtx;
  return { ctx, editor, handlers };
}

describe("SETTING-PULL-01 heritage without a catalog", () => {
  it("offers free text rather than an empty stock dropdown and keeps the existing save action", () => {
    const { ctx, editor, handlers } = personalContext(true);
    const root = renderPersonalSection(ctx);
    expect(root.querySelector('select[aria-label="Heritage (choose)"]')).toBeNull();
    const input = root.querySelector<HTMLInputElement>('input[aria-label="Heritage custom name"]')!;
    expect(input.value).toBe("Our own heritage");
    input.value = "A table-defined homeland"; input.dispatchEvent(new Event("input"));
    root.querySelector<HTMLButtonElement>('.field-editing button[title="Save"]')!.click();
    expect(editor.customName).toBe("A table-defined homeland");
    expect(handlers.onNamedSave).toHaveBeenCalledOnce();
  });
  it("does not erase a scoundrel's existing user-entered heritage or description", () => {
    const { ctx } = personalContext(false);
    const root = renderPersonalSection(ctx);
    expect(root.textContent).toContain("Our own heritage");
    expect(root.textContent).toContain("Our own family history");
  });
});
