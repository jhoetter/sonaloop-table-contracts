import { writeFileSync } from 'node:fs';
import { CONTRACT_JSON_SCHEMA_FILE, contractJsonSchema } from '../src/json-schema.ts';

/** Regenerates the JSON Schema file from the zod schema. Run after every format change; a test pins the file to the generator. */
writeFileSync(new URL(`../${CONTRACT_JSON_SCHEMA_FILE}`, import.meta.url), `${JSON.stringify(contractJsonSchema(), null, 2)}\n`);
