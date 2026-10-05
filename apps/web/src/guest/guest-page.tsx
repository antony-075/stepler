'use client';

// The guest page (DESIGN-SYSTEM.md §6.1, §6.3, §6.10, §7.1, §7.3; [O4], [C16]; ADR 0017).
// The page itself is a guest page template (`@stepler/templates`): this module owns the session,
// the data, the uploads, the name prompt and the wish composer, and hands the template a model,
// the actions as data, and the app's own pieces as slots (template-model.ts, template-slots.tsx).
// The template, its settings, the welcome and the images are the collection's published guest
// page (`context.page`, never a draft); `classic` with its defaults is the guest page as it was
// before templates (its layout notes are in the template).
// - The pencil is the guest's main action only: «Додати фото й відео» (or what the link takes),
//   opening the system picker for many files at once; «Додати ще» after a batch. The wish is the
//   quieter second action, or the pencil one on a text-only link. A view-only link has none.
// - Uploads show at the top of «Ваші кадри» (`UploadBatch`); «Не закривайте сторінку…» shows
//   with the actions while files are on their way.
// - The name is asked once, before the first contribution, with «Пропустити»; «Змінити» later.
// - Any call that meets a link or collection state switches the whole page to that state; the
//   loading and state pages keep the plain Stepler header and footer.

import type { GuestContext } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { Skeleton } from '@stepler/ui/components/skeleton';
import { useToast } from '@stepler/ui/components/toast';
import { GuestTemplateRoot } from '@stepler/templates/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { LinkStatePage } from '@/app/g/[token]/link-state-page';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { LanguageSwitch } from '@/i18n/language-switch';
import { getContext, submitText, updateName } from './api';
import { acceptFor, primaryContribution } from './contribute-actions';
import type { GuestPageState } from './guest-state';
import { NamePrompt } from './name-prompt';
import { guestContentKey, useFrameTime } from './own-frames';
import { fontVariables } from './template-fonts';
import { buildGuestActions, buildGuestPageModel } from './template-model';
import { staticSlots } from './static-slots';
import { AllFramesSection, OwnFramesSection } from './template-slots';
import { TextComposer } from './text-composer';
import { hasUnsettled } from './upload/queue';
import { useUploadQueue } from './upload/use-upload-queue';
import { UploadBatch } from './uploader';
import { useGuestSession } from './use-guest-session';

type Call = <T>(fn: (collectionId: string) => Promise<T>) => Promise<T>;

export function GuestPage({ token }: { token: string }) {
  const session = useGuestSession(token);
  // Files this visit added, so a link closed mid-batch can still say how many arrived.
  const [added, setAdded] = useState(0);
  if (session.status === 'loading') {
    return (
      <GuestChrome>
        <GuestLoading />
      </GuestChrome>
    );
  }
  if (session.status !== 'ready') {
    return (
      <GuestChrome>
        <GuestStatePage state={session.status} retry={session.retry} added={added} />
      </GuestChrome>
    );
  }
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

/** The plain Stepler header, page column and footer around the loading and link states. */
function GuestChrome({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader>
        <LanguageSwitch variant="header" />
      </SiteHeader>
      <main className="stepler-container flex-1 pt-6 pb-16 sm:pt-10 lg:pt-12">{children}</main>
      <SiteFooter />
    </div>
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
  const { permissions, guest, counts } = context;
  const primary = primaryContribution(permissions);
  const contributes = primary !== null;

  const [namePrompt, setNamePrompt] = useState<{ mode: 'first' | 'edit'; then: Pending } | null>(
    null,
  );
  const [composerOpen, setComposerOpen] = useState(false);
  // Whether «Ваші кадри» has anything: with this visit's uploads, the page's phase.
  const [ownHasItems, setOwnHasItems] = useState(false);
  const uploads = useUploadQueue(context, call);
  // The hidden picker, held in state (a callback ref) so the actions can be built during render.
  const [fileInput, setFileInput] = useState<HTMLInputElement | null>(null);
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

  /** The header's counts after the guest deleted a frame; a failure keeps the old line. */
  function refreshContext() {
    call((id) => getContext(id)).then(setContext, () => {});
  }

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
    if (action === 'files') fileInput?.click();
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

  /** The page images' links expired (a tab left open for hours): fresh ones, once per link. */
  const [coverRetried, setCoverRetried] = useState<string | null>(null);
  function coverExpired() {
    // One key for the page's links: a refresh signs the cover and the background together.
    const src = context.page.cover?.previewUrl ?? context.page.background?.previewUrl ?? null;
    if (src === null || coverRetried === src) return;
    setCoverRetried(src);
    refreshContext();
  }

  const model = buildGuestPageModel(context, {
    countsLabel: counts === null ? null : t('counts', { count: counts.total }),
    lastAddedLabel:
      counts?.lastAddedAt == null ? null : t('lastAt', { time: time(counts.lastAddedAt) }),
    contributed: ownHasItems || addedCount > 0,
    onCoverError: coverExpired,
  });
  const actions = buildGuestActions(
    permissions,
    { t: (key) => t(key), batchStarted: uploads.state.items.length > 0 },
    { onFiles: () => contribute('files'), onWrite: () => contribute('text') },
    busy ? t('upload.keepOpen') : null,
  );
  const slots = {
    ...staticSlots(),
    ownFrames: contributes ? (
      <OwnFramesSection
        context={context}
        collectionId={collectionId}
        call={call}
        batch={<UploadBatch uploads={uploads} context={context} />}
        hide={doneIds}
        onRename={() => setNamePrompt({ mode: 'edit', then: null })}
        onDeleted={refreshContext}
        onHasItems={setOwnHasItems}
      />
    ) : null,
    allFrames: permissions.canViewGallery ? (
      <AllFramesSection collectionId={collectionId} call={call} onRefresh={refreshContext} />
    ) : null,
  };

  return (
    <>
      <GuestTemplateRoot
        templateId={context.page.templateId}
        templateVersion={context.page.templateVersion}
        settings={context.page.settings}
        fontClassName={fontVariables}
        model={model}
        actions={actions}
        slots={slots}
      />
      {primary === 'files' ? (
        <input
          ref={setFileInput}
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
