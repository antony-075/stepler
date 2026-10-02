'use client';

import type { Collection, GuestLink } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Badge } from '@stepler/ui/components/badge';
import { Button } from '@stepler/ui/components/button';
import { ConfirmDialog } from '@stepler/ui/components/confirm-dialog';
import { CopyField } from '@stepler/ui/components/copy-field';
import { Label } from '@stepler/ui/components/label';
import { LinkCard, LinkCardDangerAction, LinkCardSection } from '@stepler/ui/components/link-card';
import { RotatingQr } from '@stepler/ui/components/qr-frame';
import { Switch } from '@stepler/ui/components/switch';
import { useToast } from '@stepler/ui/components/toast';
import { UnsavedBar } from '@stepler/ui/components/unsaved-bar';
import { useMutation } from '@tanstack/react-query';
import { Ban, RefreshCw, Trash2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { isApiError } from '@/api/client';
import { useInvalidateCollections } from '@/api/collections';
import {
  activateGuestLink,
  deactivateGuestLink,
  deleteGuestLink,
  revokeGuestLink,
  rotateDefaultLink,
  updateGuestLink,
} from '@/api/guest-links';
import { useLeaveGuard } from '@/components/use-leave-guard';
import { errorMessageKey } from '@/errors/error-message';
import {
  fromPermissions,
  isValidForm,
  type PermissionForm,
  permissionWords,
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
 * One guest link as an accordion card (owner review 2026-10-02). Always visible: the QR, name,
 * status, what guests can do in words, the link with Copy and Download QR. «Керувати» opens what
 * guests can do (saved explicitly), its state (a switch, saved at once: pausing is reversible)
 * and the danger zone (replace the main link; revoke or delete an additional one; each asks for
 * the link's name to be typed). Unsaved permission edits are flagged in the header too, so a
 * closed card still says so.
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
  const tShare = useTranslations('links.share');
  const tWords = useTranslations('guestLinks.permissions');
  const format = useFormatter();
  const name = useLinkName()(link);
  const [dirty, setDirty] = useState(false);
  const paused = link.status === 'INACTIVE';
  const { url } = link;
  const fileBase = qrFileName(link.isDefault ? collection.title : `${collection.title} ${name}`);
  return (
    <LinkCard
      title={name}
      level={level}
      status={paused ? 'paused' : 'active'}
      statusLabel={t(paused ? 'status.INACTIVE' : 'status.ACTIVE')}
      notice={dirty ? <Badge variant="warning">{t('unsavedTag')}</Badge> : undefined}
      meta={
        link.isDefault
          ? t('defaultMeta')
          : t('createdOn', { date: format.dateTime(new Date(link.createdAt), SHORT_DATE) })
      }
      summary={permissionWords(link.permissions, tWords, (words) => format.list(words))}
      qr={
        url === null ? null : (
          <RotatingQr rotationKey={link.id}>
            <QrCode value={url} label={tShare('qrLabel', { name })} size={112} />
          </RotatingQr>
        )
      }
      share={
        url === null ? (
          <Alert variant="info">{link.isDefault ? tShare('hidden') : tShare('hiddenExtra')}</Alert>
        ) : (
          <CopyField
            label={tShare('link')}
            hideLabel
            value={url}
            copyLabel={tShare('copy')}
            copiedLabel={tShare('copied')}
            failedLabel={tShare('copyFailed')}
          />
        )
      }
      actions={
        url === null ? undefined : <QrDownloadMenu url={url} fileBase={fileBase} size="lg" />
      }
      toggleLabel={t('manage')}
      toggleName={t('manageName', { name })}
    >
      <PermissionsSection link={link} onDirtyChange={setDirty} />
      <StateSection link={link} />
      <DangerSection collection={collection} link={link} name={name} />
    </LinkCard>
  );
}

type PermissionsValues = { permissions: PermissionForm };

/**
 * Explicit Save, not save-on-click: guests see a change on their next request, so a half-made
 * choice (two boxes of three unticked) should never reach them; the admin sees what will change
 * and confirms it once. While something changed, a sticky warning bar holds Save and Cancel, the
 * card's header says «Не збережено», and leaving the page asks first.
 */
function PermissionsSection({
  link,
  onDirtyChange,
}: {
  link: GuestLink;
  onDirtyChange: (dirty: boolean) => void;
}) {
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
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useLeaveGuard(dirty, t('leave'));

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
          render={({ field }) => (
            <PermissionFields value={field.value} onChange={field.onChange} layout="wide" />
          )}
        />
        {failure !== null ? <Alert variant="error">{tRoot(errorMessageKey(failure))}</Alert> : null}
        <UnsavedBar open={dirty} message={t('unsaved')}>
          <Button
            type="button"
            variant="ghost"
            aria-disabled={busy}
            onClick={() => {
              if (!save.isPending) {
                form.reset(saved);
                save.reset();
              }
            }}
          >
            {t('cancel')}
          </Button>
          <Button type="submit" aria-disabled={busy}>
            {save.isPending ? t('saving') : t('save')}
          </Button>
        </UnsavedBar>
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
      // The toast takes the colour of the state the link is in now (§5.17).
      const nowPaused = updated.status === 'INACTIVE';
      toast({
        variant: nowPaused ? 'warning' : 'success',
        title: nowPaused ? t('paused') : t('resumed'),
      });
      await invalidate();
    },
  });
  const failure = isApiError(toggle.error) ? toggle.error.code : null;
  const hintId = `link-state-hint-${link.id}`;

  return (
    <LinkCardSection title={t('title')} description={t('description')}>
      <div className="grid gap-x-8 gap-y-3 @[40rem]/link-card-part:grid-cols-[auto_minmax(0,1fr)] @[40rem]/link-card-part:items-center">
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
        {failure !== null ? (
          <Alert variant="error" className="@[40rem]/link-card-part:col-span-2">
            {tRoot(errorMessageKey(failure))}
          </Alert>
        ) : null}
      </div>
    </LinkCardSection>
  );
}

