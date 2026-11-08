/**
 * Hard bounds of the format. A contract or a row beyond one of them is refused with a finding or an error that names the bound;
 * nothing is truncated.
 */

/** Bounds of one row (and of any JSON value the package walks, a contract document included). */
export const ROW_LIMITS = Object.freeze({
  /** Nesting depth of objects and arrays; the row itself is depth 0. */
  maxDepth: 20,
  /** Values of all kinds (objects, arrays, scalars) in one row. */
  maxNodes: 10000,
  /** Characters of the row as JSON. */
  maxRowChars: 128000,
  /** Characters of one `text` or `markdown` value (and of any other string value). */
  maxTextChars: 32000,
  /** Entries of one `list` value. */
  maxListItems: 1000,
});

/** Bounds of one contract. */
export const CONTRACT_LIMITS = Object.freeze({
  /** Columns of one contract (at least one). */
  maxColumns: 64,
  /** Sub-columns (`fields`) of one `object` column (at least one). */
  maxFields: 64,
  /** Options of one `select` column (at least one). */
  maxOptions: 50,
  /** Characters of one option. */
  maxOptionChars: 100,
  /** Characters of `title`. */
  maxTitleChars: 120,
  /** Characters of `purpose`. */
  maxPurposeChars: 400,
  /** Characters of a column's `description`. */
  maxDescriptionChars: 200,
  /** Rules (`rules[]`) of one contract. */
  maxRules: 16,
});

/** Bounds of the helpers of the standard contracts. */
export const HELPER_LIMITS = Object.freeze({
  /** Consent rows `currentConsent` reads for one person; more is an error, never a silently cut answer. */
  maxConsentRows: 10000,
});
