'use client';

// The guest page (DESIGN-SYSTEM.md §6.1, §6.3, §6.10, §7.1, §7.3; [O4], [C16]).
// Design pass (frontend-design, ui-ux-pro-max, web-design-guidelines, responsive-design):
// - One question per screen: what is this (the collection's title, display size) and what do I
//   do (one pencil action in the thumb zone). Everything else is quieter and lower.
// - Layout per breakpoint (owner review 2026-10-03: "designed on tablets and monitors too"):
//   phones (< 640): one column, the action in a dock fixed at the bottom with the safe area (the
//   content gets room below it). 640–1023: one centred column of 720px; the action sits under
//   the title, so no dock covers the frames on a tablet. ≥ 1024: two columns in the page container
//   (1240px, 1320px from 1600): the collection's identity and the action on a sticky sheet on the
//   left (380/420px), the frames on the right. Wider screens grow the margins, not the line length.
// - The pencil is the guest's main action only: «Додати фото й відео» (or what the link takes),
//   opening the system picker for many files at once; «Додати ще» after a batch. The wish is the
//   quieter second action, or the pencil one on a text-only link. A view-only link has no dock.
// - Uploads (PR C) show at the top of «Ваші кадри» (`UploadBatch`); the dock on phones is
//   `UploadDock` with «Не закривайте сторінку…» while files are on their way.
// - Frames are borderless tiles (`FrameGrid`, remark 62): numbers only on the guest's own frames,
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
import { ImagePlus, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { UploadDock } from '@stepler/ui/components/upload-dock';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LinkStatePage } from '@/app/g/[token]/link-state-page';
import { submitText, updateName } from './api';
import { acceptFor, primaryContribution, uploadLabelKey } from './contribute-actions';
import type { GuestPageState } from './guest-state';
import { NamePrompt } from './name-prompt';
import { GuestFrames, guestContentKey, useFrameTime } from './own-frames';
import { TextComposer } from './text-composer';
import { hasUnsettled } from './upload/queue';
import { useUploadQueue } from './upload/use-upload-queue';
import { KeepOpenNote, UploadBatch } from './uploader';
import { useGuestSession } from './use-guest-session';

type Call = <T>(fn: (collectionId: string) => Promise<T>) => Promise<T>;

export function GuestPage({ token }: { token: string }) {
  const session = useGuestSession(token);
  // Files this visit added, so a link closed mid-batch can still say how many arrived.
  const [added, setAdded] = useState(0);
  if (session.status === 'loading') return <GuestLoading />;
  if (session.status !== 'ready')
    return <GuestStatePage state={session.status} retry={session.retry} added={added} />;
  return (
    <GuestCollection
      collectionId={session.collectionId}
      context={session.context}
      call={session.call}
      setContext={session.setContext}
      onAdded={setAdded}
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
      className="mx-auto grid w-full max-w-[720px] gap-4 lg:max-w-none"
    >
      <Skeleton className="h-10 w-4/5" />
      <Skeleton className="h-5 w-3/5" />
    </div>
  );
}

function GuestStatePage({
  state,
  retry,
  added = 0,
}: {
  state: GuestPageState;
  retry: () => void;
  added?: number;
}) {
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
  return (
    <div className="mx-auto grid w-full max-w-[720px] gap-4">
      {page}
      {added > 0 ? (
        <p className="text-muted-foreground">{t('addedBeforeClosed', { count: added })}</p>
      ) : null}
    </div>
  );
}

type Pending = 'text' | 'files' | null;

