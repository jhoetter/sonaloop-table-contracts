import { ROW_LIMITS } from './limits.ts';

/** A finding about a contract or a JSON document: what is wrong, where, and an example of a correct value. */
export interface Finding {
  /** Stable machine code, e.g. `column-reserved`. */
  readonly code: string;
  /** Location in the document, e.g. `columns[2].options`; empty for the document itself. */
  readonly path: string;
  /** What is wrong, in plain words. */
  readonly message: string;
  /** A correct value or snippet. */
  readonly example: string;
}

/** Thrown by the functions that need a valid input (`parseContract`, `contractHash`, `canonicalize` ...); `findings` names every problem. */
export class ContractError extends Error {
  readonly code: string;
  readonly findings: readonly Finding[];
  constructor(findings: readonly Finding[], message?: string) {
    const first = findings[0];
    super(message ?? (first ? `${first.path ? `${first.path}: ` : ''}${first.message}${findings.length > 1 ? ` (+${findings.length - 1} more)` : ''}` : 'Invalid contract.'));
    this.name = 'ContractError';
    this.code = first?.code ?? 'invalid';
    this.findings = findings;
  }
}

export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

interface JsonBounds {
  readonly maxDepth: number;
  readonly maxNodes: number;
  readonly maxStringChars: number;
}

const DEFAULT_BOUNDS: JsonBounds = { maxDepth: ROW_LIMITS.maxDepth, maxNodes: ROW_LIMITS.maxNodes, maxStringChars: ROW_LIMITS.maxTextChars };

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** True when a string is valid Unicode (no lone UTF-16 surrogate), as RFC 8785 requires. */
const isWellFormed = (text: string) => !LONE_SURROGATE.test(text);

/** A plain data object: `{}` or `Object.create(null)`, never a class instance, Date, Map or array. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export const childPath = (path: string, key: string | number) =>
  typeof key === 'number' ? `${path}[${key}]` : /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? (path ? `${path}.${key}` : key) : `${path}[${JSON.stringify(key)}]`;

/**
 * First problem that keeps a value from being a bounded JSON document: a cycle, a value JSON has no form for (undefined in an array,
 * function, symbol, bigint, NaN, Infinity, class instance), a lone surrogate, too deep, too many values, a too long string.
 * `undefined` object properties count as absent (as in JSON.stringify). Recursion is bounded by `maxDepth`.
 */
export function jsonProblem(value: unknown, bounds: JsonBounds = DEFAULT_BOUNDS, root = ''): Finding | undefined {
  let nodes = 0;
  const ancestors = new Set<object>();
  const visit = (current: unknown, path: string, depth: number): Finding | undefined => {
    if (++nodes > bounds.maxNodes) return { code: 'too-large', path, message: `More than ${bounds.maxNodes} values.`, example: 'Fewer values; store large data as a file.' };
    if (depth > bounds.maxDepth) return { code: 'too-deep', path, message: `Nested deeper than ${bounds.maxDepth} levels.`, example: 'A flatter structure.' };
    if (current === null || typeof current === 'boolean') return undefined;
    if (typeof current === 'number') return Number.isFinite(current) ? undefined : { code: 'not-json', path, message: 'Number is not finite (NaN or Infinity).', example: '0' };
    if (typeof current === 'string') {
      if (current.length > bounds.maxStringChars) return { code: 'too-long', path, message: `Text is longer than ${bounds.maxStringChars} characters.`, example: 'Shorter text.' };
      return isWellFormed(current) ? undefined : { code: 'unicode', path, message: 'Text contains a lone surrogate (not valid Unicode).', example: '"Text"' };
    }
    if (typeof current !== 'object') return { code: 'not-json', path, message: `A value of type ${typeof current} is not JSON.`, example: 'null' };
    if (ancestors.has(current)) return { code: 'cyclic', path, message: 'The value contains itself (cycle).', example: 'A tree without back references.' };
    ancestors.add(current);
    try {
      if (Array.isArray(current)) {
        for (let index = 0; index < current.length; index++) {
          if (!(index in current) || current[index] === undefined) return { code: 'not-json', path: childPath(path, index), message: 'Empty entry (undefined) in a list.', example: 'null' };
          const problem = visit(current[index], childPath(path, index), depth + 1);
          if (problem) return problem;
        }
        return undefined;
      }
      if (!isPlainObject(current)) return { code: 'not-json', path, message: 'Only plain objects are allowed (no class instance, no Date, no Map).', example: '{ "key": "value" }' };
      for (const key of Object.keys(current)) {
        if (!isWellFormed(key)) return { code: 'unicode', path: childPath(path, key), message: 'Key contains a lone surrogate.', example: '"key"' };
        const child = current[key];
        if (child === undefined) continue;
        const problem = visit(child, childPath(path, key), depth + 1);
        if (problem) return problem;
      }
      return undefined;
    } finally {
      ancestors.delete(current);
    }
  };
  return visit(value, root, 0);
}
