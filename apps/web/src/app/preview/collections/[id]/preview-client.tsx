'use client';

// The guest page as the editor's working copy would show it (plan Task 12, ADR 0017).
// - Driven by postMessage from the editor (`preview-protocol.ts`): it announces itself ready
//   once, then renders the last version and page state it accepted (same origin, from the parent
//   window only).
// - Real where it is the admin's own: the collection's title and description, the working copy's
//   welcome and cover. The frames are built-in samples (owner remark 76: generated pictures, a
//   video, wishes, a document; never a guest's real photo), so a new collection shows how the
//   page looks with content.
// - The page state comes from the editor's two controls (owner remarks 77, 92): «Доступ за
//   посиланням» (everything, only their own, view-only, paused, closed) and «Вміст» (empty, mine,
//   others', both, uploading), and «Екран» (owner remark 2026-10-16: the tabs «Додати» / «Кадри»).
//   «Завантаження» draws the upload sheet over the page as the guest sees it after a pick. A link
//   that hides the gallery never draws «Усі кадри», as on the real page. Each state is drawn with the same pieces the guest page uses; the actions carry the default link's real labels
//   and do nothing; the whole page is `inert`.
// - Admin endpoints only: no guest session is created and no guest API is called (lint and a
//   test check the imports).

import type { CollectionDetail, GuestLinkPermissions, GuestPageVersion } from '@stepler/contracts';
import { Button } from '@stepler/ui/components/button';
import { EmptyState } from '@stepler/ui/components/empty-state';
import { Frame } from '@stepler/ui/components/frame';
import { FrameGrid } from '@stepler/ui/components/frame-grid';
import { UploadFrame } from '@stepler/ui/components/upload-frame';
import { UploadSummary } from '@stepler/ui/components/upload-summary';
import {
  GuestTemplateRoot,
  type TemplateSlots,
  templateSurfaceProps,
} from '@stepler/templates/react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, UserRound, X } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { collectionKey, fetchCollection } from '@/api/collections';
import { formatBytes } from '@/format/bytes';
import { primaryContribution } from '@/guest/contribute-actions';
import { fromAdminImage } from '@/guest/guest-cover';
import { GuestStateScreen } from '@/guest/guest-screens';
import { staticSlots } from '@/guest/static-slots';
import { fontVariables } from '@/guest/template-fonts';
import { buildGuestActions } from '@/guest/template-model';
import { GuestViewTabs } from '@/guest/view-tabs';
import {
  acceptPreviewMessage,
  type PreviewView,
  previewReadyMessage,
} from '@/guest-page/preview-protocol';
import { type PreviewShape, previewShape } from '@/guest-page/preview-state';
import { samplePhoto } from '@/guest-page/sample-photos';

/** A link that takes everything: the preview's labels when the default link takes nothing. */
const ALL: GuestLinkPermissions = {
  canUploadPhotos: true,
  canUploadVideos: true,
  canUploadDocuments: false,
  canSubmitText: true,
  canViewGallery: true,
  canDeleteOwn: true,
};

const noop = () => {};

/** One sample frame. */
type Sample =
  | { kind: 'photo'; picture: number }
  | { kind: 'video'; picture: number; duration: string }
  | { kind: 'wish'; text: 'wishOwn' | 'wishOther' | 'wishOther2' }
  | { kind: 'document' };

const OWN: readonly Sample[] = [
  { kind: 'photo', picture: 0 },
  { kind: 'wish', text: 'wishOwn' },
  { kind: 'video', picture: 2, duration: '0:12' },
];
const OTHERS: readonly Sample[] = [
  { kind: 'photo', picture: 1 },
  { kind: 'photo', picture: 3 },
  { kind: 'wish', text: 'wishOther' },
  { kind: 'photo', picture: 4 },
  { kind: 'video', picture: 5, duration: '0:47' },
  { kind: 'document' },
  { kind: 'photo', picture: 6 },
  { kind: 'wish', text: 'wishOther2' },
  { kind: 'photo', picture: 7 },
];

/** What a page state draws (`preview-state.ts`). */
type Shape = Extract<PreviewShape, { kind: 'page' }>;

