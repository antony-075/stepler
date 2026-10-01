'use client';

import { Button } from '@stepler/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@stepler/ui/components/dropdown-menu';
import { Check, Menu } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

export type AdminNavItem = { href: string; label: string };

/** `aria-current="page"` on an exact path match (until a slice adds nested pages). */
function useCurrent() {
  const pathname = usePathname();
  return (href: string) => (pathname === href ? ('page' as const) : undefined);
}

/**
 * The admin sections as inline links, from `md`. The current one is a tinted pill (not weight
 * alone) with `aria-current="page"`.
 */
export function AdminNav({ items }: { items: AdminNavItem[] }) {
  const t = useTranslations('app');
  const current = useCurrent();
  return (
    <nav aria-label={t('nav.label')} className="ml-4 hidden md:block lg:ml-6">
      <ul className="flex items-center gap-1">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={current(item.href)}
              className="inline-flex min-h-11 items-center rounded-lg px-3 text-[0.9375rem] font-semibold text-muted-foreground no-underline outline-none hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/70 aria-[current=page]:bg-foreground/[0.06] aria-[current=page]:text-foreground"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * The same sections behind a menu button on phones, placed before the brand. The current item is
 * primary with a check.
 */
export function AdminNavMenu({ items }: { items: AdminNavItem[] }) {
  const t = useTranslations('app');
  const current = useCurrent();
  return (
    <nav aria-label={t('nav.label')} className="-ml-2.5 md:hidden">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t('menu')} className="text-foreground">
            <Menu aria-hidden="true" className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {items.map((item) => (
            <DropdownMenuItem key={item.href} asChild>
              <Link
                href={item.href}
                aria-current={current(item.href)}
                className="justify-between no-underline aria-[current=page]:font-semibold aria-[current=page]:text-primary"
              >
                {item.label}
                {current(item.href) ? <Check aria-hidden="true" className="text-primary" /> : null}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
