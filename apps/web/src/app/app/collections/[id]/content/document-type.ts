import type { AdminContentItem } from '@stepler/contracts';

/** `PDF`, `DOCX`…: the original name's extension, upper case; `''` without one. */
export function documentType(item: Pick<AdminContentItem, 'originalFilename'>): string {
  const name = item.originalFilename ?? '';
  return name.includes('.') ? (name.split('.').pop()?.toUpperCase() ?? '') : '';
}
