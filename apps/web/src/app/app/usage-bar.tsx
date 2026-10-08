import { cn } from '@stepler/ui/lib/utils';
import { meterPercent } from './usage-meter';

/**
 * A thin decorative usage meter: the share used, in the accent, with the minimum visible fill
 * (`meterPercent`). Always next to words that carry the numbers, so it is hidden from screen
 * readers. The dashboard's usage line and «Тариф і оплата» share it; `className` sets the size.
 */
export function UsageBar({
  used,
  limit,
  className,
}: {
  used: number;
  limit: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn('block h-1 w-14 overflow-hidden rounded-full bg-track', className)}
    >
      <span
        className="block h-full rounded-full bg-primary"
        style={{ width: `${meterPercent(used, limit)}%` }}
      />
    </span>
  );
}
