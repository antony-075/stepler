'use client';

// The guest page (DESIGN-SYSTEM.md §6.1, §6.3, §6.10, §7.1, §7.3; [O4], [C16]).
// Design pass (frontend-design, ui-ux-pro-max, web-design-guidelines, responsive-design):
// - One question per screen: what is this (the collection's title, display size) and what do I
//   do (one pencil action in the thumb zone). Everything else is quieter and lower.
// - Phones (< 640): one column, the dock fixed at the bottom with the safe area; the content gets
//   room below so nothing hides under it. 640–1023: the same column (max 560) with the dock sticky
//   at its bottom. ≥ 1024: two columns, the title and actions sticky on the left (360/400px), the
//   frames on the right; no dock.
// - The pencil is the guest's main action only. Until uploads exist it is «Написати побажання»,
//   with a plain line that photos and videos come soon (no dead «Додати фото» button: rule 18);
//   with uploads, «Додати фото» takes the pencil. A view-only link has no dock at all.
// - Frames are the contact sheet (`FrameGrid`): times only, numbers only on the guest's own frames,
//   never other guests' names. The count line («86 кадрів», «останній о 21:10») only with the
//   shared gallery (§11.3). Contribution-only links say who will see the frames instead.
// - The name is asked once, before the first contribution, with «Пропустити»; «Змінити» later.
// - Any call that meets a link or collection state switches the whole page to that state.

import type { GuestContext } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { EmptyState } from '@stepler/ui/components/empty-state';
import { Skeleton } from '@stepler/ui/components/skeleton';
import { useToast } from '@stepler/ui/components/toast';
import { cn } from '@stepler/ui/lib/utils';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { LinkStatePage } from '@/app/g/[token]/link-state-page';
import { submitText, updateName } from './api';
import { primaryContribution } from './contribute-actions';
import type { GuestPageState } from './guest-state';
import { NamePrompt } from './name-prompt';
import { GuestFrames, guestContentKey, useFrameTime } from './own-frames';
import { TextComposer } from './text-composer';
import { useGuestSession } from './use-guest-session';

type Call = <T>(fn: (collectionId: string) => Promise<T>) => Promise<T>;

export function GuestPage({ token }: { token: string }) {
  const session = useGuestSession(token);
  if (session.status === 'loading') return <GuestLoading />;
  if (session.status !== 'ready')
    return <GuestStatePage state={session.status} retry={session.retry} />;
  return (
    <GuestCollection
      collectionId={session.collectionId}
      context={session.context}
      call={session.call}
      setContext={session.setContext}
    />
  );
}

function GuestLoading() {
  const t = useTranslations('guestLink');
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={t('loading')}
      className="mx-auto grid w-full max-w-[560px] gap-4 lg:max-w-none"
    >
      <Skeleton className="h-10 w-4/5" />
      <Skeleton className="h-5 w-3/5" />
    </div>
  );
}

function GuestStatePage({ state, retry }: { state: GuestPageState; retry: () => void }) {
  const t = useTranslations('guestLink');
  const again = (
    <Button variant="outline" className="w-full sm:w-auto" onClick={retry}>
      {t('retry')}
    </Button>
  );
  const page = (() => {
    switch (state) {
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
      case 'quota-full':
        return <LinkStatePage title={t('quotaFull.title')} text={t('quotaFull.text')} />;
      case 'rate-limited':
        return <LinkStatePage title={t('rateLimited.title')} action={again} />;
      case 'failed':
        return (
          <Alert variant="error" action={again}>
            {t('failed')}
          </Alert>
        );
    }
  })();
  return <div className="mx-auto w-full max-w-[560px]">{page}</div>;
}

type Pending = 'text' | null;

