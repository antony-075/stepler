/** The collection page's tabs, in the URL as `?tab=` (none: the content). */
export type CollectionTab = 'content' | 'links' | 'appearance' | 'settings';

const TABS: readonly CollectionTab[] = ['content', 'links', 'appearance', 'settings'];

/** `?tab=links|appearance|settings` open those tabs; anything else (or nothing) the content. */
export const tabOf = (value: string | null): CollectionTab =>
  TABS.find((tab) => tab !== 'content' && tab === value) ?? 'content';
