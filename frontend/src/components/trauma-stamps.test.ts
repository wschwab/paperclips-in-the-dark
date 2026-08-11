// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { traumaStamps } from "./trauma-stamps.js";

describe("traumaStamps", () => {
  it("renders a remove control per stamped trauma when onRemove is set", () => {
    const onRemove = vi.fn();
    const el = traumaStamps({
      items: ["Haunted", "Cold"],
      stamped: ["Haunted"],
      onRemove,
    });
    const btns = [...el.querySelectorAll("button.trauma-remove-btn")];
    expect(btns.length).toBe(1); // only the stamped trauma is removable
    expect(btns[0].getAttribute("aria-label")).toBe("Remove trauma: Haunted");
  });

  it("fires onRemove with the trauma name on click", () => {
    const onRemove = vi.fn();
    const el = traumaStamps({
      items: ["Haunted"],
      stamped: ["Haunted"],
      onRemove,
    });
    const btn = el.querySelector("button.trauma-remove-btn") as HTMLButtonElement;
    expect(btn).not.toBeNull();
    btn.click();
    expect(onRemove).toHaveBeenCalledWith("Haunted");
  });

  it("does not fire onRemove when the control is disabled", () => {
    const onRemove = vi.fn();
    const el = traumaStamps({
      items: ["Haunted"],
      stamped: ["Haunted"],
      onRemove,
      disabled: true,
    });
    const btn = el.querySelector("button.trauma-remove-btn") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    btn.click();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("renders no remove control when onRemove is absent", () => {
    const el = traumaStamps({ items: ["Haunted"], stamped: ["Haunted"] });
    expect(el.querySelectorAll("button.trauma-remove-btn").length).toBe(0);
  });
});
