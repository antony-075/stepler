// Small local previews for the upload grid. A phone photo decodes to 50–200 MB (12–48 MP); ten of
// them as full-size <img> took iOS Safari past its memory limit and the tab was killed mid-pick
// (owner remark, billing M4 round, 2026-10-15). So each preview is decoded once, drawn into a
// THUMB_PX canvas and kept as a small JPEG, strictly one file at a time; the original is never
// shown. A browser that cannot decode the file gets no preview (the type tile).
// Videos get the same small JPEG of one frame (owner remark 2026-10-16: ten videos were ten
// identical «MOV» tiles): the file is opened in a detached muted <video>, seeked once and drawn;
// the element and its object URL go before the next file starts. A video the browser cannot
// play here (HEVC outside Safari) or one that does not answer in VIDEO_TIMEOUT_MS keeps its tile.

/** The longer side of a local preview; the grid tiles are at most ~160 CSS px at 2x. */
export const THUMB_PX = 320;
const JPEG_QUALITY = 0.75;
/** A video that has not shown a frame by then gets no preview, so the queue moves on. */
export const VIDEO_TIMEOUT_MS = 8_000;
/** The frame a video preview shows: a second in (past a black first frame), or its middle. */
export const videoFrameTime = (durationSeconds: number): number =>
  Number.isFinite(durationSeconds) && durationSeconds > 0 ? Math.min(1, durationSeconds / 2) : 0;

let chain: Promise<unknown> = Promise.resolve();

/** Runs `task` after every earlier one, so only one original is decoded at any moment. */
function serial<T>(task: () => Promise<T>): Promise<T> {
  const next = chain.then(task, task);
  chain = next.catch(() => undefined);
  return next;
}

/** The target size that fits `width × height` into `max` on the longer side, never enlarging. */
export function fitWithin(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** `source` drawn at most THUMB_PX on its longer side, as a small JPEG object URL. */
async function toJpegUrl(
  source: CanvasImageSource,
  width: number,
  height: number,
): Promise<string | null> {
  const size = fitWithin(width, height, THUMB_PX);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (context === null) return null;
  context.drawImage(source, 0, 0, size.width, size.height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  );
  // Frees the canvas backing store at once (iOS keeps it until GC otherwise).
  canvas.width = 0;
  canvas.height = 0;
  return blob === null ? null : URL.createObjectURL(blob);
}

async function renderPhoto(file: Blob): Promise<string | null> {
  if (typeof createImageBitmap !== 'function') return null;
  // Browsers that support the resize options decode straight to the small size; the rest decode
  // the original once here, which is then closed before the next file starts.
  const bitmap = await createImageBitmap(file, { resizeWidth: THUMB_PX, resizeQuality: 'medium' });
  try {
    return await toJpegUrl(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

/** Resolves on `event`, rejects on the element's `error` or after VIDEO_TIMEOUT_MS. */
function once(video: HTMLVideoElement, event: 'loadeddata' | 'seeked'): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (ok: boolean) => {
      clearTimeout(timer);
      video.removeEventListener(event, onEvent);
      video.removeEventListener('error', onError);
      if (ok) resolve();
      else reject(new Error(`video ${event} did not happen`));
    };
    const onEvent = () => done(true);
    const onError = () => done(false);
    const timer = setTimeout(() => done(false), VIDEO_TIMEOUT_MS);
    video.addEventListener(event, onEvent);
    video.addEventListener('error', onError);
  });
}

async function renderVideo(file: Blob): Promise<string | null> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  try {
    const loaded = once(video, 'loadeddata');
    video.src = url;
    await loaded;
    const at = videoFrameTime(video.duration);
    if (at > 0) {
      const seeked = once(video, 'seeked');
      video.currentTime = at;
      await seeked;
    }
    if (video.videoWidth === 0 || video.videoHeight === 0) return null;
    return await toJpegUrl(video, video.videoWidth, video.videoHeight);
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

/** A small object URL for `file`, or `null` when it cannot be decoded here. Revoke it when done. */
export function localThumbnail(file: Blob): Promise<string | null> {
  const render = file.type.startsWith('video/') ? renderVideo : renderPhoto;
  return serial(() => render(file).catch(() => null));
}
