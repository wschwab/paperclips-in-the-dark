// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { actionDots } from "./action-dots.js";

const cssSource = readFileSync("src/styles/components.css", "utf8");

function press(target: Element, key: string): void {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
  );
}

/** Tab stops inside the group: dots carrying tabindex="0". */
function tabStops(group: HTMLElement): HTMLElement[] {
  return [...group.querySelectorAll<HTMLElement>(".action-dot")].filter(
    (d) => d.getAttribute("tabindex") === "0",
  );
}

describe("actionDots a11y (A11Y-01)", () => {
  describe("interactive rows", () => {
    const make = (overrides: Partial<Parameters<typeof actionDots>[0]> = {}) => {
      const onChange = vi.fn();
      const root = actionDots({
        name: "Hunt",
        value: 2,
        max: 4,
        onChange,
        ...overrides,
      });
      document.body.replaceChildren(root); // focus() needs a live tree
      return { root, group: root.querySelector<HTMLElement>(".action-dots")!, onChange };
    };

    it("exposes exactly ONE tab stop per rating group (roving tabindex)", () => {
      const { group } = make();
      const dots = [...group.querySelectorAll<HTMLElement>(".action-dot")];
      expect(dots.length).toBe(4);
      expect(tabStops(group)).toHaveLength(1);
      // The initially active stop tracks the current value (highest filled dot).
      expect(dots[1].getAttribute("tabindex")).toBe("0");
      expect(dots[0].getAttribute("tabindex")).toBe("-1");
      expect(dots[2].getAttribute("tabindex")).toBe("-1");
    });

    it("keeps the documented aria surfaces: group label carries name/value/max, dots carry pressed state", () => {
      const { group } = make();
      expect(group.getAttribute("role")).toBe("group");
      expect(group.getAttribute("aria-label")).toBe("Hunt rating 2 of 4");
      const dot2 = group.querySelector('.action-dot[data-index="2"]')!;
      expect(dot2.getAttribute("aria-label")).toBe("Hunt 2");
      expect(dot2.getAttribute("aria-pressed")).toBe("true");
      const dot3 = group.querySelector('.action-dot[data-index="3"]')!;
      expect(dot3.getAttribute("aria-pressed")).toBe("false");
    });

    it("moves the active dot AND the selection right on ArrowRight through the shared op path", () => {
      const { root, group, onChange } = make();
      const dots = [...group.querySelectorAll<HTMLButtonElement>(".action-dot")];
      dots[1].focus();
      press(dots[1], "ArrowRight");

      // Active dot moved to #3…
      expect(tabStops(group)).toEqual([dots[2]]);
      expect(document.activeElement).toBe(dots[2]);
      // …and the selection followed: same funnel as a pointer click.
      expect(onChange).toHaveBeenCalledWith(3);
      expect(group.getAttribute("aria-label")).toBe("Hunt rating 3 of 4");
      expect(dots[2].getAttribute("data-fill")).toBe("1");
      // Root element identity is preserved (in-place state change, no re-render).
      expect(root.querySelector(".action-dots")).toBe(group);
    });

    it("moves left on ArrowLeft without dropping below the first dot", () => {
      const { group, onChange } = make({ value: 1 });
      const dots = [...group.querySelectorAll<HTMLButtonElement>(".action-dot")];
      dots[0].focus();
      press(dots[0], "ArrowLeft");

      expect(onChange).not.toHaveBeenCalled(); // clamped at dot 1
      expect(tabStops(group)).toEqual([dots[0]]);
      expect(group.getAttribute("aria-label")).toBe("Hunt rating 1 of 4");
    });

    it("supports Up/Down as vertical aliases of the horizontal arrows", () => {
      const { group, onChange } = make({ value: 1 });
      const dots = [...group.querySelectorAll<HTMLButtonElement>(".action-dot")];
      dots[0].focus();
      press(dots[0], "ArrowUp");
      expect(onChange).toHaveBeenLastCalledWith(2);
      press(dots[1], "ArrowDown");
      expect(onChange).toHaveBeenLastCalledWith(1);
    });

    it("jumps to the ends with Home/End", () => {
      const { group, onChange } = make({ value: 2 });
      const dots = [...group.querySelectorAll<HTMLButtonElement>(".action-dot")];
      dots[1].focus();
      press(dots[1], "End");
      expect(onChange).toHaveBeenLastCalledWith(4);
      expect(tabStops(group)).toEqual([dots[3]]);
      press(dots[3], "Home");
      expect(onChange).toHaveBeenLastCalledWith(1);
      expect(tabStops(group)).toEqual([dots[0]]);
    });

    it("pointer click and keyboard activation drive the same toggle semantics", () => {
      const { group, onChange } = make({ value: 2 });
      const dots = [...group.querySelectorAll<HTMLButtonElement>(".action-dot")];
      dots[2].click(); // set to 3
      expect(onChange).toHaveBeenLastCalledWith(3);
      dots[2].click(); // terminal filled dot clears to 2
      expect(onChange).toHaveBeenLastCalledWith(2);
      expect(group.getAttribute("aria-label")).toBe("Hunt rating 2 of 4");
      // The clicked dot became the roving stop.
      expect(tabStops(group)).toEqual([dots[2]]);
    });

    it("does not hijack modified arrows (browser shortcuts stay native)", () => {
      const { group, onChange } = make();
      const dot = group.querySelector<HTMLButtonElement>(".action-dot")!;
      dot.focus();
      dot.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowRight",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
      expect(onChange).not.toHaveBeenCalled();
    });

    it("renders a ≥24×24 CSS px hit affordance for interactive dots (CSS contract)", () => {
      const { group } = make();
      expect(group.classList.contains("is-interactive")).toBe(true);
      // Explicit 24px dimensions (not inset bleed — the button border
      // shrinks the abs-positioning containing block below 16px).
      expect(cssSource).toMatch(
        /\.action-dots\.is-interactive button\.action-dot[^{]*\{[^}]*width:\s*24px/,
      );
      // The ink dot itself stays at its committed 16×16 (M18 guard: shrinking
      // the declared size below the WCAG 2.5.8 pitch budget must fail here).
      expect(cssSource).toMatch(
        /\.action-dot\s*\{[^}]*width:\s*16px[^}]*height:\s*16px/,
      );
      // Interactive pitch stays ≥24px: 16px dot + 10px gap (A11Y-01).
      expect(cssSource).toMatch(
        /\.action-dots\.is-interactive\s*\{[^}]*gap:\s*10px/,
      );
    });
  });

  describe("disabled rows", () => {
    it("keeps dots reachable but inert, with the disabled state exposed accessibly", () => {
      const onChange = vi.fn();
      const root = actionDots({
        name: "Hunt",
        value: 2,
        max: 4,
        onChange,
        disabled: true,
      });
      const group = root.querySelector<HTMLElement>(".action-dots")!;
      const dots = [...group.querySelectorAll<HTMLButtonElement>(".action-dot")];
      // Still buttons (discoverable, focusable), still one tab stop…
      expect(dots.length).toBe(4);
      expect(tabStops(group)).toHaveLength(1);
      // …marked disabled for AT…
      expect(dots.every((d) => d.getAttribute("aria-disabled") === "true")).toBe(
        true,
      );
      // …and fully inert for both pointers and keys.
      dots[3].click();
      press(dots[1], "ArrowRight");
      expect(onChange).not.toHaveBeenCalled();
      expect(group.getAttribute("aria-label")).toBe("Hunt rating 2 of 4");
    });
  });

  describe("display-only rows", () => {
    it("stay non-interactive spans with no tab stops", () => {
      const root = actionDots({ name: "Hunt", value: 2, max: 4 });
      const group = root.querySelector<HTMLElement>(".action-dots")!;
      expect(group.querySelectorAll("button").length).toBe(0);
      expect(tabStops(group)).toHaveLength(0);
      expect(group.classList.contains("is-interactive")).toBe(false);
    });
  });
});
