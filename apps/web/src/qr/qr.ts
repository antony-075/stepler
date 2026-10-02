import encodeQR from 'qr';

/**
 * QR codes for guest links, made in the browser (spec §4): the `qr` library only computes the
 * module matrix; the SVG and PNG are drawn here. Dark modules on white in both themes, so a code
 * stays scannable in dark mode and in print (DESIGN-SYSTEM.md §5.15, §11.3).
 */

/** Light modules around the symbol, in modules (the minimum the QR standard asks for). */
export const QR_QUIET_ZONE = 4;
/** The ink token (`--foreground` in light). */
export const QR_DARK = '#141614';
export const QR_LIGHT = '#FFFFFF';
/** Print size of the downloaded PNG. */
export const QR_PNG_SIZE = 2048;

const FILE_PREFIX = 'stepler-qr';
const FILE_TITLE_MAX = 60;

/** The module matrix (`true` = dark), without the quiet zone. Error correction M. */
export function qrMatrix(text: string): boolean[][] {
  // The library insists on a quiet zone; take the smallest (1) and slice it off, as its docs
  // suggest for custom renderers. The border never changes the symbol.
  const bordered = encodeQR(text, 'raw', { ecc: 'medium', border: 1 });
  return bordered.slice(1, -1).map((row) => row.slice(1, -1));
}

/** One path for every dark module, one unit per module, rows merged into runs. */
export function qrPath(matrix: boolean[][]): string {
  const parts: string[] = [];
  matrix.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x += 1;
        continue;
      }
      const start = x;
      while (x < row.length && row[x]) x += 1;
      parts.push(`M${start} ${y}h${x - start}v1h${start - x}z`);
    }
  });
  return parts.join('');
}

/** The viewBox of a matrix with its quiet zone; the symbol itself starts at 0 0. */
export function qrViewBox(modules: number): string {
  const side = modules + QR_QUIET_ZONE * 2;
  return `-${QR_QUIET_ZONE} -${QR_QUIET_ZONE} ${side} ${side}`;
}

/** A standalone SVG file: white square, quiet zone included, one crisp path. */
export function qrSvg(matrix: boolean[][], opts: { dark?: string } = {}): string {
  const side = matrix.length + QR_QUIET_ZONE * 2;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${qrViewBox(matrix.length)}" shape-rendering="crispEdges">`,
    `<rect x="-${QR_QUIET_ZONE}" y="-${QR_QUIET_ZONE}" width="${side}" height="${side}" fill="${QR_LIGHT}"/>`,
    `<path fill="${opts.dark ?? QR_DARK}" d="${qrPath(matrix)}"/>`,
    '</svg>',
  ].join('');
}

/** Whole-pixel modules, as large as fit with the quiet zone, the symbol centred. */
export function qrPngLayout(
  modules: number,
  sizePx: number,
): { modulePx: number; offsetPx: number } {
  const modulePx = Math.floor(sizePx / (modules + QR_QUIET_ZONE * 2));
  return { modulePx, offsetPx: Math.floor((sizePx - modulePx * modules) / 2) };
}

/** A square PNG for print (browser only: it draws on a canvas). */
export function qrPngBlob(matrix: boolean[][], sizePx = QR_PNG_SIZE): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = sizePx;
  canvas.height = sizePx;
  const context = canvas.getContext('2d');
  if (context === null) return Promise.reject(new Error('Canvas 2D is unavailable'));
  const { modulePx, offsetPx } = qrPngLayout(matrix.length, sizePx);
  context.fillStyle = QR_LIGHT;
  context.fillRect(0, 0, sizePx, sizePx);
  context.fillStyle = QR_DARK;
  matrix.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark)
        context.fillRect(offsetPx + x * modulePx, offsetPx + y * modulePx, modulePx, modulePx);
    }),
  );
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob === null ? reject(new Error('PNG encoding failed')) : resolve(blob)),
      'image/png',
    ),
  );
}

// Characters Windows, macOS or Linux refuse in a file name, and control characters.
// eslint-disable-next-line no-control-regex
const FORBIDDEN_IN_FILE_NAME = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;

/** `stepler-qr-{title}` without an extension: forbidden characters become spaces, 60 at most. */
export function qrFileName(title: string): string {
  const clean = title.replace(FORBIDDEN_IN_FILE_NAME, ' ').replace(/\s+/g, ' ').trim();
  const cut = Array.from(clean)
    .slice(0, FILE_TITLE_MAX)
    .join('')
    .replace(/[\s.]+$/, '');
  return cut === '' ? FILE_PREFIX : `${FILE_PREFIX}-${cut}`;
}

/** Saves a blob through a temporary link (no new window, nothing leaves the browser). */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  // Revoked on the next task: some browsers start the download only after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export type QrFileFormat = 'png' | 'svg';

/** Encodes `url` and saves it as `{fileBase}.png` (2048px, for print) or `{fileBase}.svg`. */
export async function downloadQr(url: string, fileBase: string, format: QrFileFormat) {
  const matrix = qrMatrix(url);
  const blob =
    format === 'png'
      ? await qrPngBlob(matrix)
      : new Blob([qrSvg(matrix)], { type: 'image/svg+xml' });
  downloadBlob(blob, `${fileBase}.${format}`);
}