const ITEMS: Record<Shape['all'], readonly Sample[]> = {
  none: [],
  empty: [],
  own: OWN,
  others: OTHERS,
  both: [...OWN, ...OTHERS],
};

export function PreviewClient({ collectionId }: { collectionId: string }) {
  const t = useTranslations('guestPage.preview');
  const [view, setView] = useState<PreviewView | null>(null);

  useEffect(() => {
    // Not framed: nothing will ever post a page here.
    if (window.parent === window) return;
    const parent = window.parent;
    const onMessage = (event: MessageEvent) => {
      const next = acceptPreviewMessage(event, parent);
      if (next !== null) setView(next);
    };
    window.addEventListener('message', onMessage);
    parent.postMessage(previewReadyMessage, window.location.origin);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const collection = useQuery({
    queryKey: collectionKey(collectionId),
    queryFn: () => fetchCollection(collectionId),
    retry: false,
  });

  if (collection.isError) {
    return (
      <main className="grid min-h-svh place-items-center bg-background p-6 text-center">
        <p className="max-w-[40ch] text-muted-foreground">{t('unavailable')}</p>
      </main>
    );
  }
  if (view === null || collection.data === undefined) {
    // Neutral, so a dark template does not flash over a light page.
    return <div aria-busy="true" className="min-h-svh bg-background" />;
  }
  const shape = previewShape(view.state);
  if (shape.kind === 'link-state') return <PreviewLinkState state={shape.state} page={view.page} />;
  return <PreviewPage collection={collection.data} page={view.page} shape={shape} />;
}

/** The link or collection state, in the page's template as the guest page shows it (inert). */
function PreviewLinkState({ state, page }: { state: 'paused' | 'closed'; page: GuestPageVersion }) {
  return (
    <div inert data-slot="preview-link-state" data-state={state}>
      <GuestStateScreen theme={page} state={state === 'paused' ? 'paused' : 'archived'} />
    </div>
  );
}

function PreviewPage({
  collection,
  page,
  shape,
}: {
  collection: CollectionDetail;
  page: GuestPageVersion;
  shape: Shape;
}) {
  const t = useTranslations('guest');
  const format = useFormatter();
  const linkPermissions = collection.defaultLinkPermissions ?? ALL;
  // A contributing state on a view-only default link still shows what contributing looks like.
  const contributing = primaryContribution(linkPermissions) === null ? ALL : linkPermissions;
  // Whether others' frames show is the state's to say, whatever the default link allows now.
  const permissions: GuestLinkPermissions = {
    ...contributing,
    canViewGallery: shape.all !== 'none',
  };
  const uploading = shape.own === 'uploading';
  const actions = shape.actions
    ? buildGuestActions(permissions, { t: (key) => t(key) }, { onFiles: noop, onWrite: noop })
    : null;

  const allItems = ITEMS[shape.all];
  // A sample «останній о 21:10», in the viewer's own time format.
  const lastAt = new Date();
  lastAt.setHours(21, 10, 0, 0);
  const showsCounts = allItems.length > 0;

  const slots: TemplateSlots = {
    ...staticSlots(),
    tabs: shape.actions ? (
      <GuestViewTabs
        view={shape.view}
        onChange={noop}
        labels={{
          list: t('views.label'),
          add: t('views.add'),
          frames: t('views.frames'),
          framesCount: showsCounts ? String(allItems.length) : null,
        }}
      />
    ) : null,
    ownFrames:
      shape.own === 'none' ? null : (
        <OwnSection hasItems={shape.own !== 'empty'} viewsGallery={permissions.canViewGallery} />
      ),
    allFrames: shape.all === 'none' ? null : <AllSection items={allItems} />,
  };
  return (
    <>
      <GuestTemplateRoot
        templateId={page.templateId}
        templateVersion={page.templateVersion}
        settings={page.settings}
        fontClassName={fontVariables}
        model={{
          title: collection.title,
          description: collection.description,
          welcomeMessage: page.welcomeMessage,
          countsLabel: showsCounts ? t('counts', { count: allItems.length }) : null,
          lastAddedLabel: showsCounts
            ? t('lastAt', { time: format.dateTime(lastAt, { hour: '2-digit', minute: '2-digit' }) })
            : null,
          cover: fromAdminImage(page.cover),
          background: fromAdminImage(page.background),
          view: shape.view,
        }}
        actions={actions}
        slots={slots}
        inert
      />
      {uploading ? <SampleUploadSheet page={page} /> : null}
    </>
  );
}

/**
 * The upload sheet as the guest sees it after a pick (`UploadSheet`): drawn in place (no dialog),
 * at the bottom on phones and centred from `sm`, in the page's template; inert like the page.
 */
function SampleUploadSheet({ page }: { page: GuestPageVersion }) {
  const t = useTranslations('guest.upload');
  const surface = templateSurfaceProps(
    page.templateId,
    page.templateVersion,
    page.settings,
    fontVariables,
  );
  return (
    <div
      inert
      className="fixed inset-0 z-40 flex items-end justify-center bg-overlay sm:items-center"
    >
      <section
        {...surface}
        aria-label={t('sheet.title')}
        data-slot="upload-sheet"
        className={[
          'flex max-h-[calc(100dvh-3rem)] w-full max-w-[560px] flex-col rounded-t-dialog border bg-popover text-popover-foreground shadow-lg sm:w-[calc(100%-2rem)] sm:rounded-dialog',
          surface.className ?? '',
        ].join(' ')}
      >
        <div className="flex min-h-14 items-center gap-3 border-b py-1.5 pr-2 pl-4 sm:pl-6">
          <h2 className="type-h3 flex-1">{t('sheet.title')}</h2>
          <span className="inline-flex size-11 items-center justify-center text-muted-foreground">
            <X aria-hidden="true" className="size-4" />
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden px-4 py-4 sm:px-6">
          <SampleBatch />
        </div>
        <div className="grid gap-3 border-t px-4 py-3 sm:px-6">
          <p className="text-sm text-muted-foreground">{t('keepOpen')}</p>
          <div className="flex justify-end">
            <Button variant="outline">{t('sheet.addMore')}</Button>
          </div>
        </div>
      </section>
    </div>
  );
}

/** «Ваші кадри», as `OwnFramesSection` draws it, with the sample frames. */
function OwnSection({ hasItems, viewsGallery }: { hasItems: boolean; viewsGallery: boolean }) {
  const t = useTranslations('guest');
  const tSample = useTranslations('guestPage.preview.sample');
  return (
    <section
      aria-labelledby="preview-own-title"
      data-slot="guest-own-frames"
      className="grid gap-4"
    >
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="grid gap-1">
          <h2 id="preview-own-title" className="type-h2">
            {t('ownTitle')}
          </h2>
          {viewsGallery ? null : (
            <p className="text-sm text-muted-foreground">{t('onlyOrganizer')}</p>
          )}
        </div>
        {hasItems ? (
          <p className="flex min-w-0 items-center gap-1 text-sm">
            <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border bg-card py-1 pr-3 pl-2">
              <UserRound aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{t('you', { name: tSample('guestName') })}</span>
            </span>
            <Button variant="ghost" size="sm" className="shrink-0 text-link">
              {t('changeName')}
            </Button>
          </p>
        ) : null}
      </div>
      {hasItems ? (
        <FrameGrid ariaLabel={t('listLabelOwn')}>
          {OWN.map((sample, i) => (
            <SampleFrame key={i} sample={sample} number={OWN.length - i} />
          ))}
        </FrameGrid>
      ) : (
        <p className="rounded-sheet border border-dashed border-input px-4 py-6 text-center text-sm text-muted-foreground">
          {t('ownEmpty')}
        </p>
      )}
    </section>
  );
}

/** «Усі кадри», as `AllFramesSection` draws it: everyone's frames, without numbers. */
function AllSection({ items }: { items: readonly Sample[] }) {
  const t = useTranslations('guest');
  return (
    <section
      aria-labelledby="preview-all-title"
      data-slot="guest-all-frames"
      className="grid gap-4"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 id="preview-all-title" className="type-h2">
          {t('allTitle')}
        </h2>
        <Button variant="outline" size="sm" className="shrink-0">
          <RefreshCw aria-hidden="true" className="size-4" />
          {t('refresh')}
        </Button>
      </div>
      {items.length === 0 ? (
        <EmptyState
          frameNumber={1}
          headingLevel={3}
          title={t('allEmpty')}
          description={t('allEmptyText')}
        />
      ) : (
        <FrameGrid ariaLabel={t('listLabelAll')}>
          {items.map((sample, i) => (
            <SampleFrame key={i} sample={sample} />
          ))}
        </FrameGrid>
      )}
    </section>
  );
}

/** One sample frame; a number only on the guest's own (others' numbers stay private). */
function SampleFrame({ sample, number }: { sample: Sample; number?: number }) {
  const t = useTranslations('guestPage.preview');
  const numbered = number === undefined ? {} : { number };
  const name = t('frame');
  switch (sample.kind) {
    case 'wish':
      return (
        <Frame kind="text" {...numbered} text={t(`sample.${sample.text}`)} accessibleName={name} />
      );
    case 'document':
      return (
        <Frame
          kind="document"
          {...numbered}
          docType="PDF"
          // Only the guest's own frames carry a file name.
          {...(number === undefined ? {} : { docTitle: t('sample.docTitle') })}
          accessibleName={name}
        />
      );
    case 'video':
    case 'photo':
      return (
        <Frame
          kind={sample.kind}
          {...numbered}
          {...(sample.kind === 'video' ? { meta: sample.duration } : {})}
          accessibleName={name}
          // A generated SVG: nothing for next/image to optimise.
          // eslint-disable-next-line @next/next/no-img-element
          media={<img src={samplePhoto(sample.picture)} alt={DECORATIVE} />}
        />
      );
  }
}

const BATCH = [
  { state: 'done', progress: 100, frameNo: 4 },
  { state: 'uploading', progress: 62 },
  { state: 'queued', progress: 0 },
] as const;

/** Uploads in progress, as `UploadBatch` shows them: the summary over the frames on their way. */
function SampleBatch() {
  const t = useTranslations('guest.upload');
  const format = useFormatter();
  const bytes = (value: number) => formatBytes(format.number, value);
  const total = BATCH.length;
  return (
    <div className="grid gap-4" data-slot="upload-batch">
      <UploadSummary
        added={1}
        total={total}
        failed={0}
        cancelled={0}
        bytesDone={7_400_000}
        bytesTotal={14_200_000}
        offline={false}
        labels={{
          added: (added, of) => t('added', { added, total: of }),
          failed: (count) => t('failedCount', { count }),
          cancelled: (count) => t('cancelled', { count }),
          bytes: (done, of) => t('bytes', { done: bytes(done), total: bytes(of) }),
          eta: (seconds) => t('eta', { minutes: Math.max(1, Math.ceil(seconds / 60)) }),
          progress: t('progress'),
          // Inert and sample: nothing to announce.
          announce: () => '',
          retryFailed: t('retryFailed'),
          cancelRest: t('cancelRest'),
          offline: t('offline'),
          retryNow: t('retryNow'),
          why: t('why'),
        }}
        onCancelRest={noop}
      />
      <FrameGrid ariaLabel={t('listLabel')}>
        {BATCH.map((frame, i) => (
          <UploadFrame
            key={i}
            state={frame.state}
            progress={frame.progress}
            preview={
              // A generated SVG: nothing for next/image to optimise.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={samplePhoto(8 + i)} alt={DECORATIVE} className="size-full object-cover" />
            }
            position={{ index: i + 1, total }}
            {...(frame.state === 'done' ? { frameNo: frame.frameNo } : {})}
            accessibleName={t('frameQueued', { index: i + 1, total })}
            labels={{
              queued: t('queued'),
              processing: t('processing'),
              done: t('done'),
              failed: t('failed'),
              retry: t('retry'),
              cancel: t('cancel', { index: i + 1, total }),
              position: (index, of) => t('position', { index, total: of }),
              percent: (value) => t('percent', { value }),
            }}
            onCancel={noop}
            className="h-full"
          />
        ))}
      </FrameGrid>
    </div>
  );
}

/** Decorative: the frame's accessible name says what it is. */
const DECORATIVE = '';
