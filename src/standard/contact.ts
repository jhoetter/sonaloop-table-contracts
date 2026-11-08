import { defineContract } from '../types.ts';

/** A person the tenant knows (lead, customer, applicant). Consent is its own contract (`consent`). */
export const contact = defineContract({
  schema: 'sonaloop.table-contract.v1',
  id: 'contact',
  version: 1,
  title: 'Contact',
  purpose: 'A person the tenant knows (lead, customer, applicant). Consent lives in the contract consent, the company of the person in the contract account.',
  partition: 'tenant',
  personal: { subjectKey: ['email', 'phone'] },
  columns: [
    { name: 'email', type: 'email', unique: true, privacy: 'personal', description: 'Email address; unique, the match key when merging (compared trimmed and lower-cased).' },
    { name: 'phone', type: 'text', index: true, privacy: 'personal', description: 'Phone number as entered.' },
    { name: 'firstName', type: 'text', privacy: 'personal', description: 'First name.' },
    { name: 'lastName', type: 'text', privacy: 'personal', description: 'Last name.' },
    { name: 'accountId', type: 'reference', target: 'account', index: true, privacy: 'pseudonymous', description: 'Account (company) the person belongs to.' },
    { name: 'externalIds', type: 'json', privacy: 'pseudonymous', description: 'Ids of the person in other systems, as an object { system: id }.' },
    { name: 'attributes', type: 'json', privacy: 'personal', description: 'Further details the apps keep about the person (object); each app maintains its own keys.' },
  ],
  rules: [{ anyRequired: ['email', 'phone'] }],
});
