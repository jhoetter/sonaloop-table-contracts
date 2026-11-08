import type { Column, ObjectField, TableContract } from './format.ts';
import { canonicalize } from './canonical.ts';
import { contractHash, normalizeContract } from './hash.ts';

/** One difference between two versions of a contract. */
export interface ContractChange {
  readonly code: string;
  /** Location in the newer contract, e.g. `columns.stage.options`. */
  readonly path: string;
  readonly message: string;
}

/** Result of `compareContracts`: `compatible` when nothing is breaking. */
export interface ContractComparison {
  readonly compatible: boolean;
  readonly additions: readonly ContractChange[];
  readonly breaking: readonly ContractChange[];
}

const NEW_ID = 'new contract id needed';

/**
 * Compares two versions of a contract after the rules of the format: a newer version may only extend (new optional column, new
 * select option, required -> optional, lower `min`, higher `max`, add `index`, change `title`, `purpose`, `description`).
 * Everything else is breaking and needs a new contract id. The same version with different content is breaking too, and so is a
 * lower version. Both inputs are normalized first (spelling and defaults do not count); order of columns and options does not count.
 * Throws `ContractError` when an input does not have the shape of a contract.
 */
export function compareContracts(before: unknown, after: unknown): ContractComparison {
  const older = normalizeContract(before), newer = normalizeContract(after);
  const additions: ContractChange[] = [], breaking: ContractChange[] = [];
  const add = (code: string, path: string, message: string) => additions.push({ code, path, message });
  const breaks = (code: string, path: string, message: string) => breaking.push({ code, path, message: `${message} – ${NEW_ID}.` });

  if (older.id !== newer.id) breaks('id-changed', 'id', `The id changes: "${older.id}" -> "${newer.id}"; that is a different contract`);
  if (contractHash(older) === contractHash(newer)) return { compatible: breaking.length === 0, additions, breaking };
  if (newer.version === older.version)
    breaks('same-version', 'version', `Version ${newer.version} with different content (${contractHash(older)} against ${contractHash(newer)}); a change needs a higher version`);
  else if (newer.version < older.version) breaks('version-lowered', 'version', `Version drops from ${older.version} to ${newer.version}`);

  if (older.title !== newer.title) add('title-changed', 'title', `Title changed: "${older.title}" -> "${newer.title}".`);
  if (older.purpose !== newer.purpose) add('purpose-changed', 'purpose', 'Purpose changed.');
  if (older.partition !== newer.partition) breaks('partition-changed', 'partition', `partition changes: "${older.partition}" -> "${newer.partition}"`);
  if (Boolean(older.appendOnly) !== Boolean(newer.appendOnly)) breaks('append-only-changed', 'appendOnly', 'appendOnly changes');
  if (same(older.personal) !== same(newer.personal)) breaks('personal-changed', 'personal', 'The personal block (subjectKey, subjectRef) changes');
  if (older.retentionDays !== newer.retentionDays) breaks('retention-changed', 'retentionDays', `retentionDays changes from ${older.retentionDays ?? 'none'} to ${newer.retentionDays ?? 'none'}`);
  if (same(older.rules) !== same(newer.rules)) breaks('rules-changed', 'rules', 'The rules (anyRequired) change');

  compareMembers(older.columns, newer.columns, 'columns', 'Column', add, breaks);
  return { compatible: breaking.length === 0, additions, breaking };
}

type Note = (code: string, path: string, message: string) => void;
type Member = Column | ObjectField;

const same = (value: unknown) => (value === undefined ? '' : canonicalize(value));

function compareMembers(before: readonly Member[], after: readonly Member[], path: string, noun: string, add: Note, breaks: Note) {
  const newer = new Map(after.map(member => [member.name, member]));
  const older = new Map(before.map(member => [member.name, member]));
  for (const member of before) {
    const next = newer.get(member.name);
    if (!next) breaks('column-removed', `${path}.${member.name}`, `${noun} "${member.name}" is missing (removed or renamed)`);
    else compareMember(member, next, `${path}.${member.name}`, add, breaks);
  }
  for (const member of after) {
    if (older.has(member.name)) continue;
    if (member.required) breaks('column-added-required', `${path}.${member.name}`, `New required ${noun.toLowerCase()} "${member.name}"; old rows would have no value`);
    else add('column-added', `${path}.${member.name}`, `New optional ${noun.toLowerCase()} "${member.name}" (${member.type}).`);
  }
}

function compareMember(before: Member, after: Member, path: string, add: Note, breaks: Note) {
  if (before.type !== after.type) return breaks('type-changed', `${path}.type`, `Type changes from ${before.type} to ${after.type}`);
  if (!before.required && after.required) breaks('required-added', `${path}.required`, 'required is added');
  if (before.required && !after.required) add('required-removed', `${path}.required`, 'required is dropped (required -> optional).');
  if (before.integer !== after.integer) breaks('integer-changed', `${path}.integer`, 'integer changes');
  compareBound(before.min, after.min, 'min', path, add, breaks);
  compareBound(before.max, after.max, 'max', path, add, breaks);
  if (before.target !== after.target) breaks('target-changed', `${path}.target`, `target changes: "${before.target}" -> "${after.target}"`);
  if (before.items !== after.items) breaks('items-changed', `${path}.items`, `items changes from ${before.items} to ${after.items}`);
  const options = new Set(after.options ?? []);
  for (const option of before.options ?? []) if (!options.has(option)) breaks('option-removed', `${path}.options`, `Option "${option}" is removed`);
  const known = new Set(before.options ?? []);
  for (const option of after.options ?? []) if (!known.has(option)) add('option-added', `${path}.options`, `New option "${option}".`);
  if (before.description !== after.description) add('description-changed', `${path}.description`, 'Description changed.');
  // Object fields have none of the following properties, so these compare equal for them.
  const [a, b] = [before as Column, after as Column];
  if (!a.unique && b.unique) breaks('unique-added', `${path}.unique`, 'unique is added; existing rows might contain duplicates');
  if (a.unique && !b.unique) breaks('unique-removed', `${path}.unique`, 'unique is removed');
  const indexed = (column: Column) => Boolean(column.index || column.unique);
  if (!indexed(a) && indexed(b) && !b.unique) add('index-added', `${path}.index`, 'New index.');
  if (indexed(a) && !indexed(b)) breaks('index-removed', `${path}.index`, 'The index is removed');
  const [privacyBefore, privacyAfter] = [a.privacy ?? 'technical', b.privacy ?? 'technical'];
  if (privacyBefore !== privacyAfter) breaks('privacy-changed', `${path}.privacy`, `Privacy class changes from ${privacyBefore} to ${privacyAfter}`);
  if (Boolean(a.secret) !== Boolean(b.secret)) breaks('secret-changed', `${path}.secret`, 'secret changes');
  if (a.fields || b.fields) compareMembers(a.fields ?? [], b.fields ?? [], `${path}.fields`, 'Sub-column', add, breaks);
}

function compareBound(before: number | undefined, after: number | undefined, key: 'min' | 'max', path: string, add: Note, breaks: Note) {
  if (before === after) return;
  // Wider is an addition: a lower min or a higher max, or dropping the bound. Narrower (or a new bound) breaks old rows.
  const wider = after === undefined || (before !== undefined && (key === 'min' ? after < before : after > before));
  if (wider) add(`${key}-widened`, `${path}.${key}`, `${key} ${before} -> ${after ?? 'none'} (wider).`);
  else breaks(`${key}-narrowed`, `${path}.${key}`, `${key} ${before ?? 'none'} -> ${after} (narrower); old rows might become invalid`);
}
