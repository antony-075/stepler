'use client';

import type { Collection, GuestLink } from '@stepler/contracts';
import { Badge } from '@stepler/ui/components/badge';
import { Button } from '@stepler/ui/components/button';
import { ConfirmDialog } from '@stepler/ui/components/confirm-dialog';
import { CopyButton } from '@stepler/ui/components/copy-button';
import { QrFrame } from '@stepler/ui/components/qr-frame';
import { useToast } from '@stepler/ui/components/toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@stepler/ui/components/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@stepler/ui/components/dropdown-menu';
import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import { Ellipsis, Maximize2, Pause, Play, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';
import { isApiError } from '@/api/client';
import { useInvalidateCollections } from '@/api/collections';
import { activateGuestLink, deactivateGuestLink, deleteGuestLink } from '@/api/guest-links';
import { errorMessageKey } from '@/errors/error-message';
import { linkKey, useLinkName } from '@/guest-links/link-pages';
import { permissionWords } from '@/guest-links/link-permissions';
import { QrCode } from '@/qr/qr-code';
import { ShareDialog } from '../share-dialog';

/**
 * One live guest link, on the collection page (the main link) and in «Усі посилання» (owner
 * reviews 2026-10-02). The row itself is not a control: the QR thumbnail (it opens this link's
 * share dialog: the QR large with its download, the link with Copy and Open), the name with its status (never truncated), what guests can do
 * (two lines at most) and the link (one line, cut with an ellipsis; the full address is its
 * `title`) with a small copy icon right after it (a check and «Скопійовано» when done; without
 * a clipboard the address is selected). One «⋯» top right holds the rest: «Керувати» (the
 * link's settings), «Призупинити / Увімкнути» and, for an additional link, «Видалити». The same three columns at every width, so nothing squeezes in a narrow sheet.
 */
export function LinkListRow({
  collection,
  link,
  level = 3,
  onSettings,
}: {
  collection: Collection;
  link: GuestLink;
  /** The name's heading level (3 under the tab's section headings). */
  level?: 3 | 4;
  /** Opens the settings sheet for this link (`main` or its id). */
  onSettings: (key: string) => void;
}) {
  const t = useTranslations('links');
  const tShare = useTranslations('links.share');
  const tWords = useTranslations('guestLinks.permissions');
  const format = useFormatter();
  const name = useLinkName()(link);
  const paused = link.status === 'INACTIVE';
  const statusKey = paused ? 'status.INACTIVE' : 'status.ACTIVE';
  const qrLabel = t('row.showQr', { name });
  const Heading = level === 3 ? 'h3' : 'h4';
  const urlRef = useRef<HTMLParagraphElement>(null);
  // Without a clipboard, select the address for a manual copy (as `CopyField` does).
  const selectUrl = useCallback(() => {
    const node = urlRef.current;
    const selection = window.getSelection();
    if (node === null || selection === null) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
  }, []);
  return (
    <li
      data-slot="link-list-row"
      className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-start gap-x-4 p-4 sm:px-5"
    >
      {link.url === null ? (
        <QrFrame className="size-14 p-1" />
      ) : (
        // The only way into this link's share dialog (owner 2026-10-02: one way to share): it
        // looks like a control at rest, an expand badge in the corner, the edge turns ink and the
        // frame lifts on hover and focus.
        <ShareDialog
          collection={collection}
          linkKey={linkKey(link)}
          trigger={
            <button
              type="button"
              aria-label={qrLabel}
              className={cn(
                'group/qr relative cursor-pointer rounded-frame transition-transform duration-(--duration-fast) hover:-translate-y-px motion-reduce:transition-none motion-reduce:hover:translate-y-0',
                focusRing,
              )}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="block">
                    <QrFrame className="size-14 p-1 transition-[border-color,box-shadow] duration-(--duration-fast) group-hover/qr:border-foreground group-hover/qr:shadow-card-hover group-focus-visible/qr:border-foreground motion-reduce:transition-none">
                      <QrCode value={link.url} label={tShare('qrLabel', { name })} size={48} />
                    </QrFrame>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{qrLabel}</TooltipContent>
              </Tooltip>
              <span
                aria-hidden="true"
                className="absolute -right-1.5 -bottom-1.5 grid size-5 place-items-center rounded-full border bg-card text-foreground shadow-card"
              >
                <Maximize2 className="size-3" />
              </span>
            </button>
          }
        />
      )}
      <div className="grid min-w-0 gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <Heading className="min-w-0 font-semibold [overflow-wrap:anywhere]">{name}</Heading>
          <Badge variant={paused ? 'warning' : 'success'} className="max-w-none shrink-0">
            {t(statusKey)}
          </Badge>
        </div>
        <p className="line-clamp-2 text-sm text-pretty text-muted-foreground">
          {permissionWords(link.permissions, tWords, (words) => format.list(words))}
        </p>
        {link.url === null ? (
          <p className="text-sm text-muted-foreground">{t('row.hidden')}</p>
        ) : (
          <div className="-my-1.5 flex min-w-0 items-center gap-1">
            <p
              ref={urlRef}
              className="type-data min-w-0 truncate text-muted-foreground"
              title={link.url}
              translate="no"
            >
              {link.url}
            </p>
            <CopyButton
              iconOnly
              value={link.url}
              copyLabel={t('row.copyLink')}
              copiedLabel={tShare('copied')}
              failedLabel={t('row.copyFailed')}
              onFail={selectUrl}
              className="shrink-0"
            />
          </div>
        )}
      </div>
      <LinkMenu link={link} name={name} onSettings={() => onSettings(linkKey(link))} />
    </li>
  );
}

/**
 * «⋯» (owner 2026-10-02): pause or turn the link back on (saved at once; the toast takes the
 * colour of the new state, a failure is an error toast) and, for an additional link, delete it
 * (destructive, the name typed to confirm). Replacing the main link stays inside «Керувати».
 * Focus returns to the trigger after the dialog.
 */
function LinkMenu({
  link,
  name,
  onSettings,
}: {
  link: GuestLink;
  name: string;
  onSettings: () => void;
}) {
  const t = useTranslations('links');
  const tRoot = useTranslations();
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const [confirming, setConfirming] = useState(false);
  const paused = link.status === 'INACTIVE';
  const toggle = useMutation({
    mutationFn: () => (paused ? activateGuestLink(link.id) : deactivateGuestLink(link.id)),
    onSuccess: async (updated) => {
      const nowPaused = updated.status === 'INACTIVE';
      toast({
        variant: nowPaused ? 'warning' : 'success',
        title: nowPaused ? t('state.paused') : t('state.resumed'),
      });
      await invalidate();
    },
    onError: (error) =>
      toast({
        variant: 'error',
        title: tRoot(errorMessageKey(isApiError(error) ? error.code : 'INTERNAL')),
      }),
  });
  const remove = useMutation({
    mutationFn: () => deleteGuestLink(link.id),
    onSuccess: async () => {
      toast({ variant: 'info', title: t('delete.done') });
      await invalidate();
    },
  });
  const failure = isApiError(remove.error) ? remove.error.code : null;
  const label = t('row.menu', { name });
  const failureMessage = tRoot(errorMessageKey(failure ?? 'INTERNAL'));
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={label}
            title={label}
            className="-mt-1.5 -mr-2 text-muted-foreground hover:text-foreground"
          >
            <Ellipsis aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem onSelect={onSettings}>
            <SlidersHorizontal aria-hidden="true" />
            {t('row.settings')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={toggle.isPending}
            onSelect={() => {
              if (!toggle.isPending) toggle.mutate();
            }}
          >
            {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
            {paused ? t('row.resume') : t('row.pause')}
          </DropdownMenuItem>
          {link.isDefault ? null : (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => {
                  remove.reset();
                  setConfirming(true);
                }}
              >
                <Trash2 aria-hidden="true" />
                {t('delete.button')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {link.isDefault ? null : (
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          destructive
          title={t('delete.confirmTitle', { name })}
          description={t('delete.confirmText')}
          confirmPhrase={name}
          confirmPhraseLabel={t('delete.phrase', { name })}
          confirmLabel={t('delete.confirm')}
          cancelLabel={t('danger.cancel')}
          pendingLabel={t('delete.pending')}
          onConfirm={async () => {
            await remove.mutateAsync();
          }}
          errorMessage={failureMessage}
        />
      )}
    </>
  );
}
