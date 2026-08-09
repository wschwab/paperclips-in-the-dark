// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { clock } from "./clock.js";

describe("clock component (F2aa)", () => {
  it("renders the requested number of clickable segments", () => {
    const el = clock({ segments: 6, value: 2, onChange: () => {} });
    const svg = el.querySelector("svg.clock")!;
    expect(svg.querySelectorAll(".clock-segment").length).toBe(6);
  });

  it("clicking segment N calls onChange with N (click-to-progress)", () => {
    const onChange = vi.fn();
    const el = clock({ segments: 6, value: 2, onChange });
    const segs = el.querySelectorAll<SVGPathElement>(".clock-segment");

    const click = (seg: SVGPathElement) =>
      seg.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    click(segs[4]!); // click segment 5 → next = 5
    expect(onChange).toHaveBeenLastCalledWith(5);

    click(segs[1]!); // state is now 5; click segment 2 → sets progress to 2
    expect(onChange).toHaveBeenLastCalledWith(2);

    click(segs[1]!); // clicking the filled terminal clears it → 1
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it("Enter on a focused segment activates it", () => {
    const onChange = vi.fn();
    const el = clock({ segments: 4, value: 0, onChange });
    const seg = el.querySelectorAll<SVGPathElement>(".clock-segment")[2]!;
    seg.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(onChange).toHaveBeenLastCalledWith(3);
  });

  it("non-interactive clocks render plain segments without button roles", () => {
    const el = clock({ segments: 4, value: 1 });
    const seg = el.querySelector(".clock-segment")!;
    expect(seg.hasAttribute("tabindex")).toBe(false);
    expect(seg.getAttribute("role")).toBeNull();
  });
});
