'use client';

// The guest's upload batch (DESIGN-SYSTEM.md §5.11, §5.18, §6.2, §6.3; spec §10).
// Design pass (frontend-design, ui-ux-pro-max, web-design-guidelines, responsive-design):
// - Lives at the top of «Ваші кадри», in the page's own column (phone column, tablet column,
//   desktop right column beside the sticky side panel), so the frames being uploaded sit exactly
//   where the saved ones will be. The pick action stays in the dock / side panel.
// - While files move: `UploadSummary` (words, mono bytes, the 2px pencil line, partial and
//   offline follow-ups, one polite live region) above a grid of `UploadFrame` tiles with
//   local previews (`URL.createObjectURL`, revoked when the frame goes; HEIC, video and documents
//   get a type tile: never a decoded original in the grid).
// - When the batch settles with everything added: the B success moment, `PrintStack` of the last
//   three prints + «Готово, ваші кадри» and the count; with failures, the summary stays with
//   «Повторити невдалі»; all failed: «Не вдалося додати кадри» + «Повторити всі».
// - Files refused before upload never become frames: one line with «Чому?» (types and sizes).
// - A full collection fails the files still to go with one warning; the page stays usable.
// - Cancelled frames leave the sheet; the summary counts them.

import { FILE_TYPES, type FileKind, type GuestContext } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { FrameGrid } from '@stepler/ui/components/frame-grid';
import { PrintStack } from '@stepler/ui/components/print-stack';
import {
  UploadFrame,
  type UploadFrameLabels,
  type UploadFrameState,
} from '@stepler/ui/components/upload-frame';
import { UploadSummary, type UploadSummaryLabels } from '@stepler/ui/components/upload-summary';
import { FileText, Film, ImageIcon, type LucideIcon } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { formatBytes } from '@/format/bytes';
import { allowedKinds } from './upload/file-rules';
import type { UploadItem } from './upload/queue';
import type { UploadQueue } from './upload/use-upload-queue';

/** Types a browser can show from the file itself (HEIC cannot, outside Safari). */
const PREVIEWABLE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const isPreviewable = (item: UploadItem): boolean =>
  item.kind === 'PHOTO' && PREVIEWABLE.has(item.file.type.toLowerCase());

/**
 * Object URLs for previewable photos, one per file, created on first use and revoked when the
 * batch goes (the page closes or the guest leaves). A batch is at most 100 files, so keeping a
 * cancelled file's URL until then costs little.
 */
function useLocalPreviews(): (item: UploadItem) => string | undefined {
  const [cache] = useState(() => new Map<File, string>());
  useEffect(
    () => () => {
      for (const url of cache.values()) URL.revokeObjectURL(url);
      cache.clear();
    },
    [cache],
  );
  return (item) => {
    if (!isPreviewable(item)) return undefined;
    let url = cache.get(item.file);
    if (url === undefined) {
      url = URL.createObjectURL(item.file);
      cache.set(item.file, url);
    }
    return url;
  };
}

/** Decorative: the frame's accessible name says what the picture is. */
const DECORATIVE = '';

const KIND_ICON: Record<FileKind, LucideIcon> = {
  PHOTO: ImageIcon,
  VIDEO: Film,
  DOCUMENT: FileText,
};

/** A frame's picture: the local preview, or a quiet tile with the type. */
function Preview({ item, url }: { item: UploadItem; url: string | undefined }) {
  // A local object URL: nothing for next/image to optimise.
  // eslint-disable-next-line @next/next/no-img-element
  if (url !== undefined) return <img alt={DECORATIVE} src={url} />;
  const Icon = KIND_ICON[item.kind];
  const ext = item.file.name.includes('.') ? item.file.name.split('.').pop()?.toUpperCase() : '';
  return (
    <div className="grid place-content-center justify-items-center gap-1 bg-muted text-muted-foreground">
      <Icon aria-hidden="true" className="size-5" />
      <span translate="no" className="type-data text-link">
        {ext}
      </span>
    </div>
  );
}

