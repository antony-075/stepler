'use client';

// Design (DESIGN-SYSTEM.md §6.10, plan Task 11, G5/G6):
// - The guest surface, not the admin shell: the wordmark, then one column (max 560, centred) that
//   starts near the top on phones so nothing jumps when the state arrives.
// - A live link is a placeholder until slices 3 and 5 build the real guest page: the collection
//   title as h1 (wraps anywhere, a 100-character title never widens the page), its description,
//   what the organiser allows in one sentence, and that adding is coming soon. No upload button
//   that does nothing (rule 18), and no pencil: the guest's main action does not exist yet.
// - Every other state is the same template: h1 and one plain line, a button only when there is
//   something to do (try again). A paused link shows no title: the organiser may have paused it
//   to stop exposure.
// - Loading is the column's shape in skeletons, `aria-busy`.

import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { Panel } from '@stepler/ui/components/panel';
import { Skeleton } from '@stepler/ui/components/skeleton';
import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { resolveGuestLink } from '@/api/guest';
import { allowedWords } from '@/guest-links/link-permissions';
import { canContribute } from '@stepler/contracts';
import { guestLinkState } from './guest-link-state';
import { LinkStatePage } from './link-state-page';

export function GuestLinkLanding({ token }: { token: string }) {
  const t = useTranslations('guestLink');
  const tWords = useTranslations('guestLinks.permissions');
  const format = useFormatter();
  const query = useQuery({
    queryKey: ['guest-link', token],
    queryFn: () => resolveGuestLink(token),
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  if (query.isPending) {
    return (
      <div role="status" aria-busy="true" aria-label={t('loading')} className="grid gap-4">
        <Skeleton className="h-9 w-4/5" />
        <Skeleton className="h-5 w-3/5" />
      </div>
    );
  }

  if (query.isError) {
    const retry = (
      <Button variant="outline" className="w-full sm:w-auto" onClick={() => void query.refetch()}>
        {t('retry')}
      </Button>
    );
    switch (guestLinkState(query.error)) {
      case 'paused':
        return <LinkStatePage tone="warning" title={t('paused.title')} text={t('paused.text')} />;
      case 'revoked':
        return <LinkStatePage title={t('revoked.title')} text={t('revoked.text')} />;
      case 'archived':
        return <LinkStatePage title={t('archived.title')} text={t('archived.text')} />;
      case 'unavailable':
        return <LinkStatePage title={t('unavailable.title')} text={t('unavailable.text')} />;
      case 'not-found':
        return <LinkStatePage title={t('notFound.title')} text={t('notFound.text')} />;
      case 'rate-limited':
        return <LinkStatePage title={t('rateLimited.title')} action={retry} />;
      case 'failed':
        return (
          <Alert variant="error" action={retry}>
            {t('failed')}
          </Alert>
        );
    }
  }

  const { collection, permissions } = query.data;
  return (
    <article className="grid gap-6">
      <div className="grid gap-3">
        <h1 className="type-h1 text-balance [overflow-wrap:anywhere]">{collection.title}</h1>
        {collection.description === null ? null : (
          <p className="whitespace-pre-line text-pretty [overflow-wrap:anywhere]">
            {collection.description}
          </p>
        )}
      </div>
      <Panel className="grid gap-2 p-4 sm:p-5">
        <p>{allowedWords(permissions, tWords, (items) => format.list(items))}</p>
        <p className="text-sm text-muted-foreground">
          {canContribute(permissions) ? t('soonAdd') : t('soonView')}
        </p>
      </Panel>
    </article>
  );
}
