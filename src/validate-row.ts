import { z } from 'zod/v4';
import { COLUMN_NAME_PATTERN, RESERVED_COLUMNS, ROW_ID_PATTERN, UNSAFE_NAMES, type Column, type ObjectField, type TableContract } from './format.ts';
import { jsonProblem, type JsonValue } from './json.ts';
import { ROW_LIMITS } from './limits.ts';

/** `create` and `replace` carry the whole row; `patch` carries the columns to change (`null` clears an optional column). */
export type RowMode = 'create' | 'replace' | 'patch';

export interface ValidateRowOptions {
  readonly mode: RowMode;
  /**
   * Pass through columns this contract version does not know (rows written by a newer version of the same contract). Their names
   * must still be valid column names and their values bounded JSON; they are not checked further.
   */
  readonly allowUnknown?: boolean;
}

/** One problem of a row: contract, column, the rule it breaks, plain words and an example of a valid value. */
export interface RowError {
  readonly contract: string;
  /** Column name, `field.sub` inside an object, `column[3]` inside a list; empty for the row as a whole. */
  readonly column: string;
  readonly rule: string;
  readonly message: string;
  readonly example: string;
}

export type RowResult = { readonly ok: true; readonly value: { readonly [column: string]: JsonValue } } | { readonly ok: false; readonly errors: readonly RowError[] };

const systemColumns = new Set<string>(RESERVED_COLUMNS);
const unsafe = new Set<string>(UNSAFE_NAMES);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const emailSchema = z.email();
const columnsOf = new WeakMap<TableContract, Map<string, Column>>();

/**
 * Checks one row against a contract. Pure: no I/O, so it cannot check that a reference's target exists or that a unique value is
 * free (the table core does both). The contract must be valid (`parseContract`). Rules: bounded JSON (depth 20, 10000 values,
 * 128000 characters, strings 32000), no system column, no unknown column (unless `allowUnknown`), required columns in `create` and
 * `replace` (an empty string does not fill a required column), types, `min`/`max`/`integer`, `select` options, `date` as `YYYY-MM-DD`, `timestamp` as ISO 8601 UTC with milliseconds,
 * `url` http(s) without user info, `email`, `reference` as a row id, lists up to 1000 entries, object fields, `anyRequired`.
 * On success `value` is the data with absent (`null`) optional columns dropped in `create` and `replace` (kept in `patch`).
 */
