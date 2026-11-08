import {
  COLUMN_NAME_PATTERN, CONTRACT_ID_PATTERN, RESERVED_COLUMNS, RESERVED_NAMESPACES, UNSAFE_NAMES, tableContractSchema,
  type Column, type ObjectField, type TableContract,
} from './format.ts';
import { ContractError, childPath, jsonProblem, type Finding } from './json.ts';
import { CONTRACT_LIMITS } from './limits.ts';

const reserved = new Set<string>(RESERVED_COLUMNS);
const unsafe = new Set<string>(UNSAFE_NAMES);
const reservedNamespaces = new Set<string>(RESERVED_NAMESPACES);
/** Types without equality search and sort: `unique` and `index` make no sense there. */
const unindexable = new Set(['json', 'object', 'list']);
/** Types that may carry `secret`. */
const secretTypes = new Set(['text', 'json', 'object']);

/**
 * All findings of a contract document; an empty list means valid. Runs the closed shape (`tableContractSchema`) first, then the
 * semantic rules of the format. Never throws, whatever the input (cyclic, huge, hostile keys).
 */
export function checkContract(input: unknown): Finding[] {
  const problem = jsonProblem(input);
  if (problem) return [problem];
  const shape = tableContractSchema.safeParse(input);
  if (!shape.success) return shape.error.issues.map(shapeFinding);
  return semanticFindings(shape.data as TableContract);
}

/** The contract when it is valid (without the `$schema` editor hint); throws `ContractError` with every finding otherwise. */
export function parseContract(input: unknown): TableContract {
  const findings = checkContract(input);
  if (findings.length) throw new ContractError(findings);
  const { $schema: _hint, ...contract } = tableContractSchema.parse(input) as TableContract;
  return contract;
}

function shapeFinding(issue: { code: string; path: PropertyKey[]; message: string; keys?: string[] }): Finding {
  const path = issue.path.reduce<string>((text, key) => childPath(text, typeof key === 'number' ? key : String(key)), '');
  if (issue.code === 'unrecognized_keys') {
    const keys = issue.keys ?? [];
    const named = keys.map(key => JSON.stringify(key)).join(', ');
    return { code: 'unknown-key', path, message: `Unknown property ${named}: the vocabulary is closed.`, example: 'Use only the properties of the format.' };
  }
  return { code: 'invalid-shape', path, message: issue.message, example: exampleFor(path) };
}

const exampleFor = (path: string) =>
  /schema$/.test(path) ? '"sonaloop.table-contract.v1"' : /type$/.test(path) ? '"text"' : /partition$/.test(path) ? '"tenant"'
    : /privacy$/.test(path) ? '"personal"' : 'See format sonaloop.table-contract.v1.';

function semanticFindings(contract: TableContract): Finding[] {
  const findings: Finding[] = [];
  const add = (code: string, path: string, message: string, example: string) => findings.push({ code, path, message, example });

  if (!CONTRACT_ID_PATTERN.test(contract.id))
    add('id-pattern', 'id', 'Id must be `<name>` or `<namespace>.<name>` (lowercase letters, digits, hyphen; at most 40 characters per part).', '"crm.deal"');
  else if (contract.id.includes('.') && reservedNamespaces.has(contract.id.split('.')[0]!))
    add('reserved-namespace', 'id', `The namespace "${contract.id.split('.')[0]}" is reserved for the platform.`, '"crm.deal"');
  if (!Number.isSafeInteger(contract.version) || contract.version < 1) add('version', 'version', 'Version must be an integer of 1 or more.', '1');
  textBound(add, 'title', contract.title, CONTRACT_LIMITS.maxTitleChars, '"Deal"');
  textBound(add, 'purpose', contract.purpose, CONTRACT_LIMITS.maxPurposeChars, '"A sales deal with stage and value."');
  if (contract.retentionDays !== undefined && (!Number.isSafeInteger(contract.retentionDays) || contract.retentionDays <= 0))
    add('retention', 'retentionDays', 'retentionDays must be an integer greater than 0.', '365');

  const columns = contract.columns;
  if (columns.length < 1 || columns.length > CONTRACT_LIMITS.maxColumns)
    add('column-count', 'columns', `A contract has 1 to ${CONTRACT_LIMITS.maxColumns} columns (found ${columns.length}).`, '[{ "name": "title", "type": "text" }]');
  const byName = new Map<string, Column>();
  columns.forEach((column, index) => {
    const path = `columns[${index}]`;
    if (checkName(add, path, column.name, true)) {
      if (byName.has(column.name)) add('column-duplicate', `${path}.name`, `Column "${column.name}" is duplicated.`, 'Each column name once.');
      else byName.set(column.name, column);
    }
    checkColumn(add, path, column, contract);
  });

  checkPersonal(add, contract, byName);
  const rules = contract.rules ?? [];
  if (rules.length > CONTRACT_LIMITS.maxRules) add('rule-count', 'rules', `At most ${CONTRACT_LIMITS.maxRules} rules.`, '[{ "anyRequired": ["email", "phone"] }]');
  rules.forEach((rule, index) => {
    const path = `rules[${index}].anyRequired`;
    if (rule.anyRequired.length < 1) add('any-required-empty', path, 'anyRequired names at least one column.', '["email", "phone"]');
    if (new Set(rule.anyRequired).size !== rule.anyRequired.length) add('any-required-duplicate', path, 'anyRequired names a column twice.', '["email", "phone"]');
    for (const name of rule.anyRequired)
      if (!byName.has(name)) add('any-required-unknown', path, `anyRequired names the unknown column "${name}".`, `[${[...byName.keys()].slice(0, 2).map(key => JSON.stringify(key)).join(', ')}]`);
  });
  return findings;
}

