import { join } from 'node:path';
import { hasPrlimit } from './decode.js';
import { run } from './exec.js';
import { CODEC_WHITELIST, FORMAT_WHITELIST } from './ffmpeg.js';
import { PermanentMediaError } from './media-error.js';

// Location stripping (ADR 0008 addendum 2026-10-05). Guests can download each other's originals
// in a shared gallery, and phones write where a photo or video was taken into the file. Before
// any preview is made, the worker removes ONLY the location metadata from the original, without
// re-encoding: the capture date, orientation, colour profile and camera stay, and the image data
// and video streams are byte-for-byte the same.
// - Photos (JPEG, PNG, WebP, GIF, HEIC) and MP4/MOV: exiftool, which rewrites only metadata
//   blocks (JPEG segments, PNG/WebP chunks, the HEIF `iloc`/Exif item, the QuickTime `moov` box)
//   and copies the rest. Tags: the EXIF GPS IFD, XMP GPS and IPTC/XMP place names (exiftool's
//   `Location` group), and the QuickTime ones phones use: `©xyz` (UserData:GPSCoordinates),
//   Apple's `com.apple.quicktime.location.ISO6709` (Keys:GPSCoordinates), `loci`
//   (UserData:LocationInformation), and ffmpeg-style `location` keys (which exiftool cannot
//   delete one by one: it then rebuilds the `Keys` box without them).
// - WebM: exiftool cannot write Matroska, so ffmpeg remuxes (`-c copy`, every stream, all other
//   tags kept) only when a location tag is present; browser recordings carry none.
// Every result is read back; anything left is a `PermanentMediaError` (the item is FAILED and
// guests never get the original). Not covered: GPS in timed metadata tracks (dashcams, GoPro
// GPMF) and maker notes; documents are out of scope (follow-up).

/** Read and delete the same set (exiftool allows wildcards for both). */
const LOCATION_TAGS = [
  'location:all',
  'gps:all',
  'XMP-exif:GPS*',
  'Keys:*GPS*',
  'Keys:*Location*',
  'UserData:*GPS*',
  'UserData:*Location*',
  'ItemList:*GPS*',
  'ItemList:*Location*',
];
/** `-m`: minor errors (a slightly off maker note) do not stop the rewrite. */
const DELETE_LOCATION = ['-m', '-q', ...LOCATION_TAGS.map((tag) => `-${tag}=`)];
/** ffprobe tag keys that hold a place: `location`, `location-eng`, `com.apple…ISO6709`, `©xyz`. */
const LOCATION_KEY = /location|gps|xyz|iso6709/i;

const EXIFTOOL_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'video/mp4',
  'video/quicktime',
]);
const QUICKTIME_TYPES = new Set(['video/mp4', 'video/quicktime']);
const VIDEO_TYPES = new Set([...QUICKTIME_TYPES, 'video/webm']);

const READ_TIMEOUT_MS = 60_000;
/** exiftool copies the whole file: 844 MB took 6.5 s in the worker image; 2 GB on a slow disk. */
const WRITE_TIMEOUT_MS = 300_000;
/**
 * Address-space cap for exiftool (Linux `prlimit --as`), as for the HEIF decoder: exiftool
 * streams the media data, so even an 844 MB MP4 peaked at 70 MB RSS; a crafted box size cannot
 * make Perl take the worker's memory.
 */
export const EXIFTOOL_MAX_BYTES = 300 * 1024 * 1024;
/**
 * exiftool messages for files it cannot rewrite (`Error: Not a valid JPEG`, `Error: Writing of
 * this type of file is not supported`, …). Its own I/O failures (`Error: Error writing …`, a
 * full disk) are retried.
 */
const BAD_FILE =
  /^Error: (?!Error (creating|writing|renaming|opening)|.*(No space|Permission denied|already exists))/m;

const exiftool = (args: readonly string[], timeoutMs: number) => {
  const base = ['-api', 'LargeFileSupport=1', ...args];
  const [command, commandArgs] = hasPrlimit()
    ? ['prlimit', [`--as=${EXIFTOOL_MAX_BYTES}`, '--', 'exiftool', ...base]]
    : ['exiftool', base];
  return run(command, commandArgs, { timeoutMs, permanentIf: BAD_FILE });
};

/** The location tags exiftool finds in the file (`group:name` → value), composites excluded. */
export async function exiftoolLocationTags(path: string): Promise<Record<string, unknown>> {
  const out = await exiftool(
    ['-j', '-a', '-G1', '-e', ...LOCATION_TAGS.map((tag) => `-${tag}`), path],
    READ_TIMEOUT_MS,
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(out.toString('utf8'));
  } catch {
    throw new PermanentMediaError('exiftool printed no JSON');
  }
  const first = Array.isArray(parsed) ? (parsed[0] as Record<string, unknown> | undefined) : null;
  if (first === undefined || first === null) throw new PermanentMediaError('exiftool read nothing');
  return Object.fromEntries(
    Object.entries(first).filter(([key]) => key !== 'SourceFile' && !key.startsWith('ExifTool:')),
  );
}

