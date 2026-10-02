'use client';

import type { Collection, GuestLink } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { ConfirmDialog } from '@stepler/ui/components/confirm-dialog';
import { CopyField } from '@stepler/ui/components/copy-field';
import { LinkPanel, RotatingQr } from '@stepler/ui/components/link-panel';
import { useToast } from '@stepler/ui/components/toast';
import { useMutation } from '@tanstack/react-query';
import { Pause, Play, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { isApiError } from '@/api/client';
import { useInvalidateCollections } from '@/api/collections';
import { activateGuestLink, deactivateGuestLink, rotateDefaultLink } from '@/api/guest-links';
import { errorMessageKey } from '@/errors/error-message';
import { permissionWords } from '@/guest-links/link-permissions';
import { QrDownloadMenu } from '@/guest-links/qr-download-menu';
import { QrCode } from '@/qr/qr-code';
import { qrFileName } from '@/qr/qr';
import { LinkDialog } from './link-dialog';

/**
 * The collection's default link (DESIGN-SYSTEM.md §6.7): QR, link, what guests can do, and its
 * four actions. Pausing is reversible, so it just happens (toast); replacing the link kills the
 * old one and every printed QR, so it asks first and says so (and, for a paused link, that the new
 * one stays paused, G7). A link whose URL cannot be shown keeps every action but the download and
 * says how to get it back: replace it.
 */
export function DefaultLink({ collection, link }: { collection: Collection; link: GuestLink }) {
  const t = useTranslations('access');
  const tWords = useTranslations('guestLinks.permissions');
  const tRoot = useTranslations();
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const [editing, setEditing] = useState(false);
  const [confirmingRotate, setConfirmingRotate] = useState(false);
  const paused = link.status === 'INACTIVE';
  const title = t('defaultTitle');

  const toggle = useMutation({
    mutationFn: () => (paused ? activateGuestLink(link.id) : deactivateGuestLink(link.id)),
    onSuccess: async (updated) => {
      toast({
        variant: 'success',
        title: updated.status === 'INACTIVE' ? t('pausedToast') : t('resumedToast'),
      });
      await invalidate();
    },
  });
  const rotate = useMutation({
    mutationFn: () => rotateDefaultLink(collection.id, link.id),
    onSuccess: async () => {
      toast({ variant: 'success', title: t('rotatedToast') });
      await invalidate();
    },
  });

  const toggleFailure = isApiError(toggle.error) ? toggle.error.code : null;
  const rotateFailure = isApiError(rotate.error) ? rotate.error.code : null;

  return (
    <>
      <LinkPanel
        title={title}
        status={paused ? 'paused' : 'active'}
        statusLabel={t(paused ? 'status.INACTIVE' : 'status.ACTIVE')}
        qr={
          link.url === null ? null : (
            <RotatingQr rotationKey={link.id}>
              <QrCode value={link.url} label={t('qrLabel', { label: title })} size={200} />
            </RotatingQr>
          )
        }
        copyField={
          link.url === null ? null : (
            <CopyField
              label={t('linkLabel')}
              value={link.url}
              copyLabel={t('copy')}
              copiedLabel={t('copied')}
              failedLabel={t('copyFailed')}
            />
          )
        }
        permissionsSummary={permissionWords(link.permissions, tWords)}
        notice={
          toggleFailure !== null ? (
            <Alert variant="error">{tRoot(errorMessageKey(toggleFailure))}</Alert>
          ) : link.url === null ? (
            <Alert variant="info">{t('hiddenNotice')}</Alert>
          ) : paused ? (
            <Alert variant="warning">{t('pausedNotice')}</Alert>
          ) : undefined
        }
        actions={
          <>
            {link.url === null ? null : (
              <QrDownloadMenu
                url={link.url}
                fileBase={qrFileName(collection.title)}
                variant="default"
              />
            )}
            <Button variant="outline" onClick={() => setEditing(true)}>
              <SlidersHorizontal aria-hidden="true" />
              {t('changeAccess')}
            </Button>
            <Button
              variant="outline"
              aria-disabled={toggle.isPending || undefined}
              onClick={() => {
                if (!toggle.isPending) toggle.mutate();
              }}
            >
              {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
              {paused ? t('resume') : t('pause')}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                rotate.reset();
                setConfirmingRotate(true);
              }}
            >
              <RefreshCw aria-hidden="true" />
              {t('rotate')}
            </Button>
          </>
        }
      />
      <LinkDialog open={editing} onOpenChange={setEditing} mode={{ kind: 'edit', link }} />
      <ConfirmDialog
        open={confirmingRotate}
        onOpenChange={setConfirmingRotate}
        title={t('rotateConfirmTitle')}
        description={
          paused ? `${t('rotateConfirmText')} ${t('rotateConfirmPaused')}` : t('rotateConfirmText')
        }
        confirmLabel={t('rotateConfirm')}
        cancelLabel={t('cancel')}
        pendingLabel={t('rotatePending')}
        onConfirm={async () => {
          await rotate.mutateAsync();
        }}
        errorMessage={tRoot(errorMessageKey(rotateFailure ?? 'INTERNAL'))}
      />
    </>
  );
}
