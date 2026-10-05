// Small pieces every template layout shares (plan PR K): the picture of the cover or background,
// and the page backdrop for an image background. Copy-free: the app passes every word in.
import type { TemplateImage } from './model.ts';

/** Decorative: the h1 names the collection; a background is decoration. */
const DECORATIVE = '';

/**
 * A presigned picture with its own dimensions (nothing shifts while it loads). `eager` for the
 * first thing seen (a cover above the fold): fetched early, at high priority.
 */
export function TemplatePicture({
  image,
  sizes,
  eager = false,
  className,
}: {
  image: TemplateImage;
  /** The rendered width; the template knows its column. */
  sizes: string;
  eager?: boolean;
  className?: string;
}) {
  return (
    // A presigned storage URL: nothing for an image optimiser to do.
    <img
      src={image.src}
      srcSet={image.srcSet}
      sizes={sizes}
      alt={DECORATIVE}
      width={image.width}
      height={image.height}
      decoding="async"
      loading={eager ? 'eager' : 'lazy'}
      {...(eager ? { fetchPriority: 'high' as const } : {})}
      onError={image.onError}
      className={className}
    />
  );
}

/**
 * The page backdrop of an image background: the picture fixed behind the page, under the
 * template's veil at the resolved dimming (`--tpl-bg-image-veil`, never below what keeps the
 * text readable). Nothing when there is no background image.
 */
export function TemplateBackdrop({ image }: { image: TemplateImage | null }) {
  if (image === null) return null;
  return (
    <div
      aria-hidden="true"
      data-slot="template-backdrop"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-(--tpl-veil)"
    >
      <TemplatePicture image={image} sizes="100vw" className="size-full object-cover" />
      <div className="absolute inset-0 bg-(--tpl-veil) opacity-(--tpl-bg-image-veil)" />
    </div>
  );
}
