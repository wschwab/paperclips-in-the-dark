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

/** State for the entity created in phase one but not yet named in phase two. */
interface PhaseTwo {
  id: string;
  name: string;
  revision: number;
}

/**
 * FV-017 phase-two (naming) failure: the crew was already created and must
 * be retained. Offer a direct link to its sheet plus a retry that resumes
 * ONLY fields.update — never a second POST to create.
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
    { className: "crew-create-error" },
    el("h1", {}, "Create Crew"),
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
  // FV-017: set once phase one (create) succeeded; phase-two retries reuse it
  // so the create endpoint is never POSTed twice for the same entity.
  let phaseTwo: PhaseTwo | null = null;
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

  const finish = (crew: Crew) => {
    if (cancelled) return;
    root.setAttribute("aria-busy", "false");
    onCreated(crew);
  };

  // Resume only the failed sub-step (fields.update) with the retained
  // id + revision. Create is not called again on this path.
  const retryNaming = () => {
    if (cancelled || !phaseTwo) return;
    const retained = phaseTwo;
    root.setAttribute("aria-busy", "true");
    setChildren(root, renderLoading());
    const program = Effect.gen(function* () {
      return yield* crewFieldsUpdate(retained.id, { name: retained.name }, retained.revision);
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
      // Phase-one succeeded: the crew exists. Keep it, link to it, and offer
      // a retry of the naming step only.
      setChildren(
        root,
        renderPhaseTwoRecovery(
          `/crew/${phaseTwo.id}`,
          `Crew created, but naming it failed ${detail}`,
          "The new crew is kept on the roster without a name. Retry naming it, or open its sheet directly.",
          "Retry naming",
          "Open crew sheet",
          retryNaming,
        ),
      );
    } else {
      setChildren(root, renderError(`Failed to create crew ${detail}`));
    }
  };

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
    // fields.update with the returned id+revision.
    phaseTwo = null;
    const program = Effect.gen(function* () {
      const created = yield* createCrew(gameStem, crewType);
      if (!name) return created;
      phaseTwo = { id: created.id, name, revision: created.revision };
      return yield* crewFieldsUpdate(created.id, { name }, created.revision);
    });

    void Effect.runPromise(
      Effect.match(program, { onFailure: fail, onSuccess: finish }),
    );
  });

  return () => {
    cancelled = true;
  };
}
