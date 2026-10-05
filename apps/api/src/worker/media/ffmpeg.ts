import { run } from './exec.js';
import { PermanentMediaError } from './media-error.js';

// Video posters (spike S5): ffprobe and ffmpeg read the original straight from storage through a
// presigned GET URL with HTTP range requests (26–80 MB of a 2 GB file for a frame at 1 s), so
// nothing is downloaded. Hardening, because the file is a guest's:
// - `-threads 1`: inside a CPU-limited container ffmpeg sees every host core and starts that many
//   decoder threads; 4K HEVC then used 433 MB and was OOM-killed at 512 MB (174 MB with one);
// - `-protocol_whitelist`: only the URL's own scheme (and TLS/TCP under it), never `file`,
//   `data`, `udp`…;
// - `-format_whitelist`: only the demuxers of the allowed video types. An HLS or concat playlist
//   uploaded as a "video" would otherwise make ffmpeg fetch any URL it names, internal hosts
//   included (SSRF); the protocol whitelist alone does not stop http → http;
// - `-codec_whitelist`: only the decoders phone and camera videos use;
// - `-max_pixels`: a 750 KB MP4 can declare 16000×16000 frames and get ffprobe OOM-killed; above
//   40 MP (8K is 33 MP) the decoder refuses the stream instead, and a probe above it fails the
//   item before any frame is decoded;
// - `-rw_timeout` per read and a hard timeout per run (SIGKILL).
// The URL is a credential: it is passed as an argument (no shell) and removed from any error.

const PROBE_TIMEOUT_MS = 30_000;
const FRAME_TIMEOUT_MS = 60_000;
/** Microseconds: a read that stalls this long fails the run. */
const RW_TIMEOUT_US = '30000000';
/** Demuxers for MP4/MOV (one demuxer) and WebM (Matroska), the D3 video types. */
export const FORMAT_WHITELIST = 'mov,mp4,m4a,3gp,3g2,mj2,matroska,webm';
/**
 * Video decoders for MP4/MOV/WebM recordings, and the audio decoders stream probing may open
 * (the frame itself never decodes audio).
 */
export const CODEC_WHITELIST = [
  'h264',
  'hevc',
  'vp8',
  'vp9',
  'av1',
  'mpeg4',
  'prores',
  'mjpeg',
  'aac',
  'mp3',
  'opus',
  'vorbis',
  'alac',
  'flac',
  'ac3',
  'eac3',
  'pcm_s16le',
  'pcm_s16be',
  'pcm_s24le',
  'pcm_s24be',
  'pcm_f32le',
].join(',');
/** Largest frame a decoder may allocate: 8K (33 MP) fits. */
export const MAX_VIDEO_PIXELS = 40_000_000;
/** The frame fits in 1600×1600 (portrait and landscape), never upscaled, even dimensions. */
const FRAME_FILTER =
  "scale=w='min(1600,iw)':h='min(1600,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2";
/** stderr of a run that failed because of the file, not the network. */
const BAD_INPUT =
  /Invalid data found|moov atom not found|does not contain any stream|no video stream|Format not on whitelist|Codec .* not on whitelist|could not find codec parameters|Output file is empty|exceeds specified max pixel count|Could not allocate memory|Error while opening decoder/i;

/** `https,tls,tcp` for R2; `http,tcp` for the local emulator. Anything else is refused. */
export function protocolWhitelist(url: string): string {
  const scheme = new URL(url).protocol;
  if (scheme === 'https:') return 'https,tls,tcp';
  if (scheme === 'http:') return 'http,tcp';
  throw new Error('media URL must be http(s)');
}

const inputOptions = (url: string): string[] => [
  '-rw_timeout',
  RW_TIMEOUT_US,
  '-protocol_whitelist',
  protocolWhitelist(url),
  '-format_whitelist',
  FORMAT_WHITELIST,
  '-codec_whitelist',
  CODEC_WHITELIST,
  '-max_pixels',
  String(MAX_VIDEO_PIXELS),
];

export interface VideoProbe {
  /** `null` when the container does not say (some WebM). */
  durationMs: number | null;
  /** As displayed: swapped for a ±90° rotation (phone videos). */
  width: number;
  height: number;
}

interface ProbeOutput {
  streams?: {
    width?: number;
    height?: number;
    side_data_list?: { rotation?: number }[];
    tags?: { rotate?: string };
  }[];
  format?: { duration?: string };
}

/** Duration and displayed size of the first video stream. */
export async function probeVideo(url: string): Promise<VideoProbe> {
  const out = await run(
    'ffprobe',
    [
      '-v',
      'error',
      ...inputOptions(url),
      '-select_streams',
      'v:0',
      '-show_entries',
      'format=duration:stream=width,height:stream_side_data=rotation:stream_tags=rotate',
      '-of',
      'json',
      url,
    ],
    { timeoutMs: PROBE_TIMEOUT_MS, secrets: [url], permanentIf: BAD_INPUT },
  );
  let parsed: ProbeOutput;
  try {
    parsed = JSON.parse(out.toString('utf8')) as ProbeOutput;
  } catch {
    throw new PermanentMediaError('ffprobe printed no JSON');
  }
  const stream = parsed.streams?.[0];
  // A size of 0 is what ffprobe 5.1 reports over HTTP when the decoder refused the stream
  // (`-max_pixels`) yet the probe exited 0.
  if (
    stream?.width === undefined ||
    stream.height === undefined ||
    stream.width <= 0 ||
    stream.height <= 0
  ) {
    throw new PermanentMediaError('no video stream of a known size');
  }
  const rotation =
    stream.side_data_list?.find((side) => side.rotation !== undefined)?.rotation ??
    Number(stream.tags?.rotate ?? 0);
  if (stream.width * stream.height > MAX_VIDEO_PIXELS) {
    throw new PermanentMediaError(`video frame of ${stream.width}×${stream.height} is too large`);
  }
  const quarterTurn = Math.abs(rotation) % 180 === 90;
  const seconds = Number(parsed.format?.duration);
  return {
    durationMs: Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : null,
    width: quarterTurn ? stream.height : stream.width,
    height: quarterTurn ? stream.width : stream.height,
  };
}

/**
 * One frame at `atSeconds` as PNG, upright (ffmpeg applies the rotation), at most 1600 px wide.
 * `-ss` before `-i` seeks with range requests instead of decoding from the start.
 */
export async function extractFrame(url: string, atSeconds: number): Promise<Buffer> {
  const frame = await run(
    'ffmpeg',
    [
      '-v',
      'error',
      '-nostdin',
      '-threads',
      '1',
      '-filter_threads',
      '1',
      ...inputOptions(url),
      '-ss',
      atSeconds.toFixed(3),
      '-i',
      url,
      '-threads',
      '1',
      '-map',
      '0:v:0',
      '-frames:v',
      '1',
      '-an',
      '-sn',
      '-dn',
      '-vf',
      FRAME_FILTER,
      '-f',
      'image2pipe',
      '-c:v',
      'png',
      '-',
    ],
    { timeoutMs: FRAME_TIMEOUT_MS, secrets: [url], permanentIf: BAD_INPUT },
  );
  if (frame.length === 0) throw new PermanentMediaError('ffmpeg returned no frame');
  return frame;
}

/** The poster frame: at 1 s, or halfway through a shorter clip (spike S5: later frames cost). */
export const posterTime = (durationMs: number | null): number =>
  durationMs === null ? 0 : Math.min(1, durationMs / 2000);