function GuestCollection({
  collectionId,
  context,
  call,
  setContext,
  onAdded,
}: {
  collectionId: string;
  context: GuestContext;
  call: Call;
  setContext: (context: GuestContext) => void;
  onAdded: (count: number) => void;
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
  const uploads = useUploadQueue(context, call);
  const fileInput = useRef<HTMLInputElement>(null);
  const busy = hasUnsettled(uploads.state);
  const doneIds = useMemo(
    () =>
      new Set(
        uploads.state.items.flatMap((item) => (item.result === undefined ? [] : [item.result.id])),
      ),
    [uploads.state.items],
  );
  const addedCount = uploads.summary.added;

  // A new frame shows in the shared gallery too; the parent remembers the count for the
  // link-state page if the link closes mid-batch.
  useEffect(() => {
    onAdded(addedCount);
    if (addedCount > 0) {
      void queryClient.invalidateQueries({ queryKey: guestContentKey(collectionId, 'all') });
    }
  }, [addedCount, collectionId, onAdded, queryClient]);

  const saveName = useMutation({
    mutationFn: (name: string | null) => call((id) => updateName(id, name)),
    onSuccess: setContext,
    onError: () => toast({ variant: 'error', title: t('name.failed') }),
  });

  /** Before the first contribution the name is asked once; then the action runs. */
  function contribute(action: 'text' | 'files') {
    if (!guest.nameAnswered) {
      setNamePrompt({ mode: 'first', then: action });
      return;
    }
    run(action);
  }

  /** Still inside the tap that asked for it: iOS opens a file picker only on a user gesture. */
  function run(action: 'text' | 'files') {
    if (action === 'files') fileInput.current?.click();
    else setComposerOpen(true);
  }

  function nameDone(name: string | null) {
    const then = namePrompt?.then ?? null;
    setNamePrompt(null);
    // Optimistic: the prompt does not come back while the save is in flight.
    setContext({ ...context, guest: { name, nameAnswered: true } });
    saveName.mutate(name);
    // Still inside the «Продовжити»/«Пропустити» tap, so the picker counts as a user gesture.
    if (then !== null) run(then);
  }

  async function sendText(body: string, idempotencyKey: string) {
    await call((id) => submitText(id, body, idempotencyKey));
    toast({ variant: 'success', title: t('textSent') });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: guestContentKey(collectionId, 'own') }),
      queryClient.invalidateQueries({ queryKey: guestContentKey(collectionId, 'all') }),
    ]);
  }

  const fileLabel = uploads.state.items.length > 0 ? 'addMore' : uploadLabelKey(permissions);
  const actions =
    primary === null ? null : (
      <ContributeActions
        primary={primary}
        fileLabel={t(fileLabel)}
        canWrite={permissions.canSubmitText}
        onFiles={() => contribute('files')}
        onWrite={() => contribute('text')}
      />
    );

  return (
    <>
      <div
        className={cn(
          'mx-auto grid w-full max-w-[720px] gap-8 sm:gap-10 lg:max-w-none lg:grid-cols-[380px_minmax(0,1fr)] lg:items-start lg:gap-12 xl:grid-cols-[420px_minmax(0,1fr)] xl:gap-16',
          // Room for the fixed dock on phones.
          contributes && 'max-sm:pb-32',
        )}
      >
        {/* The collection's identity; from lg a sheet that stays in view beside the frames. */}
        <header className="grid content-start gap-3 lg:sticky lg:top-6 lg:rounded-sheet lg:border lg:bg-card lg:p-8 xl:p-10">
          {/* Display size until the sheet: there it fits the 300–340px column without breaking words. */}
          <h1 className="type-display text-balance [overflow-wrap:anywhere] lg:text-[2.5rem] lg:leading-[1.1] xl:text-[2.75rem]">
            {collection.title}
          </h1>
          {collection.description === null ? null : (
            <p className="max-w-[60ch] whitespace-pre-line text-pretty [overflow-wrap:anywhere]">
              {collection.description}
            </p>
          )}
          {counts === null ? null : (
            <p className="flex flex-wrap gap-x-3 type-data text-[0.875rem] text-muted-foreground">
              <span className="tabular-nums">{t('counts', { count: counts.total })}</span>
              {counts.lastAddedAt === null ? null : (
                <span>{t('lastAt', { time: time(counts.lastAddedAt) })}</span>
              )}
            </p>
          )}
          {actions === null ? null : (
            <div className="mt-4 hidden gap-3 sm:grid sm:max-w-sm lg:mt-6 lg:max-w-none lg:border-t lg:pt-6">
              {actions}
              <KeepOpenNote busy={busy} />
            </div>
          )}
        </header>

        <div className="grid min-w-0 content-start gap-10 lg:gap-12">
          {contributes ? (
            <section aria-labelledby="own-title" className="grid gap-4">
              <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
                <div className="grid gap-1">
                  <h2 id="own-title" className="type-h2">
                    {t('ownTitle')}
                  </h2>
                  {permissions.canViewGallery ? null : (
                    <p className="text-sm text-muted-foreground">{t('onlyOrganizer')}</p>
                  )}
                </div>
                {guest.nameAnswered ? (
                  <GuestNameLine
                    name={guest.name}
                    onChange={() => setNamePrompt({ mode: 'edit', then: null })}
                  />
                ) : null}
              </div>
              <UploadBatch uploads={uploads} context={context} />
              <GuestFrames
                collectionId={collectionId}
                scope="own"
                call={call}
                label={t('listLabelOwn')}
                hide={doneIds}
                empty={
                  <p className="rounded-sheet border border-dashed border-input px-4 py-6 text-center text-sm text-muted-foreground">
                    {t('ownEmpty')}
                  </p>
                }
              />
            </section>
          ) : null}

          {permissions.canViewGallery ? (
            <section aria-labelledby="all-title" className="grid gap-4">
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
        // Phones only: from 640px the actions sit under the title / in the side panel.
        <UploadDock
          className="sm:hidden"
          primary={actions}
          {...(busy ? { note: t('upload.keepOpen') } : {})}
        />
      )}
      {primary === 'files' ? (
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={acceptFor(permissions)}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            // Cleared, so picking the same files again fires `change` again.
            event.target.value = '';
            if (files.length > 0) uploads.add(files);
          }}
        />
      ) : null}

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
 * Who the guest is to the organiser, as one quiet chip with «Змінити» beside it (a text button,
 * 44px tall on touch), right of the section title when it fits.
 */
