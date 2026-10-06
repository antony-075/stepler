'use client';

// Design (DESIGN-SYSTEM.md §6.6 «Поділитися», §5.15; owner review 2026-10-02: "make it clearer"):
// - The fastest path to the one thing an admin does before an event: show or send the main link.
//   The header names the dialog and says the link's state once. Then two labelled options, side
//   by side from `sm` (stacked on phones): «Покажіть QR-код» (the QR large in its white frame,
//   «Завантажити для друку (PNG)» and «SVG») and «Надішліть посилання» (the whole address in
//   Geist Mono over two lines if needed, «Копіювати посилання» and «Відкрити як гість»).
// - A paused link is the one state that makes sharing pointless: a warning strip at the top
//   with «Увімкнути» right there. A link that cannot be shown says how to replace it.
// - A «Посилання» select at the top picks which live link to share (the one it was opened for
//   first); a paused one shows the warning and its copy, download and open wait until it is on.
// - Opened from the collection page's «Дії», its empty content and a dashboard card; Escape
//   returns focus to whatever opened it.

import type { Collection, GuestLink } from '@stepler/contracts';
import { Alert, type AlertVariant } from '@stepler/ui/components/alert';
import { Badge } from '@stepler/ui/components/badge';
import { Button } from '@stepler/ui/components/button';
import { CopyButton } from '@stepler/ui/components/copy-button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@stepler/ui/components/dialog';
import { QrFrame } from '@stepler/ui/components/qr-frame';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@stepler/ui/components/select';
import { Skeleton } from '@stepler/ui/components/skeleton';
import { useToast } from '@stepler/ui/components/toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@stepler/ui/components/tooltip';
import { cn } from '@stepler/ui/lib/utils';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Copy, Download, ExternalLink, Share2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, type RefObject, useId, useState } from 'react';
import { isApiError } from '@/api/client';
import { useInvalidateCollections } from '@/api/collections';
import { CollectionCoverImage } from '../../collection-cover-image';
import { activateGuestLink, guestLinksKey, listGuestLinks } from '@/api/guest-links';
import { errorMessageKey } from '@/errors/error-message';
import { findLink, linkKey as linkKeyOf, MAIN_LINK, useLinkName } from '@/guest-links/link-pages';
import { LinkUrlBlock } from '@/guest-links/link-url-block';
import { QrCode } from '@/qr/qr-code';
import { downloadQr, type QrFileFormat, qrFileName } from '@/qr/qr';

/** «Поділитися» and its dialog. `children` is the trigger's label. */
export function ShareButton({
  collection,
  variant = 'default',
  size = 'default',
  icon = <Share2 aria-hidden="true" />,
  className,
  children,
}: {
  collection: Collection;
  /** The accent as the page's primary; outline where another primary is on the page. */
  variant?: 'default' | 'outline';
  size?: 'default' | 'sm';
  /** Decorative, before the label. */
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <ShareDialog
      collection={collection}
      trigger={
        <Button variant={variant} size={size} className={className}>
          {icon}
          {children}
        </Button>
      }
    />
  );
}

/**
 * «Поділитися» as an icon button with its name in a tooltip (the dashboard's table rows and
 * cards, owner 2026-10-06): 44px on phones and touch, 36px with a mouse; `label` is its
 * accessible name.
 */
