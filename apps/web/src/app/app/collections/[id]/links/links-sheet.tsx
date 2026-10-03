'use client';

// Design (DESIGN-SYSTEM.md §6.7; owner reviews 2026-10-02: the accordion card was "crooked",
// a page per link nested too deep, then the Links tab did not fit):
// - The links are listed on the collection page's «Посилання» tab; one link's settings open in
//   this sheet from the right (full screen on phones), `?link=main` (the live default, kept
//   across rotations) or `?link={id}` in the URL. One level, never deeper.
// - A link's settings, top to bottom: what the link is for, how guests get in (the link with
//   Copy and Open, the QR with its download), what they may add (four tiles), what they see
//   (two radio cards), whether it works (a switch, saved at once: pausing is reversible) and
//   the irreversible actions (the danger zone, last and apart; each asks for the name typed).
// - Permissions save explicitly (a half-made choice must never reach guests): the sticky
//   UnsavedBar holds Cancel and Save; leaving the link with unsaved changes asks first.

import type { Collection, GuestLink } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Badge } from '@stepler/ui/components/badge';
import { Button } from '@stepler/ui/components/button';
import { ConfirmDialog } from '@stepler/ui/components/confirm-dialog';
import { CopyButton } from '@stepler/ui/components/copy-button';
import { Label } from '@stepler/ui/components/label';
import { Panel } from '@stepler/ui/components/panel';
import { QrFrame, RotatingQr } from '@stepler/ui/components/qr-frame';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@stepler/ui/components/sheet';
import { Switch } from '@stepler/ui/components/switch';
import { useToast } from '@stepler/ui/components/toast';
import { UnsavedBar } from '@stepler/ui/components/unsaved-bar';
import { useMutation } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Ban, ExternalLink, Info, RefreshCw, Trash2, TriangleAlert } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
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
  toPermissions,
} from '@/guest-links/link-permissions';
import {
  AddPermissionTiles,
  PermissionNotice,
  SeePermissionCards,
} from '@/guest-links/permission-fields';
import { findLink, LINK_PARAM, useLinkName } from '@/guest-links/link-pages';
import { LinkUrlBlock } from '@/guest-links/link-url-block';
import { QrDownloadMenu } from '@/guest-links/qr-download-menu';
import { QrCode } from '@/qr/qr-code';
import { qrFileName } from '@/qr/qr';

const SHORT_DATE = { day: '2-digit', month: '2-digit', year: 'numeric' } as const;

/**
 * A link's settings sheet over the collection page, kept in the URL (`?link=main`, the live
 * default kept across rotations, or `?link={id}`) next to the tab (`?tab=links`), so it can be
 * linked to and Back closes it. Opening pushes a history entry; closing one opened here goes
 * back over it, and one the page was opened with (a shared or old link) is closed by replacing
 * the URL, so Back never leaves the app.
 */
export function useLinksSheet(collectionId: string) {
  const router = useRouter();
  const params = useSearchParams();
  const linkKey = params.get(LINK_PARAM);
  const pushed = useRef(false);
  useEffect(() => {
    if (linkKey === null) pushed.current = false;
  }, [linkKey]);
  const withLink = (key: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (key === null) next.delete(LINK_PARAM);
    else next.set(LINK_PARAM, key);
    const query = next.toString();
    return `/app/collections/${collectionId}${query === '' ? '' : `?${query}`}`;
  };
  const openLink = (key: string) => {
    pushed.current = true;
    router.push(withLink(key), { scroll: false });
  };
  const close = () => {
    if (pushed.current) {
      pushed.current = false;
      router.back();
    } else {
      router.replace(withLink(null), { scroll: false });
    }
  };
  return { linkKey, openLink, close };
}

/**
 * One link's settings in a sheet from the right (full screen on phones). Unsaved permission
 * edits are reported up, so closing (the button, Escape, a tap outside) asks first. While it
 * closes, the last link stays on screen for the exit animation.
 */
