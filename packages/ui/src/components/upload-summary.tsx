// UploadSummary: the batch at a glance, above the guest's own frames (DESIGN-SYSTEM.md §5.11,
// §6.2, §9 "Скринридеры").
// Design pass (frontend-design, ui-ux-pro-max, web-design-guidelines, responsive-design):
// - One line of words («12 з 30 додано», «3 не вдалося», «Скасовано 2») and one line of data in
//   mono («148 МБ з 410 МБ», «Залишилось ~3 хв»), then the 2px pencil progress line. Separate
//   elements with a CSS gap, never «·» glued into the copy.
// - Partial success is a normal state, not an error: the failed count is destructive text with
//   an icon, and the follow-ups are plain buttons («Повторити невдалі» outline, «Скасувати
//   решту» ghost) that wrap into a column on narrow phones.
// - Offline is a warning Alert, not failures: «Немає з’єднання…» + «Повторити зараз».
// - Files refused before upload get one quiet line with a «Чому?» disclosure (native
//   `<details>`, keyboard and screen-reader friendly without script).
// - Screen readers hear one polite region, updated at the start, at every quarter and at the
//   end, never per percent.
import { CircleAlert } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { focusRing } from '../lib/focus';
import { cn } from '../lib/utils';
import { Alert } from './alert';
import { Button } from './button';
import { Progress } from './progress';

type UploadSummaryLabels = {
  /** «12 з 30 додано». */
  added: (added: number, total: number) => string;
  /** «3 не вдалося». */
  failed: (count: number) => string;
  /** «Скасовано 2». */
  cancelled: (count: number) => string;
  /** «148 МБ з 410 МБ». */
  bytes: (done: number, total: number) => string;
  /** «Залишилось ~3 хв». */
  eta: (seconds: number) => string;
  /** The progress line's accessible name, e.g. «Завантаження кадрів». */
  progress: string;
  /** What the polite live region says, e.g. «Додано 27 з 30. 3 не вдалося». */
  announce: (added: number, total: number, failed: number) => string;
  retryFailed: string;
  cancelRest: string;
  offline: string;
  retryNow: string;
  /** The «Чому?» disclosure next to the rejected line. */
  why: string;
};

type UploadSummaryProps = {
  added: number;
  total: number;
  failed: number;
  cancelled: number;
  /** The pre-check line, e.g. «2 файли не підходять: формат .exe; понад 50 МБ». */
  rejected?: string;
  /** What «Чому?» reveals: the allowed types and sizes. */
  rejectedHelp?: ReactNode;
  bytesDone: number;
  bytesTotal: number;
  /** Shown only when the caller's estimate is stable. */
  etaSeconds?: number;
  offline: boolean;
  labels: UploadSummaryLabels;
  onRetryFailed?: () => void;
  onCancelRest?: () => void;
  onRetryNow?: () => void;
  className?: string;
};

/** Start, each quarter, the end: the moments worth announcing. */
const milestone = (added: number, failed: number, cancelled: number, total: number): string => {
  if (total === 0) return 'idle';
  if (added + failed + cancelled >= total) return `end:${added}:${failed}`;
  return `q${Math.floor((added / total) * 4)}`;
};

/**
 * The upload batch's summary: counts in words, bytes in mono, a 2px progress line, the partial
 * and offline follow-ups, and one aggregated polite live region.
 */
function UploadSummary({
  added,
  total,
  failed,
  cancelled,
  rejected,
  rejectedHelp,
  bytesDone,
  bytesTotal,
  etaSeconds,
  offline,
  labels,
  onRetryFailed,
  onCancelRest,
  onRetryNow,
  className,
}: UploadSummaryProps) {
  const settled = added + failed + cancelled >= total;
  const percent = bytesTotal > 0 ? (bytesDone / bytesTotal) * 100 : 0;
  const mark = milestone(added, failed, cancelled, total);
  // Re-derived only when the milestone moves (React's "adjust state on prop change"), so percent
  // ticks never re-announce.
  const [spoken, setSpoken] = useState({ mark: 'idle', text: '' });
  if (mark !== spoken.mark) {
    setSpoken({ mark, text: mark === 'idle' ? '' : labels.announce(added, total, failed) });
  }

  const hasActions = (failed > 0 && onRetryFailed) || (!settled && onCancelRest);

  return (
    <section data-slot="upload-summary" className={cn('grid min-w-0 gap-2', className)}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="type-body font-semibold text-foreground">{labels.added(added, total)}</p>
        {failed > 0 ? (
          <p className="flex items-center gap-1 type-small font-medium text-destructive">
            <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
            {labels.failed(failed)}
          </p>
        ) : null}
        {cancelled > 0 ? (
          <p className="type-small text-muted-foreground">{labels.cancelled(cancelled)}</p>
        ) : null}
        <p className="ml-auto flex gap-3 type-data text-muted-foreground">
          <span>{labels.bytes(bytesDone, bytesTotal)}</span>
          {etaSeconds !== undefined && !settled ? <span>{labels.eta(etaSeconds)}</span> : null}
        </p>
      </div>
      <Progress value={percent} label={labels.progress} />
      {offline ? (
        <Alert
          variant="warning"
          action={
            onRetryNow ? (
              <Button variant="outline" onClick={onRetryNow}>
                {labels.retryNow}
              </Button>
            ) : undefined
          }
        >
          {labels.offline}
        </Alert>
      ) : null}
      {hasActions ? (
        <div className="flex flex-wrap gap-2 *:max-[359px]:w-full">
          {failed > 0 && onRetryFailed ? (
            <Button variant="outline" onClick={onRetryFailed}>
              {labels.retryFailed}
            </Button>
          ) : null}
          {!settled && onCancelRest ? (
            <Button variant="ghost" onClick={onCancelRest}>
              {labels.cancelRest}
            </Button>
          ) : null}
        </div>
      ) : null}
      {rejected && rejectedHelp ? (
        <details className="type-small text-muted-foreground">
          <summary
            className={cn(
              'flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-2 rounded-control [&::-webkit-details-marker]:hidden',
              focusRing,
            )}
          >
            <span>{rejected}</span>
            <span className="font-medium text-link underline underline-offset-2">{labels.why}</span>
          </summary>
          <div className="pb-2 text-foreground">{rejectedHelp}</div>
        </details>
      ) : rejected ? (
        <p className="type-small text-muted-foreground">{rejected}</p>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {spoken.text}
      </p>
    </section>
  );
}

export { UploadSummary, type UploadSummaryLabels, type UploadSummaryProps };
