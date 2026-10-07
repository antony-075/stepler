'use client';

// Design pass (slice 9, Task 15; frontend-design, ui-ux-pro-max, web-design-guidelines,
// responsive-design): the frame's moderation in the viewer's details column (R2, R3). Decisions:
// - it lives on the viewer's dark stage in both themes, so it uses the stage's own colours
//   (`--viewer-foreground`, `--viewer-muted`, white hairlines) rather than the page's alerts;
// - first the frame's state in one sentence, then the one action that changes it: «Приховати від
//   гостей» or «Показати гостям»; an operator's hide is a red-edged note with the reason and the
//   appeal address, and no button (the admin cannot undo it);
// - then the open reports, oldest first: the reason, the description (or «Без опису»), the
//   time; never who reported or their contact; «Відхилити скарги» asks first;
// - buttons are 44px, outlined on the dark stage, never hover-only.
// - slice 9b: a frame the operator deleted is «Видалено модерацією» with the reason and the date
//   it is deleted for good, and no hide/show; on it and on an operator hide the admin appeals in
//   place (`AppealStatus`), the status following below.
import type { AdminContentDetail } from '@stepler/contracts';
import { ConfirmDialog } from '@stepler/ui/components/confirm-dialog';
import { useToast } from '@stepler/ui/components/toast';
import { cn } from '@stepler/ui/lib/utils';
import { useMutation } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { isApiError } from '@/api/client';
import { createContentAppeal } from '@/api/appeals';
import { dismissReports, hideContent, unhideContent } from '@/api/content';
import { viewerButton } from '@/media/viewer-stage';
import { AppealOutcome, AppealStatus } from './appeal-status';

/** An outlined button on the dark stage. */
const stageButton = cn(viewerButton, 'border border-[rgb(255_255_255/0.24)] justify-center');

export function ModerationPanel({
  collectionId,
  detail,
  contactEmail,
  onChanged,
}: {
  collectionId: string;
  detail: AdminContentDetail;
  /** `LEGAL_CONTACT_EMAIL`, the address to disagree with an operator's hide; may be unset. */
  contactEmail: string | null;
  /** Refreshes the frame, the lists and the counts. */
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations('content.moderation');
  const tReasons = useTranslations('guest.report.reasons');
  const format = useFormatter();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const hidden = detail.moderation.hidden;
  const quarantined = detail.moderation.quarantined;
  const contactLine =
    contactEmail === null ? null : (
      <p className="text-[var(--viewer-muted)]">
        {t.rich('moderatedContact', {
          email: () => (
            <a
              href={`mailto:${contactEmail}`}
              className="text-viewer-foreground underline underline-offset-2"
            >
              {contactEmail}
            </a>
          ),
        })}
      </p>
    );
  const appealStatus = (
    <AppealStatus
      appeal={detail.appeal}
      target="content"
      tone="stage"
      submit={(text) => createContentAppeal(collectionId, detail.id, text)}
      onChanged={onChanged}
    />
  );

  const visibility = useMutation({
    mutationFn: (hide: boolean) => (hide ? hideContent(detail.id) : unhideContent(detail.id)),
    onSuccess: async (_item, hide) => {
      await onChanged();
      toast({ variant: 'success', title: t(hide ? 'hiddenDone' : 'shownDone') });
    },
    onError: async (error) => {
      if (isApiError(error, 'CONTENT_MODERATED')) {
        await onChanged();
        toast({ variant: 'error', title: t('moderatedConflict') });
      } else {
        toast({ variant: 'error', title: t('failed') });
      }
    },
  });

  return (
    <section
      aria-labelledby="moderation-title"
      className="grid gap-3 border-t border-[rgb(255_255_255/0.12)] pt-4"
    >
      <h3 id="moderation-title" className="text-xs text-[var(--viewer-muted)]">
        {t('title')}
      </h3>
      {quarantined !== null ? (
        <div className="grid gap-3">
          <div className="grid gap-1 border-l-2 border-[#FF7A7A] pl-3 text-[0.9375rem] leading-snug">
            <p className="font-semibold">{t('quarantinedTitle')}</p>
            <p className="[overflow-wrap:anywhere]">
              {t('moderatedReason', { reason: quarantined.reason })}
            </p>
            <p className="text-[var(--viewer-muted)]">
              {t('quarantinedPurge', {
                date: format.dateTime(new Date(quarantined.purgeAfter), {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                }),
              })}
            </p>
            {contactLine}
          </div>
          {appealStatus}
        </div>
      ) : hidden?.by === 'OPERATOR' ? (
        <div className="grid gap-3">
          <div className="grid gap-1 border-l-2 border-[#FF7A7A] pl-3 text-[0.9375rem] leading-snug">
            <p className="font-semibold">{t('moderatedTitle')}</p>
            {hidden.reason === null ? null : (
              <p className="[overflow-wrap:anywhere]">
                {t('moderatedReason', { reason: hidden.reason })}
              </p>
            )}
            {contactLine}
          </div>
          {appealStatus}
        </div>
      ) : (
        <>
          <p className="text-[0.9375rem] leading-snug">
            {hidden === null ? t('visible') : t('hiddenByAdmin')}
          </p>
          <button
            type="button"
            className={stageButton}
            aria-disabled={visibility.isPending || undefined}
            onClick={() => {
              if (!visibility.isPending) visibility.mutate(hidden === null);
            }}
          >
            {hidden === null ? (
              <EyeOff aria-hidden="true" className="size-4" />
            ) : (
              <Eye aria-hidden="true" className="size-4" />
            )}
            {hidden === null ? t('hide') : t('show')}
          </button>
          <AppealOutcome appeal={detail.appeal} />
        </>
      )}

      {detail.reports.length === 0 ? null : (
        <div className="grid gap-2 pt-2">
          <h4 className="text-[0.9375rem] font-semibold">
            {t('reportsTitle', { count: detail.reports.length })}
          </h4>
          <ul className="grid gap-2.5">
            {detail.reports.map((report) => (
              <li key={report.id} className="grid gap-0.5 text-[0.9375rem] leading-snug">
                <span className="font-medium">{tReasons(report.reason)}</span>
                <span className="[overflow-wrap:anywhere] text-[var(--viewer-muted)]">
                  {report.description ?? t('noDescription')}
                </span>
                <time
                  dateTime={report.createdAt}
                  className="text-xs text-[var(--viewer-muted)] tabular-nums"
                >
                  {format.dateTime(new Date(report.createdAt), {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </li>
            ))}
          </ul>
          <button type="button" className={stageButton} onClick={() => setConfirming(true)}>
            {t('dismiss')}
          </button>
          <p className="text-xs leading-snug text-[var(--viewer-muted)]">{t('dismissHint')}</p>
        </div>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('dismissTitle')}
        description={t('dismissText')}
        confirmLabel={t('dismissConfirm')}
        cancelLabel={t('cancel')}
        pendingLabel={t('pending')}
        errorMessage={t('failed')}
        onConfirm={async () => {
          await dismissReports(detail.id);
          await onChanged();
          toast({ variant: 'info', title: t('dismissDone') });
        }}
      />
    </section>
  );
}
