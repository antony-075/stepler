'use client';

import type { Collection, GuestLink } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { ConfirmDialog } from '@stepler/ui/components/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@stepler/ui/components/dropdown-menu';
import { LinkRow } from '@stepler/ui/components/link-row';
import { useToast } from '@stepler/ui/components/toast';
import { useMutation } from '@tanstack/react-query';
import { Ban, Copy, Download, Ellipsis, Pause, Play, Plus, SlidersHorizontal } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { isApiError } from '@/api/client';
import { useInvalidateCollections } from '@/api/collections';
import { activateGuestLink, deactivateGuestLink, revokeGuestLink } from '@/api/guest-links';
import { errorMessageKey } from '@/errors/error-message';
import { permissionWords } from '@/guest-links/link-permissions';
import { QrCode } from '@/qr/qr-code';
import { downloadQr, qrFileName } from '@/qr/qr';
import { LinkDialog } from './link-dialog';

// Day and month in digits (data, so Geist Mono): «01.10».
const ROW_DATE = { day: '2-digit', month: '2-digit' } as const;

/**
 * Additional links (DESIGN-SYSTEM.md §6.7, G8): a list of `LinkRow`s with a `⋯` menu each, the
 * «Нове посилання» button, and revoked links kept as struck-through records. Revoking is
 * permanent, so it goes through a destructive ConfirmDialog that says it cannot be undone.
 */
export function OtherLinks({ collection, links }: { collection: Collection; links: GuestLink[] }) {
  const t = useTranslations('access');
  const tRoot = useTranslations();
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<GuestLink | null>(null);
  const [revoking, setRevoking] = useState<GuestLink | null>(null);

  const toggle = useMutation({
    mutationFn: (link: GuestLink) =>
      link.status === 'INACTIVE' ? activateGuestLink(link.id) : deactivateGuestLink(link.id),
    onSuccess: async (updated) => {
      toast({
        variant: 'success',
        title: updated.status === 'INACTIVE' ? t('pausedToast') : t('resumedToast'),
      });
      await invalidate();
    },
  });
  const revoke = useMutation({
    mutationFn: (link: GuestLink) => revokeGuestLink(link.id),
    onSuccess: async () => {
      toast({ variant: 'success', title: t('revokedToast') });
      await invalidate();
    },
  });

  const toggleFailure = isApiError(toggle.error) ? toggle.error.code : null;
  // Additional links always have a label; the fallback only keeps the type honest.
  const revokingLabel = revoking?.label ?? t('defaultTitle');
  const revokeFailure = isApiError(revoke.error) ? revoke.error.code : null;

  return (
    <section aria-labelledby="other-links" className="grid gap-3">
      <div className="grid gap-3 sm:flex sm:items-center sm:justify-between">
        <h2 id="other-links" className="type-h3">
          {t('others')}
        </h2>
        <Button variant="outline" className="w-full sm:w-auto" onClick={() => setCreating(true)}>
          <Plus aria-hidden="true" />
          {t('newLink')}
        </Button>
      </div>
      {toggleFailure !== null ? (
        <Alert variant="error">{tRoot(errorMessageKey(toggleFailure))}</Alert>
      ) : null}
      {links.length === 0 ? (
        <p className="max-w-[60ch] text-pretty text-muted-foreground">{t('othersEmpty')}</p>
      ) : (
        <ul className="divide-y rounded-sheet border bg-card px-4 sm:px-5">
          {links.map((link) => (
            <li key={link.id}>
              <OtherLinkRow
                collection={collection}
                link={link}
                pending={toggle.isPending}
                onToggle={() => {
                  if (!toggle.isPending) toggle.mutate(link);
                }}
                onEdit={() => setEditing(link)}
                onRevoke={() => {
                  revoke.reset();
                  setRevoking(link);
                }}
              />
            </li>
          ))}
        </ul>
      )}
      <LinkDialog
        open={creating}
        onOpenChange={setCreating}
        mode={{ kind: 'create', collectionId: collection.id }}
      />
      {editing === null ? null : (
        <LinkDialog
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          mode={{ kind: 'edit', link: editing }}
        />
      )}
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null);
        }}
        destructive
        title={t('revokeConfirmTitle', { label: revokingLabel })}
        description={t('revokeConfirmText')}
        confirmLabel={t('revoke')}
        cancelLabel={t('cancel')}
        pendingLabel={t('revokePending')}
        onConfirm={async () => {
          if (revoking !== null) await revoke.mutateAsync(revoking);
        }}
        errorMessage={tRoot(errorMessageKey(revokeFailure ?? 'INTERNAL'))}
      />
    </section>
  );
}

function OtherLinkRow({
  collection,
  link,
  pending,
  onToggle,
  onEdit,
  onRevoke,
}: {
  collection: Collection;
  link: GuestLink;
  pending: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onRevoke: () => void;
}) {
  const t = useTranslations('access');
  const tWords = useTranslations('guestLinks.permissions');
  const format = useFormatter();
  const { toast } = useToast();
  const label = link.label ?? t('defaultTitle');
  const revoked = link.status === 'REVOKED';
  const paused = link.status === 'INACTIVE';
  const { url } = link;

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ variant: 'success', title: t('copiedToast') });
    } catch {
      toast({ variant: 'error', title: t('copyFailedToast') });
    }
  };
  const download = async (value: string) => {
    try {
      await downloadQr(value, qrFileName(`${collection.title} ${label}`), 'png');
    } catch {
      toast({ variant: 'error', title: t('downloadFailed') });
    }
  };

  return (
    <LinkRow
      label={label}
      permissionsSummary={
        url === null && !revoked ? t('hiddenRowNotice') : permissionWords(link.permissions, tWords)
      }
      status={revoked ? 'revoked' : paused ? 'paused' : 'active'}
      statusLabel={
        revoked
          ? t('revokedOn', {
              date: format.dateTime(new Date(link.revokedAt ?? link.updatedAt), ROW_DATE),
            })
          : t(paused ? 'status.INACTIVE' : 'status.ACTIVE')
      }
      date={format.dateTime(new Date(link.createdAt), ROW_DATE)}
      qr={
        url === null ? undefined : <QrCode value={url} label={t('qrLabel', { label })} size={44} />
      }
      menu={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t('rowActions', { label })}>
              <Ellipsis aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {url === null ? null : (
              <>
                <DropdownMenuItem onSelect={() => void copy(url)}>
                  <Copy aria-hidden="true" />
                  {t('copyLink')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void download(url)}>
                  <Download aria-hidden="true" />
                  {t('downloadQr')}
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem onSelect={onEdit}>
              <SlidersHorizontal aria-hidden="true" />
              {t('changeAccess')}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={pending} onSelect={onToggle}>
              {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
              {paused ? t('resume') : t('pause')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onRevoke}>
              <Ban aria-hidden="true" />
              {t('revoke')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    />
  );
}
