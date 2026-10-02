'use client';

import type { GuestLinkPermissions } from '@stepler/contracts';
import { cn } from '@stepler/ui/lib/utils';
import { Eye } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { fromPermissions } from './link-permissions';
import { ADD_TYPES } from './permission-types';

const CHIP =
  'inline-flex h-8 items-center gap-1.5 rounded-sheet border bg-background px-2.5 text-sm font-medium whitespace-nowrap text-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground';

/**
 * What a link lets guests add, as quiet chips with icons («Фото · Відео · Документи ·
 * Побажання», owner 2026-10-02): only what is allowed, from the link's real permissions. A link
 * where guests can add nothing says «Лише перегляд». A list named for screen readers; the chips
 * are not controls (the link page changes them).
 */
export function PermissionChips({
  permissions,
  className,
}: {
  permissions: GuestLinkPermissions;
  className?: string;
}) {
  const t = useTranslations('links.permissions');
  const form = fromPermissions(permissions);
  const allowed = ADD_TYPES.filter(({ name }) => form[name]);
  return (
    <ul
      data-slot="permission-chips"
      aria-label={t('chipsLabel')}
      className={cn('flex flex-wrap gap-2', className)}
    >
      {allowed.length === 0 ? (
        <li className={CHIP}>
          <Eye aria-hidden="true" />
          {t('viewOnlyChip')}
        </li>
      ) : (
        allowed.map(({ name, icon: Icon }) => (
          <li key={name} className={CHIP}>
            <Icon aria-hidden="true" />
            {t(`type.${name}.title`)}
          </li>
        ))
      )}
    </ul>
  );
}
