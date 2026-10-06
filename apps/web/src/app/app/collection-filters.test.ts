import type { Collection } from '@stepler/contracts';
import { describe, expect, it } from 'vitest';
import {
  stateCounts,
  stateFilterOf,
  statesFromParams,
  visibleCollections,
} from './collection-filters';

const collection = (
  title: string,
  createdAt: string,
  archived = false,
  storageBytes = 0,
  blocked = false,
): Collection => ({
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
  storageBytes,
  welcomeMessage: null,
  image: null,
  blocked: blocked ? { at: createdAt, reason: 'Спам' } : null,
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
const base = { states: [], query: '', sort: 'newest', locale: 'uk' } as const;

describe('visibleCollections', () => {
  it('shows active and archived together, newest first, with nothing checked', () => {
    expect(titles(visibleCollections(active, archived, base))).toEqual([
      'Весілля Олі',
      'Ювілей бабусі',
      'Випускний 2025',
    ]);
  });

  it('keeps one state when it alone is checked', () => {
    expect(titles(visibleCollections(active, archived, { ...base, states: ['archived'] }))).toEqual(
      ['Випускний 2025'],
    );
    expect(titles(visibleCollections(active, archived, { ...base, states: ['active'] }))).toEqual([
      'Весілля Олі',
      'Ювілей бабусі',
    ]);
  });

  it('ORs the checked states and ANDs the search (owner remark S2)', () => {
    const blocked = collection('Корпоратив', '2026-09-02T10:00:00.000Z', false, 0, true);
    const blockedArchived = collection('Старий архів', '2026-07-01T10:00:00.000Z', true, 0, true);
    const all = [...active, blocked];
    const archive = [...archived, blockedArchived];
    // A blocked collection is «Заблоковані», never «В архіві» or «Активні».
    expect(titles(visibleCollections(all, archive, { ...base, states: ['blocked'] }))).toEqual([
      'Корпоратив',
      'Старий архів',
    ]);
    expect(titles(visibleCollections(all, archive, { ...base, states: ['archived'] }))).toEqual([
      'Випускний 2025',
    ]);
    expect(
      titles(visibleCollections(all, archive, { ...base, states: ['active', 'blocked'] })),
    ).toEqual(['Весілля Олі', 'Корпоратив', 'Ювілей бабусі', 'Старий архів']);
    expect(
      titles(
        visibleCollections(all, archive, { ...base, states: ['active', 'blocked'], query: 'кор' }),
      ),
    ).toEqual(['Корпоратив']);
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

  it('sorts by the content size, largest or smallest first; equal sizes newest first', () => {
    const sized = [
      collection('Мала', '2026-09-03T10:00:00.000Z', false, 1_000),
      collection('Велика', '2026-09-01T10:00:00.000Z', false, 128_000_000),
      collection('Порожня нова', '2026-09-05T10:00:00.000Z', false, 0),
      collection('Порожня стара', '2026-09-02T10:00:00.000Z', false, 0),
    ];
    expect(titles(visibleCollections(sized, [], { ...base, sort: 'largest' }))).toEqual([
      'Велика',
      'Мала',
      'Порожня нова',
      'Порожня стара',
    ]);
    expect(titles(visibleCollections(sized, [], { ...base, sort: 'smallest' }))).toEqual([
      'Порожня нова',
      'Порожня стара',
      'Мала',
      'Велика',
    ]);
  });
});

describe('the «Стан» options', () => {
  it('reads ?state= values in the menu order, deduped, dropping unknown ones', () => {
    expect(statesFromParams(['blocked', 'x', 'active', 'blocked'])).toEqual(['active', 'blocked']);
    expect(statesFromParams([])).toEqual([]);
  });

  it('files a blocked collection under «Заблоковані», even an archived one', () => {
    expect(stateFilterOf(collection('a', '2026-09-01T10:00:00.000Z', true, 0, true))).toBe(
      'blocked',
    );
    expect(stateFilterOf(collection('a', '2026-09-01T10:00:00.000Z', true))).toBe('archived');
    expect(stateFilterOf(collection('a', '2026-09-01T10:00:00.000Z'))).toBe('active');
  });

  it('counts by display status over both loaded lists', () => {
    const blocked = collection('Корпоратив', '2026-09-02T10:00:00.000Z', false, 0, true);
    expect(stateCounts([...active, blocked], archived)).toEqual({
      active: 2,
      archived: 1,
      blocked: 1,
    });
  });
});
