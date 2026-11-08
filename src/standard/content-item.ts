import { defineContract } from '../types.ts';

/** A planned or published piece of content with its placements. */
export const contentItem = defineContract({
  schema: 'sonaloop.table-contract.v1',
  id: 'content-item',
  version: 1,
  title: 'Content item',
  purpose: 'A planned or published piece of content (article, video, post, newsletter, page section) with its placements.',
  partition: 'tenant',
  columns: [
    { name: 'title', type: 'text', required: true, privacy: 'technical', description: 'Title of the content.' },
    { name: 'kind', type: 'text', required: true, index: true, privacy: 'technical', description: 'Kind, e.g. article, video, social-post, newsletter, page-section; custom kinds are allowed.' },
    {
      name: 'status', type: 'select', options: ['draft', 'in-review', 'scheduled', 'published', 'archived'], required: true, index: true, privacy: 'technical',
      description: 'State: draft, in review, scheduled, published, archived.',
    },
    { name: 'summary', type: 'text', privacy: 'technical', description: 'Summary.' },
    { name: 'body', type: 'json', privacy: 'technical', description: 'Content as JSON (blocks, text); the app decides the shape.' },
    { name: 'mediaAssetIds', type: 'list', items: 'reference', target: 'media-asset', privacy: 'technical', description: 'Media assets used.' },
    { name: 'campaignId', type: 'reference', target: 'campaign', index: true, privacy: 'technical', description: 'Campaign the content belongs to.' },
    {
      name: 'placements', type: 'json', privacy: 'technical',
      description: 'Placements as a list of objects { target, slot?, publishAt?, publishedAt?, url? }; json because list holds only simple entries.',
    },
    { name: 'tags', type: 'list', items: 'text', privacy: 'technical', description: 'Tags.' },
  ],
});
