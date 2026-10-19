'use client';

import { buttonVariants } from '@stepler/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@stepler/ui/components/dialog';
import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import { Menu } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { LanguageSwitch } from '@/i18n/language-switch';
import { CURRENT_SECTION, useCurrentSection } from './section-nav';
import { NAV_SECTIONS, ROUTE, sectionHref } from './sections';

/**
 * The header's menu below 1280px: a sheet from the top over the page (Radix Dialog: focus moves
 * in and stays, Escape and the close button close it, focus returns to «Меню»). The anchors close
 * it as they jump, so the section is not hidden behind it; sign-in, the trial and the language
 * live here on phones, where the header keeps only the logo.
 */
export function MobileMenu({
  onLanding = true,
  signedIn = false,
}: {
  onLanding?: boolean;
  signedIn?: boolean;
}) {
  const t = useTranslations('home.nav');
  const [open, setOpen] = useState(false);
  const current = useCurrentSection();
  const close = () => setOpen(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'xl:hidden')}
        aria-label={t('openMenu')}
      >
        <Menu aria-hidden="true" className="size-5" />
      </DialogTrigger>
      <DialogContent
        closeLabel={t('closeMenu')}
        className="top-0 left-0 w-full max-w-none translate-x-0 translate-y-0 rounded-none rounded-b-dialog border-x-0 border-t-0 sm:max-w-none motion-safe:data-[state=open]:slide-in-from-top-2"
      >
        <DialogTitle className="sr-only">{t('menuTitle')}</DialogTitle>
        <DialogDescription className="sr-only">{t('label')}</DialogDescription>
        <nav aria-label={t('label')}>
          <ul className="grid gap-1 pt-6">
            {NAV_SECTIONS.map((key) => (
              <li key={key}>
                <a
                  href={sectionHref(key, onLanding)}
                  aria-current={key === current ? CURRENT_SECTION : undefined}
                  onClick={close}
                  className={cn(
                    'flex min-h-12 items-center rounded-control px-2 text-lg font-medium text-foreground no-underline hover:bg-hover-ghost aria-[current=location]:bg-pencil-soft aria-[current=location]:text-link',
                    focusRing,
                  )}
                >
                  {t(key)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="grid gap-3 border-t pt-5">
          {signedIn ? (
            <Link href={ROUTE.app} className={cn(buttonVariants({ size: 'lg' }), 'w-full')}>
              {t('openApp')}
            </Link>
          ) : (
            <>
              <Link href={ROUTE.register} className={cn(buttonVariants({ size: 'lg' }), 'w-full')}>
                {t('trial')}
              </Link>
              <Link
                href={ROUTE.login}
                className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'w-full')}
              >
                {t('login')}
              </Link>
            </>
          )}
          <div className="flex justify-start pt-1">
            <LanguageSwitch variant="header" />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
