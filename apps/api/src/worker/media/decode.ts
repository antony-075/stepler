import { accessSync, constants } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { run } from './exec.js';

// HEIC/HEIF photos (iPhone) are HEVC-coded, which sharp's prebuilt libvips cannot decode. The
// libheif CLI (with libde265) decodes them to a temporary JPEG at quality 92, which sharp then
// reads (spike S5: about 2 s and 90 MB for 12 MP at 0.5 CPU, against 7 s via PNG).
// libheif applies the HEIF rotation and mirroring (`irot`/`imir`) while decoding but copies the
// EXIF Orientation tag unchanged, so the decoded JPEG is already upright and must NOT be
// auto-oriented again (`images.ts`).

const DECODE_TIMEOUT_MS = 30_000;
const JPEG_QUALITY = '92';
/**
 * Address-space cap for the decoder (Linux `prlimit --as`). A 28 KB HEIC can declare an
 * 11000×11000 image and get the decoder OOM-killed; under the cap it fails cleanly instead.
 * Measured in the worker image (0.5 CPU, 512 MB): a 12 MP HEIC decodes under 200 MB, a 48 MP one
 * under 300 MB. With one media job at a time (`MediaSlots`) the worker stays under 512 MB.
 */
export const HEIF_DECODE_MAX_BYTES = 300 * 1024 * 1024;
/** Messages libheif's CLI prints for files it cannot read; anything else (disk, tool) retries. */
const BAD_HEIF =
  /Could not (read|decode)|Invalid input|does not appear to start|is a (JPEG|PNG)|Unsupported|Decoder plugin generated an error|No 'ftyp'/i;

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
let prlimit: boolean | undefined;

/** Whether `prlimit` (util-linux) can cap the decoder's memory. */
export function hasPrlimit(): boolean {
  prlimit ??= onPath('prlimit');
  return prlimit;
}

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
  const args = ['-q', JPEG_QUALITY, input, output];
  // Linux (the worker image, CI) caps the decoder's memory; macOS has no prlimit, so local
  // development runs it uncapped.
  const [command, commandArgs] = hasPrlimit()
    ? ['prlimit', [`--as=${HEIF_DECODE_MAX_BYTES}`, '--', heifDecoder(), ...args]]
    : [heifDecoder(), args];
  await run(command, commandArgs, { timeoutMs: DECODE_TIMEOUT_MS, permanentIf: BAD_HEIF });
  const files = (await readdir(workDir)).filter((name) => /^decoded(-\d+)?\.jpg$/.test(name));
  const first = files.includes('decoded.jpg')
    ? 'decoded.jpg'
    : files.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))[0];
  // heif-convert 1.15 exits 0 when it cannot write its output (a full disk): retry.
  if (first === undefined) throw new Error(`${heifDecoder()} wrote no image`);
  return join(workDir, first);
}

/** HEIC and HEIF need the CLI decoder; every other photo type sharp reads directly. */
export const needsHeifDecoder = (mimeType: string): boolean =>
  mimeType === 'image/heic' || mimeType === 'image/heif';
