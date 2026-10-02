import { redirect } from 'next/navigation';
import { allLinksPath, LINK_PARAM, linkSettingsPath } from '@/guest-links/link-pages';

/**
 * The Links tab is gone (owner review 2026-10-02: the tabs did not fit): links live on the
 * collection page, the full list in its «Усі посилання» sheet. Old addresses land there, a
 * `?link=` one on that link's settings.
 */
export default async function OldLinksPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const link = (await searchParams)[LINK_PARAM];
  redirect(typeof link === 'string' ? linkSettingsPath(id, link) : allLinksPath(id));
}