export function validateRow(contract: TableContract, data: unknown, options: ValidateRowOptions): RowResult {
  const errors: RowError[] = [];
  const fail = (column: string, rule: string, message: string, example: string) => errors.push({ contract: contract.id, column, rule, message, example });
  if (data === null || typeof data !== 'object' || Array.isArray(data))
    return { ok: false, errors: [{ contract: contract.id, column: '', rule: 'row-shape', message: 'A row is a JSON object.', example: exampleRow(contract) }] };
  const problem = jsonProblem(data);
  if (problem) {
    fail(problem.path.split(/[.[]/)[0] ?? '', problem.code, problem.message, problem.example);
    return { ok: false, errors };
  }
  const row = data as { readonly [key: string]: JsonValue | undefined };
  if (JSON.stringify(row).length > ROW_LIMITS.maxRowChars) {
    fail('', 'row-too-long', `The row is longer than ${ROW_LIMITS.maxRowChars} characters as JSON.`, 'Store large content as a file (image, video).');
    return { ok: false, errors };
  }
  const columns = lookup(contract);
  const value: { [column: string]: JsonValue } = {};
  for (const key of Object.keys(row)) {
    const entry = row[key];
    if (entry === undefined) continue;
    const column = columns.get(key);
    if (!column) {
      if (systemColumns.has(key)) fail(key, 'system-column', `"${key}" is a system column; the core sets it.`, 'Leave system columns out.');
      else if (options.allowUnknown && COLUMN_NAME_PATTERN.test(key) && !unsafe.has(key)) define(value, key, entry);
      else fail(key, 'unknown-column', `Contract "${contract.id}" has no column "${key}".`, `Columns: ${[...columns.keys()].join(', ')}`);
      continue;
    }
    if (entry === null) {
      if (column.required) fail(key, 'required', `Required column "${key}" must not be empty.`, example(column));
      else if (options.mode === 'patch') define(value, key, null);
      continue;
    }
    if (entry === '' && column.required) fail(key, 'required', `Required column "${key}" must not be an empty string.`, example(column));
    else checkValue(column, entry, key, fail);
    define(value, key, entry);
  }
  if (options.mode !== 'patch') {
    for (const column of columns.values())
      if (column.required && row[column.name] === undefined) // null was reported above
        fail(column.name, 'required', `Required column "${column.name}" is missing.`, `{ "${column.name}": ${example(column)} }`);
    for (const rule of contract.rules ?? [])
      if (!rule.anyRequired.some(name => row[name] !== undefined && row[name] !== null))
        fail(rule.anyRequired.join('|'), 'any-required', `At least one of the columns ${rule.anyRequired.join(', ')} must be set.`,
          `{ "${rule.anyRequired[0]}": ${example(columns.get(rule.anyRequired[0]!)!)} }`);
  }
  return errors.length ? { ok: false, errors } : { ok: true, value };
}

/** The value a `unique` or `index` column compares by: an e-mail address trimmed and lower-cased, every other value as it is. */
export function comparableValue(column: Pick<Column, 'type'>, value: JsonValue): JsonValue {
  return column.type === 'email' && typeof value === 'string' ? value.trim().toLowerCase() : value;
}

type Fail = (column: string, rule: string, message: string, example: string) => void;

function lookup(contract: TableContract): Map<string, Column> {
  let map = columnsOf.get(contract);
  if (!map) {
    map = new Map(contract.columns.map(column => [column.name, column]));
    if (Object.isFrozen(contract)) columnsOf.set(contract, map);
  }
  return map;
}

/** Own data property, also for a key like `__proto__` (plain assignment would set the prototype instead). */
function define(target: Record<string, JsonValue>, key: string, entry: JsonValue) {
  Object.defineProperty(target, key, { value: entry, enumerable: true, writable: true, configurable: true });
}

function checkValue(column: Column | ObjectField, entry: JsonValue, path: string, fail: Fail) {
  const wrong = (rule: string, message: string) => fail(path, rule, `${path}: ${message}`, example(column));
  switch (column.type) {
    case 'list': {
      if (!Array.isArray(entry)) return wrong('type', 'expected a list.');
      if (entry.length > ROW_LIMITS.maxListItems) return wrong('list-too-long', `at most ${ROW_LIMITS.maxListItems} entries (found ${entry.length}).`);
      const item = { ...column, type: column.items!, name: column.name } as ObjectField;
      entry.forEach((element, index) => {
        if (element === null) fail(`${path}[${index}]`, 'type', `${path}[${index}]: empty entries are not allowed.`, example(item));
        else checkValue(item, element, `${path}[${index}]`, fail);
      });
      return;
    }
    case 'object': {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return wrong('type', 'expected an object.');
      const fields = new Map(((column as Column).fields ?? []).map(field => [field.name, field]));
      const record = entry as { readonly [key: string]: JsonValue };
      for (const key of Object.keys(record)) {
        const field = fields.get(key);
        if (!field) fail(`${path}.${key}`, 'unknown-field', `${path}: unknown field "${key}".`, `Fields: ${[...fields.keys()].join(', ')}`);
        else if (record[key] === null || (record[key] === '' && field.required)) {
          if (field.required) fail(`${path}.${key}`, 'required', `${path}.${key} must not be empty.`, example(field));
        }
        else checkValue(field, record[key]!, `${path}.${key}`, fail);
      }
      for (const field of fields.values())
        if (field.required && (record[field.name] === undefined || record[field.name] === null))
          fail(`${path}.${field.name}`, 'required', `${path}.${field.name} is missing.`, example(field));
      return;
    }
    case 'json':
      return;
    case 'number':
      if (typeof entry !== 'number') return wrong('type', 'expected a number.');
      if (column.integer && !Number.isSafeInteger(entry)) wrong('integer', 'expected an integer.');
      if (column.min !== undefined && entry < column.min) wrong('min', `less than ${column.min}.`);
      if (column.max !== undefined && entry > column.max) wrong('max', `greater than ${column.max}.`);
      return;
    case 'boolean':
      if (typeof entry !== 'boolean') wrong('type', 'expected true or false.');
      return;
    default:
      if (typeof entry !== 'string') return wrong('type', 'expected text.');
      return checkText(column, entry, wrong);
  }
}

function checkText(column: Column | ObjectField, entry: string, wrong: (rule: string, message: string) => void) {
  switch (column.type) {
    case 'select':
      if (!(column.options ?? []).includes(entry)) wrong('option', `"${entry}" is not one of the options (${(column.options ?? []).join(', ')}).`);
      return;
    case 'date':
      if (!DATE.test(entry) || Number.isNaN(Date.parse(entry)) || new Date(entry).toISOString().slice(0, 10) !== entry) wrong('date', 'expected a date YYYY-MM-DD.');
      return;
    case 'timestamp':
      if (!TIMESTAMP.test(entry) || Number.isNaN(Date.parse(entry)) || new Date(entry).toISOString() !== entry)
        wrong('timestamp', 'expected a UTC timestamp with milliseconds (ISO 8601).');
      return;
    case 'email':
      if (entry.trim().length > 254 || !emailSchema.safeParse(entry.trim()).success) wrong('email', 'Email address is invalid.');
      return;
    case 'url':
      if (!validUrl(entry)) wrong('url', 'only http(s) links without credentials are allowed.');
      return;
    case 'reference':
      if (!ROW_ID_PATTERN.test(entry)) wrong('reference', 'expected a row id (letters, digits, _ . : -, at most 96 characters).');
      return;
    case 'image':
    case 'video':
      if (!entry.trim()) wrong('type', 'expected a reference to a file.');
      return;
    default:
      return;
  }
}

function validUrl(entry: string): boolean {
  if (entry !== entry.trim()) return false;
  try {
    const url = new URL(entry);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password;
  } catch {
    return false; // not a URL at all: the caller reports it as invalid
  }
}

function example(column: Column | ObjectField): string {
  switch (column.type) {
    case 'number': return String(column.min ?? (column.max !== undefined ? Math.min(0, column.max) : 0));
    case 'boolean': return 'true';
    case 'date': return '"2026-11-07"';
    case 'timestamp': return '"2026-11-07T09:30:00.000Z"';
    case 'email': return '"lena@example.com"';
    case 'url': return '"https://example.com/"';
    case 'select': return JSON.stringify(column.options?.[0] ?? '');
    case 'reference': return '"row_01"';
    case 'json': return '{ "key": "value" }';
    case 'object': return `{ ${((column as Column).fields ?? []).filter(field => field.required).map(field => `"${field.name}": ${example(field)}`).join(', ')} }`;
    case 'list': return `[${example({ ...column, type: column.items! } as ObjectField)}]`;
    default: return '"Text"';
  }
}

function exampleRow(contract: TableContract): string {
  const required = contract.columns.filter(column => column.required);
  return `{ ${(required.length ? required : contract.columns.slice(0, 1)).map(column => `"${column.name}": ${example(column)}`).join(', ')} }`;
}
