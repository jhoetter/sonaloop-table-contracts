import { defineContract } from '../types.ts';

/** An immutable media file, referenced by its artifact key. */
export const mediaAsset = defineContract({
  schema: 'sonaloop.table-contract.v1',
  id: 'media-asset',
  version: 1,
  title: 'Media asset',
  purpose: 'An immutable media file (video, image, audio, document), referenced by its artifact key, never by a signed URL.',
  partition: 'tenant',
  columns: [
    { name: 'kind', type: 'select', options: ['video', 'image', 'audio', 'document'], required: true, index: true, privacy: 'technical', description: 'Kind of file.' },
    { name: 'mediaType', type: 'text', required: true, privacy: 'technical', description: 'MIME type, e.g. video/mp4.' },
    { name: 'artifactRef', type: 'text', required: true, index: true, privacy: 'technical', description: 'Immutable artifact key or content hash of the file.' },
    { name: 'title', type: 'text', privacy: 'technical', description: 'Title.' },
    { name: 'bytes', type: 'number', integer: true, min: 0, privacy: 'technical', description: 'Size in bytes.' },
    { name: 'durationMs', type: 'number', integer: true, min: 0, privacy: 'technical', description: 'Duration in milliseconds (video, audio).' },
    { name: 'width', type: 'number', integer: true, min: 0, privacy: 'technical', description: 'Width in pixels.' },
    { name: 'height', type: 'number', integer: true, min: 0, privacy: 'technical', description: 'Height in pixels.' },
    { name: 'checksum', type: 'text', privacy: 'technical', description: 'Checksum of the file.' },
    { name: 'producedBy', type: 'text', privacy: 'technical', description: 'Producing tool, e.g. render-tool:job_17.' },
  ],
});
