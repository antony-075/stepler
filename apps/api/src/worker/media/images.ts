import sharp, { type Sharp } from 'sharp';
import { PermanentMediaError } from './media-error.js';

// One image at a time per job, no libvips cache: the worker has 512 MB (spike S5) and every
// input is seen once. Set once, when the worker first loads this module.
sharp.cache(false);
sharp.concurrency(1);

/**
 * Larger inputs are refused before decoding (decompression bombs). JPEG (and so a decoded HEIC)
 * is shrunk while it loads, so 100 MP stays cheap; PNG, WebP and GIF are decoded whole, where a
 * 16-bit RGBA image costs 8 bytes a pixel, so they stop at 40 MP (phones shoot up to 48 MP, but
 * as HEIC or JPEG). Measured in ADR 0009.
 */
export const MAX_INPUT_PIXELS = 100_000_000;
export const MAX_DECODED_PIXELS = 40_000_000;
const SHRINK_ON_LOAD = new Set(['jpeg']);

/** Longest side of the grid thumbnail and of the viewer's preview (or a video's poster). */
export const THUMBNAIL_PX = 480;
export const PREVIEW_PX = 1600;
const THUMBNAIL_QUALITY = 70;
const PREVIEW_QUALITY = 80;

export interface Rendition {
  data: Buffer;
  width: number;
  height: number;
}

export interface Derivatives {
  thumbnail: Rendition;
  /** The 1600 px rendition: PREVIEW for photos, POSTER for videos. */
  large: Rendition;
  /** The upright dimensions of the source. */
  source: { width: number; height: number };
}

export interface RenderOptions {
  /**
   * Apply the EXIF orientation. `false` for input that is already upright: a decoded HEIC
   * (libheif applied the rotation and kept the tag) or a video frame (ffmpeg auto-rotates).
   */
  autoOrient: boolean;
}

const webp = async (pipeline: Sharp, size: number, quality: number): Promise<Rendition> => {
  const { data, info } = await pipeline
    .resize(size, size, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
};

/**
 * WebP thumbnail and preview of an image file or PNG frame. Metadata (EXIF with GPS, XMP, ICC
 * comments) is never copied: sharp writes none unless asked. Input errors (corrupt, unsupported,
 * over the pixel limit) are `PermanentMediaError`s.
 */
export async function renderDerivatives(
  input: string | Buffer,
  options: RenderOptions,
): Promise<Derivatives> {
  try {
    // The header first: the pixel limit depends on how the format decodes.
    const metadata = await sharp(input).metadata();
    const limit = SHRINK_ON_LOAD.has(metadata.format) ? MAX_INPUT_PIXELS : MAX_DECODED_PIXELS;
    // The first frame of an animated GIF/WebP (sharp's default `pages: 1`).
    const base = sharp(input, { limitInputPixels: limit, failOn: 'error' });
    const oriented = options.autoOrient ? base.autoOrient() : base;
    const source = options.autoOrient
      ? { width: metadata.autoOrient.width, height: metadata.autoOrient.height }
      : { width: metadata.width, height: metadata.height };
    const large = await webp(oriented.clone(), PREVIEW_PX, PREVIEW_QUALITY);
    const thumbnail = await webp(oriented.clone(), THUMBNAIL_PX, THUMBNAIL_QUALITY);
    return { thumbnail, large, source };
  } catch (error) {
    throw new PermanentMediaError(
      `image could not be processed: ${error instanceof Error ? error.message : 'unknown'}`,
    );
  }
}

/** The longest side of a background's large rendition (≥ 1024 px screens), and its quality. */
export const LARGE_PX = 2400;
export const LARGE_QUALITY = 72;

export type RenditionRole = 'thumbnail' | 'preview' | 'large';

const RENDITION_SIZE: Record<RenditionRole, { px: number; quality: number }> = {
  thumbnail: { px: THUMBNAIL_PX, quality: THUMBNAIL_QUALITY },
  preview: { px: PREVIEW_PX, quality: PREVIEW_QUALITY },
  large: { px: LARGE_PX, quality: LARGE_QUALITY },
};

/**
 * The WebP renditions `roles` of an admin image (plan Task 8): the same decoding, limits and
 * metadata stripping as `renderDerivatives`, never enlarged. `source` is the upright size.
 */
export async function renderRenditions<R extends RenditionRole>(
  input: string | Buffer,
  roles: readonly R[],
  options: RenderOptions,
): Promise<{ renditions: Record<R, Rendition>; source: { width: number; height: number } }> {
  try {
    const metadata = await sharp(input).metadata();
    const limit = SHRINK_ON_LOAD.has(metadata.format) ? MAX_INPUT_PIXELS : MAX_DECODED_PIXELS;
    const base = sharp(input, { limitInputPixels: limit, failOn: 'error' });
    const oriented = options.autoOrient ? base.autoOrient() : base;
    const source = options.autoOrient
      ? { width: metadata.autoOrient.width, height: metadata.autoOrient.height }
      : { width: metadata.width, height: metadata.height };
    const renditions = {} as Record<R, Rendition>;
    for (const role of roles) {
      const { px, quality } = RENDITION_SIZE[role];
      renditions[role] = await webp(oriented.clone(), px, quality);
    }
    return { renditions, source };
  } catch (error) {
    throw new PermanentMediaError(
      `image could not be processed: ${error instanceof Error ? error.message : 'unknown'}`,
    );
  }
}
