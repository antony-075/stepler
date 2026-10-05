'use client';

// The guest page as the editor's working copy would show it (plan Task 12, ADR 0017).
// - Driven by postMessage from the editor (`preview-protocol.ts`): it announces itself ready
//   once, then renders the last version it accepted (same origin, from the parent window only).
// - Real data the owner already sees: the collection's title, description and frame count, and
//   its 12 newest frames as a static «Усі кадри» grid (no viewer). «Ваші кадри» is the empty
//   block a first-time guest sees. The actions carry the default link's real labels and do
//   nothing; the whole page is `inert`, so nothing in it can be focused or clicked.
// - Admin endpoints only: no guest session is created and no guest API is called (lint and a
//   test check the imports).

import type {
  AdminContentItem,
  CollectionDetail,
  GuestLinkPermissions,
  GuestPageVersion,
} from '@stepler/contracts';
import { Frame } from '@stepler/ui/components/frame';
import { FrameGrid } from '@stepler/ui/components/frame-grid';
import { GuestTemplateRoot, type TemplateSlots } from '@stepler/templates/react';
import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { collectionKey, fetchCollection } from '@/api/collections';
import { listContent } from '@/api/content';
import { fromAdminImage } from '@/guest/guest-cover';
import { staticSlots } from '@/guest/static-slots';
import { fontVariables } from '@/guest/template-fonts';
import { buildGuestActions } from '@/guest/template-model';
import { acceptPreviewMessage, previewReadyMessage } from '@/guest-page/preview-protocol';

/** A link that takes everything: the preview's labels when the default link is not known. */
const ALL: GuestLinkPermissions = {
  canUploadPhotos: true,
  canUploadVideos: true,
  canUploadDocuments: false,
  canSubmitText: true,
  canViewGallery: true,
  canDeleteOwn: true,
};

const FRAMES = 12;
const PLACEHOLDERS = 6;

const noop = () => {};

export function PreviewClient({ collectionId }: { collectionId: string }) {
  const t = useTranslations('guestPage.preview');
  const [page, setPage] = useState<GuestPageVersion | null>(null);

  useEffect(() => {
    // Not framed: nothing will ever post a page here.
    if (window.parent === window) return;
    const parent = window.parent;
    const onMessage = (event: MessageEvent) => {
      const next = acceptPreviewMessage(event, parent);
      if (next !== null) setPage(next);
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
  const frames = useQuery({
    queryKey: ['guest-page-preview', collectionId, 'frames'],
    queryFn: () => listContent(collectionId, { sort: 'newest', limit: FRAMES }),
    retry: false,
  });

  if (collection.isError) {
    return (
      <main className="grid min-h-svh place-items-center bg-background p-6 text-center">
        <p className="max-w-[40ch] text-muted-foreground">{t('unavailable')}</p>
      </main>
    );
  }
  if (page === null || collection.data === undefined) {
    // Neutral, so a dark template does not flash over a light page.
    return <div aria-busy="true" className="min-h-svh bg-background" />;
  }
  return (
    <PreviewPage
      collection={collection.data}
      page={page}
      items={frames.data?.items.slice(0, FRAMES) ?? []}
    />
  );
}

function PreviewPage({
  collection,
  page,
  items,
}: {
  collection: CollectionDetail;
  page: GuestPageVersion;
  items: AdminContentItem[];
}) {
  const t = useTranslations('guest');
  const tPreview = useTranslations('guestPage.preview');
  const format = useFormatter();
  const permissions = collection.defaultLinkPermissions ?? ALL;
  const actions = buildGuestActions(
    permissions,
    { t: (key) => t(key), batchStarted: false },
    { onFiles: noop, onWrite: noop },
    null,
  );
  const slots: TemplateSlots = {
    ...staticSlots(),
    ownFrames:
      actions === null ? null : (
        <section aria-labelledby="preview-own-title" className="grid gap-4">
          <h2 id="preview-own-title" className="type-h2">
            {t('ownTitle')}
          </h2>
          <p className="rounded-sheet border border-dashed border-input px-4 py-6 text-center text-sm text-muted-foreground">
            {t('ownEmpty')}
          </p>
        </section>
      ),
    allFrames: (
      <section aria-labelledby="preview-all-title" className="grid gap-4">
        <h2 id="preview-all-title" className="type-h2">
          {t('allTitle')}
        </h2>
        <FrameGrid ariaLabel={t('listLabelAll')}>
          {items.length === 0
            ? Array.from({ length: PLACEHOLDERS }, (_, i) => (
                <Frame
                  key={i}
                  kind="pending-preview"
                  accessibleName={tPreview('placeholder')}
                  placeholderLabel=""
                />
              ))
            : items.map((item) => <PreviewFrame key={item.id} item={item} />)}
        </FrameGrid>
      </section>
    ),
  };
  return (
    <GuestTemplateRoot
      templateId={page.templateId}
      templateVersion={page.templateVersion}
      settings={page.settings}
      fontClassName={fontVariables}
      model={{
        title: collection.title,
        description: collection.description,
        welcomeMessage: page.welcomeMessage,
        countsLabel:
          collection.contentCount === 0 ? null : t('counts', { count: collection.contentCount }),
        lastAddedLabel:
          collection.lastContentAt === null
            ? null
            : t('lastAt', {
                time: format.dateTime(new Date(collection.lastContentAt), {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              }),
        cover: fromAdminImage(page.cover),
        background: fromAdminImage(page.background),
        phase: 'first-visit',
      }}
      actions={actions}
      slots={slots}
      inert
    />
  );
}

/** One of the newest frames, as a guest of the shared gallery sees it: no number, no name. */
function PreviewFrame({ item }: { item: AdminContentItem }) {
  const t = useTranslations('guestPage.preview');
  const name = t('frame');
  if (item.kind === 'TEXT') {
    return <Frame kind="text" text={item.text ?? ''} accessibleName={name} />;
  }
  if (item.thumbnailUrl === null) {
    return <Frame kind="pending-preview" placeholderLabel="" accessibleName={name} />;
  }
  return (
    <Frame
      kind={item.kind === 'VIDEO' ? 'video' : item.kind === 'DOCUMENT' ? 'document' : 'photo'}
      accessibleName={name}
      // A presigned thumbnail: nothing for next/image to optimise.
      // eslint-disable-next-line @next/next/no-img-element
      media={<img src={item.thumbnailUrl} alt={DECORATIVE} loading="lazy" decoding="async" />}
    />
  );
}

/** Decorative: the frame's accessible name says what it is. */
const DECORATIVE = '';
