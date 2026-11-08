import { z } from 'zod/v4';

/** Format identifier of a table contract. */
export const CONTRACT_SCHEMA = 'sonaloop.table-contract.v1';

/** The closed column vocabulary. A further type needs a decision of the maintainers (otherwise the contract turns into a programming language). */
export const COLUMN_TYPES = [
  'text', 'markdown', 'number', 'boolean', 'date', 'timestamp', 'url', 'email', 'select', 'json', 'reference', 'object', 'list', 'image', 'video',
] as const;
export type ColumnType = (typeof COLUMN_TYPES)[number];

/** Types an entry of a `list` column may have. */
export const LIST_ITEM_TYPES = ['text', 'number', 'boolean', 'date', 'timestamp', 'url', 'email', 'select', 'reference'] as const;
export type ListItemType = (typeof LIST_ITEM_TYPES)[number];

/** Types of a sub-column of an `object` column: everything except `object` (one level deep; deeper data is `json`). */
export const FIELD_TYPES = COLUMN_TYPES.filter((type): type is Exclude<ColumnType, 'object'> => type !== 'object');
export type FieldType = Exclude<ColumnType, 'object'>;

/** Privacy classes of a column. `technical` is the default except for `json` and `object`, which must name one. */
export const PRIVACY_CLASSES = ['technical', 'pseudonymous', 'personal'] as const;
export type PrivacyClass = (typeof PRIVACY_CLASSES)[number];

/** Who sees the rows: every app of the tenant with a grant, or only callers of the row's organization. */
export const PARTITIONS = ['tenant', 'organization'] as const;
export type Partition = (typeof PARTITIONS)[number];

/** System columns of every row; the table core manages them, a contract must not declare them. `imported` marks a row a core took over from the export of another core. */
export const RESERVED_COLUMNS = ['id', 'revision', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'contractVersion', 'partition', 'imported'] as const;
export type SystemColumn = (typeof RESERVED_COLUMNS)[number];

/** Names of `Object.prototype` members; refused as column and field names so that a row object never shadows them. */
export const UNSAFE_NAMES = ['constructor', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', 'prototype', 'toLocaleString', 'toString', 'valueOf'] as const;

/** Namespace that only the platform may use. */
export const RESERVED_NAMESPACES = ['platform'] as const;

/** `<name>` for a standard contract, `<namespace>.<name>` for every other one. */
export const CONTRACT_ID_PATTERN = /^[a-z][a-z0-9-]{0,39}(\.[a-z][a-z0-9-]{0,39})?$/;
/** camelCase column and field names. */
export const COLUMN_NAME_PATTERN = /^[a-z][A-Za-z0-9]{0,62}$/;
/** Row ids (and the value of a `reference` column). */
export const ROW_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,96}$/;

/** A sub-column of an `object` column. */
export interface ObjectField {
  readonly name: string;
  readonly type: FieldType;
  readonly required?: boolean;
  readonly description?: string;
  readonly min?: number;
  readonly max?: number;
  readonly integer?: boolean;
  readonly options?: readonly string[];
  readonly target?: string;
  readonly items?: ListItemType;
}

/** One column of a contract. */
export interface Column {
  readonly name: string;
  readonly type: ColumnType;
  readonly required?: boolean;
  readonly unique?: boolean;
  readonly index?: boolean;
  readonly secret?: boolean;
  readonly privacy?: PrivacyClass;
  readonly description?: string;
  readonly min?: number;
  readonly max?: number;
  readonly integer?: boolean;
  readonly options?: readonly string[];
  readonly target?: string;
  readonly items?: ListItemType;
  readonly fields?: readonly ObjectField[];
}

/** Personal data of a table: columns that identify a person (`subjectKey`) and `reference` columns to such rows (`subjectRef`). */
export interface PersonalData {
  readonly subjectKey?: readonly string[];
  readonly subjectRef?: readonly string[];
}

/** A closed rule across columns. Today only `anyRequired`: at least one of the columns is set. */
export interface ContractRule {
  readonly anyRequired: readonly string[];
}

/** A table contract `sonaloop.table-contract.v1`: one table described as plain data. */
export interface TableContract {
  /** Editor hint (JSON Schema URL); not part of the contract and not part of its hash. */
  readonly $schema?: string;
  readonly schema: typeof CONTRACT_SCHEMA;
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly purpose: string;
  readonly partition: Partition;
  readonly personal?: PersonalData;
  readonly retentionDays?: number;
  readonly appendOnly?: boolean;
  readonly columns: readonly Column[];
  readonly rules?: readonly ContractRule[];
}

const name = z.string();
const commonColumn = {
  name,
  required: z.boolean().optional(),
  description: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  integer: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  target: z.string().optional(),
  items: z.enum(LIST_ITEM_TYPES).optional(),
};

/** Shape of an `object` sub-column (closed: an unknown key is an error). */
export const objectFieldSchema = z.strictObject({ ...commonColumn, type: z.enum(FIELD_TYPES as unknown as [FieldType, ...FieldType[]]) });

/** Shape of a column (closed). The rules between properties are checked by `checkContract`. */
export const columnSchema = z.strictObject({
  ...commonColumn,
  type: z.enum(COLUMN_TYPES),
  unique: z.boolean().optional(),
  index: z.boolean().optional(),
  secret: z.boolean().optional(),
  privacy: z.enum(PRIVACY_CLASSES).optional(),
  fields: z.array(objectFieldSchema).optional(),
});

/**
 * Shape of a table contract: strict and closed, every unknown key is an error. It checks keys and value types only; the semantic
 * rules (patterns, bounds, references between columns, privacy) are `checkContract`, which runs this schema first.
 */
export const tableContractSchema = z.strictObject({
  $schema: z.string().optional(),
  schema: z.literal(CONTRACT_SCHEMA),
  id: z.string(),
  version: z.number(),
  title: z.string(),
  purpose: z.string(),
  partition: z.enum(PARTITIONS),
  personal: z.strictObject({ subjectKey: z.array(name).optional(), subjectRef: z.array(name).optional() }).optional(),
  retentionDays: z.number().optional(),
  appendOnly: z.boolean().optional(),
  columns: z.array(columnSchema),
  rules: z.array(z.strictObject({ anyRequired: z.array(name) })).optional(),
});
