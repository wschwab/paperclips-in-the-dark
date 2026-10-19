// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderCrewClaimsSection } from "./crew-sections/claims.js";
import type { RenderState } from "./crew-detail.js";

function fixture(editor: Record<string, unknown> | null = null, owned = ["turf-a"], loading = false) {
  const handlers = { onClaimToggle: vi.fn(), onClaimEditStart: vi.fn(), onClaimEditSelect: vi.fn(), onClaimEditCancel: vi.fn(), onClaimSave: vi.fn(), onClaimReset: vi.fn(), onClaimsEditToggle: vi.fn(), onClaimCustomize: vi.fn() };
  const state = {
    c: { crewTypeName: "Test", claimedClaimIds: owned, claimOverrides: [{ claimId: "turf-a", name: "Our territory" }] },
    crewTypeData: { Claims: { Columns: 3, Rows: 2, Nodes: [
      { Id: "lair", Name: "Lair", Description: "Always controlled", Kind: "lair", Column: 1, Row: 1 },
      { Id: "turf-a", Name: "Turf", Description: "Expand the hunting grounds", Kind: "turf", Column: 2, Row: 1 },
      { Id: "claim-b", Name: "Broker's office", Description: "A useful introduction", Kind: "claim", Column: 3, Row: 2 },
    ], Edges: [{ From: "lair", To: "turf-a" }, { From: "turf-a", To: "claim-b" }] } },
    crewTypesData: null, claimsEditMode: false, claimEditor: editor, anyLoading: loading, handlers,
  } as unknown as RenderState;
  return { state, handlers };
}
function claim(root: HTMLElement, name: string): HTMLButtonElement {
  return [...root.querySelectorAll<HTMLButtonElement>(".claims-grid button")].find(button => button.querySelector("strong")?.textContent === name)!;
}
function button(root: HTMLElement, label: string): HTMLButtonElement | undefined {
  return [...root.querySelectorAll<HTMLButtonElement>("button")].find(candidate => candidate.textContent === label);
}
afterEach(() => vi.restoreAllMocks());

describe("CREW-CLAIMS-EDIT-01", () => {
  it("lets a normal owned-claim click relinquish with confirmation and no edit-mode gate", () => {
    const { state, handlers } = fixture();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const root = renderCrewClaimsSection(state);
    const owned = claim(root, "Our territory");
    expect(owned.disabled).toBe(false);
    expect(owned.querySelector(".claim-not-connected")).toBeNull();
    owned.click();
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/Relinquish.*benefit stops applying/));
    expect(handlers.onClaimToggle).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    owned.click();
    expect(handlers.onClaimToggle).toHaveBeenCalledWith("turf-a", false);
  });

  it("warns about disconnected acquisition but permits it after confirmation", () => {
    const { state, handlers } = fixture(null, []);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const root = renderCrewClaimsSection(state);
    claim(root, "Broker's office").click();
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/out-of-sequence.*NOT connected/s));
    expect(handlers.onClaimToggle).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    claim(root, "Broker's office").click();
    expect(handlers.onClaimToggle).toHaveBeenCalledWith("claim-b", true);
  });

  it("removes active-benefit rename controls and replaces the old Edit claims toggle with one Edit claim action", () => {
    const { state, handlers } = fixture();
    const root = renderCrewClaimsSection(state);
    expect(root.querySelector(".claims-edit-toggle")).toBeNull();
    expect(root.querySelectorAll(".active-claims button")).toHaveLength(0);
    expect(button(root, "Edit claim")).toBeDefined();
    button(root, "Edit claim")!.click();
    expect(handlers.onClaimEditStart).toHaveBeenCalledOnce();
  });

  it("uses a one-shot claim picker for editing without changing ownership or showing an acquisition dialog", () => {
    const { state, handlers } = fixture({ kind: "choose" });
    const confirm = vi.spyOn(window, "confirm");
    const root = renderCrewClaimsSection(state);
    claim(root, "Our territory").click();
    expect(handlers.onClaimEditSelect).toHaveBeenCalledWith("turf-a");
    expect(handlers.onClaimToggle).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("edits the selected claim's name and text in an inline form while preserving the draft for submission", () => {
    const editor = { kind: "edit", claimId: "turf-a", name: "Our territory", description: "Expand the hunting grounds" };
    const { state, handlers } = fixture(editor);
    const root = renderCrewClaimsSection(state);
    const form = root.querySelector<HTMLFormElement>(".claim-editor");
    expect(form).not.toBeNull();
    const name = form!.querySelector<HTMLInputElement>('input[aria-label="Claim name"]')!;
    const text = form!.querySelector<HTMLTextAreaElement>('textarea[aria-label="Claim text"]')!;
    name.value = "The bridge"; name.dispatchEvent(new Event("input"));
    text.value = "Our own benefit description"; text.dispatchEvent(new Event("input"));
    form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(editor.name).toBe("The bridge");
    expect(editor.description).toBe("Our own benefit description");
    expect(handlers.onClaimSave).toHaveBeenCalledOnce();
    expect(handlers.onClaimToggle).not.toHaveBeenCalled();
  });

  it("keeps reset and cancel in the selected editor rather than on the active-benefit list", () => {
    const { state, handlers } = fixture({ kind: "edit", claimId: "turf-a", name: "Our territory", description: "Existing text" });
    const root = renderCrewClaimsSection(state);
    button(root, "Reset to default")!.click();
    expect(handlers.onClaimReset).toHaveBeenCalledWith("turf-a");
    button(root, "Cancel")!.click();
    expect(handlers.onClaimEditCancel).toHaveBeenCalledOnce();
    expect(root.querySelectorAll(".active-claims button")).toHaveLength(0);
  });

  it("preserves edited values and disables the form while an operation is in flight", () => {
    const { state } = fixture({ kind: "edit", claimId: "turf-a", name: "Unsaved name", description: "Unsaved text" }, ["turf-a"], true);
    const root = renderCrewClaimsSection(state);
    const form = root.querySelector<HTMLFormElement>(".claim-editor");
    expect(form).not.toBeNull();
    expect(form!.querySelector<HTMLInputElement>('input[aria-label="Claim name"]')?.value).toBe("Unsaved name");
    expect(form!.querySelector<HTMLTextAreaElement>('textarea[aria-label="Claim text"]')?.value).toBe("Unsaved text");
    expect([...form!.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement>("input,textarea,button")].every(control => control.disabled)).toBe(true);
  });
});
