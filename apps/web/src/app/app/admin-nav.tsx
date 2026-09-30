'use client';

import { Button } from '@stepler/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@stepler/ui/components/dropdown-menu';
import { Menu } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

export type AdminNavItem = { href: string; label: string };

/**
 * The admin sections: inline links from `md`, a menu button on phones. The current section has
 * `aria-current="page"` (an exact path match until a slice adds nested pages).
 */
export function AdminNav({ items }: { items: AdminNavItem[] }) {
  const t = useTranslations('app');
  const pathname = usePathname();
  const current = (href: string) => (pathname === href ? 'page' : undefined);

  return (
    <nav aria-label={t('nav.label')}>
      <ul className="hidden items-center gap-1 md:flex">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={current(item.href)}
              className="inline-flex min-h-11 items-center rounded-lg px-3 font-semibold text-muted-foreground no-underline outline-none hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/70 aria-[current=page]:text-foreground aria-[current=page]:underline aria-[current=page]:decoration-primary aria-[current=page]:decoration-2 aria-[current=page]:underline-offset-8"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('menu')}
            className="text-foreground md:hidden"
          >
            <Menu aria-hidden="true" className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {items.map((item) => (
            <DropdownMenuItem key={item.href} asChild>
              <Link
                href={item.href}
                aria-current={current(item.href)}
                className="no-underline aria-[current=page]:font-bold"
              >
                {item.label}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
