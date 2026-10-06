import { cn } from '@stepler/ui/lib/utils';
import { BrandMark } from './brand-mark';

/**
 * The app's loading screen (owner 2026-10-06): the brand «S» over a thin indeterminate line,
 * centred on the theme's page colour (the theme is in the server HTML, so no flash of the other
 * one). It fades in only after 180ms, so a fast load shows nothing at all; the line slides
 * (transform only) and stands still under reduced motion. `label` is the status read by screen
 * readers; `message`, when given, is also shown under the line.
 */
export function BrandLoading({
  label,
  message,
  className,
}: {
  label: string;
  message?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={cn('loading-delayed grid justify-items-center gap-4 text-center', className)}
    >
      <BrandMark kind="letter" className="h-11" />
      <span
        aria-hidden="true"
        className="relative block h-0.5 w-24 overflow-hidden rounded-full bg-track"
      >
        <span className="loading-line absolute inset-y-0 left-0 w-2/5 rounded-full bg-primary" />
      </span>
      {message === undefined ? (
        <span className="sr-only">{label}</span>
      ) : (
        <span className="text-sm text-muted-foreground">{message}</span>
      )}
    </div>
  );
}
