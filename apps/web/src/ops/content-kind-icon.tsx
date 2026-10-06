import type { ContentKind } from '@stepler/contracts';
import { FileText, Image, Type, Video } from 'lucide-react';

const ICONS = { PHOTO: Image, VIDEO: Video, DOCUMENT: FileText, TEXT: Type } as const;

/** A frame's kind as a small icon; the label goes next to it or into the accessible name. */
export function ContentKindIcon({ kind }: { kind: ContentKind }) {
  const Icon = ICONS[kind];
  return <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />;
}
