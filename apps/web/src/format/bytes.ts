// Sizes, localized by `Intl.NumberFormat` (`unit` style), e.g. «1,2 ГБ» / «1.2 GB». Two kinds,
// one convention each (owner 2026-10-08, «Тариф і оплата» redesign):
// - storage space (the account's limit and usage, a pack's size, a collection's total, upgrades)
//   is sold in whole binary units (`10 × 2^30` bytes, seeded tiers) and named «10 ГБ», like every
//   storage product does: `formatStorage`, the only formatter for it, so a limit, its usage and
//   a pack's size always share a base («3,2 ГБ з 20 ГБ», never «з 21 ГБ»);
// - a single file's size and the per-file upload limits are decimal, as the limits are stated
//   (D2: «50 МБ», «2 ГБ» = 2·10^9 bytes): `formatBytes`.

interface UnitOptions {
  style: 'unit';
  unit: string;
  maximumFractionDigits?: number;
}

type NumberFormatter = (value: number, options: UnitOptions) => string;

const UNITS = [
  { unit: 'gigabyte', size: 1e9 },
  { unit: 'megabyte', size: 1e6 },
  { unit: 'kilobyte', size: 1e3 },
] as const;

/** `format` is next-intl's `useFormatter().number` (or any Intl-backed formatter). */
export function formatBytes(format: NumberFormatter, bytes: number): string {
  for (const { unit, size } of UNITS) {
    if (bytes >= size) {
      const value = bytes / size;
      return format(value, {
        style: 'unit',
        unit,
        maximumFractionDigits: value < 10 ? 1 : 0,
      });
    }
  }
  return format(bytes, { style: 'unit', unit: 'byte' });
}

const STORAGE_UNITS = [
  { unit: 'terabyte', size: 1024 ** 4 },
  { unit: 'gigabyte', size: 1024 ** 3 },
  { unit: 'megabyte', size: 1024 ** 2 },
  { unit: 'kilobyte', size: 1024 },
] as const;

/**
 * Storage space in binary units named ГБ/МБ: `10 × 2^30` bytes → «10 ГБ», `20 × 2^30` → «20 ГБ».
 * One decimal below 10 («3,2 ГБ»), whole units above.
 */
export function formatStorage(format: NumberFormatter, bytes: number): string {
  for (const { unit, size } of STORAGE_UNITS) {
    if (bytes >= size) {
      const value = bytes / size;
      return format(value, {
        style: 'unit',
        unit,
        maximumFractionDigits: value < 10 ? 1 : 0,
      });
    }
  }
  return format(bytes, { style: 'unit', unit: 'byte' });
}

/** «1:05» or «1:02:05» from milliseconds. */
export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}
