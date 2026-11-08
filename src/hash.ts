import { canonicalize } from './canonical.ts';
import { tableContractSchema, type Column, type ObjectField, type TableContract } from './format.ts';
import { ContractError, jsonProblem } from './json.ts';
import { sha256Hex } from './sha256.ts';

/**
 * The normal form of a contract: the meaning without its spelling. Drops the editor hint `$schema` and every property that only
 * repeats a default (`required: false`, `unique: false`, `index: false`, `secret: false`, `integer: false`, `appendOnly: false`,
 * `privacy: "technical"` where it is the default, `index: true` next to `unique: true`, empty `rules` and empty `personal` lists).
 * Key order does not matter (canonical JSON sorts keys); column, field and option order is kept. Throws `ContractError` when the
 * input does not have the shape of a contract. It does not run the semantic checks (`checkContract`).
 */
export function normalizeContract(input: unknown): TableContract {
  const problem = jsonProblem(input);
  if (problem) throw new ContractError([problem]);
  const shape = tableContractSchema.safeParse(input);
  if (!shape.success)
    throw new ContractError(shape.error.issues.map(issue => ({ code: 'invalid-shape', path: issue.path.join('.'), message: issue.message, example: 'See checkContract.' })));
  const { $schema: _hint, personal, rules, appendOnly, columns, ...rest } = shape.data as TableContract;
  const subjectKey = personal?.subjectKey?.length ? personal.subjectKey : undefined;
  const subjectRef = personal?.subjectRef?.length ? personal.subjectRef : undefined;
  return {
    ...rest,
    ...(subjectKey || subjectRef ? { personal: { ...(subjectKey ? { subjectKey } : {}), ...(subjectRef ? { subjectRef } : {}) } } : {}),
    ...(appendOnly ? { appendOnly: true } : {}),
    columns: columns.map(normalizeColumn),
    ...(rules?.length ? { rules } : {}),
  };
}

function normalizeColumn(column: Column): Column {
  const { required, unique, index, secret, integer, privacy, fields, ...rest } = column;
  const privacyDefault = column.type !== 'json' && column.type !== 'object';
  return {
    ...rest,
    ...(required ? { required: true } : {}),
    ...(unique ? { unique: true } : {}),
    ...(index && !unique ? { index: true } : {}),
    ...(index === false && unique ? { index: false } : {}),
    ...(secret ? { secret: true } : {}),
    ...(integer ? { integer: true } : {}),
    ...(privacy && !(privacyDefault && privacy === 'technical') ? { privacy } : {}),
    ...(fields ? { fields: fields.map(normalizeField) } : {}),
  };
}

function normalizeField(field: ObjectField): ObjectField {
  const { required, integer, ...rest } = field;
  return { ...rest, ...(required ? { required: true } : {}), ...(integer ? { integer: true } : {}) };
}

/** `"sha256:" + hex` over the canonical JSON (RFC 8785) of the normal form. Two spellings of the same contract have the same hash. */
export function contractHash(input: unknown): string {
  return `sha256:${sha256Hex(canonicalize(normalizeContract(input)))}`;
}

/** Canonical JSON text of the normal form: what bundle files store. */
export function canonicalContract(input: unknown): string {
  return canonicalize(normalizeContract(input));
}
