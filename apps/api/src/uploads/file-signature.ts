import type { FileKind } from '@stepler/contracts';

// Content signatures for the allowed types (spec §10.1, [C17]), read from the first 4 KB of an
// uploaded object at completion. In-house on purpose: about fifteen rules, no `file-type`
// dependency (rule 14). Anything not recognised here (other ZIPs, SVG, HTML, executables) is
// refused; the browser's declared type is never trusted.

export interface DetectedType {
  kind: FileKind;
  mime: string;
}

/**
 * The detected MIME of any OOXML package. The signature cannot tell DOCX, XLSX and PPTX apart, so
 * the declared extension decides between them (see `verifiedMime`).
 */
export const OOXML_MIME = 'application/vnd.openxmlformats-officedocument';

const ascii = (bytes: Uint8Array, start: number, end: number): string =>
  String.fromCharCode(...bytes.subarray(start, end));

const startsWith = (bytes: Uint8Array, prefix: readonly number[], offset = 0): boolean =>
  bytes.length >= offset + prefix.length && prefix.every((b, i) => bytes[offset + i] === b);

const startsWithAscii = (bytes: Uint8Array, text: string, offset = 0): boolean =>
  bytes.length >= offset + text.length && ascii(bytes, offset, offset + text.length) === text;

const u32be = (bytes: Uint8Array, offset: number): number =>
  (((bytes[offset] ?? 0) << 24) |
    ((bytes[offset + 1] ?? 0) << 16) |
    ((bytes[offset + 2] ?? 0) << 8) |
    (bytes[offset + 3] ?? 0)) >>>
  0;

const u16le = (bytes: Uint8Array, offset: number): number =>
  (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);

/** HEIF still images (ISO/IEC 23008-12 brands); `mif1`/`msf1` are the generic HEIF brands. */
const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']);
/** ISO base media video brands (MP4, M4V, 3GP-style phone recordings). */
const MP4_BRANDS = new Set([
  'isom',
  'iso2',
  'iso3',
  'iso4',
  'iso5',
  'iso6',
  'mp41',
  'mp42',
  'avc1',
  'M4V ',
  'M4VH',
  'M4VP',
  'MSNV',
  'dash',
  '3gp4',
  '3gp5',
  '3gp6',
]);
const QUICKTIME_BRAND = 'qt  ';

/** AV1 still images (AVIF) are not on the allowed list (D3); browsers and the worker differ. */
const AVIF_BRANDS = new Set(['avif', 'avis']);
/** The generic HEIF brands say nothing about the codec inside. */
const GENERIC_HEIF_BRANDS = new Set(['mif1', 'msf1']);

const brandsOf = (bytes: Uint8Array): { major: string; compatible: string[] } => {
  const end = Math.min(u32be(bytes, 0), bytes.length);
  const compatible: string[] = [];
  for (let offset = 16; offset + 4 <= end; offset += 4) {
    compatible.push(ascii(bytes, offset, offset + 4));
  }
  return { major: ascii(bytes, 8, 12), compatible };
};

/** An `av01` item type anywhere in the head: an AV1-coded HEIF image, i.e. AVIF. */
const hasAv1Item = (bytes: Uint8Array): boolean => {
  for (let i = 0; i + 4 <= bytes.length; i += 1) {
    if (bytes[i] === 0x61 && ascii(bytes, i, i + 4) === 'av01') return true;
  }
  return false;
};

/**
 * `ftyp` box: major brand at 8, compatible brands from 16 to the box end (within the head).
 * AVIF is refused wherever its brand appears, and a generic `mif1`/`msf1` image counts as HEIC
 * only when an HEVC brand is compatible and no `av01` item shows.
 */
const isoBmff = (bytes: Uint8Array): DetectedType | null => {
  if (!startsWithAscii(bytes, 'ftyp', 4) || bytes.length < 12) return null;
  const { major, compatible } = brandsOf(bytes);
  if (AVIF_BRANDS.has(major) || compatible.some((brand) => AVIF_BRANDS.has(brand))) return null;
  if (GENERIC_HEIF_BRANDS.has(major)) {
    const hevc = compatible.some(
      (brand) => HEIF_BRANDS.has(brand) && !GENERIC_HEIF_BRANDS.has(brand),
    );
    return hevc && !hasAv1Item(bytes) ? { kind: 'PHOTO', mime: 'image/heic' } : null;
  }
  if (HEIF_BRANDS.has(major)) {
    return hasAv1Item(bytes) ? null : { kind: 'PHOTO', mime: 'image/heic' };
  }
  if (major === QUICKTIME_BRAND) return { kind: 'VIDEO', mime: 'video/quicktime' };
  if (MP4_BRANDS.has(major)) return { kind: 'VIDEO', mime: 'video/mp4' };
  // An unknown major brand (a vendor's own) still counts when a compatible brand is a video one.
  // HEIF is only taken from the major brand.
  for (const brand of compatible) {
    if (brand === QUICKTIME_BRAND) return { kind: 'VIDEO', mime: 'video/quicktime' };
    if (MP4_BRANDS.has(brand)) return { kind: 'VIDEO', mime: 'video/mp4' };
  }
  return null;
};

