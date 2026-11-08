import { ContractError, jsonProblem } from './json.ts';
import { ROW_LIMITS } from './limits.ts';

/**
 * Canonical JSON after RFC 8785 (JSON Canonicalization Scheme): object keys sorted by UTF-16 code units, no whitespace, numbers in
 * the ECMAScript shortest form, strings escaped as ECMAScript's JSON.stringify does (which is what RFC 8785 specifies). Strings are
 * not Unicode-normalized (RFC 8785 §3.2.2.2): NFC and NFD spellings of the same text give different output.
 *
 * Throws `ContractError` for input that has no canonical form: a cycle, NaN/Infinity, undefined inside an array, functions, class
 * instances, lone surrogates, or a value beyond the row bounds (depth 20, 10000 values). `undefined` object properties are omitted.
 */
export function canonicalize(value: unknown): string {
  const problem = jsonProblem(value, { maxDepth: ROW_LIMITS.maxDepth, maxNodes: ROW_LIMITS.maxNodes, maxStringChars: ROW_LIMITS.maxRowChars });
  if (problem) throw new ContractError([problem]);
  return serialize(value);
}

function serialize(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  // ECMAScript Number::toString is the RFC 8785 number form; JSON.stringify(-0) is "0".
  if (typeof value === 'number' || typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(serialize).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).filter(key => record[key] !== undefined).sort(compareCodeUnits);
  return `{${keys.map(key => `${JSON.stringify(key)}:${serialize(record[key])}`).join(',')}}`;
}

/** Order of RFC 8785: by UTF-16 code unit, which is what `<` on strings does. */
const compareCodeUnits = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);
