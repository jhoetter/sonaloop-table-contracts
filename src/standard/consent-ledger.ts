import { ContractError } from '../json.ts';
import { HELPER_LIMITS } from '../limits.ts';
import type { CreateOf, RowOf } from '../types.ts';
import { validateRow } from '../validate-row.ts';
import { consent } from './consent.ts';

/** A consent row as a table returns it (system columns as far as the caller has them). */
export type ConsentRow = Pick<RowOf<typeof consent>, 'id' | 'contactId' | 'purpose' | 'status' | 'at'> & Partial<RowOf<typeof consent>>;
export type ConsentEntry = CreateOf<typeof consent>;

/** One page of `query`: the table client answers with `nextCursor` (absent or null on the last page); `cursor` is accepted as an alias. */
export interface ConsentPage {
  readonly items: readonly ConsentRow[];
  readonly nextCursor?: string | null;
  readonly cursor?: string | null;
}

/**
 * The part of a table client the consent helpers need, typed by structure (any client with these two methods fits, an in-memory
 * fake included). `query` filters by equality and pages with an opaque cursor; `create` appends one row.
 */
export interface ConsentTable {
  query(query: { where: { contactId: string; purpose?: string }; order?: 'createdAt'; limit?: number; cursor?: string }): Promise<ConsentPage>;
  create(data: ConsentEntry, options?: { idempotencyKey?: string; sourceRef?: string }): Promise<ConsentRow>;
}

async function entries(table: ConsentTable, contactId: string, purpose?: string): Promise<ConsentRow[]> {
  const rows: ConsentRow[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await table.query({ where: purpose === undefined ? { contactId } : { contactId, purpose }, order: 'createdAt', limit: 500, ...(cursor ? { cursor } : {}) });
    rows.push(...page.items);
    if (rows.length > HELPER_LIMITS.maxConsentRows) throw new Error(`More than ${HELPER_LIMITS.maxConsentRows} consents for ${contactId}; query aborted.`);
    cursor = page.nextCursor ?? page.cursor ?? undefined;
    // A cursor that comes back again would page forever: stop with an error instead of a silently partial answer.
    if (cursor !== undefined && seen.has(cursor)) throw new Error(`The table returns the same cursor twice (${contactId}); query aborted.`);
    if (cursor !== undefined) seen.add(cursor);
  } while (cursor);
  return rows;
}

/** Options of `currentConsent`. */
export interface ConsentOptions {
  /**
   * Count rows an import brought from another core (`imported: true`). Default false: their writer and time come from a file no one here vouches for,
   * so they are a hint, never proof of a consent. A restore of the same core does not mark its rows.
   */
  readonly includeImported?: boolean;
}

/** Latest first by `at`; equal `at` keeps the later created entry (creation order as the table returned it, then `createdAt`). */
function latest(rows: readonly ConsentRow[]): Map<string, ConsentRow> {
  const current = new Map<string, ConsentRow>();
  rows.forEach(row => {
    const known = current.get(row.purpose);
    if (!known || row.at > known.at || (row.at === known.at && (row.createdAt ?? '') >= (known.createdAt ?? ''))) current.set(row.purpose, row);
  });
  return current;
}

/**
 * The current consent of a person: the latest entry per purpose (by `at`, then creation order). With `purpose` the entry of that
 * purpose or undefined; without it every purpose. Old entries stay in the table; nothing is changed. Imported rows (another core's) do not count
 * unless `includeImported`.
 */
export async function currentConsent(table: ConsentTable, contactId: string, purpose: string, options?: ConsentOptions): Promise<ConsentRow | undefined>;
export async function currentConsent(table: ConsentTable, contactId: string, purpose?: undefined, options?: ConsentOptions): Promise<ReadonlyMap<string, ConsentRow>>;
export async function currentConsent(table: ConsentTable, contactId: string, purpose?: string, options: ConsentOptions = {}):
  Promise<ConsentRow | undefined | ReadonlyMap<string, ConsentRow>> {
  const rows = (await entries(table, contactId, purpose)).filter(row => options.includeImported === true || row.imported !== true);
  const current = latest(rows);
  return purpose === undefined ? current : current.get(purpose);
}

/**
 * Appends one consent decision. `at` defaults to now. The entry is checked against the contract first, so a wrong status or a
 * missing purpose is a `ContractError` naming column and rule before anything is written.
 */
export async function recordConsent(
  table: ConsentTable,
  entry: Omit<ConsentEntry, 'at'> & { at?: string },
  options?: { idempotencyKey?: string; sourceRef?: string },
): Promise<ConsentRow> {
  const data = { ...entry, at: entry.at ?? new Date().toISOString() } as ConsentEntry;
  const checked = validateRow(consent, data, { mode: 'create' });
  if (!checked.ok)
    throw new ContractError(checked.errors.map(error => ({ code: error.rule, path: error.column, message: error.message, example: error.example })));
  return table.create(data, options);
}
