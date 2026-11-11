import { Effect } from "effect";
import {
  apiFailureText,
  createCharacter,
  createCrew,
  createPcCharacter,
  crewFieldsUpdate,
  dossierUpdate,
  type PickerOption,
} from "../api/client.js";
import { namedOptionLabel } from "./character-domain.js";
import { pcBudgetFromSettings } from "../lib/chargen.js";
import { el, setChildren } from "../lib/dom.js";
import type { Character } from "../schema/character.js";
import type { Crew } from "../schema/crew.js";

/** Everything the create hub needs up front; main.ts loads these in parallel. */
export interface CharacterCreateDeps {
  gameStem: string;
  /** Playbook options: game-data name and Hook (the picker label is "Name - Description"). */
  playbooks: PickerOption[];
  /** Raw game-settings payload (`getGame`) — budget derivation input. */
  settings: Record<string, unknown>;
  crewTypes: PickerOption[];
  onCreated: (character: Character) => void;
  onCrewCreated: (crew: Crew) => void;
}

function renderError(message: string): HTMLElement {
  return el(
    "section",
    { className: "create-error" },
    el("h2", {}, "Something went wrong"),
    el("p", {}, message),
    el("a", { href: "/roster", className: "btn-secondary" }, "Back to roster"),
  );
}

function renderLoading(): HTMLElement {
  return el(
    "section",
    { className: "create-loading" },
    el("h2", {}, "Working…"),
    el("p", {}, "Creating…"),
  );
}

/** State for the entity created in phase one but not yet named in phase two. */
interface PhaseTwo {
  kind: "character" | "crew";
  id: string;
  name: string;
  revision: number;
}

/**
 * Phase-two (naming) failure: the entity was already created and must be
 * retained. Offer a direct link to its sheet plus a retry that resumes ONLY
 * the naming op — never a second POST to create (FV-017).
 */
function renderPhaseTwoRecovery(
  entityHref: string,
  message: string,
  note: string,
  retryLabel: string,
  openLabel: string,
  onRetry: () => void,
): HTMLElement {
  const retryBtn = el("button", { type: "button", className: "btn-primary" }, retryLabel);
  retryBtn.addEventListener("click", onRetry);
  return el(
    "section",
    { className: "create-phase-two-recovery" },
    el("h2", {}, "Almost there"),
    el("p", {}, message),
    el("p", { className: "notice" }, note),
    el(
      "div",
      { className: "form-actions" },
      retryBtn,
      el("a", { href: entityHref, className: "btn-secondary" }, openLabel),
    ),
  );
}

/**
 * The legacy unvalidated form (game/name/playbook → POST /api/characters):
 * kept as the experienced-character/NPC path and as the only path when the
 * game publishes no PC allocation budget (CONTRACT-01 setting-absent).
 */
