'use client';

import type { Collection, GuestLink } from '@stepler/contracts';
import { Badge } from '@stepler/ui/components/badge';
import { Button } from '@stepler/ui/components/button';
import { CopyButton } from '@stepler/ui/components/copy-button';
import { QrFrame } from '@stepler/ui/components/qr-frame';
import { Tooltip, TooltipContent, TooltipTrigger } from '@stepler/ui/components/tooltip';
import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import { Maximize2, SlidersHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useRef } from 'react';
import { linkKey, useLinkName } from '@/guest-links/link-pages';
import { PermissionSummary } from '@/guest-links/permission-summary';
import { QrCode } from '@/qr/qr-code';
import { ShareDialog } from '../share-dialog';

/**
 * One live guest link, on the collection page (the main link) and in «Усі посилання» (owner
 * reviews 2026-10-02). The row itself is not a control: the QR thumbnail (it opens this link's
 * share dialog: the QR large with its download, the link with Copy and Open), the name with its status (never truncated), what guests can do
 * (two lines at most) and the link (one line, cut with an ellipsis; the full address is its
 * `title`) with a small copy icon right after it (a check and «Скопійовано» when done; without
 * a clipboard the address is selected). On the right one «Керувати» (`LinkActions`); on phones
 * it moves under the address.
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
      className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-x-4 p-4 sm:grid-cols-[3.5rem_minmax(0,1fr)_auto] sm:px-5"
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
          <PermissionSummary permissions={link.permissions} />
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
      <LinkActions name={name} onSettings={() => onSettings(linkKey(link))} />
    </li>
  );
}

/**
 * The row's one action (owner 2026-10-03): «Керувати» opens the link's sheet, where it is paused
 * or resumed («Стан посилання») and, for an additional link, deleted (its danger zone). The
 * status badge on the row says when it is paused. On phones it goes under the address.
 */
function LinkActions({ name, onSettings }: { name: string; onSettings: () => void }) {
  const t = useTranslations('links');
  return (
    <div
      data-slot="link-actions"
      className="col-span-2 mt-3 sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:mt-0"
    >
      {/* Every row has this button: the name in the accessible name tells them apart. */}
      <Button
        variant="outline"
        className="w-full sm:w-auto"
        aria-label={t('row.settingsName', { name })}
        onClick={onSettings}
      >
        <SlidersHorizontal aria-hidden="true" />
        {t('row.settings')}
      </Button>
    </div>
  );
}