export function UploadBatch({ uploads, context }: { uploads: UploadQueue; context: GuestContext }) {
  const t = useTranslations('guest.upload');
  const tErrors = useTranslations('errors');
  const format = useFormatter();
  const { state, summary } = uploads;
  const shown = useMemo(
    () => state.items.filter((item) => item.state !== 'cancelled'),
    [state.items],
  );
  const preview = useLocalPreviews();
  const bytes = (value: number) => formatBytes(format.number, value);

  const rejectedLine = useRejectedLine(state.rejected);
  if (shown.length === 0 && rejectedLine === null && state.truncated === 0) return null;

  const total = shown.length;
  const settled = shown.every((item) => item.state === 'done' || item.state === 'failed');
  const quotaFull = shown.some((item) => item.error === 'QUOTA_EXCEEDED');
  const allFailed = settled && total > 0 && summary.added === 0;
  const success = settled && total > 0 && summary.failed === 0 && state.linkClosed === null;

  const reason = (item: UploadItem): string | undefined => {
    if (item.error === undefined) return undefined;
    if (item.error === 'NETWORK' || item.error === 'STORAGE_403') return t(`reason.${item.error}`);
    return tErrors(item.error);
  };

  const frameLabels: UploadFrameLabels = {
    queued: t('queued'),
    processing: t('processing'),
    done: t('done'),
    failed: t('failed'),
    retry: t('retry'),
    cancel: '',
    position: (index, of) => t('position', { index, total: of }),
    percent: (value) => t('percent', { value }),
  };

  const summaryLabels: UploadSummaryLabels = {
    added: (added, of) => t('added', { added, total: of }),
    failed: (count) => t('failedCount', { count }),
    cancelled: (count) => t('cancelled', { count }),
    bytes: (done, of) => t('bytes', { done: bytes(done), total: bytes(of) }),
    eta: (seconds) => t('eta', { minutes: Math.max(1, Math.ceil(seconds / 60)) }),
    progress: t('progress'),
    announce: (added, of, failed) =>
      failed > 0
        ? t('announceFailed', { added, total: of, failed })
        : t('announce', { added, total: of }),
    retryFailed: t('retryFailed'),
    cancelRest: t('cancelRest'),
    offline: t('offline'),
    retryNow: t('retryNow'),
    why: t('why'),
  };

  // The last three added, photos first: a print of a picture says more than a type tile.
  const done = shown.filter((item) => item.state === 'done');
  const prints = [
    ...done.filter((item) => !isPreviewable(item)),
    ...done.filter((item) => isPreviewable(item)),
  ]
    .slice(-3)
    .map((item) => ({
      key: item.localId,
      image: <Preview item={item} url={preview(item)} />,
      ...(item.result?.frameNo == null ? {} : { frameNo: item.result.frameNo }),
    }));

  return (
    <div className="grid gap-4" data-slot="upload-batch">
      {success ? (
        <div className="grid justify-items-center gap-4 py-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:justify-items-start sm:gap-8">
          <PrintStack prints={prints} label={t('stackLabel', { count: summary.added })} />
          <div className="grid gap-1 text-center sm:text-left">
            <h3 className="type-h2">{t('doneTitle')}</h3>
            <p className="type-data-lg text-muted-foreground">
              {t('doneCount', { added: summary.added, total })}
            </p>
          </div>
        </div>
      ) : allFailed && !quotaFull ? (
        <Alert
          variant="error"
          title={t('allFailedTitle')}
          action={
            <Button variant="outline" onClick={() => uploads.retry()}>
              {t('retryAll')}
            </Button>
          }
        >
          {reason(shown[0] as UploadItem)}
        </Alert>
      ) : total > 0 ? (
        <UploadSummary
          added={summary.added}
          total={summary.total - summary.cancelled}
          failed={summary.failed}
          cancelled={summary.cancelled}
          bytesDone={summary.bytesDone}
          bytesTotal={summary.bytesTotal}
          offline={state.offline}
          labels={summaryLabels}
          onRetryFailed={quotaFull ? undefined : () => uploads.retry()}
          onCancelRest={() => uploads.cancel()}
          onRetryNow={uploads.retryNow}
          {...(rejectedLine === null
            ? {}
            : { rejected: rejectedLine, rejectedHelp: <RejectedHelp context={context} /> })}
        />
      ) : null}

      {total === 0 && rejectedLine !== null ? (
        <UploadSummaryRejectedOnly line={rejectedLine} context={context} />
      ) : null}
      {(success || allFailed) && rejectedLine !== null && total > 0 ? (
        <UploadSummaryRejectedOnly line={rejectedLine} context={context} />
      ) : null}
      {state.truncated > 0 ? (
        <Alert variant="info">{t('truncated', { max: context.limits.filesPerBatch })}</Alert>
      ) : null}
      {quotaFull ? <Alert variant="warning">{t('quotaFull')}</Alert> : null}

      {total > 0 ? (
        <FrameGrid ariaLabel={t('listLabel')}>
          {shown.map((item, i) => {
            const index = i + 1;
            const frameNo = item.result?.frameNo ?? undefined;
            const accessibleName =
              item.state === 'done' && frameNo !== undefined
                ? t('frameDone', { number: frameNo })
                : item.state === 'failed'
                  ? t('frameFailed', { index, total })
                  : item.state === 'uploading'
                    ? t('frameUploading', { index, total })
                    : item.state === 'processing'
                      ? t('frameProcessing', { index, total })
                      : t('frameQueued', { index, total });
            return (
              <UploadFrame
                key={item.localId}
                state={frameStateOf(item)}
                progress={item.progress}
                preview={<Preview item={item} url={preview(item)} />}
                position={{ index, total }}
                {...(frameNo === undefined ? {} : { frameNo })}
                {...(reason(item) === undefined ? {} : { reason: reason(item) })}
                accessibleName={accessibleName}
                labels={{ ...frameLabels, cancel: t('cancel', { index, total }) }}
                {...(item.state === 'failed' && item.error !== 'QUOTA_EXCEEDED'
                  ? { onRetry: () => uploads.retry(item.localId) }
                  : {})}
                onCancel={() => uploads.cancel(item.localId)}
                // Rows are as tall as their tallest frame (one with «Повторити»): fill the cell.
                className="h-full"
              />
            );
          })}
        </FrameGrid>
      ) : null}
    </div>
  );
}

