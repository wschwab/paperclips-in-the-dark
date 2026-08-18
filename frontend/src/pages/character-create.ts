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

/** State for the entity created in phase one but not yet named in phase two. */
interface PhaseTwo {
  id: string;
  name: string;
  revision: number;
}

/**
 * FV-017 phase-two (naming) failure: the character was already created and
 * must be retained. Offer a direct link to its sheet plus a retry that
 * resumes ONLY dossier.update — never a second POST to create.
 */
function renderPhaseTwoRecovery(
  entityHref: string,
  message: string,
  note: string,
  retryLabel: string,
  openLabel: string,
  onRetry: () => void,
): HTMLElement {
  const retry = el("button", { type: "button", className: "btn-primary" }, retryLabel);
  retry.addEventListener("click", onRetry);
  return el(
    "section",
    { className: "character-create-error" },
    el("h1", {}, "Create Character"),
    el("p", { className: "error", role: "alert" }, message),
    el("p", { className: "recovery-note" }, note),
    el(
      "div",
      { className: "form-actions" },
      el("a", { href: entityHref, className: "btn-secondary" }, openLabel),
      retry,
    ),
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
  // FV-017: set once phase one (create) succeeded; phase-two retries reuse it
  // so the create endpoint is never POSTed twice for the same entity.
  let phaseTwo: PhaseTwo | null = null;
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

  const finish = (character: Character) => {
    if (cancelled) return;
    root.setAttribute("aria-busy", "false");
    onCreated(character);
  };

  // Resume only the failed sub-step (dossier.update) with the retained
  // id + revision. Create is not called again on this path.
  const retryNaming = () => {
    if (cancelled || !phaseTwo) return;
    const retained = phaseTwo;
    root.setAttribute("aria-busy", "true");
    setChildren(root, renderLoading());
    const program = Effect.gen(function* () {
      return yield* dossierUpdate(retained.id, { name: retained.name }, retained.revision);
    });
    void Effect.runPromise(Effect.match(program, { onFailure: fail, onSuccess: finish }));
  };

  const fail = (err: unknown) => {
    if (cancelled) return;
    root.setAttribute("aria-busy", "false");
    const detail =
      err instanceof ApiError
        ? `(${err.status}): ${err.body}`
        : err instanceof DecodeError
          ? `Invalid response: ${err.message}`
          : String(err);
    if (phaseTwo) {
      // Phase-one succeeded: the character exists. Keep it, link to it, and
      // offer a retry of the naming step only.
      setChildren(
        root,
        renderPhaseTwoRecovery(
          `/character/${phaseTwo.id}`,
          `Character created, but naming it failed ${detail}`,
          "The new character is kept on the roster without a name. Retry naming it, or open its sheet directly.",
          "Retry naming",
          "Open character sheet",
          retryNaming,
        ),
      );
    } else {
      setChildren(root, renderError(`Failed to create character ${detail}`));
    }
  };

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
    // via dossier.update with the returned id+revision.
    phaseTwo = null;
    const program = Effect.gen(function* () {
      const created = yield* createCharacter(gameStem, playbook);
      if (!name) return created;
      phaseTwo = { id: created.id, name, revision: created.revision };
      return yield* dossierUpdate(created.id, { name }, created.revision);
    });

    void Effect.runPromise(
      Effect.match(program, { onFailure: fail, onSuccess: finish }),
    );
  });

  return () => {
    cancelled = true;
  };
}
