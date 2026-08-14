/**
 * Generated completeness metadata — DO NOT EDIT BY HAND.
 *
 * Source: `x-requiredWhenComplete` in contract/schemas/character.json and
 * contract/schemas/crew.json (SC-C1). Regenerate with:
 *
 *   node skill/generate-completeness.mjs
 *
 * Completeness is derived, never stored (spec-change-work-spec § Completeness,
 * completeness-audit.mdx): a canonical empty at a locked pointer makes an
 * entity readable and incomplete; a genuinely absent property is a
 * canonicality question (repair/degraded), not a completeness question.
 */

/** Contract completeness-predicate vocabulary (Q9, completeness-audit.mdx). */
export type CompletenessPredicate =
  | "nonBlankString"
  | "nonEmptyArray"
  | "positiveInteger"
  | "true";

/**
 * One completeness requirement: a JSON pointer into the canonical entity
 * document plus its predicate from the contract vocabulary.
 */
export interface CompletenessRecord {
  readonly pointer: string;
  readonly predicate: CompletenessPredicate;
}

/** Character completeness requirements (8), in contract pointer order. */
export const CHARACTER_COMPLETENESS_RECORDS: readonly CompletenessRecord[] = [
  { pointer: "/dossier/name", predicate: "nonBlankString" },
  { pointer: "/dossier/alias", predicate: "nonBlankString" },
  { pointer: "/dossier/look", predicate: "nonBlankString" },
  { pointer: "/dossier/heritage/name", predicate: "nonBlankString" },
  { pointer: "/dossier/background/name", predicate: "nonBlankString" },
  { pointer: "/dossier/vice/name", predicate: "nonBlankString" },
  { pointer: "/dossier/vice/purveyor/name", predicate: "nonBlankString" },
  { pointer: "/playbook/name", predicate: "nonBlankString" },
];

/** Crew completeness requirements (5), in contract pointer order. */
export const CREW_COMPLETENESS_RECORDS: readonly CompletenessRecord[] = [
  { pointer: "/name", predicate: "nonBlankString" },
  { pointer: "/crewTypeName", predicate: "nonBlankString" },
  { pointer: "/lair", predicate: "nonBlankString" },
  { pointer: "/reputation", predicate: "nonBlankString" },
  { pointer: "/huntingGrounds", predicate: "nonBlankString" },
];

/** All completeness requirements, keyed by entity kind. */
export const COMPLETENESS_RECORDS: Readonly<{
  character: readonly CompletenessRecord[];
  crew: readonly CompletenessRecord[];
}> = {
  character: CHARACTER_COMPLETENESS_RECORDS,
  crew: CREW_COMPLETENESS_RECORDS,
};

/** nonBlankString: at least one character that is not Unicode whitespace. */
export const isNonBlankString = (value: unknown): boolean =>
  typeof value === "string" && value.trim().length > 0;

/** nonEmptyArray: at least one entry. */
export const isNonEmptyArray = (value: unknown): boolean =>
  Array.isArray(value) && value.length > 0;

/** positiveInteger: an integer greater than zero. */
export const isPositiveInteger = (value: unknown): boolean =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

/** true: the boolean value true. */
export const isTrue = (value: unknown): boolean => value === true;

/**
 * Predicate vocabulary: name to evaluator. A type mismatch is a predicate
 * failure (readable + incomplete), never a schema violation.
 */
export const PREDICATES: Readonly<
  Record<CompletenessPredicate, (value: unknown) => boolean>
> = {
  nonBlankString: isNonBlankString,
  nonEmptyArray: isNonEmptyArray,
  positiveInteger: isPositiveInteger,
  true: isTrue,
};

/**
 * RFC 6901 JSON pointer resolution over a decoded document. Returns
 * undefined when the pointer does not resolve (absent property or index).
 * Pointer tokens decode ~1 to / and ~0 to ~ in that order.
 */
export const resolvePointer = (document: unknown, pointer: string): unknown => {
  if (pointer === "") return document;
  if (!pointer.startsWith("/")) return undefined;
  let current: unknown = document;
  for (const rawToken of pointer.slice(1).split("/")) {
    const token = rawToken.replace(/~1/g, "/").replace(/~0/g, "~");
    if (Array.isArray(current)) {
      if (!/^(0|[1-9][0-9]*)$/.test(token)) return undefined;
      const index = Number(token);
      if (index >= current.length) return undefined;
      current = current[index];
    } else if (typeof current === "object" && current !== null) {
      if (!Object.prototype.hasOwnProperty.call(current, token)) return undefined;
      current = (current as Record<string, unknown>)[token];
    } else {
      return undefined;
    }
  }
  return current;
};

/**
 * The records whose predicate fails on the value at their pointer: the
 * readable-and-incomplete set for a canonical stored document.
 */
export const findIncompleteRecords = (
  records: readonly CompletenessRecord[],
  document: unknown,
): readonly CompletenessRecord[] =>
  records.filter(
    (record) =>
      !PREDICATES[record.predicate](resolvePointer(document, record.pointer)),
  );

/** True when every record's predicate holds for the document. */
export const isComplete = (
  records: readonly CompletenessRecord[],
  document: unknown,
): boolean => findIncompleteRecords(records, document).length === 0;
