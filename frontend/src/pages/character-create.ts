import { Effect } from "effect";
import {
  apiFailureText,
  createCharacter,
  createCrew,
  createPcCharacter,
  crewFieldsUpdate,
  dossierUpdate,
} from "../api/client.js";
import {
  actionGroupsFromSettings,
  pcAllocationReady,
  pcBudgetFromSettings,
  playbookDefaultsFromSettings,
  unspentDots,
  type ChargenGroup,
  type PcBudget,
} from "../lib/chargen.js";
import { el, setChildren } from "../lib/dom.js";
import type { Character } from "../schema/character.js";
import type { Crew } from "../schema/crew.js";
import { actionDots } from "../components/action-dots.js";

/** Everything the create hub needs up front; main.ts loads these in parallel. */
export interface CharacterCreateDeps {
  gameStem: string;
  playbooks: string[];
  /** Raw game-settings payload (`getGame`) — budget derivation input. */
  settings: Record<string, unknown>;
  crewTypes: string[];
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
function renderLegacyForm(gameStem: string, playbooks: string[]): HTMLElement {
  const playbookOptions = playbooks.map((pb) =>
    el("option", { value: pb }, pb),
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
      el("button", { type: "submit", className: "btn-primary" }, "Create Character"),
      el("a", { href: "/roster", className: "btn-secondary" }, "Cancel"),
    ),
  );
}

// ---------------------------------------------------------------------------
// PC chargen (CONTRACT-01 stage 3)
// ---------------------------------------------------------------------------

interface PcChargenRefs {
  form: HTMLFormElement;
  counter: HTMLElement;
  unspentEl: HTMLElement;
  submitBtn: HTMLButtonElement;
}
/**
 * Build the validated PC flow: playbook select first, then per-action dot
 * pickers grouped by attribute, both budget numbers visible, and a Create
 * button gated on "exactly 0 unspent AND every rating ≤ cap". The chosen
 * playbook's DefaultActionPoints prefill from settings as LOCKED dots
 * (DEC-01 ruling); switching playbooks re-derives them from scratch.
 */