export function ShareIconButton({
  collection,
  label,
  className,
}: {
  collection: Collection;
  label: string;
  className?: string;
}) {
  return (
    <Tooltip>
      <ShareDialog
        collection={collection}
        trigger={
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={label}
              className={cn('text-muted-foreground hover:text-foreground', className)}
            >
              <Share2 aria-hidden="true" />
            </Button>
          </TooltipTrigger>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The share dialog itself: with a `trigger`, or controlled (`open`, `onOpenChange`) when a menu
 * item opens it (the collection page's «Дії»).
 */
export function ShareDialog({
  collection,
  linkKey = MAIN_LINK,
  trigger,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  collection: Collection;
  /** Which link to share: `main` (the default) or an additional link's id. */
  linkKey?: string;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Opened from a menu item (which is gone by then): where focus goes back on close. */
  returnFocusTo?: RefObject<HTMLElement | null>;
}) {
  const t = useTranslations('share');
  return (
    <Dialog {...(open === undefined ? {} : { open })} onOpenChange={onOpenChange}>
      {trigger === undefined ? null : <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        closeLabel={t('close')}
        className="sm:max-w-[46rem]"
        {...(returnFocusTo === undefined
          ? {}
          : {
              onCloseAutoFocus: (event: Event) => {
                event.preventDefault();
                returnFocusTo.current?.focus();
              },
            })}
      >
        <ShareBody collection={collection} linkKey={linkKey} />
      </DialogContent>
    </Dialog>
  );
}

function ShareBody({ collection, linkKey }: { collection: Collection; linkKey: string }) {
  const t = useTranslations('share');
  // Loads when the dialog opens (its content mounts then), from the same cache as the tab.
  const links = useQuery({
    queryKey: guestLinksKey(collection.id),
    queryFn: () => listGuestLinks(collection.id),
  });
  const live = (links.data?.items ?? []).filter((item) => item.status !== 'REVOKED');
  const [selected, setSelected] = useState(linkKey);
  const link = links.data === undefined ? undefined : findLink(links.data.items, selected);

  return (
    <>
      {/* The collection's 44px mark beside the title [A7]: which collection is being shared. */}
      <DialogHeader className="grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3">
        <CollectionCoverImage collection={collection} size="sm" className="row-span-2" />
        <DialogTitle>{t('title')}</DialogTitle>
        <DialogDescription>{t('description')}</DialogDescription>
      </DialogHeader>
      {links.isError ? (
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
      ) : links.data === undefined ? (
        <div role="status" aria-busy="true" aria-label={t('loading')} className="grid gap-4">
          <Skeleton className="h-11 w-full rounded-control sm:w-80" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-80 rounded-sheet" />
            <Skeleton className="h-80 rounded-sheet" />
          </div>
        </div>
      ) : link === undefined ? (
        <Alert variant="info">{t('gone')}</Alert>
      ) : (
        <>
          <LinkPicker links={live} value={linkKeyOf(link)} onChange={setSelected} />
          <SharedLink key={link.id} collection={collection} link={link} />
        </>
      )}
    </>
  );
}

/**
 * Which link to share (owner 2026-10-02): a select labelled «Посилання» over the live links (the
 * main one first; a paused one says so), or the one link as plain text when there is no choice.
 */
function LinkPicker({
  links,
  value,
  onChange,
}: {
  links: readonly GuestLink[];
  value: string;
  onChange: (key: string) => void;
}) {
  const t = useTranslations('share');
  const tLinks = useTranslations('links');
  const name = useLinkName();
  const labelId = useId();
  const only = links.length === 1 ? links[0] : undefined;
  if (only !== undefined) {
    const paused = only.status === 'INACTIVE';
    const statusKey = paused ? 'status.INACTIVE' : 'status.ACTIVE';
    return (
      <p data-slot="share-link-status" className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t('picker')}</span>
        <span className="font-semibold">{name(only)}</span>
        <Badge variant={paused ? 'warning' : 'success'}>{tLinks(statusKey)}</Badge>
      </p>
    );
  }
  return (
    <div className="grid gap-2 sm:max-w-80">
      <span id={labelId} className="text-sm font-semibold">
        {t('picker')}
      </span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-labelledby={labelId} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {links.map((item) => (
              <SelectItem key={item.id} value={linkKeyOf(item)}>
                <span>{name(item)}</span>
                {item.status === 'INACTIVE' ? (
                  <span className="text-muted-foreground">{t('pausedMarker')}</span>
                ) : null}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

// A nested card inside the dialog: the sheet colour and a hairline, no shadow of its own.
const CARD = 'flex min-w-0 flex-col gap-4 rounded-sheet border bg-card p-4';

function SharedLink({ collection, link }: { collection: Collection; link: GuestLink }) {
  const t = useTranslations('share');
  const tLinks = useTranslations('links');
  const tShare = useTranslations('links.share');
  const tRoot = useTranslations();
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const qrHeading = useId();
  const linkHeading = useId();
  const fieldId = useId();
  const resume = useMutation({
    mutationFn: () => activateGuestLink(link.id),
    onSuccess: async () => {
      toast({ variant: 'success', title: tLinks('state.resumed') });
      await invalidate();
    },
  });
  const failure = isApiError(resume.error) ? resume.error.code : null;
  const alertVariant: AlertVariant = failure === null ? 'warning' : 'error';
  const linkName = useLinkName()(link);
  // The file name says which link it is («…-Основне посилання.png»).
  const fileBase = qrFileName(`${collection.title} ${linkName}`);
  // Paused, the link would only show guests «Посилання призупинене»: nothing to hand out until
  // it is turned on (the warning above says so and turns it on in place).
  const paused = link.status === 'INACTIVE';
  const inert = paused || undefined;
  const save = async (format: QrFileFormat) => {
    if (link.url === null || paused) return;
    try {
      await downloadQr(link.url, fileBase, format);
    } catch {
      toast({ variant: 'error', title: tShare('downloadFailed') });
    }
  };

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
              {t('resume')}
            </Button>
          }
        >
          {failure === null ? t('pausedNotice') : tRoot(errorMessageKey(failure))}
        </Alert>
      ) : null}
      {link.url === null ? (
        <Alert variant="info">{link.isDefault ? tShare('hidden') : tShare('hiddenExtra')}</Alert>
      ) : (
        // Two equal cards side by side from `sm` (stretched to the taller one), each a column with
        // its buttons pinned to the bottom, so the two pairs line up; stacked on phones.
        <div className="grid gap-4 sm:grid-cols-2">
          <section aria-labelledby={qrHeading} className={CARD}>
            <h3 id={qrHeading} className="type-h3">
              {t('qrTitle')}
            </h3>
            <QrFrame className="size-[180px] self-center min-[375px]:size-[200px]">
              <QrCode value={link.url} label={tShare('qrLabel', { name: linkName })} size={200} />
            </QrFrame>
            <div className="mt-auto grid gap-2">
              <Button aria-disabled={inert} onClick={() => void save('png')}>
                <Download aria-hidden="true" />
                {t('downloadPng')}
              </Button>
              <Button variant="outline" aria-disabled={inert} onClick={() => void save('svg')}>
                {t('downloadSvg')}
              </Button>
            </div>
          </section>
          <section aria-labelledby={linkHeading} className={CARD}>
            <h3 id={linkHeading} className="type-h3">
              {t('linkTitle')}
            </h3>
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <label htmlFor={fieldId} className="text-sm font-semibold">
                {tShare('link')}
              </label>
              {/* The whole address: it grows with its text (wrapping anywhere), never clipped. */}
              <LinkUrlBlock id={fieldId} value={link.url} />
            </div>
            <div className="grid gap-2">
              {paused ? (
                <Button aria-disabled="true">
                  <Copy aria-hidden="true" />
                  {t('copyLink')}
                </Button>
              ) : (
                <CopyButton
                  value={link.url}
                  variant="default"
                  copyLabel={t('copyLink')}
                  copiedLabel={tShare('copied')}
                  failedLabel={tShare('copyFailed')}
                  className="w-full [&>button]:w-full"
                />
              )}
              {paused ? (
                <Button variant="outline" aria-disabled="true">
                  <ExternalLink aria-hidden="true" />
                  {t('openAsGuest')}
                </Button>
              ) : (
                <Button asChild variant="outline">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="no-underline"
                  >
                    <ExternalLink aria-hidden="true" />
                    {t('openAsGuest')}
                    <span className="sr-only">{tShare('newTab')}</span>
                  </a>
                </Button>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
