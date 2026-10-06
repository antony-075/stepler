'use client';

import type { GuestLinkPermissions } from '@stepler/contracts';
import { cn } from '@stepler/ui/lib/utils';
import { Eye } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { fromPermissions } from './link-permissions';
import { ADD_TYPES } from './permission-types';

const CHIP = {
  default:
    'inline-flex h-7 items-center gap-1.5 rounded-control bg-muted px-2 text-[0.875rem] whitespace-nowrap text-foreground-soft [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground',
  /** The dashboard's tiles and cards (V1): 22px. */
  compact:
    'inline-flex h-[1.375rem] items-center gap-1.5 rounded-[5px] bg-muted px-1.5 text-xs whitespace-nowrap text-foreground-soft [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground',
  /**
   * The dashboard's table: the icons only, each named (screen readers, the tooltip), until the
   * table (`@container/table`) has room for the labels on one line (86rem), then labelled chips.
   */
  icons:
    'inline-flex h-[1.625rem] min-w-[1.625rem] items-center justify-center gap-1.5 rounded-[5px] bg-muted text-xs whitespace-nowrap text-foreground-soft @min-[86rem]/table:h-[1.375rem] @min-[86rem]/table:px-1.5 [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground',
} as const;

/**
 * What a link lets guests add, as quiet chips with icons («Фото · Відео · Документи ·
 * Побажання», owner 2026-10-02): only what is allowed, from the link's real permissions. A link
 * where guests can add nothing says «Лише перегляд». A list named for screen readers; the chips
 * are not controls (the link page changes them).
 */
export function PermissionChips({
  permissions,
  size = 'default',
  className,
}: {
  permissions: GuestLinkPermissions;
  size?: keyof typeof CHIP;
  className?: string;
}) {
  const t = useTranslations('links.permissions');
  const form = fromPermissions(permissions);
  const allowed = ADD_TYPES.filter(({ name }) => form[name]);
  return (
    <ul
      data-slot="permission-chips"
      aria-label={t('chipsLabel')}
      className={cn(
        'flex',
        size === 'icons' ? 'flex-nowrap gap-1' : 'flex-wrap',
        size === 'compact' ? 'gap-1' : size === 'default' ? 'gap-1.5' : null,
        className,
      )}
    >
      {allowed.length === 0 ? (
        <li className={CHIP[size]} {...(size === 'icons' ? { title: t('viewOnlyChip') } : {})}>
          <Eye aria-hidden="true" />
          <span className={cn({ 'sr-only @min-[86rem]/table:not-sr-only': size === 'icons' })}>
            {t('viewOnlyChip')}
          </span>
        </li>
      ) : (
        allowed.map(({ name, icon: Icon }) => {
          const label = t(`type.${name}.title`);
          return size === 'icons' ? (
            <li key={name} className={CHIP.icons} title={label}>
              <Icon aria-hidden="true" />
              <span className="sr-only @min-[86rem]/table:not-sr-only">{label}</span>
            </li>
          ) : (
            <li key={name} className={CHIP[size]}>
              <Icon aria-hidden="true" />
              {label}
            </li>
          );
        })
      )}
    </ul>
  );
}
