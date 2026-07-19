/** Tiny plain-DOM helpers. No framework. */

type PropValue = string | number | boolean | undefined | null;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, PropValue> = {},
  ...children: Array<Node | string | null | undefined>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue;
    if (key === "className") {
      node.className = String(value);
    } else if (key === "textContent") {
      node.textContent = String(value);
    } else if (key === "htmlFor") {
      (node as HTMLLabelElement).htmlFor = String(value);
    } else if (key === "checked" && node instanceof HTMLInputElement) {
      node.checked = Boolean(value);
    } else if (key === "disabled" && "disabled" in node) {
      (node as HTMLInputElement).disabled = Boolean(value);
    } else if (key === "value" && "value" in node) {
      (node as HTMLInputElement).value = String(value);
    } else if (typeof value === "boolean") {
      if (value) node.setAttribute(key, "");
      else node.removeAttribute(key);
    } else {
      node.setAttribute(key, String(value));
    }
  }
  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function setChildren(
  node: HTMLElement,
  ...children: Array<Node | string | null | undefined>
): void {
  clear(node);
  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
}
