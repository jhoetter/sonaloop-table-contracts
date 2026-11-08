/**
 * @sonaloop/table-contracts: a table described as plain data (format `sonaloop.table-contract.v1`). Check it, hash it, compare
 * versions, validate rows against it and derive TypeScript row types from it. No I/O; the only dependency is zod.
 */
export {
  COLUMN_NAME_PATTERN, COLUMN_TYPES, CONTRACT_ID_PATTERN, CONTRACT_SCHEMA, FIELD_TYPES, LIST_ITEM_TYPES, PARTITIONS, PRIVACY_CLASSES,
  RESERVED_COLUMNS, RESERVED_NAMESPACES, ROW_ID_PATTERN, UNSAFE_NAMES, columnSchema, objectFieldSchema, tableContractSchema,
} from './format.ts';
export type {
  Column, ColumnType, ContractRule, FieldType, ListItemType, ObjectField, Partition, PersonalData, PrivacyClass, SystemColumn, TableContract,
} from './format.ts';
export { CONTRACT_LIMITS, HELPER_LIMITS, ROW_LIMITS } from './limits.ts';
export { ContractError, type Finding, type JsonValue } from './json.ts';
export { checkContract, parseContract } from './check.ts';
export { canonicalize } from './canonical.ts';
export { canonicalContract, contractHash, normalizeContract } from './hash.ts';
export { sha256Hex } from './sha256.ts';
export { defineContract, type CreateOf, type PatchOf, type RowOf, type SystemFields, type ValueOf } from './types.ts';
export { compareContracts, type ContractChange, type ContractComparison } from './compare.ts';
export { comparableValue, validateRow, type RowError, type RowMode, type RowResult, type ValidateRowOptions } from './validate-row.ts';
export {
  BUNDLE_SCHEMA, LOCK_SCHEMA, bundleOf, lockOf, parseBundle, parseLock, serializeBundle, serializeLock, verifyLock,
  type ContractBundle, type ContractsLock, type LockEntry,
} from './bundle.ts';
export { CONTRACT_JSON_SCHEMA_FILE, contractJsonSchema } from './json-schema.ts';
export {
  account, campaign, consent, contact, contentItem, listStandardContracts, mediaAsset, standard, type StandardContractEntry,
} from './standard/index.ts';
export { currentConsent, recordConsent, type ConsentEntry, type ConsentOptions, type ConsentPage, type ConsentRow, type ConsentTable } from './standard/consent-ledger.ts';
