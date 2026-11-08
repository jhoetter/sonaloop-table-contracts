import { z } from 'zod/v4';
import { CONTRACT_SCHEMA, tableContractSchema } from './format.ts';

/** Where the JSON Schema of the format is served from inside the package (`schema/table-contract.v1.schema.json`). */
export const CONTRACT_JSON_SCHEMA_FILE = 'schema/table-contract.v1.schema.json';

/**
 * JSON Schema (draft 2020-12) of a contract for editors, generated from `tableContractSchema`: the closed shape (keys, types,
 * enums). A contract points its editor at it with
 * `"$schema": "./node_modules/@sonaloop/table-contracts/schema/table-contract.v1.schema.json"`. The semantic rules are
 * `checkContract`; an editor that accepts a document can still get findings there.
 */
export function contractJsonSchema(): Record<string, unknown> {
  const generated = z.toJSONSchema(tableContractSchema, { target: 'draft-2020-12' }) as Record<string, unknown>;
  return {
    ...generated,
    title: CONTRACT_SCHEMA,
    description: 'A table described as plain data. Shape only; run checkContract for the semantic rules.',
  };
}