/** Blocked files (the link closed) read as failed; cancelled ones are never shown. */
function frameStateOf(item: UploadItem): UploadFrameState {
  if (item.state === 'blocked') return 'failed';
  if (item.state === 'cancelled') return 'queued';
  return item.state;
}

/** «2 файли не підходять: формат .exe; завеликий або порожній файл», or `null`. */
function useRejectedLine(rejected: readonly { name: string; reason: 'type' | 'size' }[]) {
  const t = useTranslations('guest.upload');
  if (rejected.length === 0) return null;
  const exts = [
    ...new Set(
      rejected
        .filter((r) => r.reason === 'type')
        .map((r) => (r.name.includes('.') ? `.${r.name.split('.').pop()?.toLowerCase()}` : r.name)),
    ),
  ];
  const reasons = [
    ...(exts.length > 0 ? [t('reasonType', { exts: exts.join(', ') })] : []),
    ...(rejected.some((r) => r.reason === 'size') ? [t('reasonSize')] : []),
  ];
  return t('rejected', { count: rejected.length, reasons: reasons.join('; ') });
}

/** What «Чому?» explains: the types this link takes and the size limits. */
function RejectedHelp({ context }: { context: GuestContext }) {
  const t = useTranslations('guest.upload');
  const format = useFormatter();
  const kinds = allowedKinds(context.permissions);
  const types = [
    ...new Set(
      FILE_TYPES.filter((type) => kinds.includes(type.kind) && type.ext !== 'jpeg').map((type) =>
        type.ext.toUpperCase(),
      ),
    ),
  ].join(', ');
  const max = context.limits.maxFileBytes;
  return (
    <>
      {t('rejectedHelp', {
        types,
        photo: formatBytes(format.number, max.photo),
        video: formatBytes(format.number, max.video),
        document: formatBytes(format.number, max.document),
      })}
    </>
  );
}

/** The refused-files line on its own, when nothing else of the batch is shown. */
function UploadSummaryRejectedOnly({ line, context }: { line: string; context: GuestContext }) {
  const t = useTranslations('guest.upload');
  return (
    <details className="text-sm text-muted-foreground">
      <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-2 rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        <span>{line}</span>
        <span className="font-medium text-link underline underline-offset-2">{t('why')}</span>
      </summary>
      <p className="pb-2 text-foreground">
        <RejectedHelp context={context} />
      </p>
    </details>
  );
}