type DangerKind = 'rotate' | 'revoke' | 'delete';

const DANGER_ICON: Record<DangerKind, ReactNode> = {
  rotate: <RefreshCw aria-hidden="true" />,
  revoke: <Ban aria-hidden="true" />,
  delete: <Trash2 aria-hidden="true" />,
};

/**
 * The irreversible actions, last and apart, one row each. The main link can only be replaced
 * (its old token is revoked; it is never deleted: every guest has it). An additional link can
 * be revoked (it stays under «Відкликані» as a record) or deleted (revoked and gone from the
 * list; the server keeps the row for the audit trail). Each confirms with the link's name typed.
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
  const kinds: DangerKind[] = link.isDefault ? ['rotate'] : ['revoke', 'delete'];
  return (
    <LinkCardSection tone="danger" title={t('danger.title')} description={t('danger.description')}>
      {kinds.map((kind) => (
        <DangerAction key={kind} kind={kind} collection={collection} link={link} name={name} />
      ))}
      {link.isDefault ? (
        <div className="mt-4 border-t border-destructive/25 pt-4">
          <p className="max-w-[60ch] text-sm text-pretty">{t('danger.mainOnly')}</p>
        </div>
      ) : null}
    </LinkCardSection>
  );
}

function DangerAction({
  kind,
  collection,
  link,
  name,
}: {
  kind: DangerKind;
  collection: Collection;
  link: GuestLink;
  name: string;
}) {
  const t = useTranslations('links');
  const tRoot = useTranslations();
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const [confirming, setConfirming] = useState(false);
  const action = useMutation({
    mutationFn: (): Promise<unknown> => {
      if (kind === 'rotate') return rotateDefaultLink(collection.id, link.id);
      if (kind === 'revoke') return revokeGuestLink(link.id);
      return deleteGuestLink(link.id);
    },
    onSuccess: async () => {
      // Replaced: a working link (success). Revoked or deleted: gone for good (info, §5.17).
      toast({ variant: kind === 'rotate' ? 'success' : 'info', title: t(`${kind}.done`) });
      await invalidate();
    },
  });
  const failure = isApiError(action.error) ? action.error.code : null;
  const id = `link-${kind}-${link.id}`;

  return (
    <LinkCardDangerAction
      id={id}
      title={t(`${kind}.button`)}
      description={t(`${kind}.description`)}
    >
      <Button
        variant="destructive"
        aria-describedby={`${id}-hint`}
        onClick={() => {
          action.reset();
          setConfirming(true);
        }}
      >
        {DANGER_ICON[kind]}
        {t(`${kind}.button`)}
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        destructive
        title={t(`${kind}.confirmTitle`, { name })}
        description={
          kind === 'rotate' && link.status === 'INACTIVE'
            ? `${t('rotate.confirmText')} ${t('rotate.confirmPaused')}`
            : t(`${kind}.confirmText`)
        }
        confirmIcon={kind === 'delete' ? undefined : DANGER_ICON[kind]}
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
    </LinkCardDangerAction>
  );
}
