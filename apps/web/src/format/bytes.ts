// File sizes in decimal units, as the limits are stated (D2: «50 МБ», «2 ГБ»), localized by
// `Intl.NumberFormat` (`unit` style), e.g. «1,2 ГБ» / «1.2 GB».

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
