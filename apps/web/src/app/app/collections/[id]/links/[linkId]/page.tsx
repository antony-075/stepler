import { redirect } from 'next/navigation';
import { linkSettingsPath } from '@/guest-links/link-pages';

/**
 * Link settings used to be a page of their own; they open in a sheet over the collection page
 * now (owner reviews 2026-10-02: too much nesting). Old addresses and bookmarks land there.
 */
export default async function GuestLinkRoute({
  params,
}: {
  params: Promise<{ id: string; linkId: string }>;
}) {
  const { id, linkId } = await params;
  redirect(linkSettingsPath(id, linkId));
}
