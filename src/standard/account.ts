import { defineContract } from '../types.ts';

/** The company a person belongs to (B2B account). Holds no personal data. */
export const account = defineContract({
  schema: 'sonaloop.table-contract.v1',
  id: 'account',
  version: 1,
  title: 'Account',
  purpose: 'The company or organization of a person that contacts belong to (B2B account). Holds no personal data.',
  partition: 'tenant',
  columns: [
    { name: 'name', type: 'text', required: true, index: true, privacy: 'technical', description: 'Name of the company.' },
    { name: 'domain', type: 'text', unique: true, privacy: 'technical', description: 'Web domain of the company (without protocol); unique, detects duplicates.' },
    { name: 'industry', type: 'text', privacy: 'technical', description: 'Industry.' },
    { name: 'size', type: 'text', privacy: 'technical', description: 'Size as a range, e.g. 51-200.' },
    { name: 'externalIds', type: 'json', privacy: 'pseudonymous', description: 'Ids of the company in other systems, as an object { system: id }.' },
    { name: 'attributes', type: 'json', privacy: 'technical', description: 'Further details the apps keep about the company (object); no personal data.' },
  ],
});
