import { Archive, Ban, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge, type BadgeVariant } from './badge';

/** The one display status of a collection (`collectionDisplayStatus` in `@stepler/contracts`). */
type CollectionDisplayStatus = 'BLOCKED' | 'DELETING' | 'ARCHIVED' | 'ACTIVE';

const LOOK: Record<CollectionDisplayStatus, { variant: BadgeVariant; icon?: ReactNode }> = {
  // An alert, not a state the owner chose: red with the ban sign.
  BLOCKED: { variant: 'danger', icon: <Ban /> },
  DELETING: { variant: 'neutral', icon: <Trash2 /> },
  ARCHIVED: { variant: 'neutral', icon: <Archive /> },
  // The one green status; its dot says so.
  ACTIVE: { variant: 'success' },
};

type CollectionStatusBadgeProps = {
  status: CollectionDisplayStatus;
  /** The translated status («Заблоковано», «В архіві», «Активна» or «Колекція активна»). */
  label: string;
  className?: string;
};

/**
 * One truthful collection status (owner remark S1, 2026-10-06): the same badge on the dashboard,
 * the collection page, the share dialog and the ops console. Precedence lives in the contracts
 * helper; this only maps the status to a tone and an icon, so a blocked collection is never also
 * «Активна». `data-status` carries the status for tests.
 */
function CollectionStatusBadge({ status, label, className }: CollectionStatusBadgeProps) {
  const look = LOOK[status];
  return (
    <Badge
      data-slot="collection-status"
      data-status={status}
      variant={look.variant}
      title={label}
      {...(look.icon === undefined ? {} : { icon: look.icon })}
      {...(className === undefined ? {} : { className })}
    >
      {label}
    </Badge>
  );
}

export { CollectionStatusBadge, type CollectionStatusBadgeProps, type CollectionDisplayStatus };
