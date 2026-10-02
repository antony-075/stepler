'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@stepler/ui/components/tooltip';
import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import { Layers, UserCog, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

type Section = { key: 'collections' | 'account'; href: string; icon: LucideIcon };

// Only what works (owner 2026-10-02): no statistics or help entries until they exist. The
// account (theme, language) comes right under the collections, styled and opened the same way.
const COLLECTIONS: Section = { key: 'collections', href: '/app', icon: Layers };
const ACCOUNT: Section = { key: 'account', href: '/app/account', icon: UserCog };

/** «Акаунт» owns /app/account; every other admin page belongs to the collections. */
export function currentSection(pathname: string): Section['key'] {
  return pathname === ACCOUNT.href || pathname.startsWith(`${ACCOUNT.href}/`)
    ? 'account'
    : 'collections';
}

/** `page` on the section's own page; `true` inside it (a collection's pages). */
const currentValue = (pathname: string, href: string): 'page' | 'true' =>
  pathname === href ? 'page' : 'true';

/**
 * The admin's two sections (DESIGN-SYSTEM.md §6.0, owner decisions 2026-10-02): «Колекції», then
 * «Акаунт» right under it, in the sidebar from `lg` and in the menu sheet below it.
 * Top level only: a collection's own sections are its tabs, and the breadcrumbs say where you
 * are. 44px rows, an icon and the name; the current section sits on a sheet (`--card`, a 1px
 * edge) in the foreground colour with `aria-current` (`page` on its own page, `true` inside it),
 * the others muted until hover. `collapsed` (the desktop icon rail) keeps each name for screen
 * readers and shows it as a tooltip on hover and focus. `onNavigate` closes the menu sheet.
 */
export function AdminNav({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const t = useTranslations('app.nav');
  return (
    <nav aria-label={t('label')}>
      <ul className="grid gap-1">
        <NavItem section={COLLECTIONS} collapsed={collapsed} onNavigate={onNavigate} />
        <NavItem section={ACCOUNT} collapsed={collapsed} onNavigate={onNavigate} />
      </ul>
    </nav>
  );
}

function NavItem({
  section: { key, href, icon: Icon },
  collapsed,
  onNavigate,
}: {
  section: Section;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const t = useTranslations('app.nav');
  const pathname = usePathname();
  const active = currentSection(pathname) === key;
  const label = t(key);
  const link = (
    <Link
      href={href}
      onClick={onNavigate}
      {...(active ? { 'aria-current': currentValue(pathname, href) } : {})}
      className={cn(
        'flex min-h-11 items-center gap-3 rounded-control border border-transparent px-3 text-[0.9375rem] font-semibold text-muted-foreground no-underline transition-colors duration-(--duration-fast) hover:bg-hover hover:text-foreground motion-reduce:transition-none',
        focusRing,
        {
          'border-border bg-card text-foreground hover:bg-card': active,
          'justify-center px-0': collapsed,
        },
      )}
    >
      <Icon aria-hidden="true" className="size-[1.125rem] shrink-0" />
      <span className={cn({ 'sr-only': collapsed })}>{label}</span>
    </Link>
  );
  return (
    <li>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      ) : (
        link
      )}
    </li>
  );
}
