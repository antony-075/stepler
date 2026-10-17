import { rm, stat, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import { hasPrlimit } from './decode.js';
import { run } from './exec.js';
import { BAD_INPUT, localInputOptions } from './ffmpeg.js';
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
// Fail closed: a read exiftool reports as incomplete (`Skipping …`, `Truncated …`), anything left
// after stripping, or a rewrite that does not keep the image size or every stream bit for bit,
// is a `PermanentMediaError` (guests never get the original). ffprobe and ffmpeg run with the
// same hardening as for posters (`localInputOptions`). Not covered: GPS in timed metadata tracks
// (dashcams, GoPro GPMF), maker notes and embedded media; documents are out of scope.

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
/** A `location` key exiftool cannot delete by name: rebuild `Keys` from the tags it knows. */
const REBUILD_KEYS = ['-Keys:all=', '-tagsFromFile', '@', '-Keys:all'];
/** ffprobe tag keys that hold a place: `location`, `location-eng`, `com.apple…ISO6709`, `©xyz`. */
const LOCATION_KEY = /location|gps|xyz|iso6709/i;
/** exiftool warnings that mean it did not read the whole file, so it may have missed a tag. */
const INCOMPLETE_READ = /Skipping|Truncated/i;

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
 * streams the media data, so even an 844 MB MP4 peaked at 70 MB RSS; a crafted box size or a
 * compressed XMP block that inflates to 1 GB makes Perl stop with `Out of memory!` instead.
 */
export const EXIFTOOL_MAX_BYTES = 300 * 1024 * 1024;
/**
 * exiftool output for files it cannot read or rewrite (`Error: Not a valid JPEG`, `Error: Writing
 * of this type of file is not supported`, Perl's `Out of memory!` under the cap). Its own I/O
 * failures (`Error: Error writing …`) are retried, unless the disk had room (`rewrite`).
 */
export const EXIFTOOL_BAD_FILE =
  /^Error: (?!Error (creating|writing|renaming|opening|copying)|.*(No space|Permission denied|already exists))|Out of memory/m;

const exiftool = (args: readonly string[], timeoutMs: number) => {
  const base = ['-api', 'LargeFileSupport=1', ...args];
  const [command, commandArgs] = hasPrlimit()
    ? ['prlimit', [`--as=${EXIFTOOL_MAX_BYTES}`, '--', 'exiftool', ...base]]
    : ['exiftool', base];
  return run(command, commandArgs, { timeoutMs, permanentIf: EXIFTOOL_BAD_FILE });
};

/** exiftool's first JSON record, or a `PermanentMediaError`. */
function firstRecord(out: Buffer): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(out.toString('utf8'));
  } catch {
    throw new PermanentMediaError('exiftool printed no JSON');
  }
  const first = Array.isArray(parsed) ? (parsed[0] as Record<string, unknown> | undefined) : null;
  if (first === undefined || first === null) throw new PermanentMediaError('exiftool read nothing');
  return first;
}

/**
 * exiftool's warnings, grouped by where it met them: `ExifTool:Warning`, or with `-G1` the track
 * (`Track4:Warning` in an iPhone MOV: "The ExtractEmbedded option may find more tags…").
 */
const isWarning = (key: string): boolean => /(^|:)Warning$/.test(key);

/** Fails closed when exiftool says it did not read the whole file (any `…:Warning`). */
export function assertCompleteRead(record: Record<string, unknown>): void {
  const warnings = Object.entries(record)
    .filter(([key]) => isWarning(key))
    .flatMap(([, value]): unknown[] => (Array.isArray(value) ? (value as unknown[]) : [value]))
    .map(String);
  const incomplete = warnings.find((warning) => INCOMPLETE_READ.test(warning));
  if (incomplete !== undefined) {
    throw new PermanentMediaError(`exiftool could not read the whole file: ${incomplete}`);
  }
}

/** The location tags exiftool finds in the file (`group:name` → value), composites excluded. */
export async function exiftoolLocationTags(path: string): Promise<Record<string, unknown>> {
  const out = await exiftool(
    ['-j', '-a', '-G1', '-e', '-Warning', ...LOCATION_TAGS.map((tag) => `-${tag}`), path],
    READ_TIMEOUT_MS,
  );
  const record = firstRecord(out);
  assertCompleteRead(record);
  return locationTagsOf(record);
}

/** The tags of an exiftool record, without its file name, own fields and warnings. */
export function locationTagsOf(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(
      ([key]) => key !== 'SourceFile' && !key.startsWith('ExifTool:') && !isWarning(key),
    ),
  );
}