function renderLegacyForm(gameStem: string, playbooks: PickerOption[]): HTMLElement {
  const playbookOptions = playbooks.map((pb) =>
    el("option", { value: pb.name }, namedOptionLabel(pb.name, pb.description)),
  );

  return el(
    "form",
    { className: "character-create-form" },
    el(
      "div",
      { className: "form-group" },
      el("label", { htmlFor: "gameStem" }, "Game"),
      el("input", {
        id: "gameStem",
        name: "gameStem",
        className: "form-input",
        value: gameStem,
        readOnly: true,
      }),
    ),
    el(
      "div",
      { className: "form-group" },
      el("label", { htmlFor: "name" }, "Name"),
      el("input", {
        id: "name",
        name: "name",
        className: "form-input",
        placeholder: "Leave blank to name later",
        autoComplete: "off",
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
      el("button", { type: "submit", className: "btn-primary" }, "Create Scoundrel"),
      el("a", { href: "/roster", className: "btn-secondary" }, "Cancel"),
    ),
  );
}

// ---------------------------------------------------------------------------
// PC chargen (CONTRACT-01 stage 3)
// ---------------------------------------------------------------------------


/**
 * DEC-01 §6 ruling: the required-field state visible before submission.
 * Creation collects only a playbook, so EVERY one of these is
 * still outstanding on the fresh sheet at submit time. Keys mirror
 * lib/completion-cues.ts so this pre-create list and the sheet-side
 * prompts stay aligned.
 */
const REQUIRED_AFTER_CREATE: readonly { key: string; label: string }[] = [
  { key: "name", label: "a name" },
  { key: "alias", label: "an alias" },
  { key: "heritage", label: "a heritage" },
  { key: "background", label: "a background" },
  { key: "look", label: "a look" },
  { key: "vice", label: "a vice, its purveyor, and a description" },
  { key: "ability", label: "a first playbook ability" },
  { key: "crew", label: "a crew" },
];

function renderRequiredAfterCreate(): HTMLElement {
  return el(
    "div",
    { className: "chargen-required" },
    el(
      "p",
      { className: "chargen-required-title" },
      "Creating leaves these blank — finish them on the sheet:",
    ),
    el(
      "ul",
      {},
      ...REQUIRED_AFTER_CREATE.map((r) =>
        el("li", { "data-required-field": r.key }, r.label),
      ),
    ),
  );
}
/** Create the durable draft first; all Talent allocation happens on its sheet. */
function buildPcChargenForm(
  playbooks: PickerOption[],
  onSubmit: (playbook: string) => void,
): HTMLFormElement {
  const select = el("select", { id: "pc-playbook", className: "form-input", required: true },
    el("option", { value: "" }, "Select a playbook..."),
    ...playbooks.map((pb) => el("option", { value: pb.name }, namedOptionLabel(pb.name, pb.description))),
  );
  const submit = el("button", { type: "submit", className: "btn-primary", disabled: true }, "Create Scoundrel");
  select.addEventListener("change", () => { submit.disabled = !select.value; });
  const form = el("form", { className: "pc-chargen-form" },
    el("div", { className: "form-group" }, el("label", { htmlFor: "pc-playbook" }, "Playbook *"), select),
    el("p", { className: "notice" }, "Choose a playbook to open your sheet. Its default Talent dots are included; allocate the rest there."),
    renderRequiredAfterCreate(),
    el("div", { className: "form-actions" }, submit, el("a", { href: "/roster", className: "btn-secondary" }, "Cancel")),
  );
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    if (select.value) onSubmit(select.value);
  });
  return form;
}

// ---------------------------------------------------------------------------
// Crew multi-step flow (type → name → confirm), presented frontend-only
// ---------------------------------------------------------------------------

/**
 * Presented three-step crew creation. Nothing numeric to validate — this is
 * a guided presentation of the same two-phase create+name calls the
 * /crew/create page performs directly.
 */