function buildPcChargenForm(
  playbooks: string[],
  budget: PcBudget,
  groups: ChargenGroup[],
  settings: Record<string, unknown>,
  onSubmit: (playbook: string, ratings: Record<string, number>) => void,
): PcChargenRefs {
  let selectedPlaybook = "";
  const ratings: Record<string, number> = {};
  const allActions = groups.flatMap((g) => g.actions);

  const playbookSelect = el(
    "select",
    { id: "pc-playbook", className: "form-input", required: true },
    el("option", { value: "" }, "Select a playbook..."),
    ...playbooks.map((pb) => el("option", { value: pb }, pb)),
  );

  const unspentEl = el("span", { "data-chargen-unspent": "" }, String(budget.startingActionDots));
  const counter = el(
    "p",
    { className: "chargen-counter", role: "status" },
    "Unspent Talent dots: ",
    unspentEl,
    " of ",
    el("span", { "data-chargen-budget": "" }, String(budget.startingActionDots)),
    ` (per-action max ${budget.startingActionDotMax})`,
  );

  // Per-action hosts so a playbook switch can rebuild the pickers from
  // scratch: the dots keep internal state, and stale fills would silently
  // invert the next click into a "clear" (review-caught defect).
  const dotHosts: Record<string, HTMLElement> = {};
  for (const group of groups) {
    for (const action of group.actions) {
      dotHosts[action] = el("div", { className: "chargen-dots" });
    }
  }
  const mountActionDots = (action: string, locked: boolean): HTMLElement => {
    const host = dotHosts[action];
    host.replaceChildren(
      actionDots({
        name: action,
        max: budget.startingActionDotMax,
        value: ratings[action] ?? 0,
        locked,
        title: locked ? "Fixed by the playbook's DefaultActionPoints" : undefined,
        onChange: (next) => {
          ratings[action] = next;
          refresh();
        },
      }),
    );
    return host;
  };
  for (const action of allActions) mountActionDots(action, false);

  const groupEls = groups.map((group) =>
    el(
      "div",
      { className: "chargen-group", "data-attribute": group.attribute },
      el("h3", { className: "chargen-attribute" }, group.attribute),
      ...group.actions.map((action) => dotHosts[action]),
    ),
  );

  const submitBtn = el(
    "button",
    { type: "submit", className: "btn-primary", disabled: true },
    "Create Character",
  );

  const form = el(
    "form",
    { className: "pc-chargen-form" },
    el(
      "div",
      { className: "form-group" },
      el("label", { htmlFor: "pc-playbook" }, "Playbook *"),
      playbookSelect,
    ),
    el(
      "div",
      { className: "chargen-groups" },
      el("p", { className: "chargen-hint" }, "Pick a playbook — its default dots prefill and lock; distribute the rest."),
      ...groupEls,
    ),
    counter,
    el(
      "div",
      { className: "form-actions" },
      submitBtn,
      el("a", { href: "/roster", className: "btn-secondary" }, "Cancel"),
    ),
  );

  // Refresh the derived UI: counter numbers and the disabled-button rule
  // (exactly 0 unspent AND every rating ≤ StartingActionDotMax AND a
  // playbook chosen). Pickers clamp to the cap, so over-allocation cannot
  // be entered — under-allocation shows as unspent > 0 either way.
  function refresh(): void {
    unspentEl.textContent = String(unspentDots(budget, ratings));
    submitBtn.disabled = !pcAllocationReady(budget, selectedPlaybook, ratings);
  }

  playbookSelect.addEventListener("change", () => {
    selectedPlaybook = playbookSelect.value;
    // A fresh playbook means a fresh allocation — never carry dots across.
    // Its DefaultActionPoints come from the settings payload (DEC-01
    // ruling): prefilled, LOCKED, and counted against the same
    // StartingActionDots budget, so unspent shows budget − defaults
    // immediately.
    for (const action of allActions) delete ratings[action];
    const defaults = playbookDefaultsFromSettings(settings, selectedPlaybook);
    for (const [action, points] of Object.entries(defaults)) {
      ratings[action] = points;
    }
    for (const action of allActions) {
      mountActionDots(action, action in defaults);
    }
    refresh();
  });

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    if (!pcAllocationReady(budget, selectedPlaybook, ratings)) return;
    // V4: send EVERY published action; untouched actions are explicit 0.
    const finalRatings: Record<string, number> = {};
    for (const action of allActions) finalRatings[action] = ratings[action] ?? 0;
    onSubmit(selectedPlaybook, finalRatings);
  });

  refresh();
  return { form, counter, unspentEl, submitBtn };
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
  crewTypes: string[],
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
        ...crewTypes.map((ct) => el("option", { value: ct, selected: ct === crewType || undefined }, ct)),
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
  const groups = actionGroupsFromSettings(settings);
  const pcFlowReady = budget !== null && groups !== null;

  const page = el(
    "section",
    { className: "character-create" },
    el("h1", {}, "Create Character"),
  );

  // -- Validated PC chargen --------------------------------------------------
  if (pcFlowReady && budget && groups) {
    const refs = buildPcChargenForm(playbooks, budget, groups, settings, (playbook, ratings) => {
      if (cancelled) return;
      phaseTwo = null;
      root.setAttribute("aria-busy", "true");
      setChildren(root, renderLoading());
      const program = createPcCharacter(gameStem, playbook, ratings);
      void Effect.runPromise(
        Effect.match(program, {
          onSuccess: finish,
          onFailure: (err) => fail(`Failed to create character: ${apiFailureText(err)}`),
        }),
      );
    });
    page.append(refs.form);
  } else {
    page.append(
      el(
        "p",
        { className: "notice", role: "note" },
        "This game does not publish a validated starting-dot budget, so characters are created without Talent validation.",
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

    void Effect.runPromise(Effect.match(program, { onSuccess: finish, onFailure: (err) => fail(`Failed to create character: ${apiFailureText(err)}`) }));
  });

  if (pcFlowReady) {
    // Budget exists: the unvalidated path stays available for experienced
    // characters and NPCs, tucked behind an explicit opt-in.
    page.append(
      el(
        "details",
        { className: "create-unvalidated" },
        el("summary", {}, "Advanced: create without validation (experienced character / NPC)"),
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
    const label = retained.kind === "character" ? "Character" : "Crew";
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
          `The new ${isChar ? "character" : "crew"} is kept on the roster without a name. Retry naming it, or open its sheet directly.`,
          "Retry naming",
          isChar ? "Open character sheet" : "Open crew sheet",
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
