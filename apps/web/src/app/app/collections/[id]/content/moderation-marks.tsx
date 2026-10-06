import type { AdminContentItem } from '@stepler/contracts';
import { Badge } from '@stepler/ui/components/badge';
import type { FrameRing } from '@stepler/ui/components/frame';
import { useTranslations } from 'next-intl';

export type ModerationMark = 'reported' | 'hidden' | 'moderated';

/**
 * A frame's moderation marks in reading order (slice 9, R2, R3): «Скарга» while it has open
 * reports the admin has not dismissed; «Приховано» when the admin hid it; «Приховано
 * модерацією» when the Stepler operator did.
 */
export function moderationMarks(item: Pick<AdminContentItem, 'moderation'>): ModerationMark[] {
  const marks: ModerationMark[] = [];
  if (item.moderation.openReports > 0) marks.push('reported');
  if (item.moderation.hidden?.by === 'ADMIN') marks.push('hidden');
  if (item.moderation.hidden?.by === 'OPERATOR') marks.push('moderated');
  return marks;
}

const VARIANT = { reported: 'warning', hidden: 'neutral', moderated: 'danger' } as const;

/** The tile's inner ring (F2): a hide's colour wins over a report's. */
export function moderationRing(marks: readonly ModerationMark[]): FrameRing | undefined {
  if (marks.includes('moderated')) return 'destructive';
  if (marks.includes('hidden')) return 'muted';
  if (marks.includes('reported')) return 'warning';
  return undefined;
}

/** The marks as Badges for `Frame.marks`; the same words go into the tile's name. */
export function ModerationMarks({ marks }: { marks: ModerationMark[] }) {
  const t = useTranslations('content.moderation.marks');
  if (marks.length === 0) return null;
  return (
    <>
      {marks.map((mark) => (
        <Badge key={mark} variant={VARIANT[mark]}>
          {t(mark)}
        </Badge>
      ))}
    </>
  );
}
