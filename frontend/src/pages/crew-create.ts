import { Effect } from "effect";
import { createCrew, ApiError, DecodeError } from "../api/client.js";
import { el, setChildren } from "../lib/dom.js";
import type { Crew } from "../schema/crew.js";

function renderForm(gameStem: string, crewTypes: string[]): HTMLElement {
  const crewTypeOptions = crewTypes.map((ct) =>
    el("option", { value: ct }, ct),
  );

  const form = el(
    "form",
    { className: "crew-create-form" },
    el(
      "div",
      { className: "form-group" },
      el("label", { htmlFor: "gameStem" }, "Game"),
      el("input", {
        id: "gameStem",
        type: "text",
        value: gameStem,
        disabled: true,
        className: "form-input",
      }),
    ),
    el(
      "div",
      { className: "form-group" },
      el("label", { htmlFor: "crewType" }, "Crew Type *"),
      el(
        "select",
        { id: "crewType", className: "form-input", required: true },
        el("option", { value: "" }, "Select a crew type..."),
        ...crewTypeOptions,
      ),
    ),
    el(
      "div",
      { className: "form-actions" },
      el("button", { type: "submit", className: "btn-primary" }, "Create Crew"),
      el("a", { href: "/roster", className: "btn-secondary" }, "Cancel"),
    ),
  );

  return el(
    "section",
    { className: "crew-create" },
    el("h2", {}, "Create Crew"),
    form,
  );
}

function renderError(message: string): HTMLElement {
  return el(
    "section",
    { className: "crew-create-error" },
    el("h2", {}, "Create Crew"),
    el("p", { className: "error", role: "alert" }, message),
  );
}

function renderLoading(): HTMLElement {
  return el(
    "section",
    { className: "crew-create-loading" },
    el("h2", {}, "Create Crew"),
    el("p", {}, "Creating crew…"),
  );
}

/**
 * Mount the crew creation page into `root` for the given game.
 * Calls `onCreated` on successful creation; returns a disposer.
 */
export function mountCrewCreatePage(
  root: HTMLElement,
  gameStem: string,
  crewTypes: string[],
  onCreated: (crew: Crew) => void,
): () => void {
  let cancelled = false;
  root.setAttribute("aria-live", "polite");

  const form = renderForm(gameStem, crewTypes);
  setChildren(root, form);

  const submitBtn = form.querySelector("button[type=submit]") as HTMLButtonElement;
  if (!submitBtn) {
    return () => {
      cancelled = true;
    };
  }

  const formEl = form.querySelector("form") as HTMLFormElement;
  if (!formEl) {
    return () => {
      cancelled = true;
    };
  }

  formEl.addEventListener("submit", (ev) => {
    if (cancelled) return;
    ev.preventDefault();

    const crewTypeField = formEl.querySelector(
      "#crewType",
    ) as HTMLSelectElement;
    const crewType = crewTypeField?.value;
    if (!crewType) {
      return;
    }

    root.setAttribute("aria-busy", "true");
    setChildren(root, renderLoading());

    const program = Effect.gen(function* () {
      return yield* createCrew(gameStem, crewType);
    });

    void Effect.runPromise(
      Effect.match(program, {
        onFailure: (err) => {
          if (cancelled) return;
          root.setAttribute("aria-busy", "false");
          const msg =
            err instanceof ApiError
              ? `Failed to create crew (${err.status}): ${err.body}`
              : err instanceof DecodeError
                ? `Invalid response: ${err.message}`
                : String(err);
          setChildren(root, renderError(msg));
        },
        onSuccess: (crew) => {
          if (cancelled) return;
          root.setAttribute("aria-busy", "false");
          onCreated(crew);
        },
      }),
    );
  });

  return () => {
    cancelled = true;
  };
}
