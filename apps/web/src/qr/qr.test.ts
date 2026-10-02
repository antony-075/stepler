import decodeQR from 'qr/decode.js';
import { describe, expect, it } from 'vitest';
import { QR_QUIET_ZONE, qrFileName, qrMatrix, qrPngLayout, qrSvg } from './qr';

const URL_70 = `http://127.0.0.1:3100/g/${'A'.repeat(43)}`;

/** Paints a matrix (with its quiet zone) into RGBA pixels, `scale` px per module. */
function toImage(matrix: boolean[][], scale = 4) {
  const modules = matrix.length + QR_QUIET_ZONE * 2;
  const side = modules * scale;
  const data = new Uint8Array(side * side * 4).fill(255);
  matrix.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (!dark) return;
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const px = (x + QR_QUIET_ZONE) * scale + dx;
          const py = (y + QR_QUIET_ZONE) * scale + dy;
          data.fill(0, (py * side + px) * 4, (py * side + px) * 4 + 3);
        }
      }
    }),
  );
  return { width: side, height: side, data };
}

describe('qrMatrix', () => {
  it('is a square with an odd side of at least 21 modules', () => {
    const matrix = qrMatrix(URL_70);
    expect(matrix.length).toBeGreaterThanOrEqual(21);
    expect(matrix.length % 2).toBe(1);
    for (const row of matrix) expect(row).toHaveLength(matrix.length);
  });

  it('decodes back to the same URL', () => {
    expect(decodeQR(toImage(qrMatrix(URL_70)))).toBe(URL_70);
  });
});

describe('qrSvg', () => {
  const matrix = qrMatrix(URL_70);
  const svg = qrSvg(matrix);

  it('is one crisp path on a white background', () => {
    expect(svg.match(/<path/g)).toHaveLength(1);
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).toMatch(/<rect[^>]*fill="#FFFFFF"/);
  });

  it('has a viewBox that includes the 4-module quiet zone', () => {
    const side = matrix.length + 8;
    expect(svg).toContain(`viewBox="-4 -4 ${side} ${side}"`);
  });

  it('uses the given dark colour', () => {
    expect(qrSvg(matrix, { dark: '#000000' })).toContain('fill="#000000"');
  });
});

describe('qrPngLayout', () => {
  it('uses whole-pixel modules with at least the quiet zone around them', () => {
    const modules = qrMatrix(URL_70).length;
    const { modulePx, offsetPx } = qrPngLayout(modules, 2048);
    expect(Number.isInteger(modulePx)).toBe(true);
    expect(Number.isInteger(offsetPx)).toBe(true);
    expect(offsetPx).toBeGreaterThanOrEqual(QR_QUIET_ZONE * modulePx);
    expect(offsetPx * 2 + modulePx * modules).toBeLessThanOrEqual(2048);
    // As large as fits: one more pixel per module would not leave room for the quiet zone.
    expect((modulePx + 1) * (modules + QR_QUIET_ZONE * 2)).toBeGreaterThan(2048);
  });
});

describe('qrFileName', () => {
  it('strips characters that file names cannot hold', () => {
    expect(qrFileName('Весілля: Олі/Тараса?')).toBe('stepler-qr-Весілля Олі Тараса');
  });

  it('falls back to the bare prefix when nothing is left', () => {
    expect(qrFileName('///')).toBe('stepler-qr');
    expect(qrFileName('   ')).toBe('stepler-qr');
  });

  it('keeps at most 60 characters of the title', () => {
    expect(qrFileName('а'.repeat(100))).toBe(`stepler-qr-${'а'.repeat(60)}`);
  });
});
