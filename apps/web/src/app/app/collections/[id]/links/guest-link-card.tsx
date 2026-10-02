'use client';

import type { Collection, GuestLink } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { ConfirmDialog } from '@stepler/ui/components/confirm-dialog';
import { CopyField } from '@stepler/ui/components/copy-field';
import { Label } from '@stepler/ui/components/label';
import { LinkCard, LinkCardSection, LinkShare } from '@stepler/ui/components/link-card';
import { RotatingQr } from '@stepler/ui/components/qr-frame';
import { Switch } from '@stepler/ui/components/switch';
import { useToast } from '@stepler/ui/components/toast';
import { useMutation } from '@tanstack/react-query';
import { Ban, RefreshCw } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { isApiError } from '@/api/client';
import { useInvalidateCollections } from '@/api/collections';
import {
  activateGuestLink,
  deactivateGuestLink,
  revokeGuestLink,
  rotateDefaultLink,
  updateGuestLink,
} from '@/api/guest-links';
import { errorMessageKey } from '@/errors/error-message';
import {
  fromPermissions,
  isValidForm,
  type PermissionForm,
  toPermissions,
} from '@/guest-links/link-permissions';
import { PermissionFields } from '@/guest-links/permission-fields';
import { QrDownloadMenu } from '@/guest-links/qr-download-menu';
import { QrCode } from '@/qr/qr-code';
import { qrFileName } from '@/qr/qr';

// Day and month in digits: «01.10».
const SHORT_DATE = { day: '2-digit', month: '2-digit', year: 'numeric' } as const;

/** The name a guest link goes by everywhere, also the phrase its typed confirmations ask for. */
export function useLinkName(): (link: GuestLink) => string {
  const t = useTranslations('links');
  return (link) => (link.isDefault ? t('defaultTitle') : (link.label ?? t('defaultTitle')));
}

/**
 * One guest link, everything about it in one card (owner review 2026-10-02), in four parts:
 * share it (QR, link, download), what guests can do (saved explicitly), its state (a switch,
 * saved at once: pausing is reversible), and the danger zone (replace the default link, revoke
 * an additional one; both ask for the link's name to be typed).
 */
export function GuestLinkCard({
  collection,
  link,
  level,
}: {
  collection: Collection;
  link: GuestLink;
  level: 2 | 3;
}) {
  const t = useTranslations('links');
  const format = useFormatter();
  const name = useLinkName()(link);
  const paused = link.status === 'INACTIVE';
  return (
    <LinkCard
      title={name}
      level={level}
      status={paused ? 'paused' : 'active'}
      statusLabel={t(paused ? 'status.INACTIVE' : 'status.ACTIVE')}
      meta={
        link.isDefault
          ? t('defaultMeta')
          : t('createdOn', { date: format.dateTime(new Date(link.createdAt), SHORT_DATE) })
      }
    >
      <ShareSection collection={collection} link={link} name={name} />
      <PermissionsSection link={link} />
      <StateSection link={link} />
      <DangerSection collection={collection} link={link} name={name} />
    </LinkCard>
  );
}

function ShareSection({
  collection,
  link,
  name,
}: {
  collection: Collection;
  link: GuestLink;
  name: string;
}) {
  const t = useTranslations('links.share');
  const { url } = link;
  const fileBase = qrFileName(link.isDefault ? collection.title : `${collection.title} ${name}`);
  return (
    <LinkCardSection title={t('title')} description={t('description')}>
      <LinkShare
        qr={
          url === null ? null : (
            <RotatingQr rotationKey={link.id}>
              <QrCode value={url} label={t('qrLabel', { name })} size={200} />
            </RotatingQr>
          )
        }
        field={
          url === null ? (
            <Alert variant="info">{link.isDefault ? t('hidden') : t('hiddenExtra')}</Alert>
          ) : (
            <CopyField
              label={t('link')}
              value={url}
              copyLabel={t('copy')}
              copiedLabel={t('copied')}
              failedLabel={t('copyFailed')}
            />
          )
        }
        actions={url === null ? undefined : <QrDownloadMenu url={url} fileBase={fileBase} />}
      />
    </LinkCardSection>
  );
}

type PermissionsValues = { permissions: PermissionForm };

/**
 * Explicit Save, not save-on-click: guests see a change on their next request, so a half-made
 * choice (two boxes of three unticked) should never reach them; the admin sees what will change
 * and confirms it once. Save and Cancel do nothing until something changed.
 */
