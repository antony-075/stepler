'use client';

// Design pass (slice 9b, Task 6; frontend-design, ui-ux-pro-max, web-design-guidelines,
// responsive-design): the appeal's state and the one action, shared by the frame's moderation
// panel (the viewer's dark stage) and the blocked-collection banner (the page). Decisions:
// - one line of state in plain words: «Апеляцію подано {date} · Розглядається», «Апеляцію
//   задоволено {date}», «Апеляцію відхилено: {note}»; the operator's note is the admin's only
//   answer (no e-mail, Q-A5), so it is shown in full;
// - «Подати апеляцію» is a 44px outlined button; while an appeal is open it stays in place but is
//   `aria-disabled` with the reason underneath, never hidden (the admin sees why);
// - after a rejection the button comes back: a new appeal is allowed (the history is kept);
// - errors are toasts that name the next step; a conflict (already appealed, or the measure is
//   gone) refetches, so the panel shows the truth.
import type { AdminAppeal } from '@stepler/contracts';
import { APPEAL_TEXT_MAX_CHARS } from '@stepler/contracts';
import { AppealDialog } from '@stepler/ui/components/appeal-dialog';
import { Button } from '@stepler/ui/components/button';
import { useToast } from '@stepler/ui/components/toast';
import { cn } from '@stepler/ui/lib/utils';
import { useMutation } from '@tanstack/react-query';
import { Scale } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { isApiError } from '@/api/client';
import { viewerButton } from '@/media/viewer-stage';

export type AppealStatusKey = 'none' | 'open' | 'upheld' | 'rejected';

/** The appeal's state as the admin reads it. */
export function appealStatusKey(appeal: AdminAppeal | null): AppealStatusKey {
  if (appeal === null) return 'none';
  return appeal.status === 'OPEN' ? 'open' : appeal.status === 'UPHELD' ? 'upheld' : 'rejected';
}

/** A new appeal is allowed unless one is under review. */
export function canAppeal(appeal: AdminAppeal | null): boolean {
  return appeal === null || appeal.status !== 'OPEN';
}

/** The appeal's state in one line: «… · Розглядається», «Апеляцію задоволено …», «… відхилено: …». */
function useAppealLine() {
  const t = useTranslations('appeals');
  const format = useFormatter();
  const date = (iso: string) => format.dateTime(new Date(iso), { day: 'numeric', month: 'long' });
  return (appeal: AdminAppeal | null): string | null => {
    switch (appealStatusKey(appeal)) {
      case 'none':
        return null;
      case 'open':
        return t('open', { date: date(appeal!.createdAt) });
      case 'upheld':
        return t('upheld', { date: date(appeal!.resolution?.at ?? appeal!.createdAt) });
      case 'rejected':
        return t('rejected', { note: appeal!.resolution?.note ?? t('noNote') });
    }
  };
}

/**
 * The outcome alone, where no appeal can be made any more (the measure was reversed, e.g. an
 * upheld appeal): the admin still reads what happened.
 */
export function AppealOutcome({ appeal }: { appeal: AdminAppeal | null }) {
  const line = useAppealLine()(appeal);
  if (line === null) return null;
  return (
    <p
      data-slot="appeal-status"
      data-status={appealStatusKey(appeal)}
      className="text-[0.9375rem] leading-snug [overflow-wrap:anywhere]"
    >
      {line}
    </p>
  );
}

/** An outlined button on the viewer's dark stage. */
const stageButton = cn(viewerButton, 'border border-[rgb(255_255_255/0.24)] justify-center');

export function AppealStatus({
  appeal,
  target,
  tone,
  submit,
  onChanged,
}: {
  /** The latest appeal on this target, or `null`. */
  appeal: AdminAppeal | null;
  target: 'content' | 'collection';
  /** `stage`: the viewer's dark details column; `page`: the light page (the banner). */
  tone: 'stage' | 'page';
  submit: (text: string) => Promise<unknown>;
  /** Refetches the appeal (and what it is about). */
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations('appeals');
  const { toast } = useToast();
  const hintId = useId();
  const [open, setOpen] = useState(false);
  const key = appealStatusKey(appeal);
  const allowed = canAppeal(appeal);

  const create = useMutation({
    mutationFn: (text: string) => submit(text),
    onSuccess: async () => {
      await onChanged();
    },
    onError: async (error) => {
      if (isApiError(error, 'APPEAL_OPEN') || isApiError(error, 'APPEAL_NOT_APPLICABLE')) {
        setOpen(false);
        await onChanged();
        toast({
          variant: 'info',
          title: t(
            isApiError(error, 'APPEAL_OPEN')
              ? 'errors.open'
              : target === 'content'
                ? 'errors.notApplicable'
                : 'errors.notApplicableCollection',
          ),
        });
      }
    },
  });

  const errorMessage = create.isError
    ? isApiError(create.error, 'RATE_LIMITED')
      ? t('errors.rateLimited')
      : isApiError(create.error, 'APPEAL_OPEN') || isApiError(create.error, 'APPEAL_NOT_APPLICABLE')
        ? null
        : t('errors.failed')
    : null;

  const muted = tone === 'stage' ? 'text-[var(--viewer-muted)]' : 'text-muted-foreground';
  const dialogTitle = t(target === 'content' ? 'dialog.titleContent' : 'dialog.titleCollection');
  const dialogDescription = t(
    target === 'content' ? 'dialog.descriptionContent' : 'dialog.descriptionCollection',
  );
  const statusLine = useAppealLine()(appeal);

  return (
    <div data-slot="appeal-status" data-status={key} className="grid gap-2">
      {statusLine === null ? null : (
        <p className="text-[0.9375rem] leading-snug [overflow-wrap:anywhere]">{statusLine}</p>
      )}
      {tone === 'stage' ? (
        <button
          type="button"
          className={stageButton}
          aria-disabled={!allowed || undefined}
          aria-describedby={allowed ? undefined : hintId}
          onClick={() => {
            if (allowed) setOpen(true);
          }}
        >
          <Scale aria-hidden="true" className="size-4" />
          {t('submit')}
        </button>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="justify-self-start"
          aria-disabled={!allowed || undefined}
          aria-describedby={allowed ? undefined : hintId}
          onClick={() => {
            if (allowed) setOpen(true);
          }}
        >
          <Scale aria-hidden="true" />
          {t('submit')}
        </Button>
      )}
      {allowed ? null : (
        <p id={hintId} className={cn('text-xs leading-snug', muted)}>
          {t('openHint')}
        </p>
      )}
      <AppealDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) create.reset();
        }}
        title={dialogTitle}
        description={dialogDescription}
        textLabel={t('dialog.textLabel')}
        textHint={t('dialog.textHint')}
        textRequiredLabel={t('dialog.required')}
        textTooLongLabel={t('dialog.tooLong', { max: APPEAL_TEXT_MAX_CHARS })}
        counterLabel={(count, max) => t('dialog.counter', { count, max })}
        submitLabel={t('dialog.send')}
        submittingLabel={t('dialog.sending')}
        cancelLabel={t('dialog.cancel')}
        sentTitle={t('dialog.sentTitle')}
        sentText={t('dialog.sentText')}
        closeLabel={t('dialog.close')}
        state={create.isPending ? 'submitting' : create.isSuccess ? 'sent' : 'idle'}
        error={errorMessage}
        maxText={APPEAL_TEXT_MAX_CHARS}
        onSubmit={({ text }) => create.mutate(text)}
      />
    </div>
  );
}