function buildCrewFlow(
  crewTypes: PickerOption[],
  onConfirm: (crewType: string, name: string) => void,
): HTMLElement {
  let step = 1;
  let crewType = "";
  let crewName = "";

  const panel = el("div", { className: "crew-flow-panel" });
  const stepNames = ["Type", "Name", "Confirm"];

  function renderStep(): void {
    setChildren(panel, el("p", { className: "crew-step-indicator" }, `Step ${step} of 3 — ${stepNames[step - 1]}`));

    if (step === 1) {
      const select = el(
        "select",
        { id: "crew-type-step", className: "form-input" },
        el("option", { value: "" }, "Select a crew type..."),
        ...crewTypes.map((ct) => el("option", { value: ct.name, selected: ct.name === crewType || undefined }, namedOptionLabel(ct.name, ct.description))),
      );
      const next = el("button", { type: "button", className: "btn-primary crew-next", disabled: !crewType }, "Next");
      next.addEventListener("click", () => {
        if (!select.value) return;
        crewType = select.value;
        step = 2;
        renderStep();
      });
      select.addEventListener("change", () => {
        next.disabled = !select.value;
      });
      panel.append(el("div", { className: "form-group" }, el("label", { htmlFor: "crew-type-step" }, "Crew type"), select));
      panel.append(el("div", { className: "form-actions" }, next));
      return;
    }

    if (step === 2) {
      const input = el("input", {
        id: "crew-name-step",
        className: "form-input",
        placeholder: "Leave blank to name later",
        autoComplete: "off",
        value: crewName,
      });
      const back = el("button", { type: "button", className: "btn-secondary crew-back" }, "Back");
      const next = el("button", { type: "button", className: "btn-primary crew-next" }, "Next");
      back.addEventListener("click", () => {
        crewName = input.value.trim();
        step = 1;
        renderStep();
      });
      next.addEventListener("click", () => {
        crewName = input.value.trim();
        step = 3;
        renderStep();
      });
      panel.append(el("div", { className: "form-group" }, el("label", { htmlFor: "crew-name-step" }, "Crew name"), input));
      panel.append(el("div", { className: "form-actions" }, back, next));
      return;
    }

    const back = el("button", { type: "button", className: "btn-secondary crew-back" }, "Back");
    const confirm = el("button", { type: "button", className: "btn-primary crew-confirm" }, "Create Crew");
    back.addEventListener("click", () => {
      step = 2;
      renderStep();
    });
    confirm.addEventListener("click", () => onConfirm(crewType, crewName));
    panel.append(
      el(
        "div",
        { className: "crew-summary" },
        el("p", {}, "Type: ", el("strong", {}, crewType)),
        el("p", {}, "Name: ", el("strong", {}, crewName || "(unnamed — can be added later)")),
      ),
      el("div", { className: "form-actions" }, back, confirm),
    );
  }

  renderStep();
  return el(
    "section",
    { className: "crew-create-flow", "aria-label": "Create crew" },
    el("h2", {}, "Create a crew instead"),
    el("p", { className: "notice" }, "Three quick steps — nothing numeric to balance here."),
    panel,
  );
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

/**
 * Mount the create hub into `root`: the validated PC chargen when the game
 * publishes a PC allocation budget (StartingActionDots/StartingActionDotMax
 * in game settings), plus the unvalidated path under an opt-in disclosure
 * (or standalone when no budget exists), plus the presented crew multi-step
 * flow. Returns a disposer.
 */
export function mountCharacterCreatePage(
  root: HTMLElement,
  deps: CharacterCreateDeps,
): () => void {
  const { gameStem, playbooks, settings, crewTypes, onCreated, onCrewCreated } = deps;
  let cancelled = false;
  // FV-017: set once phase one (create) succeeded; phase-two retries reuse
  // it so the create endpoint is never POSTed twice for the same entity.
  let phaseTwo: PhaseTwo | null = null;
  root.setAttribute("aria-live", "polite");
  const budget = pcBudgetFromSettings(settings);
  const pcFlowReady = budget !== null;

  const page = el(
    "section",
    { className: "character-create" },
    el("h1", {}, "Create Scoundrel"),
  );

  // -- Validated PC chargen --------------------------------------------------
  if (pcFlowReady) {
    const form = buildPcChargenForm(playbooks, (playbook) => {
      if (cancelled) return;
      phaseTwo = null;
      root.setAttribute("aria-busy", "true");
      setChildren(root, renderLoading());
      const program = createPcCharacter(gameStem, playbook);
      void Effect.runPromise(
        Effect.match(program, {
          onSuccess: finish,
          onFailure: (err) => fail(`Failed to create scoundrel: ${apiFailureText(err)}`),
        }),
      );
    });
    page.append(form);
  } else {
    page.append(
      el(
        "p",
        { className: "notice", role: "note" },
        "This game does not publish a validated starting-dot budget, so scoundrels are created without Talent validation.",
      ),
    );
  }

  // -- Unvalidated path ------------------------------------------------------
  const legacyForm = renderLegacyForm(gameStem, playbooks);
  legacyForm.addEventListener("submit", (ev) => {
    if (cancelled) return;
    ev.preventDefault();

    const playbookField = legacyForm.querySelector("#playbook") as HTMLSelectElement | null;
    const playbook = playbookField?.value;
    if (!playbook) return;
    const nameField = legacyForm.querySelector("#name") as HTMLInputElement | null;
    const name = (nameField?.value ?? "").trim();

    root.setAttribute("aria-busy", "true");
    setChildren(root, renderLoading());

    // Two-step create (Design Audit F-12): POST the character, then name it
    // via dossier.update with the returned id+revision.
    phaseTwo = null;
    const program = Effect.gen(function* () {
      const created = yield* createCharacter(gameStem, playbook);
      if (!name) return created;
      phaseTwo = { kind: "character", id: created.id, name, revision: created.revision };
      return yield* dossierUpdate(created.id, { name }, created.revision);
    });

    void Effect.runPromise(Effect.match(program, { onSuccess: finish, onFailure: (err) => fail(`Failed to create scoundrel: ${apiFailureText(err)}`) }));
  });

  if (pcFlowReady) {
    // Budget exists: the unvalidated path stays available for experienced
    // characters and NPCs, tucked behind an explicit opt-in.
    page.append(
      el(
        "details",
        { className: "create-unvalidated" },
        el("summary", {}, "Advanced: create without validation (experienced scoundrel / NPC)"),
        legacyForm,
      ),
    );
  } else {
    page.append(legacyForm);
  }

  // -- Crew multi-step flow ---------------------------------------------------
  page.append(buildCrewFlow(crewTypes, (crewType, name) => {
    if (cancelled) return;
    phaseTwo = null;
    root.setAttribute("aria-busy", "true");
    setChildren(root, renderLoading());
    const program = Effect.gen(function* () {
      const created = yield* createCrew(gameStem, crewType);
      if (!name) return created;
      phaseTwo = { kind: "crew", id: created.id, name, revision: created.revision };
      return yield* crewFieldsUpdate(created.id, { name }, created.revision);
    });
    void Effect.runPromise(
      Effect.match(program, {
        onSuccess: finishCrew,
        onFailure: (err) => fail(`Failed to create crew: ${apiFailureText(err)}`),
      }),
    );
  }));

  setChildren(root, page);

  const finish = (character: Character): void => {
    if (cancelled) return;
    root.setAttribute("aria-busy", "false");
    onCreated(character);
  };

  const finishCrew = (crew: Crew): void => {
    if (cancelled) return;
    root.setAttribute("aria-busy", "false");
    onCrewCreated(crew);
  };

  // Resume only the failed sub-step (naming) with the retained id + revision.
  // Create is not called again on this path. Split by kind so each program
  // stays fully typed.
  const retryNaming = (): void => {
    if (cancelled || !phaseTwo) return;
    const retained = phaseTwo;
    root.setAttribute("aria-busy", "true");
    setChildren(root, renderLoading());
    const label = retained.kind === "character" ? "Scoundrel" : "Crew";
    const onFail = (err: unknown) => fail(`${label} created, but naming it failed: ${apiFailureText(err)}`);
    if (retained.kind === "character") {
      const program = dossierUpdate(retained.id, { name: retained.name }, retained.revision);
      void Effect.runPromise(Effect.match(program, { onSuccess: finish, onFailure: onFail }));
    } else {
      const program = crewFieldsUpdate(retained.id, { name: retained.name }, retained.revision);
      void Effect.runPromise(Effect.match(program, { onSuccess: finishCrew, onFailure: onFail }));
    }
  };

  const fail = (message: string): void => {
    if (cancelled) return;
    root.setAttribute("aria-busy", "false");
    if (phaseTwo) {
      // Phase-one succeeded: the entity exists. Keep it, link to it, and
      // offer a retry of the naming step only.
      const isChar = phaseTwo.kind === "character";
      setChildren(
        root,
        renderPhaseTwoRecovery(
          `/${isChar ? "character" : "crew"}/${phaseTwo.id}`,
          message,
          `The new ${isChar ? "scoundrel" : "crew"} is kept on the roster without a name. Retry naming it, or open its sheet directly.`,
          "Retry naming",
          isChar ? "Open scoundrel sheet" : "Open crew sheet",
          retryNaming,
        ),
      );
    } else {
      setChildren(root, renderError(message));
    }
  };

  return () => {
    cancelled = true;
  };
}
