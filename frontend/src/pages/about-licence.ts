/** Launch-screen attribution: Blades in the Dark (SRD under CC-BY 3.0) and the setting. */
import { el } from "../lib/dom.js";

const link = (href: string, text: string) =>
  el("li", {}, el("a", { href, target: "_blank", rel: "noopener noreferrer" }, text));

export function renderAboutLicence(): HTMLElement {
  return el(
    "aside",
    { className: "about-licence", "aria-labelledby": "about-licence-title" },
    el("h2", { id: "about-licence-title" }, "About & licence"),
    el("p", {}, "This app is based on Blades in the Dark by John Harper, product of One Seven Design, published by Evil Hat Productions."),
    el(
      "p",
      {},
      "This work is based on Blades in the Dark (found at http://www.bladesinthedark.com/), product of One Seven Design, developed and authored by John Harper, and licensed for our use under the Creative Commons Attribution 3.0 Unported license (http://creativecommons.org/licenses/by/3.0/).",
    ),
    el("p", {}, "Doskvol/Duskwall setting material is the property of John Harper / One Seven Design. Stock world references and setting heritage choices are pulled pending permission; user-entered records remain available."),
    el(
      "ul",
      { className: "about-links" },
      link("https://bladesinthedark.com/", "Blades in the Dark"),
      link("https://bladesinthedark.com/basics", "System Reference Document (SRD)"),
      link("https://bladesinthedark.com/licensing", "Licensing"),
      link("https://creativecommons.org/licenses/by/3.0/", "Creative Commons Attribution 3.0 Unported"),
      link("https://www.evilhat.com/home/blades-in-the-dark", "Evil Hat Productions"),
    ),
  );
}
