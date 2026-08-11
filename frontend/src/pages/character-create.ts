import { Effect } from "effect";
import { createCharacter, dossierUpdate, ApiError, DecodeError } from "../api/client.js";
import { el, setChildren } from "../lib/dom.js";
import type { Character } from "../schema/character.js";

function renderForm(gameStem: string, playbooks: string[]): HTMLElement {
  const playbookOptions = playbooks.map((pb) =>
    el("option", { value: pb }, pb),
  );

  const form = el(
    "form",
    { className: "character-create-form" },
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
        placeholder: "Optional — a new character starts Unnamed",
        maxlength: 60,
      }),
    ),
    el(
      "div",
      { className: "form-group" },
      el("label", { htmlFor: "playbook" }, "Playbook *"),
      el(
        "select",
        { id: "playbook", className: "form-input", required: true },
        el("option", { value: "" }, "Select a playbook..."),
        ...playbookOptions,
      ),
    ),
    el(
      "div",
      { className: "form-actions" },
      el("button", { type: "submit", className: "btn-primary" }, "Create Character"),
      el("a", { href: "/roster", className: "btn-secondary" }, "Cancel"),
    ),
  );

  return el(
    "section",
    { className: "character-create" },
    el("h1", {}, "Create Character"),
    form,
  );
}

function renderError(message: string): HTMLElement {
  return el(
    "section",
    { className: "character-create-error" },
    el("h1", {}, "Create Character"),
    el("p", { className: "error", role: "alert" }, message),
  );
}

function renderLoading(): HTMLElement {
  return el(
    "section",
    { className: "character-create-loading" },
    el("h1", {}, "Create Character"),
    el("p", {}, "Creating character…"),
  );
}

/**
 * Mount the character creation page into `root` for the given game.
 * Returns a disposer and a function to navigate after creation.
 */
export function mountCharacterCreatePage(
  root: HTMLElement,
  gameStem: string,
  playbooks: string[],
  onCreated: (character: Character) => void,
): () => void {
  let cancelled = false;
  root.setAttribute("aria-live", "polite");

  const form = renderForm(gameStem, playbooks);
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

    const playbookField = formEl.querySelector(
      "#playbook",
    ) as HTMLSelectElement;
    const playbook = playbookField?.value;
    if (!playbook) {
      return;
    }
    const nameField = formEl.querySelector("#name") as HTMLInputElement;
    const name = (nameField?.value ?? "").trim();

    root.setAttribute("aria-busy", "true");
    setChildren(root, renderLoading());

    // Two-step create (Design Audit F-12): POST the character, then name it
    // via dossier.update with the returned id+revision. A dossier.update
    // failure must NOT re-POST the character on retry — it is recoverable,
    // so we surface the error rather than risk a duplicate character.
    const program = Effect.gen(function* () {
      const created = yield* createCharacter(gameStem, playbook);
      if (!name) return created;
      return yield* dossierUpdate(created.id, { name }, created.revision);
    });

    void Effect.runPromise(
      Effect.match(program, {
        onFailure: (err) => {
          if (cancelled) return;
          root.setAttribute("aria-busy", "false");
          const msg =
            err instanceof ApiError
              ? `Failed to create character (${err.status}): ${err.body}`
              : err instanceof DecodeError
                ? `Invalid response: ${err.message}`
                : String(err);
          setChildren(root, renderError(msg));
        },
        onSuccess: (character) => {
          if (cancelled) return;
          root.setAttribute("aria-busy", "false");
          onCreated(character);
        },
      }),
    );
  });

  return () => {
    cancelled = true;
  };
}
