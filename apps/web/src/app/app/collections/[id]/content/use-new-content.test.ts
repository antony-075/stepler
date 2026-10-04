import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { contentCountsKey, contentListKey } from '@/api/content';
import { refreshContentLists, resetContentLists } from './use-new-content';

const ID = '01a0ee76-0574-7fe5-a38b-53b07a9b40f9';

describe('resetContentLists', () => {
  it('drops every list of the collection (any filter, any order) but keeps the counts', async () => {
    const client = new QueryClient();
    const page = { pages: [{ items: [], nextCursor: 'c1' }], pageParams: [null] };
    client.setQueryData(contentListKey(ID, undefined, 'newest'), page);
    client.setQueryData(contentListKey(ID, 'TEXT', 'frame'), page);
    client.setQueryData(contentListKey('other', undefined, 'newest'), page);
    client.setQueryData(contentCountsKey(ID), { total: 13 });

    await resetContentLists(client, ID);

    expect(client.getQueryData(contentListKey(ID, undefined, 'newest'))).toBeUndefined();
    expect(client.getQueryData(contentListKey(ID, 'TEXT', 'frame'))).toBeUndefined();
    expect(client.getQueryData(contentListKey('other', undefined, 'newest'))).toEqual(page);
    expect(client.getQueryData(contentCountsKey(ID))).toEqual({ total: 13 });
  });
});

describe('refreshContentLists', () => {
  it('keeps only the first page of each list of the collection and marks them stale', async () => {
    const client = new QueryClient();
    const twoPages = {
      pages: [
        { items: [], nextCursor: 'c1' },
        { items: [], nextCursor: null },
      ],
      pageParams: [null, 'c1'],
    };
    client.setQueryData(contentListKey(ID, undefined, 'newest'), twoPages);
    client.setQueryData(contentListKey('other', undefined, 'newest'), twoPages);

    await refreshContentLists(client, ID);

    expect(client.getQueryData(contentListKey(ID, undefined, 'newest'))).toEqual({
      pages: [{ items: [], nextCursor: 'c1' }],
      pageParams: [null],
    });
    expect(client.getQueryState(contentListKey(ID, undefined, 'newest'))?.isInvalidated).toBe(true);
    expect(client.getQueryData(contentListKey('other', undefined, 'newest'))).toEqual(twoPages);
  });
});
