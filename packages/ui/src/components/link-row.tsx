import type { ReactNode } from 'react';
import { cn } from '../lib/utils';
import { Badge, type BadgeVariant } from './badge';
import { QrFrame } from './qr-frame';

type LinkRowStatus = 'active' | 'paused' | 'revoked';

type LinkRowProps = {
  /** The link's label (up to 60 characters, possibly unspaced: it wraps anywhere). */
  label: string;
  /** What guests may do, in words (e.g. «Лише перегляд»). */
  permissionsSummary: ReactNode;
  status: LinkRowStatus;
  /** The status in words; for a revoked link the whole line, e.g. «Відкликано 2 жов». */
  statusLabel: string;
  /** The creation date, already formatted; not shown for a revoked link (its label says when). */
  date: string;
  /** A 48px QR code; a dashed empty frame when absent (a revoked or hidden link). */
  qr?: ReactNode;
  /** The row's action: a `⋯` menu, or for a revoked link «Прибрати з історії». */
  menu?: ReactNode;
  className?: string;
};

/**
 * One additional guest link in a list (DESIGN-SYSTEM.md §5.15, §6.7). Phone: two lines (the
 * label, then what guests can do, the status and the date) beside a 48px QR and the menu; from a
 * 36rem list, one row. A revoked link stays as a record: muted, its label struck through, the
 * revocation date instead of a status tag, no QR; its one action removes it from the list.
 */
function LinkRow({
  label,
  permissionsSummary,
  status,
  statusLabel,
  date,
  qr,
  menu,
  className,
}: LinkRowProps) {
  const revoked = status === 'revoked';
  const badgeVariant: BadgeVariant = status === 'active' ? 'success' : 'warning';
  return (
    <div data-slot="link-row" data-status={status} className={cn('@container/link-row', className)}>
      <div
        className={cn('grid min-w-0 grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 py-3', {
          'text-muted-foreground': revoked,
        })}
      >
        {/* One row from a 36rem (576px) list; fixed status and date columns line up across rows. */}
        <QrFrame className="size-12 p-0.5">{revoked ? null : qr}</QrFrame>
        <div
          className={cn(
            'grid min-w-0 gap-1',
            '@[36rem]/link-row:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_10rem_6rem] @[36rem]/link-row:items-center @[36rem]/link-row:gap-4',
          )}
        >
          <p
            data-slot="link-row-label"
            className={cn('min-w-0 font-semibold [overflow-wrap:anywhere]', {
              'font-normal line-through decoration-muted-foreground': revoked,
            })}
          >
            {label}
          </p>
          <div
            className={cn(
              'flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm',
              '@[36rem]/link-row:contents',
            )}
          >
            <span className="min-w-0 text-muted-foreground [overflow-wrap:anywhere]">
              {permissionsSummary}
            </span>
            {revoked ? (
              <span className="text-sm">{statusLabel}</span>
            ) : (
              <Badge variant={badgeVariant} className="justify-self-start">
                {statusLabel}
              </Badge>
            )}
            {revoked ? null : <span className="type-data text-muted-foreground">{date}</span>}
          </div>
        </div>
        {/* Kept when empty, so every label starts at the same edge. */}
        <div className="flex min-w-11 justify-end">{menu}</div>
      </div>
    </div>
  );
}

export { LinkRow, type LinkRowProps, type LinkRowStatus };
