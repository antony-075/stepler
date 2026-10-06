import { cn } from '@stepler/ui/lib/utils';

const DECORATIVE = '';

/**
 * The Stepler mark (option B «Степлер», 2026-10-06; docs/design/brand): a white geometric S on a
 * Stepler-blue rounded square with a red staple across its corner. The light and dark files
 * swap with the theme (`brand-on-light` / `brand-on-dark` in globals.css, which follow the system
 * setting and an explicit choice).
 * Decorative: the link around it is named by the wordmark next to it, or by its own label.
 */
export function BrandMark({
  className,
  kind = 'mark',
}: {
  className?: string;
  /** `letter`: the wordmark's own «S» in blue, nothing else (the folded sidebar). */
  kind?: 'mark' | 'letter';
}) {
  const file = kind === 'letter' ? 'letter-s' : 'mark';
  return (
    <span aria-hidden="true" className={cn('inline-flex shrink-0', className)}>
      {/* Plain <img>: a 1 KB SVG gains nothing from image optimisation. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/brand/${file}-light.svg`}
        alt={DECORATIVE}
        width={24}
        height={24}
        className="brand-on-light h-full w-auto"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/brand/${file}-dark.svg`}
        alt={DECORATIVE}
        width={24}
        height={24}
        className="brand-on-dark h-full w-auto"
      />
    </span>
  );
}
