// Small local previews for the upload grid. A phone photo decodes to 50–200 MB (12–48 MP); ten of
// them as full-size <img> took iOS Safari past its memory limit and the tab was killed mid-pick
// (owner remark, billing M4 round, 2026-10-15). So each preview is decoded once, drawn into a
// THUMB_PX canvas and kept as a small JPEG, strictly one file at a time; the original is never
// shown. A browser that cannot decode the file gets no preview (the type tile).

/** The longer side of a local preview; the grid tiles are at most ~160 CSS px at 2x. */
export const THUMB_PX = 320;
const JPEG_QUALITY = 0.75;

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

async function render(file: Blob): Promise<string | null> {
  if (typeof createImageBitmap !== 'function') return null;
  // Browsers that support the resize options decode straight to the small size; the rest decode
  // the original once here, which is then closed before the next file starts.
  const bitmap = await createImageBitmap(file, { resizeWidth: THUMB_PX, resizeQuality: 'medium' });
  try {
    const size = fitWithin(bitmap.width, bitmap.height, THUMB_PX);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (context === null) return null;
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    // Frees the canvas backing store at once (iOS keeps it until GC otherwise).
    canvas.width = 0;
    canvas.height = 0;
    return blob === null ? null : URL.createObjectURL(blob);
  } finally {
    bitmap.close();
  }
}

/** A small object URL for `file`, or `null` when it cannot be decoded here. Revoke it when done. */
export function localThumbnail(file: Blob): Promise<string | null> {
  return serial(() => render(file).catch(() => null));
}
