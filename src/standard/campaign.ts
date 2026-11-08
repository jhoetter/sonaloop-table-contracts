import { defineContract } from '../types.ts';

const utmField = <N extends string>(name: N, description: string) => ({ name, type: 'text' as const, description });

/** A marketing campaign that groups content, links, ads and leads. */
export const campaign = defineContract({
  schema: 'sonaloop.table-contract.v1',
  id: 'campaign',
  version: 1,
  title: 'Campaign',
  purpose: 'A marketing campaign that groups content, links, ads and leads.',
  partition: 'tenant',
  columns: [
    { name: 'name', type: 'text', required: true, privacy: 'technical', description: 'Name of the campaign.' },
    { name: 'status', type: 'select', options: ['planned', 'active', 'paused', 'completed'], required: true, index: true, privacy: 'technical', description: 'State of the campaign.' },
    { name: 'channel', type: 'text', index: true, privacy: 'technical', description: 'Main channel, e.g. newsletter, linkedin.' },
    { name: 'startsAt', type: 'timestamp', privacy: 'technical', description: 'Start (UTC).' },
    { name: 'endsAt', type: 'timestamp', privacy: 'technical', description: 'End (UTC).' },
    {
      name: 'utm', type: 'object', privacy: 'technical', description: 'UTM parameters of the links.',
      fields: [
        utmField('source', 'utm_source.'), utmField('medium', 'utm_medium.'), utmField('campaign', 'utm_campaign.'),
        utmField('term', 'utm_term.'), utmField('content', 'utm_content.'),
      ],
    },
    {
      name: 'budget', type: 'object', privacy: 'technical', description: 'Budget of the campaign.',
      fields: [
        { name: 'amount', type: 'number', required: true, description: 'Amount.' },
        { name: 'currency', type: 'text', required: true, description: 'Currency (ISO 4217), e.g. EUR.' },
      ],
    },
  ],
});