function GuestCollection({
  collectionId,
  context,
  call,
  setContext,
}: {
  collectionId: string;
  context: GuestContext;
  call: Call;
  setContext: (context: GuestContext) => void;
}) {
  const t = useTranslations('guest');
  const time = useFrameTime();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { collection, permissions, guest, counts } = context;
  const primary = primaryContribution(permissions);
  const contributes = primary !== null;

  const [namePrompt, setNamePrompt] = useState<{ mode: 'first' | 'edit'; then: Pending } | null>(
    null,
  );
  const [composerOpen, setComposerOpen] = useState(false);

  const saveName = useMutation({
    mutationFn: (name: string | null) => call((id) => updateName(id, name)),
    onSuccess: setContext,
    onError: () => toast({ variant: 'error', title: t('name.failed') }),
  });

  /** Before the first contribution the name is asked once; then the action runs. */
  function contribute(action: 'text') {
    if (!guest.nameAnswered) {
      setNamePrompt({ mode: 'first', then: action });
      return;
    }
    setComposerOpen(true);
  }

  function nameDone(name: string | null) {
    const then = namePrompt?.then ?? null;
    setNamePrompt(null);
    // Optimistic: the prompt does not come back while the save is in flight.
    setContext({ ...context, guest: { name, nameAnswered: true } });
    saveName.mutate(name);
    // Still inside the tap: a file picker opened here would count as a user gesture (iOS).
    if (then === 'text') setComposerOpen(true);
  }

  async function sendText(body: string, idempotencyKey: string) {
    await call((id) => submitText(id, body, idempotencyKey));
    toast({ variant: 'success', title: t('textSent') });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: guestContentKey(collectionId, 'own') }),
      queryClient.invalidateQueries({ queryKey: guestContentKey(collectionId, 'all') }),
    ]);
  }

  const actions =
    primary === null ? null : (
      <ContributeActions
        primary={primary}
        canWrite={permissions.canSubmitText}
        onWrite={() => contribute('text')}
      />
    );

  return (
    <>
      <div
        className={cn(
          'mx-auto grid w-full max-w-[560px] gap-8 lg:max-w-none lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-12 xl:grid-cols-[400px_minmax(0,1fr)]',
          // Room for the fixed dock on phones.
          contributes && 'max-sm:pb-32',
        )}
      >
        <header className="grid content-start gap-3 lg:sticky lg:top-6 lg:self-start">
          <h1 className="type-display text-balance [overflow-wrap:anywhere]">{collection.title}</h1>
          {collection.description === null ? null : (
            <p className="whitespace-pre-line text-pretty [overflow-wrap:anywhere]">
              {collection.description}
            </p>
          )}
          {counts === null ? null : (
            <p className="flex flex-wrap gap-x-3 text-muted-foreground">
              <span className="tabular-nums">{t('counts', { count: counts.total })}</span>
              {counts.lastAddedAt === null ? null : (
                <span>{t('lastAt', { time: time(counts.lastAddedAt) })}</span>
              )}
            </p>
          )}
          {actions === null ? null : <div className="mt-5 hidden lg:grid">{actions}</div>}
        </header>

        <div className="grid min-w-0 content-start gap-10">
          {contributes ? (
            <section aria-labelledby="own-title" className="grid gap-3">
              <h2 id="own-title" className="type-h2">
                {t('ownTitle')}
              </h2>
              {permissions.canViewGallery ? null : (
                <p className="text-muted-foreground">{t('onlyOrganizer')}</p>
              )}
              {guest.nameAnswered ? (
                <p className="flex flex-wrap items-center gap-x-1 text-sm">
                  <span className="[overflow-wrap:anywhere]">
                    {guest.name === null ? t('noName') : t('you', { name: guest.name })}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-link underline underline-offset-4"
                    onClick={() => setNamePrompt({ mode: 'edit', then: null })}
                  >
                    {guest.name === null ? t('setName') : t('changeName')}
                  </Button>
                </p>
              ) : null}
              <GuestFrames
                collectionId={collectionId}
                scope="own"
                call={call}
                label={t('listLabelOwn')}
                empty={<p className="text-sm text-muted-foreground">{t('ownEmpty')}</p>}
              />
            </section>
          ) : null}

          {permissions.canViewGallery ? (
            <section aria-labelledby="all-title" className="grid gap-3">
              <h2 id="all-title" className="type-h2">
                {t('allTitle')}
              </h2>
              <GuestFrames
                collectionId={collectionId}
                scope="all"
                call={call}
                label={t('listLabelAll')}
                empty={
                  <EmptyState
                    frameNumber={1}
                    headingLevel={3}
                    title={t('allEmpty')}
                    description={t('allEmptyText')}
                  />
                }
              />
            </section>
          ) : null}
        </div>
      </div>

      {actions === null ? null : (
        <div
          data-toast-avoid
          className="fixed inset-x-0 bottom-0 z-(--z-dock) border-t bg-card px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:sticky sm:mx-auto sm:mt-8 sm:max-w-[560px] sm:rounded-t-sheet sm:border-x lg:hidden"
        >
          {actions}
        </div>
      )}

      <NamePrompt
        open={namePrompt !== null}
        onOpenChange={(open) => {
          if (!open) setNamePrompt(null);
        }}
        mode={namePrompt?.mode ?? 'first'}
        defaultName={guest.name}
        onDone={nameDone}
      />
      <TextComposer open={composerOpen} onOpenChange={setComposerOpen} onSend={sendText} />
    </>
  );
}

/**
 * The dock's content (and the left column's from 1024px). Until uploads exist (PR C) there is no
 * file button at all, not even a disabled one (a dead main action in the thumb zone, rule 18):
 * the wish is the pencil action, and a link that takes files says plainly that they come soon.
 */
function ContributeActions({
  primary,
  canWrite,
  onWrite,
}: {
  primary: 'files' | 'text';
  canWrite: boolean;
  onWrite: () => void;
}) {
  const t = useTranslations('guest');
  return (
    <div className="grid gap-2">
      {canWrite ? (
        <Button variant="pencil" size="guest" className="w-full" onClick={onWrite}>
          {t('writeWish')}
        </Button>
      ) : null}
      {primary === 'files' ? (
        <p className="text-center text-sm text-muted-foreground lg:text-left">
          {t('addFilesSoon')}
        </p>
      ) : null}
    </div>
  );
}