type Add = (code: string, path: string, message: string, example: string) => void;

function textBound(add: Add, path: string, text: string, max: number, example: string) {
  if (!text.trim()) add(`${path}-empty`, path, `${path} must not be empty.`, example);
  else if (text.length > max) add(`${path}-too-long`, path, `${path} is longer than ${max} characters (found ${text.length}).`, example);
}

/** True when the name may be used; adds the finding otherwise. */
function checkName(add: Add, path: string, name: string, column: boolean): boolean {
  if (!COLUMN_NAME_PATTERN.test(name)) {
    add(column ? 'column-name' : 'field-name', `${path}.name`, `Name "${name}" does not match camelCase (^[a-z][A-Za-z0-9]{0,62}$).`, '"firstName"');
    return false;
  }
  if (column && reserved.has(name)) {
    add('column-reserved', `${path}.name`, `"${name}" is a system column (${RESERVED_COLUMNS.join(', ')}).`, `"${name}Value"`);
    return false;
  }
  if (unsafe.has(name)) {
    add('unsafe-name', `${path}.name`, `"${name}" is not allowed as a name (object prototype).`, `"${name}Name"`);
    return false;
  }
  return true;
}

function checkColumn(add: Add, path: string, column: Column, contract: TableContract) {
  checkTyped(add, path, column);
  if (column.description !== undefined && column.description.length > CONTRACT_LIMITS.maxDescriptionChars)
    add('description-too-long', `${path}.description`, `description is longer than ${CONTRACT_LIMITS.maxDescriptionChars} characters.`, '"Email address, match key."');
  if ((column.type === 'json' || column.type === 'object') && column.privacy === undefined)
    add('privacy-required', `${path}.privacy`, `Column "${column.name}" (${column.type}) must name its privacy class; there is no default.`, '"pseudonymous"');
  if (column.type === 'email' && column.privacy !== 'personal')
    add('email-privacy', `${path}.privacy`, `Column "${column.name}" (email) must carry privacy "personal".`, '"personal"');
  if (column.type === 'list' && column.items === 'email' && column.privacy !== 'personal')
    add('email-privacy', `${path}.privacy`, `Column "${column.name}" (a list of email addresses) must carry privacy "personal".`, '"personal"');
  if (column.privacy === 'personal' && !contract.personal)
    add('personal-without-block', `${path}.privacy`, `Column "${column.name}" is personal, but the contract has no personal block.`, '"personal": { "subjectKey": ["email"] }');
  if (column.secret && !secretTypes.has(column.type))
    add('secret-type', `${path}.secret`, 'secret is allowed only on text, json and object.', '{ "type": "text", "secret": true }');
  if ((column.unique || column.index) && unindexable.has(column.type))
    add('index-type', `${path}.${column.unique ? 'unique' : 'index'}`, `${column.type} columns cannot be unique or indexed.`, '{ "type": "text", "index": true }');
  if (column.unique && column.index === false)
    add('unique-implies-index', `${path}.index`, 'unique implies index; index: false contradicts it.', '{ "unique": true }');
  if (column.type === 'object') {
    const fields = column.fields;
    if (!fields || fields.length < 1 || fields.length > CONTRACT_LIMITS.maxFields)
      add('fields-missing', `${path}.fields`, `object needs 1 to ${CONTRACT_LIMITS.maxFields} sub-columns (fields); deeper data is json.`, '[{ "name": "kind", "type": "text" }]');
    const seen = new Set<string>();
    fields?.forEach((field, index) => {
      const fieldPath = `${path}.fields[${index}]`;
      if (checkName(add, fieldPath, field.name, false)) {
        if (seen.has(field.name)) add('field-duplicate', `${fieldPath}.name`, `Sub-column "${field.name}" is duplicated.`, 'Each name once.');
        seen.add(field.name);
      }
      checkTyped(add, fieldPath, field);
      if (field.description !== undefined && field.description.length > CONTRACT_LIMITS.maxDescriptionChars)
        add('description-too-long', `${fieldPath}.description`, `description is longer than ${CONTRACT_LIMITS.maxDescriptionChars} characters.`, '"Source."');
    });
  } else if (column.fields !== undefined) add('fields-type', `${path}.fields`, 'fields are allowed only on object.', '{ "type": "object", "fields": [...] }');
}

