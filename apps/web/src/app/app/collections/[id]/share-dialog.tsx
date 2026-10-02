'use client';

// Design (DESIGN-SYSTEM.md §6.6 «Поділитися», §5.15; plan Task 10):
// - The fastest path to the one thing an admin does before an event: show or send the link.
//   The dialog holds only that: the QR (200px, the white frame, light in dark mode), the link with
//   Copy, «Завантажити QR ▾», and a way to everything else («Усі посилання» → the Links tab).
// - At 320px it is the full-width dialog: QR centred, the field and its button stacked
//   (CopyField below 22rem), the download and close buttons full width; nothing scrolls sideways.
// - A paused link is the one state that makes sharing pointless, so it is a warning Alert at the
//   top with «Відновити» right there; a link that cannot be shown says how to replace it.
// - Opened from the header («Поділитися», ink) and from the empty content sheet; each has its own
//   trigger, so Escape returns focus to the button that opened it.

import type { Collection, GuestLink } from '@stepler/contracts';
import { Alert, type AlertVariant } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { CopyField } from '@stepler/ui/components/copy-field';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@stepler/ui/components/dialog';
import { QrFrame } from '@stepler/ui/components/qr-frame';
import { Skeleton } from '@stepler/ui/components/skeleton';
import { useToast } from '@stepler/ui/components/toast';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Share2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { isApiError } from '@/api/client';
import { useInvalidateCollections } from '@/api/collections';
import { activateGuestLink, guestLinksKey, listGuestLinks } from '@/api/guest-links';
import { errorMessageKey } from '@/errors/error-message';
import { QrDownloadMenu } from '@/guest-links/qr-download-menu';
import { QrCode } from '@/qr/qr-code';
import { qrFileName } from '@/qr/qr';

/** «Поділитися» and its dialog. `children` is the trigger's label. */
export function ShareButton({
  collection,
  variant = 'default',
  className,
  children,
}: {
  collection: Collection;
  /** Ink in the header; outline where another primary is on the page. */
  variant?: 'default' | 'outline';
  className?: string;
  children: ReactNode;
}) {
  const t = useTranslations('share');
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant={variant} className={className}>
          <Share2 aria-hidden="true" />
          {children}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={t('close')}>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <ShareBody collection={collection} />
      </DialogContent>
    </Dialog>
  );
}

function ShareBody({ collection }: { collection: Collection }) {
  const t = useTranslations('share');
  const links = useQuery({
    queryKey: guestLinksKey(collection.id),
    queryFn: () => listGuestLinks(collection.id),
  });

  if (links.isError) {
    return (
      <Alert
        variant="error"
        action={
          <Button variant="outline" onClick={() => void links.refetch()}>
            {t('retry')}
          </Button>
        }
      >
        {t('loadFailed')}
      </Alert>
    );
  }
  const link = links.data?.items.find((item) => item.isDefault && item.status !== 'REVOKED');
  if (links.data === undefined || link === undefined) {
    return (
      <div role="status" aria-busy="true" aria-label={t('loading')} className="grid gap-4">
        <Skeleton className="size-[180px] justify-self-center rounded-frame min-[375px]:size-[200px]" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }
  return <SharedLink collection={collection} link={link} />;
}

function SharedLink({ collection, link }: { collection: Collection; link: GuestLink }) {
  const t = useTranslations('share');
  const tLinks = useTranslations('links');
  const tShare = useTranslations('links.share');
  const tRoot = useTranslations();
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const resume = useMutation({
    mutationFn: () => activateGuestLink(link.id),
    onSuccess: async () => {
      toast({ variant: 'success', title: tLinks('state.resumed') });
      await invalidate();
    },
  });
  const failure = isApiError(resume.error) ? resume.error.code : null;
  const title = tLinks('defaultTitle');
  const alertVariant: AlertVariant = failure === null ? 'warning' : 'error';

  return (
    <div className="grid min-w-0 gap-5">
      {link.status === 'INACTIVE' ? (
        <Alert
          variant={alertVariant}
          action={
            <Button
              variant="outline"
              aria-disabled={resume.isPending || undefined}
              onClick={() => {
                if (!resume.isPending) resume.mutate();
              }}
            >
              {tShare('resume')}
            </Button>
          }
        >
          {failure === null ? t('pausedNotice') : tRoot(errorMessageKey(failure))}
        </Alert>
      ) : null}
      {link.url === null ? (
        <Alert variant="info">{tShare('hidden')}</Alert>
      ) : (
        <>
          <QrFrame className="size-[180px] justify-self-center min-[375px]:size-[200px]">
            <QrCode value={link.url} label={tShare('qrLabel', { name: title })} size={200} />
          </QrFrame>
          <CopyField
            label={tShare('link')}
            value={link.url}
            copyLabel={tShare('copy')}
            copiedLabel={tShare('copied')}
            failedLabel={tShare('copyFailed')}
          />
        </>
      )}
      <DialogFooter className="sm:justify-between">
        <Button asChild variant="ghost">
          <Link href={`/app/collections/${collection.id}/links`} className="no-underline">
            {t('manage')}
          </Link>
        </Button>
        {link.url === null ? null : (
          <QrDownloadMenu url={link.url} fileBase={qrFileName(collection.title)} />
        )}
      </DialogFooter>
    </div>
  );
}