/** EBML header with DocType `webm` (Matroska `.mkv` is not an allowed type). */
const webm = (bytes: Uint8Array): DetectedType | null =>
  startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]) && ascii(bytes, 4, 64).includes('webm')
    ? { kind: 'VIDEO', mime: 'video/webm' }
    : null;

/**
 * A ZIP is OOXML when its first entry is one only OOXML packages start with; any other ZIP is an
 * archive and refused.
 */
const ooxml = (bytes: Uint8Array): DetectedType | null => {
  if (!startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return null;
  const nameLength = u16le(bytes, 26);
  const name = ascii(bytes, 30, 30 + nameLength);
  return name === '[Content_Types].xml' || name === '_rels/.rels' || name.startsWith('docProps/')
    ? { kind: 'DOCUMENT', mime: OOXML_MIME }
    : null;
};

/**
 * Plain text has no signature: valid UTF-8 (a character cut by the end of the slice is fine), no
 * NUL. Text that opens with markup (`<svg`, `<!doctype html`, `<?xml`) is refused like SVG/HTML.
 */
const text = (bytes: Uint8Array): DetectedType | null => {
  if (bytes.includes(0)) return null;
  let decoded: string;
  try {
    // `stream: true` holds back an incomplete trailing sequence instead of failing on it.
    decoded = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes, {
      stream: true,
    });
  } catch {
    return null;
  }
  return decoded.trimStart().startsWith('<') ? null : { kind: 'DOCUMENT', mime: 'text/plain' };
};

/** The allowed type of an object by its first bytes, or `null` when it is not one. */
export const detectFileType = (head: Uint8Array): DetectedType | null => {
  if (head.length === 0) return null;
  if (startsWith(head, [0xff, 0xd8, 0xff])) return { kind: 'PHOTO', mime: 'image/jpeg' };
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { kind: 'PHOTO', mime: 'image/png' };
  }
  if (startsWithAscii(head, 'GIF87a') || startsWithAscii(head, 'GIF89a')) {
    return { kind: 'PHOTO', mime: 'image/gif' };
  }
  if (startsWithAscii(head, 'RIFF') && startsWithAscii(head, 'WEBP', 8)) {
    return { kind: 'PHOTO', mime: 'image/webp' };
  }
  if (startsWithAscii(head, '%PDF-')) return { kind: 'DOCUMENT', mime: 'application/pdf' };
  // Executables and other binaries fall through to `text`, which refuses them (NUL or bad UTF-8).
  return isoBmff(head) ?? webm(head) ?? ooxml(head) ?? text(head);
};

/** Document formats that are one format under several names; anything else is its own family. */
const documentFamily = (mime: string): string => (mime.startsWith(OOXML_MIME) ? 'ooxml' : mime);

/**
 * The content agrees with the declared file type (owner decision 2026-10-03): photos and videos
 * match on kind alone, so a JPEG named `.png` or an MP4 named `.mov` is accepted and recorded
 * with its detected type (`verifiedMime`); documents must be the declared format (a PDF named
 * `.docx` is refused). Disallowed content never gets here: `detectFileType` returns `null`.
 */
export const matchesDeclared = (
  detected: DetectedType,
  declared: { kind: FileKind; canonicalMime: string },
): boolean =>
  detected.kind === declared.kind &&
  (detected.kind !== 'DOCUMENT' ||
    documentFamily(detected.mime) === documentFamily(declared.canonicalMime));

/**
 * The MIME type to record for a matching upload: the detected one, except for OOXML, where only
 * the declared extension tells DOCX, XLSX and PPTX apart.
 */
export const verifiedMime = (
  detected: DetectedType,
  declared: { kind: FileKind; canonicalMime: string },
): string => (detected.mime === OOXML_MIME ? declared.canonicalMime : detected.mime);
