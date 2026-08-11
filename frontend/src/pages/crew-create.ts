import { Effect } from "effect";
import { createCrew, crewFieldsUpdate, ApiError, DecodeError } from "../api/client.js";
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
      el("label", { htmlFor: "name" }, "Name"),
      el("input", {
        id: "name",
        className: "form-input",
        type: "text",
        placeholder: "Optional — a new crew starts Unnamed",
        maxlength: 60,
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
    el("h1", {}, "Create Crew"),
    form,
  );
}

function renderError(message: string): HTMLElement {
  return el(
    "section",
    { className: "crew-create-error" },
    el("h1", {}, "Create Crew"),
    el("p", { className: "error", role: "alert" }, message),
  );
}

function renderLoading(): HTMLElement {
  return el(
    "section",
    { className: "crew-create-loading" },
    el("h1", {}, "Create Crew"),
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
    const nameField = formEl.querySelector("#name") as HTMLInputElement;
    const name = (nameField?.value ?? "").trim();

    root.setAttribute("aria-busy", "true");
    setChildren(root, renderLoading());

    // Two-step create (Design Audit F-12): POST the crew, then name it via
    // fields.update with the returned id+revision. A fields.update failure
    // must NOT re-POST the crew on retry — surface the error instead.
    const program = Effect.gen(function* () {
      const created = yield* createCrew(gameStem, crewType);
      if (!name) return created;
      return yield* crewFieldsUpdate(created.id, { name }, created.revision);
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
