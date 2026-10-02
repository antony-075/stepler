import type { GuestLink } from '@stepler/contracts';
import { useTranslations } from 'next-intl';

/** How a collection's live default link is named in a URL, kept across rotations (its id changes). */
export const MAIN_LINK = 'main';

/** The query parameter that opens a link's settings in the sheet over the collection page. */
export const LINK_PARAM = 'link';

/** `main` for the default link, its id otherwise. */
export const linkKey = (link: Pick<GuestLink, 'id' | 'isDefault'>): string =>
  link.isDefault ? MAIN_LINK : link.id;

/** The «Посилання» tab with one link's settings open: `…?tab=links&link=main` (or `{id}`). */
export const linkSettingsPath = (collectionId: string, key: string): string =>
  `/app/collections/${collectionId}?${new URLSearchParams({ tab: 'links', [LINK_PARAM]: key }).toString()}`;

/** The collection page on its «Посилання» tab. */
export const allLinksPath = (collectionId: string): string =>
  `/app/collections/${collectionId}?tab=links`;

/** The live link a key names: the default for `main`, otherwise by id. Revoked links have none. */
export function findLink(items: readonly GuestLink[], linkId: string): GuestLink | undefined {
  return items.find(
    (link) =>
      link.status !== 'REVOKED' && (linkId === MAIN_LINK ? link.isDefault : link.id === linkId),
  );
}

/** The name a guest link goes by everywhere, also the phrase its typed confirmations ask for. */
export function useLinkName(): (link: GuestLink) => string {
  const t = useTranslations('links');
  return (link) => (link.isDefault ? t('defaultTitle') : (link.label ?? t('defaultTitle')));
}
