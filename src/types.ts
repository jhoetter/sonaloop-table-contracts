import { parseContract } from './check.ts';
import type { ColumnType, ListItemType, TableContract } from './format.ts';
import type { JsonValue } from './json.ts';

/**
 * Row types derived from a contract literal, without code generation. `defineContract({...})` keeps the literal types (const type
 * parameter), so `RowOf<typeof deal>` knows every column: `select` is the union of its options, `list` an array of its item type,
 * `object` a nested type of its fields, `reference` a string (the target's row id), `required` columns are not optional.
 */

type ScalarOf<T extends string> =
  T extends 'number' ? number
  : T extends 'boolean' ? boolean
  : T extends 'json' ? JsonValue
  : string;

type OptionsOf<C> = C extends { readonly options: readonly (infer O extends string)[] } ? O : string;

type ItemOf<C> = C extends { readonly items: infer I extends ListItemType } ? (I extends 'select' ? OptionsOf<C> : ScalarOf<I>) : never;

type ShapeOf<Fields> = Fields extends readonly unknown[] ? Simplify<RequiredPart<Fields[number]> & OptionalPart<Fields[number]>> : never;

/** The TypeScript type of one column's value. */
export type ValueOf<C> =
  C extends { readonly type: 'select' } ? OptionsOf<C>
  : C extends { readonly type: 'list' } ? ItemOf<C>[]
  : C extends { readonly type: 'object'; readonly fields: infer F } ? ShapeOf<F>
  : C extends { readonly type: infer T extends ColumnType } ? ScalarOf<T>
  : never;

type Named = { readonly name: string };
type RequiredPart<Cols> = { [C in Cols as C extends Named & { readonly required: true } ? C['name'] : never]: ValueOf<C> };
type OptionalPart<Cols> = { [C in Cols as C extends Named & { readonly required: true } ? never : C extends Named ? C['name'] : never]?: ValueOf<C> };
type NullablePart<Cols> = { [C in Cols as C extends Named & { readonly required: true } ? never : C extends Named ? C['name'] : never]?: ValueOf<C> | null };
type PatchPart<Cols> = { [C in Cols as C extends Named ? C['name'] : never]?: C extends { readonly required: true } ? ValueOf<C> : ValueOf<C> | null };

type Simplify<T> = { [K in keyof T]: T[K] } & {};
type ColumnsOf<C> = C extends { readonly columns: readonly (infer K)[] } ? K : never;

/** System columns of every row (managed by the table core, never written by a caller). */
export interface SystemFields {
  readonly id: string;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly createdBy: string;
  readonly updatedBy: string;
  readonly contractVersion: number;
  /** Organization id for `partition: "organization"`, otherwise null. */
  readonly partition: string | null;
  /**
   * True for a row a core took over from an export of another core (set by the core from the row's provenance, never from the data). Its writer and
   * times come from the file, so no one in this core vouches for them: a ledger such as consent counts it as a hint, not as proof.
   */
  readonly imported?: boolean;
}

/** A stored row: system columns plus the contract's columns (flat). Optional columns may be absent. */
export type RowOf<C> = Simplify<SystemFields & RequiredPart<ColumnsOf<C>> & OptionalPart<ColumnsOf<C>>>;
/** Data for `create` and `replace`: required columns must be there; `null` or absence leaves an optional column empty. */
export type CreateOf<C> = Simplify<RequiredPart<ColumnsOf<C>> & NullablePart<ColumnsOf<C>>>;
/** Data for `update` (flat merge): every column optional; `null` clears an optional column, a required one cannot be cleared. */
export type PatchOf<C> = Simplify<PatchPart<ColumnsOf<C>>>;

/**
 * Declares a contract in TypeScript. The const type parameter keeps the literal (no `as const` needed); the result is the same
 * object, deeply frozen, with its literal type, so `RowOf<typeof contract>` works. Throws `ContractError` when the contract has a
 * finding (`checkContract`), so a broken contract fails when its module loads, not when the first row is written.
 */
export function defineContract<const C extends TableContract>(contract: C): C {
  parseContract(contract);
  return deepFreeze(contract);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
