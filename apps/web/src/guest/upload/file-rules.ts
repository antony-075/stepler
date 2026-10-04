import { type FileKind, fileTypeFor, type GuestContext } from '@stepler/contracts';

// The guest page's pre-check (PRODUCT §6.3 "preparing"): files the link cannot take never enter
// the queue, so a guest learns at once and nothing is sent for them. Only a convenience: the API
// checks the type and size again at initiation and the bytes at completion.

export type RejectReason = 'type' | 'size';

export interface PrecheckResult {
  accepted: { file: File; kind: FileKind }[];
  rejected: { name: string; reason: RejectReason }[];
  /** Acceptable files beyond `filesPerBatch`, left out («додано перші 100»). */
  truncated: number;
}

/** The file kinds this link takes. */
export function allowedKinds(permissions: GuestContext['permissions']): FileKind[] {
  const kinds: FileKind[] = [];
  if (permissions.canUploadPhotos) kinds.push('PHOTO');
  if (permissions.canUploadVideos) kinds.push('VIDEO');
  if (permissions.canUploadDocuments) kinds.push('DOCUMENT');
  return kinds;
}

const maxBytes = (kind: FileKind, limits: GuestContext['limits']): number =>
  kind === 'PHOTO'
    ? limits.maxFileBytes.photo
    : kind === 'VIDEO'
      ? limits.maxFileBytes.video
      : limits.maxFileBytes.document;

/**
 * Splits picked files into those to upload (in the picked order, at most `filesPerBatch`) and
 * those refused: a type the D3 list or this link does not take, or an empty or too large file.
 */
export function precheck(files: readonly File[], context: GuestContext): PrecheckResult {
  const kinds = allowedKinds(context.permissions);
  const ok: PrecheckResult['accepted'] = [];
  const rejected: PrecheckResult['rejected'] = [];
  for (const file of files) {
    const type = fileTypeFor(file.name, file.type);
    if (type === null || !kinds.includes(type.kind)) {
      rejected.push({ name: file.name, reason: 'type' });
    } else if (file.size < 1 || file.size > maxBytes(type.kind, context.limits)) {
      rejected.push({ name: file.name, reason: 'size' });
    } else {
      ok.push({ file, kind: type.kind });
    }
  }
  const limit = context.limits.filesPerBatch;
  return {
    accepted: ok.slice(0, limit),
    rejected,
    truncated: Math.max(0, ok.length - limit),
  };
}