function GuestNameLine({ name, onChange }: { name: string | null; onChange: () => void }) {
  const t = useTranslations('guest');
  return (
    <p className="flex min-w-0 items-center gap-1 text-sm">
      <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border bg-card py-1 pr-3 pl-2">
        <UserRound aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{name === null ? t('noName') : t('you', { name })}</span>
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0 text-link underline-offset-4 hover:underline pointer-coarse:min-h-11"
        onClick={onChange}
      >
        {name === null ? t('setName') : t('changeName')}
      </Button>
    </p>
  );
}

/**
 * The actions: in the dock on phones, under the title from 640px, in the side panel from 1024px.
 * Files take the pencil when the link takes any; the wish is then the quiet second action.
 */
function ContributeActions({
  primary,
  fileLabel,
  canWrite,
  onFiles,
  onWrite,
}: {
  primary: 'files' | 'text';
  fileLabel: string;
  canWrite: boolean;
  onFiles: () => void;
  onWrite: () => void;
}) {
  const t = useTranslations('guest');
  if (primary === 'text') {
    return (
      <Button variant="pencil" size="guest" className="w-full" onClick={onWrite}>
        {t('writeWish')}
      </Button>
    );
  }
  return (
    <div className="grid gap-2">
      <Button variant="pencil" size="guest" className="w-full" onClick={onFiles}>
        <ImagePlus aria-hidden="true" />
        {fileLabel}
      </Button>
      {canWrite ? (
        <Button variant="ghost" size="lg" className="w-full" onClick={onWrite}>
          {t('writeWish')}
        </Button>
      ) : null}
    </div>
  );
}
