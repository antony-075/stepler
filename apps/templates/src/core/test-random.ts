import type { Hex } from '@stepler/contracts';

/** A small seeded PRNG (mulberry32), so the fuzz tests are repeatable. Tests only. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `count` random `#RRGGBB` colours from `seed`. */
export function randomColors(seed: number, count: number): Hex[] {
  const random = seededRandom(seed);
  return Array.from(
    { length: count },
    () =>
      `#${Math.floor(random() * 0x1000000)
        .toString(16)
        .padStart(6, '0')
        .toUpperCase()}`,
  );
}