export function LinksSheet({
  collection,
  links,
  sheet,
}: {
  collection: Collection;
  links: readonly GuestLink[];
  sheet: ReturnType<typeof useLinksSheet>;
}) {
  const t = useTranslations('links');
  const tPermissions = useTranslations('links.permissions');
  const dirty = useRef(false);
  const open = sheet.linkKey !== null;
  // Shown while closing, so the content does not flash "not found" during the exit animation.
  const [shownKey, setShownKey] = useState(sheet.linkKey);
  if (sheet.linkKey !== null && sheet.linkKey !== shownKey) setShownKey(sheet.linkKey);
  const link = shownKey === null ? undefined : findLink(links, shownKey);
  const name = useLinkName();

  const onDirtyChange = useCallback((next: boolean) => {
    dirty.current = next;
  }, []);
  const leave = () => {
    if (dirty.current && !window.confirm(tPermissions('leave'))) return;
    dirty.current = false;
    sheet.close();
  };

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? undefined : leave())}>
      <SheetContent
        side="right"
        aria-describedby={undefined}
        // Focus the sheet itself, not the link field (which would select the whole address).
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.target as HTMLElement | null)?.focus();
        }}
      >
        <SheetHeader closeLabel={t('sheet.close')}>
          <SheetTitle className="type-h2 min-w-0 [overflow-wrap:anywhere]">
            {link === undefined ? t('notFoundTitle') : name(link)}
          </SheetTitle>
          {link === undefined ? null : <LinkStatusBadge link={link} />}
        </SheetHeader>
        <SheetBody>
          {link === undefined ? (
            <p className="max-w-[60ch] p-4 text-muted-foreground sm:p-6">{t('notFoundText')}</p>
          ) : (
            <LinkDetails
              collection={collection}
              link={link}
              onGone={sheet.close}
              onDirtyChange={onDirtyChange}
            />
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function LinkStatusBadge({ link }: { link: GuestLink }) {
  const t = useTranslations('links');
  const paused = link.status === 'INACTIVE';
  const statusKey = paused ? 'status.INACTIVE' : 'status.ACTIVE';
  return <Badge variant={paused ? 'warning' : 'success'}>{t(statusKey)}</Badge>;
}

function LinkDetails({
  collection,
  link,
  onGone,
  onDirtyChange,
}: {
  collection: Collection;
  link: GuestLink;
  onGone: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const t = useTranslations('links');
  const tShare = useTranslations('links.share');
  const format = useFormatter();
  const name = useLinkName()(link);
  const fileBase = qrFileName(link.isDefault ? collection.title : `${collection.title} ${name}`);
  const urlId = useId();

  return (
    <div className="grid gap-6 p-4 pb-8 sm:p-6 sm:pb-10">
      <p className="max-w-[64ch] text-pretty text-muted-foreground">
        {link.isDefault
          ? t('mainDescription')
          : t('extraDescription', {
              date: format.dateTime(new Date(link.createdAt), SHORT_DATE),
            })}
      </p>
      {collection.status === 'ARCHIVED' ? (
        <Alert variant="info">{t('archivedNotice')}</Alert>
      ) : null}
      {/* The link and its QR side by side once the sheet is wide enough (from `sm`): two cards
          of equal height (the row stretches them), each a column with its buttons pinned to the
          bottom, so Copy and Open line up with «Завантажити QR» (as in the share dialog). */}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_15rem]">
        <Panel data-slot="link-share" className="gap-3 p-4">
          {link.url === null ? (
            <Alert variant="info">
              {link.isDefault ? tShare('hidden') : tShare('hiddenExtra')}
            </Alert>
          ) : (
            <>
              <div className="flex min-h-0 flex-1 flex-col gap-2">
                <label htmlFor={urlId} className="text-sm font-semibold">
                  {tShare('guestLink')}
                </label>
                <LinkUrlBlock id={urlId} value={link.url} />
              </div>
              {/* Pinned to the bottom of the card, level with «Завантажити QR». */}
              <div className="mt-auto grid gap-2 min-[400px]:grid-cols-2">
                <CopyButton
                  value={link.url}
                  variant="outline"
                  size="lg"
                  copyLabel={tShare('copy')}
                  copiedLabel={tShare('copied')}
                  failedLabel={tShare('copyFailed')}
                  className="w-full [&>button]:w-full"
                />
                <Button asChild size="lg">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="no-underline"
                  >
                    <ExternalLink aria-hidden="true" />
                    {tShare('open')}
                    <span className="sr-only">{tShare('newTab')}</span>
                  </a>
                </Button>
              </div>
            </>
          )}
        </Panel>
        {link.url === null ? null : (
          <Panel data-slot="link-qr" className="items-center gap-3 p-4">
            <QrFrame className="size-40">
              <RotatingQr rotationKey={link.id}>
                <QrCode value={link.url} label={tShare('qrLabel', { name })} size={160} />
              </RotatingQr>
            </QrFrame>
            <div className="mt-auto grid w-full *:w-full">
              <QrDownloadMenu url={link.url} fileBase={fileBase} />
            </div>
          </Panel>
        )}
      </div>
      <PermissionsForm link={link} onDirtyChange={onDirtyChange} />
      <StateCard link={link} />
      <DangerZone collection={collection} link={link} name={name} onGone={onGone} />
    </div>
  );
}

type PermissionsValues = { permissions: PermissionForm };

/**
 * «Що можуть додавати гості» and «Що бачать гості», one under the other, as one form with an
 * explicit Save: guests see a change on their next request, so a half-made choice should never
 * reach them. While something changed the sticky warning bar holds Cancel and Save, and leaving
 * the page asks first.
 */
function PermissionsForm({
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
  const current = useWatch({ control: form.control, name: 'permissions' });
  const dirty = form.formState.isDirty;
  const failure = isApiError(save.error) ? save.error.code : null;
  const busy = save.isPending || undefined;
  useLeaveGuard(dirty, t('leave'));
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  return (
    <form
      noValidate
      aria-label={t('title')}
      className="grid gap-4"
      onSubmit={(event) =>
        void form.handleSubmit((values) => {
          if (!save.isPending && dirty && isValidForm(values.permissions)) save.mutate(values);
        })(event)
      }
    >
      <div className="grid gap-6">
        <Controller
          control={form.control}
          name="permissions"
          render={({ field }) => (
            <>
              <Panel data-slot="link-add" className="p-4 sm:p-6">
                <CardHeading title={t('addTitle')} description={t('addDescription')} />
                <AddPermissionTiles
                  value={field.value}
                  onChange={field.onChange}
                  legend={t('addTitle')}
                  legendClassName="sr-only"
                />
              </Panel>
              <Panel data-slot="link-see" className="p-4 sm:p-6">
                <CardHeading title={t('seeTitle')} description={t('seeDescription')} />
                <SeePermissionCards
                  value={field.value}
                  onChange={field.onChange}
                  legend={t('seeTitle')}
                  legendClassName="sr-only"
                />
              </Panel>
            </>
          )}
        />
      </div>
      <PermissionNotice value={current} />
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
  );
}

/** A card's h3 and its one sentence; the fieldset inside names its group with the same words. */
function CardHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-5 grid gap-1">
      <h3 className="type-h3">{title}</h3>
      <p className="max-w-[56ch] text-sm text-pretty text-muted-foreground">{description}</p>
    </div>
  );
}

/** «Стан посилання»: one switch, saved at once (pausing is reversible), and what guests will see. */
function StateCard({ link }: { link: GuestLink }) {
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
  const on = toggle.isPending ? toggle.variables : !paused;

  return (
    <section
      aria-labelledby="link-state"
      data-slot="link-state"
      className="grid gap-4 rounded-sheet border bg-card p-4 shadow-card sm:p-6"
    >
      <div className="grid gap-1">
        <h3 id="link-state" className="type-h3">
          {t('title')}
        </h3>
        <p className="max-w-[56ch] text-sm text-pretty text-muted-foreground">{t('description')}</p>
      </div>
      <div className="flex items-start gap-3">
        <Label className="min-h-11 shrink-0">
          <Switch
            // Shows the requested state while the request runs.
            checked={on}
            aria-label={t('switch')}
            aria-describedby={hintId}
            aria-disabled={toggle.isPending || undefined}
            onCheckedChange={(next) => {
              if (!toggle.isPending) toggle.mutate(next);
            }}
          />
        </Label>
        <div className="grid gap-0.5 pt-2.5">
          <p className="font-semibold">{on ? t('on') : t('off')}</p>
          <p id={hintId} className="max-w-[56ch] text-sm text-pretty text-muted-foreground">
            {paused ? t('pausedHint') : t('activeHint')}
          </p>
        </div>
      </div>
      {failure !== null ? <Alert variant="error">{tRoot(errorMessageKey(failure))}</Alert> : null}
    </section>
  );
}

type DangerKind = 'rotate' | 'revoke' | 'delete';

const DANGER_ICON: Record<DangerKind, ReactNode> = {
  rotate: <RefreshCw aria-hidden="true" />,
  revoke: <Ban aria-hidden="true" />,
  delete: <Trash2 aria-hidden="true" />,
};

/**
 * The irreversible actions, last and apart: the soft destructive fill with a solid edge, the
 * warning icon by the heading, one row per action (what it does, then its button). The main link
 * can only be replaced (every guest has it, so it is never deleted), and an info note says so;
 * an additional link can be revoked (kept under «Відкликані») or deleted.
 */
function DangerZone({
  collection,
  link,
  name,
  onGone,
}: {
  collection: Collection;
  link: GuestLink;
  name: string;
  onGone: () => void;
}) {
  const t = useTranslations('links');
  const kinds: DangerKind[] = link.isDefault ? ['rotate'] : ['revoke', 'delete'];
  return (
    <section
      aria-labelledby="link-danger"
      data-slot="link-danger"
      className="grid gap-5 rounded-sheet border border-destructive bg-destructive-soft p-4 shadow-card sm:p-6"
    >
      <div className="flex items-start gap-3">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-destructive" />
        <div className="grid gap-1">
          <h3 id="link-danger" className="type-h3 text-destructive">
            {t('danger.title')}
          </h3>
          <p className="text-sm">{t('danger.description')}</p>
        </div>
      </div>
      <div className="grid gap-4 border-t border-destructive/25 pt-5">
        <div className="grid divide-y divide-destructive/25">
          {kinds.map((kind) => (
            <DangerAction
              key={kind}
              kind={kind}
              collection={collection}
              link={link}
              name={name}
              onGone={onGone}
            />
          ))}
        </div>
        {link.isDefault ? (
          <p className="flex items-start gap-2.5 rounded-control border border-destructive/25 bg-card px-3.5 py-3 text-sm text-pretty">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span className="min-w-0">{t('danger.mainOnly')}</span>
          </p>
        ) : null}
      </div>
    </section>
  );
}

function DangerAction({
  kind,
  collection,
  link,
  name,
  onGone,
}: {
  kind: DangerKind;
  collection: Collection;
  link: GuestLink;
  name: string;
  onGone: () => void;
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
      // Revoked or deleted, the link has no settings any more: close, the list shows where it went.
      if (kind !== 'rotate') onGone();
      await invalidate();
    },
  });
  const failure = isApiError(action.error) ? action.error.code : null;
  const id = `link-${kind}-${link.id}`;

  return (
    <div className="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6">
      <div className="grid gap-1">
        <h4 id={id} className="font-semibold">
          {t(`${kind}.button`)}
        </h4>
        <p id={`${id}-hint`} className="max-w-[60ch] text-sm text-pretty">
          {t(`${kind}.description`)}
        </p>
      </div>
      <Button
        variant="destructive"
        className="w-full sm:w-auto"
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
    </div>
  );
}
