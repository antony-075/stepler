import type { Collection } from '@stepler/contracts';
import { describe, expect, it } from 'vitest';
import { visibleCollections } from './collection-filters';

const collection = (title: string, createdAt: string, archived = false): Collection => ({
  id: `0198f0b0-0000-7000-8000-${String(Math.abs(hash(title)))
    .padStart(12, '0')
    .slice(0, 12)}`,
  title,
  description: null,
  status: archived ? 'ARCHIVED' : 'ACTIVE',
  createdAt,
  updatedAt: createdAt,
  archivedAt: archived ? createdAt : null,
  defaultLinkStatus: archived ? null : 'ACTIVE',
  defaultLinkPermissions: null,
  contentCount: 0,
  lastContentAt: null,
  welcomeMessage: null,
  cover: null,
});

function hash(text: string): number {
  return Array.from(text).reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) | 0, 7);
}

const active = [
  collection('Весілля Олі', '2026-09-03T10:00:00.000Z'),
  collection('Ювілей бабусі', '2026-09-01T10:00:00.000Z'),
];
const archived = [collection('Випускний 2025', '2026-08-01T10:00:00.000Z', true)];
const titles = (items: Collection[]) => items.map((item) => item.title);
const base = { filter: 'all', query: '', sort: 'newest', locale: 'uk' } as const;

describe('visibleCollections', () => {
  it('shows active and archived together, newest first, under «Усі»', () => {
    expect(titles(visibleCollections(active, archived, base))).toEqual([
      'Весілля Олі',
      'Ювілей бабусі',
      'Випускний 2025',
    ]);
  });

  it('keeps one status under its chip', () => {
    expect(titles(visibleCollections(active, archived, { ...base, filter: 'archived' }))).toEqual([
      'Випускний 2025',
    ]);
    expect(titles(visibleCollections(active, archived, { ...base, filter: 'active' }))).toEqual([
      'Весілля Олі',
      'Ювілей бабусі',
    ]);
  });

  it('finds titles by any part, ignoring case and surrounding spaces', () => {
    expect(titles(visibleCollections(active, archived, { ...base, query: '  БАБУС ' }))).toEqual([
      'Ювілей бабусі',
    ]);
    expect(visibleCollections(active, archived, { ...base, query: 'хрестини' })).toEqual([]);
  });

  it('sorts oldest first and by title in the page locale', () => {
    expect(titles(visibleCollections(active, archived, { ...base, sort: 'oldest' }))).toEqual([
      'Випускний 2025',
      'Ювілей бабусі',
      'Весілля Олі',
    ]);
    expect(titles(visibleCollections(active, archived, { ...base, sort: 'title' }))).toEqual([
      'Весілля Олі',
      'Випускний 2025',
      'Ювілей бабусі',
    ]);
  });
});
