// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { renderTalentsSection } from "./talents.js";
import type { SectionCtx } from "./context.js";

function fixture(pending = true, hunt = 0): SectionCtx {
  return {
    c: { talent: { allocationPending: pending, attributes: [{ name: "Insight", rating: 1, experience: { points: 0, max: 6 }, actions: [
      { name: "Study", rating: 2, maxRating: 4 }, { name: "Hunt", rating: hunt, maxRating: 4 },
    ] }] }, playbook: { name: "Spider" } },
    state: { isTalentsLoading: false, clampNotice: null },
    handlers: { onActionSetRating: vi.fn(), onTalentAllocationComplete: vi.fn() },
    gameData: { StartingActionDots: 3, StartingActionDotMax: 2, Playbooks: [{ Name: "Spider", DefaultActionPoints: [{ Action: "Study", Points: 2 }] }], Attributes: [{ Name: "Insight", Actions: [{ Name: "Hunt", ShortDescription: "Track a target." }] }] },
    gameplayDisabled: false, effCapByName: new Map(),
  } as unknown as SectionCtx;
}

describe("durable sheet Talent allocation", () => {
  it("shows unspent budget, fixed defaults, visible help and server attribute rating", () => {
    const root = renderTalentsSection(fixture());
    expect(root.querySelector('[data-talent-unspent]')?.textContent).toBe("1");
    expect(root.querySelector('[data-action="Study"] button')).toBeNull();
    expect(root.querySelector('[data-action-help="Hunt"]')?.textContent).toBe("Track a target.");
    expect(root.querySelector('[data-attribute-rating="Insight"]')?.textContent).toBe("1");
    expect(root.querySelector<HTMLButtonElement>('[data-talent-allocation-complete]')?.disabled).toBe(true);
    expect(root.querySelector('[data-action="Hunt"] button[aria-label="Hunt 2"]')).toBeNull();
  });
  it("finishes explicitly at exact budget and restores ordinary gameplay after completion", () => {
    const ctx = fixture(true, 1);
    const root = renderTalentsSection(ctx);
    const finish = root.querySelector<HTMLButtonElement>('[data-talent-allocation-complete]')!;
    expect(finish.disabled).toBe(false);
    finish.click();
    expect(ctx.handlers.onTalentAllocationComplete).toHaveBeenCalledOnce();
    const completed = renderTalentsSection(fixture(false, 1));
    expect(completed.querySelector('[data-talent-allocation-complete]')).toBeNull();
    expect(completed.querySelector('[data-action="Study"] button[aria-label="Study 4"]')).not.toBeNull();
  });
});
