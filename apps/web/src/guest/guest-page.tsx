'use client';

// The guest page (DESIGN-SYSTEM.md §6.1, §6.3, §6.10, §7.1, §7.3; [O4], [C16]; ADR 0017).
// The page itself is a guest page template (`@stepler/templates`): this module owns the session,
// the data, the uploads, the name prompt and the wish composer, and hands the template a model,
// the actions as data, and the app's own pieces as slots (template-model.ts, template-slots.tsx).
// The template, its settings, the welcome and the images are the collection's published guest
// page (`context.page`, never a draft); `classic` with its defaults is the guest page as it was
// before templates (its layout notes are in the template).
// - The pencil is the guest's main action only: «Додати фото й відео» (or what the link takes),
//   opening the system picker for many files at once (the label stays after a batch; «Додати ще»
//   lives in the upload sheet). The wish is the quieter second action, or the pencil one on a
//   text-only link. A view-only link has none.
// - Two views on phones and tablets, tabs under the template's bar (owner remarks 2026-10-16):
//   «Додати» (the intro and the actions) and «Кадри» (own frames, everyone's); from 1024px both
//   show in the template's layout without the tabs. A view-only link has the frames only.
// - Uploads run in their own sheet (`UploadSheet`), opened by the pick, folded into a pill at the
//   bottom; «Кадри» lists the frames from the server at once, previews as the worker makes them.
// - The name is asked once, before the first contribution, with «Пропустити»; «Змінити» later.
// - Any call that meets a link or collection state switches the whole page to that state; the
//   loading and state screens are drawn in the link's template when its look is known (the
//   server fetched it, owner remarks 99, 100), else in the plain Stepler header and footer.

import type { GuestContext } from '@stepler/contracts';
import { useToast } from '@stepler/ui/components/toast';
import { type GuestView, GuestTemplateRoot, templateSurfaceProps } from '@stepler/templates/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { getContext, submitText, updateName } from './api';
import { acceptFor, primaryContribution } from './contribute-actions';
import { type GuestTheme, GuestLoadingScreen, GuestStateScreen } from './guest-screens';
import { NamePrompt } from './name-prompt';
import { guestContentKey, useFrameTime } from './own-frames';
import { fontVariables } from './template-fonts';
import { buildGuestActions, buildGuestPageModel } from './template-model';
import { staticSlots } from './static-slots';
import { AllFramesSection, OwnFramesSection } from './template-slots';
import { ContributionClosed } from './contribution-closed';
import { TextComposer } from './text-composer';
import { useUploadQueue } from './upload/use-upload-queue';
import { UploadPill, UploadPillSpacer, UploadSheet } from './upload-sheet';
import { useGuestSession } from './use-guest-session';
import { GuestViewTabs } from './view-tabs';

type Call = <T>(fn: (collectionId: string) => Promise<T>) => Promise<T>;