function PermissionsSection({ link }: { link: GuestLink }) {
  const t = useTranslations('links.permissions');
  const tRoot = useTranslations();
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const saved = useMemo(
    () => ({ permissions: fromPermissions(link.permissions) }),
    [link.permissions],
  );
  // `values` resets the form whenever the saved permissions change (after a save or a refetch).
  const form = useForm<PermissionsValues>({ values: saved });
  const save = useMutation({
    mutationFn: (values: PermissionsValues) =>
      updateGuestLink(link.id, { permissions: toPermissions(values.permissions) }),
    onSuccess: async () => {
      toast({ variant: 'success', title: t('saved') });
      await invalidate();
    },
  });
  const dirty = form.formState.isDirty;
  const failure = isApiError(save.error) ? save.error.code : null;
  const busy = save.isPending || undefined;

  return (
    <LinkCardSection title={t('title')} description={t('description')}>
      <form
        noValidate
        className="grid gap-5"
        onSubmit={(event) =>
          void form.handleSubmit((values) => {
            if (!save.isPending && dirty && isValidForm(values.permissions)) save.mutate(values);
          })(event)
        }
      >
        <Controller
          control={form.control}
          name="permissions"
          render={({ field }) => <PermissionFields value={field.value} onChange={field.onChange} />}
        />
        {failure !== null ? <Alert variant="error">{tRoot(errorMessageKey(failure))}</Alert> : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Button
            type="submit"
            className="w-full sm:w-auto"
            aria-disabled={!dirty || busy || undefined}
          >
            {save.isPending ? t('saving') : t('save')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full sm:w-auto"
            aria-disabled={!dirty || busy || undefined}
            onClick={() => {
              if (dirty && !save.isPending) {
                form.reset(saved);
                save.reset();
              }
            }}
          >
            {t('cancel')}
          </Button>
          {/* Announced politely when a change makes the form dirty. */}
          <p aria-live="polite" className="text-sm text-muted-foreground sm:ml-2">
            {dirty ? t('unsaved') : null}
          </p>
        </div>
      </form>
    </LinkCardSection>
  );
}

function StateSection({ link }: { link: GuestLink }) {
  const t = useTranslations('links.state');
  const tRoot = useTranslations();
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const paused = link.status === 'INACTIVE';
  const toggle = useMutation({
    mutationFn: (on: boolean) => (on ? activateGuestLink(link.id) : deactivateGuestLink(link.id)),
    onSuccess: async (updated) => {
      toast({
        variant: 'success',
        title: updated.status === 'INACTIVE' ? t('paused') : t('resumed'),
      });
      await invalidate();
    },
  });
  const failure = isApiError(toggle.error) ? toggle.error.code : null;
  const hintId = `link-state-hint-${link.id}`;

  return (
    <LinkCardSection title={t('title')} description={t('description')}>
      <div className="grid gap-3">
        <Label className="min-h-11 gap-3 text-base font-normal">
          <Switch
            // Shows the requested state while the request runs.
            checked={toggle.isPending ? toggle.variables : !paused}
            aria-describedby={hintId}
            aria-disabled={toggle.isPending || undefined}
            onCheckedChange={(on) => {
              if (!toggle.isPending) toggle.mutate(on);
            }}
          />
          {t('switch')}
        </Label>
        <p id={hintId} className="max-w-[60ch] text-sm text-pretty text-muted-foreground">
          {paused ? t('pausedHint') : t('activeHint')}
        </p>
        {failure !== null ? <Alert variant="error">{tRoot(errorMessageKey(failure))}</Alert> : null}
      </div>
    </LinkCardSection>
  );
}

/**
 * The irreversible actions, last and apart. The default link can only be replaced (its old token
 * is revoked), an additional link only revoked (D8, F4). Both confirm with the link's name typed.
 */
function DangerSection({
  collection,
  link,
  name,
}: {
  collection: Collection;
  link: GuestLink;
  name: string;
}) {
  const t = useTranslations('links');
  const tRoot = useTranslations();
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const [confirming, setConfirming] = useState(false);
  const paused = link.status === 'INACTIVE';
  const action = useMutation({
    mutationFn: () =>
      link.isDefault ? rotateDefaultLink(collection.id, link.id) : revokeGuestLink(link.id),
    onSuccess: async () => {
      toast({ variant: 'success', title: link.isDefault ? t('rotate.done') : t('revoke.done') });
      await invalidate();
    },
  });
  const failure = isApiError(action.error) ? action.error.code : null;
  const kind = link.isDefault ? 'rotate' : 'revoke';

  return (
    <LinkCardSection tone="danger" title={t('danger.title')} description={t(`${kind}.description`)}>
      <Button
        variant="destructive"
        className="w-full sm:w-auto"
        onClick={() => {
          action.reset();
          setConfirming(true);
        }}
      >
        {link.isDefault ? <RefreshCw aria-hidden="true" /> : <Ban aria-hidden="true" />}
        {t(`${kind}.button`)}
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        destructive
        title={t(`${kind}.confirmTitle`, { name })}
        description={
          link.isDefault && paused
            ? `${t('rotate.confirmText')} ${t('rotate.confirmPaused')}`
            : t(`${kind}.confirmText`)
        }
        confirmIcon={link.isDefault ? <RefreshCw aria-hidden="true" /> : <Ban aria-hidden="true" />}
        confirmPhrase={name}
        confirmPhraseLabel={t(`${kind}.phrase`, { name })}
        confirmLabel={t(`${kind}.confirm`)}
        cancelLabel={t('danger.cancel')}
        pendingLabel={t(`${kind}.pending`)}
        onConfirm={async () => {
          await action.mutateAsync();
        }}
        errorMessage={tRoot(errorMessageKey(failure ?? 'INTERNAL'))}
      />
    </LinkCardSection>
  );
}
