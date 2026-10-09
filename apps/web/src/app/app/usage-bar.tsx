import { cn } from '@stepler/ui/lib/utils';
import { meterPercent } from './usage-meter';

/**
 * A thin decorative usage meter: the share used, in the accent, with the minimum visible fill
 * (`meterPercent`). Always next to words that carry the numbers, so it is hidden from screen
 * readers. The dashboard's usage line and «Тариф і оплата» share it; `className` sets the size,
 * `tone` the fill (warning near the limit, destructive over it, on «Ліміти акаунта»).
 */
export function UsageBar({
  used,
  limit,
  className,
  tone = 'default',
}: {
  used: number;
  limit: number;
  className?: string;
  tone?: 'default' | 'warning' | 'destructive';
}) {
  return (
    <span
      aria-hidden="true"
      className={cn('block h-1 w-14 overflow-hidden rounded-full bg-track', className)}
    >
      <span
        className={cn(
          'block h-full rounded-full',
          tone === 'default' && 'bg-primary',
          tone === 'warning' && 'bg-warning',
          tone === 'destructive' && 'bg-destructive',
        )}
        style={{ width: `${meterPercent(used, limit)}%` }}
      />
    </span>
  );
}