interface ProbeTags {
  format?: { tags?: Record<string, string> };
  streams?: { index: number; tags?: Record<string, string> }[];
}

/** Location tag keys of the container (`format`) and of each stream, as ffprobe sees them. */
export async function ffprobeLocationKeys(
  path: string,
): Promise<{ format: string[]; streams: { index: number; keys: string[] }[] }> {
  const out = await run(
    'ffprobe',
    [
      '-v',
      'error',
      '-protocol_whitelist',
      'file',
      '-format_whitelist',
      FORMAT_WHITELIST,
      '-codec_whitelist',
      CODEC_WHITELIST,
      '-show_entries',
      'format_tags:stream=index:stream_tags',
      '-of',
      'json',
      path,
    ],
    {
      timeoutMs: READ_TIMEOUT_MS,
      permanentIf: /Invalid data found|moov atom not found|whitelist/i,
    },
  );
  let parsed: ProbeTags;
  try {
    parsed = JSON.parse(out.toString('utf8')) as ProbeTags;
  } catch {
    throw new PermanentMediaError('ffprobe printed no JSON');
  }
  const locationKeys = (tags: Record<string, string> | undefined) =>
    Object.keys(tags ?? {}).filter((key) => LOCATION_KEY.test(key));
  return {
    format: locationKeys(parsed.format?.tags),
    streams: (parsed.streams ?? [])
      .map((stream) => ({ index: stream.index, keys: locationKeys(stream.tags) }))
      .filter((stream) => stream.keys.length > 0),
  };
}

async function hasLocation(path: string, mimeType: string): Promise<boolean> {
  if (EXIFTOOL_TYPES.has(mimeType) && Object.keys(await exiftoolLocationTags(path)).length > 0) {
    return true;
  }
  if (!VIDEO_TYPES.has(mimeType)) return false;
  const keys = await ffprobeLocationKeys(path);
  return keys.format.length > 0 || keys.streams.length > 0;
}

/** WebM: a stream copy of every stream with the location keys emptied (ffmpeg drops those). */
async function remuxWithoutLocation(input: string, output: string): Promise<void> {
  const keys = await ffprobeLocationKeys(input);
  await run(
    'ffmpeg',
    [
      '-v',
      'error',
      '-nostdin',
      '-threads',
      '1',
      '-protocol_whitelist',
      'file',
      '-format_whitelist',
      FORMAT_WHITELIST,
      '-i',
      input,
      '-map',
      '0',
      '-c',
      'copy',
      '-map_metadata',
      '0',
      ...keys.format.flatMap((key) => ['-metadata', `${key}=`]),
      ...keys.streams.flatMap((stream) =>
        stream.keys.flatMap((key) => [`-metadata:s:${stream.index}`, `${key}=`]),
      ),
      '-f',
      'webm',
      output,
    ],
    { timeoutMs: WRITE_TIMEOUT_MS, permanentIf: /Invalid data found|whitelist|EBML/i },
  );
}

export type StripResult =
  /** Nothing to remove: the original stays as it is (no upload). */
  | { changed: false }
  /** The sanitised copy at `path`, to replace the original. */
  | { changed: true; path: string };

/**
 * Removes location metadata from the file at `input` (of the verified type `mimeType`) into
 * `<workDir>/sanitized`. The input is never modified, so a retry starts from the same bytes.
 */
export async function stripLocation(
  input: string,
  mimeType: string,
  workDir: string,
): Promise<StripResult> {
  const supported = EXIFTOOL_TYPES.has(mimeType) || mimeType === 'video/webm';
  if (!supported) throw new PermanentMediaError(`no location stripping for ${mimeType}`);
  if (!(await hasLocation(input, mimeType))) return { changed: false };

  let output = join(workDir, 'sanitized');
  if (EXIFTOOL_TYPES.has(mimeType)) {
    await exiftool([...DELETE_LOCATION, '-o', output, input], WRITE_TIMEOUT_MS);
    if (QUICKTIME_TYPES.has(mimeType) && (await hasLocation(output, mimeType))) {
      // A `location` key exiftool cannot write (ffmpeg's `-movflags use_metadata_tags`): the
      // `Keys` box is rebuilt from the tags exiftool knows, which drops it.
      const rebuilt = join(workDir, 'sanitized-keys');
      await exiftool(
        [
          '-Keys:all=',
          '-tagsFromFile',
          '@',
          '-Keys:all',
          ...DELETE_LOCATION,
          '-o',
          rebuilt,
          output,
        ],
        WRITE_TIMEOUT_MS,
      );
      output = rebuilt;
    }
  } else {
    await remuxWithoutLocation(input, output);
  }
  if (await hasLocation(output, mimeType)) {
    throw new PermanentMediaError('location metadata is still present after stripping');
  }
  return { changed: true, path: output };
}
