'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@stepler/ui/components/tooltip';
import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import { Layers, UserCog, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { LegalLinks } from '@/legal/legal-links';

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
 * are. 36px rows with a mouse (44px on touch and in the menu sheet), an icon and the name; the
 * current section sits on a white chip with a 1px edge and an indigo icon (V1) with
 * `aria-current` (`page` on its own page, `true` inside it), the others soft until hover. `collapsed` (the desktop icon rail) keeps each name for screen
 * readers and shows it as a tooltip on hover and focus. `onNavigate` closes the menu sheet. The
 * legal links sit at the bottom of the sidebar and the menu sheet, hidden in the icon rail.
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
    <div className="flex flex-1 flex-col gap-6">
      <nav aria-label={t('label')}>
        <ul className="grid gap-0.5">
          <NavItem section={COLLECTIONS} collapsed={collapsed} onNavigate={onNavigate} />
          <NavItem section={ACCOUNT} collapsed={collapsed} onNavigate={onNavigate} />
        </ul>
      </nav>
      {collapsed ? null : <LegalLinks variant="nav" className="mt-auto" />}
    </div>
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
        'flex min-h-11 items-center gap-2.5 rounded-control px-2.5 text-[0.9375rem] text-foreground-soft no-underline transition-colors duration-(--duration-fast) hover:bg-hover hover:text-foreground motion-reduce:transition-none lg:min-h-9 lg:text-sm pointer-coarse:min-h-11',
        '[&>svg]:text-muted-foreground',
        focusRing,
        {
          'bg-card font-medium text-foreground shadow-[inset_0_0_0_1px_var(--border)] hover:bg-card [&>svg]:text-primary':
            active,
          'justify-center px-0': collapsed,
        },
      )}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
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
