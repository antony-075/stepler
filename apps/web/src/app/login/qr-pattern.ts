/** Modules per side of a version-1 QR code. */
const SIZE = 21;
const FINDER = 7;

/** A small deterministic PRNG (mulberry32), so server and client draw the same pattern. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function inFinderZone(x: number, y: number): boolean {
  const near = (v: number) => v <= FINDER;
  const far = (v: number) => v >= SIZE - FINDER - 1;
  return (near(x) && near(y)) || (far(x) && near(y)) || (near(x) && far(y));
}

function finderModule(x: number, y: number): boolean {
  const ox = x >= SIZE - FINDER ? SIZE - FINDER : 0;
  const oy = y >= SIZE - FINDER ? SIZE - FINDER : 0;
  const dx = x - ox;
  const dy = y - oy;
  if (dx < 0 || dy < 0 || dx >= FINDER || dy >= FINDER) return false; // the white separator
  const ring = Math.min(dx, dy, FINDER - 1 - dx, FINDER - 1 - dy);
  return ring !== 1;
}

/**
 * An SVG path (one unit per module, viewBox `0 0 21 21`) that looks like a QR code: the three
 * finder squares, the timing lines and a fixed random fill. It encodes nothing and is only an
 * illustration on the landing; real guest-link QR codes are generated from the link.
 */
export function qrIllustrationPath(seed = 20261002): string {
  const next = random(seed);
  const parts: string[] = [];
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      let dark: boolean;
      if (inFinderZone(x, y)) dark = finderModule(x, y);
      else if (x === 6 || y === 6) dark = (x + y) % 2 === 0;
      else dark = next() < 0.5;
      if (dark) parts.push(`M${x} ${y}h1v1h-1z`);
    }
  }
  return parts.join('');
}

export const QR_MODULES = SIZE;
