import type { GuestCover, GuestImage } from '@stepler/contracts';
import type { TemplateImage } from '@stepler/templates/react';

// The collection's cover for the guest page template ([A4], [A7]; plan Task 4). Only a `READY`
// cover reaches the guest context, with its upright source dimensions; the worker made a 480 px
// thumbnail and a 1600 px preview of it (longest side, never enlarged), so the srcset can say
// each rendition's real width and the browser picks the smaller one for a narrow column.

const THUMBNAIL_PX = 480;
const PREVIEW_PX = 1600;
const LARGE_PX = 2400;

/** The width of a rendition whose longest side is at most `px`, as the worker resizes. */
export function renditionWidth(width: number, height: number, px: number): number {
  const scale = Math.min(1, px / Math.max(width, height));
  return Math.round(width * scale);
}

/** The cover as a template image, or `null` when the admin set none (or it is not ready). */
export function coverImage(cover: GuestCover | null, onError?: () => void): TemplateImage | null {
  if (cover === null) return null;
  const { width, height } = cover;
  const thumbnail = renditionWidth(width, height, THUMBNAIL_PX);
  const preview = renditionWidth(width, height, PREVIEW_PX);
  const srcSet =
    thumbnail === preview
      ? `${cover.previewUrl} ${preview}w`
      : `${cover.thumbnailUrl} ${thumbnail}w, ${cover.previewUrl} ${preview}w`;
  return {
    src: cover.previewUrl,
    srcSet,
    // A default; the template passes the width its layout gives the picture.
    sizes: '100vw',
    width,
    height,
    ...(onError === undefined ? {} : { onError }),
  };
}

/**
 * The background as a template image: the 1600 px preview by default and, from 1024 px screens,
 * the 2400 px large rendition when the slot has made one.
 */
export function backgroundImage(
  background: GuestImage | null,
  onError?: () => void,
): TemplateImage | null {
  const image = coverImage(background, onError);
  if (image === null || background === null || background.largeUrl === null) return image;
  const large = renditionWidth(background.width, background.height, LARGE_PX);
  if (large === renditionWidth(background.width, background.height, PREVIEW_PX)) return image;
  return { ...image, srcSet: `${image.srcSet}, ${background.largeUrl} ${large}w` };
}
