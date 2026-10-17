'use client';

// Design pass (owner remark 2026-10-16: «темніше з чорним акцентом», a left sidebar or header
// navigation, strict, UX over looks; ui-ux-pro-max: Swiss minimal, dense, high contrast;
// web-design-guidelines, responsive-design). The console is a tool for one service account,
// never to be mistaken for the user app:
// - its own surface (`data-surface="ops"`, apps/web globals.css): a darker page, white panels,
//   black for primary actions, the current place, links and focus; a near-black chrome;
// - from `lg` a 240px chrome column that stays in view: the wordmark with «Модерація», the
//   sections (`OpsNav`, vertical, an icon and the word each), and at its foot who is signed in
//   with «Вийти»; the content beside it in one column of at most 1200px;
// - below `lg` the same chrome as a top bar: the wordmark and «Вийти» in one row, the address
//   under it, the three sections as one row of equal cells (icon over the word);
// - one landmark each: the chrome is the banner (named «Stepler · Модерація»), the sections a
//   navigation, the page `main`; focus on the chrome is white (`--ops-chrome-ring`).
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@stepler/ui/components/toast';
import { cn } from '@stepler/ui/lib/utils';
import { LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { signOut } from './api/operator';
import { OpsNav } from './ops-nav';

const SURFACE = 'ops';

/** Dialogs and menus render in portals under <body>: the surface goes on <html> too. */
function useRootSurface() {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.surface = SURFACE;
    return () => {
      delete root.dataset.surface;
    };
  }, []);
}

const SIGN_OUT = cn(
  'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-control px-3 text-[0.875rem] font-medium text-[var(--ops-chrome-muted)] outline-none transition-colors lg:min-h-9',
  'hover:bg-[var(--ops-chrome-hover)] hover:text-[var(--ops-chrome-foreground)]',
  'focus-visible:ring-2 focus-visible:ring-[var(--ops-chrome-ring)] aria-disabled:opacity-60',
);

export function OpsShell({ email, children }: { email: string | null; children: ReactNode }) {
  const t = useTranslations('ops');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [leaving, setLeaving] = useState(false);
  useRootSurface();

  const leave = async () => {
    if (leaving) return;
    setLeaving(true);
    try {
      await signOut();
      queryClient.clear();
      router.replace('/login');
    } catch {
      setLeaving(false);
      toast({ variant: 'error', title: t('signOutFailed') });
    }
  };

  const signOutButton = (
    <button
      type="button"
      aria-disabled={leaving || undefined}
      onClick={() => void leave()}
      className={SIGN_OUT}
    >
      <LogOut aria-hidden="true" className="size-4" />
      {t('signOut')}
    </button>
  );

  return (
    <div
      data-surface={SURFACE}
      className="min-h-dvh bg-background text-foreground lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]"
    >
      <header
        aria-label={t('title')}
        className="bg-[var(--ops-chrome)] text-[var(--ops-chrome-foreground)] lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-r lg:border-[var(--ops-chrome-border)]"
      >
        <div className="flex items-center gap-3 px-4 pt-2.5 pb-2 lg:px-5 lg:pt-5 lg:pb-6">
          <p className="flex min-w-0 items-center gap-2.5">
            <span className="text-[1.0625rem] font-bold tracking-[-0.01em]">{t('brand')}</span>
            <span className="rounded-[5px] bg-[var(--ops-chrome-foreground)] px-1.5 py-0.5 text-[0.75rem] font-semibold text-[var(--ops-chrome)]">
              {t('badge')}
            </span>
          </p>
          {email === null ? null : <div className="ml-auto lg:hidden">{signOutButton}</div>}
        </div>
        {email === null ? null : (
          <>
            <p
              className="truncate px-4 pb-2 text-[0.8125rem] text-[var(--ops-chrome-muted)] lg:hidden"
              title={email}
            >
              <span className="sr-only">{t('signedInAs')} </span>
              {email}
            </p>
            <OpsNav />
            <div className="mt-auto hidden border-t border-[var(--ops-chrome-border)] px-3 py-3 lg:block">
              <p
                className="truncate px-2 pb-1 text-[0.8125rem] text-[var(--ops-chrome-muted)]"
                title={email}
              >
                <span className="sr-only">{t('signedInAs')} </span>
                {email}
              </p>
              {signOutButton}
            </div>
          </>
        )}
      </header>
      <main
        id="main"
        className="mx-auto w-full max-w-[1200px] px-4 py-5 md:px-6 md:py-7 lg:px-10 lg:py-9"
      >
        {children}
      </main>
    </div>
  );
}
