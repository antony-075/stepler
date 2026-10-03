import { z } from 'zod';
import { NO_CONTROL_CHARACTERS } from './text.js';

/** The content kinds that are files (texts are not uploaded). */
export const fileKindSchema = z.enum(['PHOTO', 'VIDEO', 'DOCUMENT']);
export type FileKind = z.infer<typeof fileKindSchema>;

export interface FileType {
  /** Lower case, without the dot. */
  ext: string;
  /** MIME types a browser may declare for this extension. */
  mimes: readonly string[];
  kind: FileKind;
  /** The MIME type the API records and serves for this extension. */
  canonicalMime: string;
}

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

const entry =
  (kind: FileKind) =>
  (ext: string, mimes: readonly [string, ...string[]]): FileType => ({
    ext,
    mimes,
    kind,
    canonicalMime: mimes[0],
  });
const photo = entry('PHOTO');
const video = entry('VIDEO');
const doc = entry('DOCUMENT');

/**
 * Allowed uploads (D3, spec §10.1); everything else, including SVG, HTML, archives and
 * executables, is refused. The extension decides; the declared MIME only has to agree. The first
 * MIME of each entry is the canonical one. Content signatures are checked again at completion.
 */
export const FILE_TYPES: readonly FileType[] = [
  photo('jpg', ['image/jpeg', 'image/pjpeg']),
  photo('jpeg', ['image/jpeg', 'image/pjpeg']),
  photo('png', ['image/png']),
  photo('webp', ['image/webp']),
  photo('heic', ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']),
  photo('heif', ['image/heif', 'image/heic', 'image/heif-sequence', 'image/heic-sequence']),
  photo('gif', ['image/gif']),
  video('mp4', ['video/mp4']),
  video('mov', ['video/quicktime', 'video/mp4']),
  video('webm', ['video/webm']),
  doc('pdf', ['application/pdf']),
  doc('docx', [DOCX]),
  doc('xlsx', [XLSX]),
  doc('pptx', [PPTX]),
  doc('txt', ['text/plain']),
];

const BY_EXT = new Map(FILE_TYPES.map((type) => [type.ext, type]));

/** What browsers send when they don't know the type (often for HEIC). */
const UNKNOWN_MIMES = new Set(['', 'application/octet-stream']);

/** `image/JPEG; charset=x` → `image/jpeg`. */
const normalizeMime = (mime: string): string => (mime.split(';')[0] ?? '').trim().toLowerCase();

/** Lower-cased extension after the last dot, or `''` (no dot, or a dot file like `.env`). */
export const extensionOf = (filename: string): string => {
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? filename.slice(dot + 1).toLowerCase() : '';
};

/**
 * The allowed type for a file name and the MIME type its browser declared, or `null`. Used by the
 * guest page's pre-check and by the API at initiation.
 */
export const fileTypeFor = (
  filename: string,
  declaredMime: string,
): { kind: FileKind; canonicalMime: string; ext: string } | null => {
  const type = BY_EXT.get(extensionOf(filename));
  if (type === undefined) return null;
  const mime = normalizeMime(declaredMime);
  if (!UNKNOWN_MIMES.has(mime) && !type.mimes.includes(mime)) return null;
  return { kind: type.kind, canonicalMime: type.canonicalMime, ext: type.ext };
};

/** `POST /api/v1/guest/collections/:collectionId/uploads`. */
export const createUploadRequestSchema = z
  .object({
    /** Chosen by the browser per file and kept across retries: initiation is idempotent on it. */
    clientUploadId: z.uuid(),
    filename: z
      .string()
      .min(1)
      .max(255)
      .regex(NO_CONTROL_CHARACTERS, 'Must not contain control characters'),
    /** As the browser declared it; may be empty. Never trusted, only compared. */
    mimeType: z.string().max(100),
    sizeBytes: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
export type CreateUploadRequest = z.infer<typeof createUploadRequestSchema>;

/**
 * How to send the bytes. `SINGLE`: one presigned `PUT` to `url`, with exactly `headers` (they are
 * signed). `MULTIPART`: parts of `partSizeBytes` (the last one shorter); part URLs come from
 * `POST …/uploads/:uploadId/parts`. `expiresAt` is the upload session's end, not the URL's.
 */
export const uploadSessionResponseSchema = z.discriminatedUnion('strategy', [
  z
    .object({
      uploadId: z.uuid(),
      strategy: z.literal('SINGLE'),
      url: z.url(),
      headers: z.object({ 'content-type': z.string() }).strict(),
      expiresAt: z.iso.datetime(),
    })
    .strict(),
  z
    .object({
      uploadId: z.uuid(),
      strategy: z.literal('MULTIPART'),
      partSizeBytes: z.number().int().min(1),
      partCount: z.number().int().min(1).max(10_000),
      expiresAt: z.iso.datetime(),
    })
    .strict(),
]);
export type UploadSessionResponse = z.infer<typeof uploadSessionResponseSchema>;

const partNumber = z.number().int().min(1).max(10_000);

/** `POST /api/v1/guest/collections/:collectionId/uploads/:uploadId/parts`. */
export const uploadPartsRequestSchema = z
  .object({ partNumbers: z.array(partNumber).min(1).max(100) })
  .strict()
  .refine((body) => new Set(body.partNumbers).size === body.partNumbers.length, {
    message: 'Part numbers must be unique',
    path: ['partNumbers'],
  });
export type UploadPartsRequest = z.infer<typeof uploadPartsRequestSchema>;

/** Each URL signs its part's exact `Content-Length`. */
export const uploadPartsResponseSchema = z
  .object({
    parts: z.array(z.object({ partNumber, url: z.url() }).strict()),
    expiresAt: z.iso.datetime(),
  })
  .strict();
export type UploadPartsResponse = z.infer<typeof uploadPartsResponseSchema>;

/** `…/uploads/:uploadId/…` path parameters. */
export const guestUploadParamsSchema = z.object({ collectionId: z.uuid(), uploadId: z.uuid() });
