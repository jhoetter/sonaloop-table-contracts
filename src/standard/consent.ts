import { defineContract } from '../types.ts';

/** Consent of a person as a ledger: entries are only appended; the latest entry per purpose is the current state. */
export const consent = defineContract({
  schema: 'sonaloop.table-contract.v1',
  id: 'consent',
  version: 1,
  title: 'Consent',
  purpose: 'Consent decisions of a person per purpose, append-only. The latest entry per purpose is the current state; older entries stay as evidence.',
  partition: 'tenant',
  appendOnly: true,
  personal: { subjectRef: ['contactId'] },
  columns: [
    { name: 'contactId', type: 'reference', target: 'contact', required: true, index: true, privacy: 'pseudonymous', description: 'The person (contact) the consent is about.' },
    { name: 'purpose', type: 'text', required: true, index: true, privacy: 'technical', description: 'Purpose, e.g. marketing-email, sales-contact, analytics.' },
    { name: 'status', type: 'select', options: ['granted', 'denied', 'withdrawn'], required: true, privacy: 'technical', description: 'Granted, denied or withdrawn.' },
    { name: 'at', type: 'timestamp', required: true, privacy: 'technical', description: 'Time of the decision (UTC).' },
    {
      name: 'source', type: 'object', privacy: 'pseudonymous', description: 'Where the decision was recorded.',
      fields: [
        { name: 'principal', type: 'text', required: true, description: 'Producer: app, person or agent, e.g. app:website.' },
        { name: 'sourceRef', type: 'text', description: 'Business source, e.g. form:contact-page.' },
      ],
    },
    { name: 'evidenceRef', type: 'text', privacy: 'technical', description: 'Reference to the evidence (version of the wording, form revision), never the raw request.' },
  ],
});
