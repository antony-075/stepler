import { accessSync, constants } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { run } from './exec.js';
import { PermanentMediaError } from './media-error.js';

// HEIC/HEIF photos (iPhone) are HEVC-coded, which sharp's prebuilt libvips cannot decode. The
// libheif CLI (with libde265) decodes them to a temporary JPEG at quality 92, which sharp then
// reads (spike S5: about 2 s and 90 MB for 12 MP at 0.5 CPU, against 7 s via PNG).
// libheif applies the HEIF rotation and mirroring (`irot`/`imir`) while decoding but copies the
// EXIF Orientation tag unchanged, so the decoded JPEG is already upright and must NOT be
// auto-oriented again (`images.ts`).

const DECODE_TIMEOUT_MS = 30_000;
const JPEG_QUALITY = '92';

const onPath = (command: string): boolean =>
  (process.env.PATH ?? '').split(delimiter).some((dir) => {
    try {
      accessSync(join(dir, command), constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });

let decoder: string | undefined;

/**
 * `heif-dec` (libheif ≥ 1.17: Homebrew, Ubuntu 24.04) where it exists, else `heif-convert`
 * (Debian 12's libheif 1.15 in the worker image). Both take `-q <quality> <in> <out>`.
 */
export function heifDecoder(): string {
  decoder ??= onPath('heif-dec') ? 'heif-dec' : 'heif-convert';
  return decoder;
}

/**
 * Decodes the HEIC/HEIF file at `input` into `<workDir>/decoded.jpg` and returns that path.
 * A file with several top-level images is written as `decoded-1.jpg`, `decoded-2.jpg`, …;
 * the first one is used.
 */
export async function decodeHeic(input: string, workDir: string): Promise<string> {
  const output = join(workDir, 'decoded.jpg');
  await run(heifDecoder(), ['-q', JPEG_QUALITY, input, output], {
    timeoutMs: DECODE_TIMEOUT_MS,
    // Any message from the decoder on a failed run is about the file.
    permanentIf: /\S/,
  });
  const files = (await readdir(workDir)).filter((name) => /^decoded(-\d+)?\.jpg$/.test(name));
  const first = files.includes('decoded.jpg')
    ? 'decoded.jpg'
    : files.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))[0];
  if (first === undefined) throw new PermanentMediaError(`${heifDecoder()} wrote no image`);
  return join(workDir, first);
}

/** HEIC and HEIF need the CLI decoder; every other photo type sharp reads directly. */
export const needsHeifDecoder = (mimeType: string): boolean =>
  mimeType === 'image/heic' || mimeType === 'image/heif';