export function GuestPage({ token, theme }: { token: string; theme: GuestTheme | null }) {
  const session = useGuestSession(token);
  // Files this visit added, so a link closed mid-batch can still say how many arrived.
  const [added, setAdded] = useState(0);
  if (session.status === 'loading') return <GuestLoadingScreen theme={theme} />;
  if (session.status !== 'ready') {
    return (
      <GuestStateScreen theme={theme} state={session.status} retry={session.retry} added={added} />
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
  const { guest, counts } = context;
  // Closed by billing (ADR 0018 [P2]): the link's contribution rights are off; deleting their own
  // frames and the gallery stay as the link allows.
  const open = context.contribution === 'OPEN';
  const permissions = open ? context.permissions : withoutContribution(context.permissions);
  const primary = primaryContribution(permissions);
  const contributes = primary !== null;
  const contributedBefore = primaryContribution(context.permissions) !== null;

  const [namePrompt, setNamePrompt] = useState<{ mode: 'first' | 'edit'; then: Pending } | null>(
    null,
  );
  const [composerOpen, setComposerOpen] = useState(false);
  // Whether «Ваші кадри» has anything (a closed collection shows the section only then).
  const [ownHasItems, setOwnHasItems] = useState(false);
  const uploads = useUploadQueue(context, call);
  // The hidden picker, held in state (a callback ref) so the actions can be built during render.
  const [fileInput, setFileInput] = useState<HTMLInputElement | null>(null);
  // A link that takes nothing has the frames only.
  const [chosenView, setView] = useState<GuestView>('add');
  const view: GuestView = contributes ? chosenView : 'frames';
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pillDismissed, setPillDismissed] = useState(false);
  const addedCount = uploads.summary.added;
  const pillShown = !sheetOpen && !pillDismissed && uploads.state.items.length > 0;

  // A new frame shows in both lists (the guest's own polls its previews); the parent remembers
  // the count for the link-state page if the link closes mid-batch.
  useEffect(() => {
    onAdded(addedCount);
    if (addedCount > 0) {
      void queryClient.invalidateQueries({ queryKey: guestContentKey(collectionId, 'own') });
      void queryClient.invalidateQueries({ queryKey: guestContentKey(collectionId, 'all') });
    }
  }, [addedCount, collectionId, onAdded, queryClient]);

  /** «Переглянути мої кадри»: the frames view, the sheet and the pill put away. */
  function viewFrames() {
    setSheetOpen(false);
    setPillDismissed(true);
    setView('frames');
    window.scrollTo({ top: 0 });
  }

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

  // The composer and the name prompt in the page's template (owner remark 112).
  const surface = templateSurfaceProps(
    context.page.templateId,
    context.page.templateVersion,
    context.page.settings,
    fontVariables,
  );
  const model = buildGuestPageModel(context, {
    countsLabel: counts === null ? null : t('counts', { count: counts.total }),
    lastAddedLabel:
      counts?.lastAddedAt == null ? null : t('lastAt', { time: time(counts.lastAddedAt) }),
    view,
    onCoverError: coverExpired,
  });
  const actions = buildGuestActions(
    permissions,
    { t: (key) => t(key) },
    { onFiles: () => contribute('files'), onWrite: () => contribute('text') },
  );
  const statics = staticSlots();
  const slots = {
    ...statics,
    footer: pillShown ? (
      <>
        {statics.footer}
        <UploadPillSpacer />
      </>
    ) : (
      statics.footer
    ),
    tabs: contributes ? (
      <GuestViewTabs
        view={view}
        onChange={setView}
        labels={{
          list: t('views.label'),
          add: t('views.add'),
          frames: t('views.frames'),
          framesCount: permissions.canViewGallery && counts !== null ? String(counts.total) : null,
        }}
      />
    ) : null,
    ownFrames: !open ? (
      <>
        <ContributionClosed
          contribution={context.contribution as 'COLLECTING_CLOSED' | 'READ_ONLY'}
          galleryVisible={permissions.canViewGallery}
        />
        {/* The guest's own frames only when they have some: an empty «додайте» would contradict
            the closed state. Mounted (hidden) to learn whether there are any. */}
        {contributedBefore ? (
          <div hidden={!ownHasItems}>
            <OwnFramesSection
              context={context}
              collectionId={collectionId}
              call={call}
              onRename={() => setNamePrompt({ mode: 'edit', then: null })}
              onDeleted={refreshContext}
              onHasItems={setOwnHasItems}
            />
          </div>
        ) : null}
      </>
    ) : contributes ? (
      <OwnFramesSection
        context={context}
        collectionId={collectionId}
        call={call}
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
            if (files.length === 0) return;
            uploads.add(files);
            setPillDismissed(false);
            setSheetOpen(true);
          }}
        />
      ) : null}
      {primary === 'files' ? (
        <UploadSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          uploads={uploads}
          context={context}
          surface={surface}
          onAddMore={() => fileInput?.click()}
          onViewFrames={viewFrames}
        />
      ) : null}
      {pillShown ? (
        <UploadPill
          uploads={uploads}
          surface={surface}
          onOpen={() => setSheetOpen(true)}
          onViewFrames={viewFrames}
          onDismiss={() => setPillDismissed(true)}
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
        surface={surface}
      />
      <TextComposer
        open={composerOpen}
        onOpenChange={setComposerOpen}
        onSend={sendText}
        surface={surface}
      />
    </>
  );
}

/** The link's rights without adding anything: what a closed collection leaves a guest. */
function withoutContribution(p: GuestContext['permissions']): GuestContext['permissions'] {
  return {
    ...p,
    canUploadPhotos: false,
    canUploadVideos: false,
    canUploadDocuments: false,
    canSubmitText: false,
  };
}