/** A photo's stored size, from its own header. */
async function imageSize(path: string): Promise<string> {
  const record = firstRecord(
    await exiftool(['-j', '-n', '-ImageWidth', '-ImageHeight', path], READ_TIMEOUT_MS),
  );
  return `${String(record.ImageWidth)}×${String(record.ImageHeight)}`;
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
      ...localInputOptions(),
      '-show_entries',
      'format_tags:stream=index:stream_tags',
      '-of',
      'json',
      path,
    ],
    { timeoutMs: READ_TIMEOUT_MS, permanentIf: BAD_INPUT },
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

/** A SHA-256 per stream of every packet, copied without decoding: equal means bit-identical. */
export async function streamHashes(path: string): Promise<string> {
  const out = await run(
    'ffmpeg',
    [
      '-v',
      'error',
      '-nostdin',
      ...localInputOptions(),
      '-i',
      path,
      '-map',
      '0',
      '-c',
      'copy',
      '-f',
      'streamhash',
      '-hash',
      'sha256',
      '-',
    ],
    { timeoutMs: WRITE_TIMEOUT_MS, permanentIf: BAD_INPUT },
  );
  return out.toString('utf8');
}

async function hasLocation(path: string, mimeType: string): Promise<boolean> {
  if (EXIFTOOL_TYPES.has(mimeType) && Object.keys(await exiftoolLocationTags(path)).length > 0) {
    return true;
  }
  if (!VIDEO_TYPES.has(mimeType)) return false;
  const keys = await ffprobeLocationKeys(path);
  return keys.format.length > 0 || keys.streams.length > 0;
}

/**
 * exiftool says `Error writing output file` for a full disk and for some corrupt files alike:
 * with room to spare (twice the input), it was the file.
 */
async function rewrite(args: readonly string[], input: string, workDir: string): Promise<void> {
  try {
    await exiftool(args, WRITE_TIMEOUT_MS);
  } catch (error) {
    if (error instanceof PermanentMediaError) throw error;
    const [{ size }, disk] = await Promise.all([stat(input), statfs(workDir)]);
    if (disk.bavail * disk.bsize > 2 * size) {
      throw new PermanentMediaError(
        `exiftool could not rewrite the file: ${error instanceof Error ? error.message : ''}`,
      );
    }
    throw error;
  }
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
      ...localInputOptions(),
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
    { timeoutMs: WRITE_TIMEOUT_MS, permanentIf: BAD_INPUT },
  );
}

/** The rewrite kept the photo's size, or every stream of the video bit for bit. */
async function assertSameMedia(input: string, output: string, mimeType: string): Promise<void> {
  if (VIDEO_TYPES.has(mimeType)) {
    if ((await streamHashes(output)) !== (await streamHashes(input))) {
      throw new PermanentMediaError('the rewritten video does not have the same streams');
    }
  } else if ((await imageSize(output)) !== (await imageSize(input))) {
    throw new PermanentMediaError('the rewritten photo does not have the same size');
  }
}

export type StripResult =
  /** Nothing to remove: the original stays as it is (no upload). */
  | { changed: false }
  /** The sanitised copy at `path`, to replace the original. */
  | { changed: true; path: string };

/**
 * Removes location metadata from the file at `input` (of the verified type `mimeType`) into
 * `<workDir>/sanitized`. The input is never modified, so a retry starts from the same bytes; at
 * most two copies of the file exist at any time.
 */
export async function stripLocation(
  input: string,
  mimeType: string,
  workDir: string,
): Promise<StripResult> {
  const supported = EXIFTOOL_TYPES.has(mimeType) || mimeType === 'video/webm';
  if (!supported) throw new PermanentMediaError(`no location stripping for ${mimeType}`);
  if (!(await hasLocation(input, mimeType))) return { changed: false };

  // No extension: exiftool writes the input's own format whatever the name (an output named
  // `.webp` for a RIFF input would even be refused: "Can't write RIFF files").
  const output = join(workDir, 'sanitized');
  if (EXIFTOOL_TYPES.has(mimeType)) {
    await rewrite([...DELETE_LOCATION, '-o', output, input], input, workDir);
    if (QUICKTIME_TYPES.has(mimeType) && (await hasLocation(output, mimeType))) {
      // A `location` key exiftool cannot delete by name (ffmpeg's `use_metadata_tags`): again
      // from the input, rebuilding `Keys`; the first try goes first, so two copies at most.
      await rm(output, { force: true });
      await rewrite([...REBUILD_KEYS, ...DELETE_LOCATION, '-o', output, input], input, workDir);
    }
  } else {
    await remuxWithoutLocation(input, output);
  }
  if (await hasLocation(output, mimeType)) {
    throw new PermanentMediaError('location metadata is still present after stripping');
  }
  await assertSameMedia(input, output, mimeType);
  return { changed: true, path: output };
}