/** Rules of the type-bound properties, shared by columns and object fields. */
function checkTyped(add: Add, path: string, column: Column | ObjectField) {
  const { type } = column;
  const itemType = type === 'list' ? column.items : undefined;
  const numeric = type === 'number' || itemType === 'number';
  if (!numeric && (column.min !== undefined || column.max !== undefined || column.integer !== undefined))
    add('number-only', path, 'min, max and integer are allowed only on number.', '{ "type": "number", "min": 0, "integer": true }');
  if (numeric) {
    for (const key of ['min', 'max'] as const) {
      const bound = column[key];
      if (bound !== undefined && !Number.isFinite(bound)) add('range', `${path}.${key}`, `${key} must be a finite number.`, '0');
    }
    if (column.min !== undefined && column.max !== undefined && column.min > column.max) add('range', path, 'min is greater than max.', '{ "min": 0, "max": 100 }');
  }
  if (type === 'list') {
    if (!column.items) add('items-missing', `${path}.items`, 'list needs items (text, number, boolean, date, timestamp, url, email, select, reference).', '"text"');
  } else if (column.items !== undefined) add('items-type', `${path}.items`, 'items are allowed only on list.', '{ "type": "list", "items": "text" }');
  const selects = type === 'select' || itemType === 'select';
  if (selects) {
    const options = column.options ?? [];
    if (options.length < 1 || options.length > CONTRACT_LIMITS.maxOptions)
      add('options-count', `${path}.options`, `select needs 1 to ${CONTRACT_LIMITS.maxOptions} options.`, '["open", "won", "lost"]');
    if (new Set(options).size !== options.length) add('option-duplicate', `${path}.options`, 'An option is duplicated.', '["open", "won"]');
    options.forEach((option, index) => {
      if (!option.trim() || option.length > CONTRACT_LIMITS.maxOptionChars)
        add('option-invalid', `${path}.options[${index}]`, `Option is empty or longer than ${CONTRACT_LIMITS.maxOptionChars} characters.`, '"open"');
    });
  } else if (column.options !== undefined) add('options-type', `${path}.options`, 'options are allowed only on select (or list with items select).', '{ "type": "select", "options": ["a"] }');
  const references = type === 'reference' || itemType === 'reference';
  if (references) {
    if (column.target === undefined) add('target-missing', `${path}.target`, 'reference needs target (contract id of the target).', '"account"');
    else if (!CONTRACT_ID_PATTERN.test(column.target)) add('target-pattern', `${path}.target`, `target "${column.target}" is not a contract id.`, '"account"');
  } else if (column.target !== undefined) add('target-type', `${path}.target`, 'target is allowed only on reference (or list with items reference).', '{ "type": "reference", "target": "account" }');
}

function checkPersonal(add: Add, contract: TableContract, byName: Map<string, Column>) {
  const personal = contract.personal;
  if (!personal) return;
  const keys = personal.subjectKey ?? [], refs = personal.subjectRef ?? [];
  if (!keys.length && !refs.length)
    add('personal-empty', 'personal', 'personal names at least one column in subjectKey or subjectRef.', '{ "subjectKey": ["email"] }');
  for (const [list, field] of [[keys, 'subjectKey'], [refs, 'subjectRef']] as const) {
    if (new Set(list).size !== list.length) add('subject-duplicate', `personal.${field}`, `${field} names a column twice.`, '["email"]');
    for (const name of list) {
      const column = byName.get(name);
      if (!column) add('subject-unknown', `personal.${field}`, `${field} names the unknown column "${name}".`, '["email"]');
      else if (field === 'subjectRef' && column.type !== 'reference')
        add('subject-ref-type', `personal.${field}`, `subjectRef "${name}" must be a reference column.`, '["contactId"]');
      else if (field === 'subjectKey' && (unindexable.has(column.type) || column.privacy !== 'personal'))
        add('subject-key-column', `personal.${field}`, `subjectKey "${name}" must be a simple, personal column (privacy "personal").`, '["email"]');
    }
  }
}
