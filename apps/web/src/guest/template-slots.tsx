'use client';

// The app's pieces a guest page template places (plan Task 4, ADR 0017): the frames sections with
// their headings, the name line and «Оновити», the brand, the language switch, the terms notice
// and the footer. Templates get them as ReactNode slots and never import app code.
// Moved unchanged from guest-page.tsx; the design notes there and in the classic template apply.

import type { GuestContext } from '@stepler/contracts';
import { Button } from '@stepler/ui/components/button';
import { EmptyState } from '@stepler/ui/components/empty-state';
import { cn } from '@stepler/ui/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { GuestFrames, guestContentKey } from './own-frames';

type Call = <T>(fn: (collectionId: string) => Promise<T>) => Promise<T>;

/**
 * «Ваші кадри»: this browser's frames (this visit's uploads among them, previews as the worker
 * makes them) and who the guest is to the organiser. Contribution-only links say who will see
 * the frames.
 */
export function OwnFramesSection({
  context,
  collectionId,
  call,
  onRename,
  onDeleted,
  onHasItems,
}: {
  context: GuestContext;
  collectionId: string;
  call: Call;
  onRename: () => void;
  onDeleted: () => void;
  onHasItems: (hasItems: boolean) => void;
}) {
  const t = useTranslations('guest');
  const { permissions, guest } = context;
  return (
    <section aria-labelledby="own-title" data-slot="guest-own-frames" className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="grid gap-1">
          <h2 id="own-title" className="type-h2">
            {t('ownTitle')}
          </h2>
          {permissions.canViewGallery ? null : (
            <p className="text-sm text-muted-foreground">{t('onlyOrganizer')}</p>
          )}
        </div>
        {guest.nameAnswered ? <GuestNameLine name={guest.name} onChange={onRename} /> : null}
      </div>
      <GuestFrames
        collectionId={collectionId}
        scope="own"
        call={call}
        label={t('listLabelOwn')}
        onDeleted={onDeleted}
        onHasItems={onHasItems}
        empty={
          <p className="rounded-sheet border border-dashed border-input px-4 py-6 text-center text-sm text-muted-foreground">
            {t('ownEmpty')}
          </p>
        }
      />
    </section>
  );
}

/** «Усі кадри»: everyone's frames, with «Оновити» beside the title (never polled). */
export function AllFramesSection({
  collectionId,
  call,
  onRefresh,
}: {
  collectionId: string;
  call: Call;
  /** Asks for the header's counts again (a refresh, or a deleted frame). */
  onRefresh: () => void;
}) {
  const t = useTranslations('guest');
  return (
    <section aria-labelledby="all-title" data-slot="guest-all-frames" className="grid gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 id="all-title" className="type-h2">
          {t('allTitle')}
        </h2>
        <RefreshGallery collectionId={collectionId} onRefresh={onRefresh} />
      </div>
      <GuestFrames
        collectionId={collectionId}
        scope="all"
        call={call}
        label={t('listLabelAll')}
        onDeleted={onRefresh}
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
  );
}

/**
 * «Оновити» for the shared gallery (owner, PR E: never polled): everyone's frames from the first
 * page, and the header's counts. The icon spins meanwhile; «Оновлено» is announced when done.
 */
function RefreshGallery({
  collectionId,
  onRefresh,
}: {
  collectionId: string;
  onRefresh: () => void;
}) {
  const t = useTranslations('guest');
  const queryClient = useQueryClient();
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  async function refresh() {
    if (state === 'busy') return;
    setState('busy');
    onRefresh();
    try {
      await queryClient.refetchQueries({ queryKey: guestContentKey(collectionId, 'all') });
    } finally {
      setState('done');
    }
  }
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        aria-disabled={state === 'busy' || undefined}
        onClick={() => void refresh()}
        className="shrink-0 pointer-coarse:h-11"
      >
        <RefreshCw
          aria-hidden="true"
          className={cn(
            'size-4',
            state === 'busy' && 'motion-safe:animate-spin motion-safe:[animation-duration:900ms]',
          )}
        />
        {t('refresh')}
      </Button>
      <p role="status" className="sr-only">
        {state === 'done' ? t('refreshed') : null}
      </p>
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
