'use client';

// Design pass (slice 9, Task 9; frontend-design, ui-ux-pro-max, web-design-guidelines,
// responsive-design): the console is a tool for one service account, not the product, so it must
// never be mistaken for the user app. Decisions:
// - one full-width header on `--inverse` (the dark ink of tooltips and the selection dock) with
//   the wordmark and a «Модерація» chip; no sidebar, no collections, no search;
// - the V1 tokens otherwise (grey page, white panels, Golos Text, Geist Mono for numbers), so it
//   still feels like Stepler and needs no second style system;
// - content in one column of at most 1200px, 16px gutters on phones; the header wraps the
//   address under the title below 480px instead of truncating the sign-out away;
// - focus on the dark header uses `--inverse-ring`, as the selection dock does; sign-out is a
//   44px target on touch screens.
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@stepler/ui/components/button';
import { useToast } from '@stepler/ui/components/toast';
import { LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type ReactNode, useState } from 'react';
import { signOut } from './api/operator';

export function OpsShell({ email, children }: { email: string | null; children: ReactNode }) {
  const t = useTranslations('ops');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [leaving, setLeaving] = useState(false);

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

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header
        aria-label={t('title')}
        className="bg-inverse text-inverse-foreground [--ring:var(--inverse-ring)]"
      >
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 md:px-6">
          <p className="flex items-center gap-2.5">
            <span className="text-[1.0625rem] font-bold tracking-[-0.01em]">{t('brand')}</span>
            <span className="rounded-[5px] border border-inverse-muted/40 px-2 py-0.5 text-[0.8125rem] font-semibold text-inverse-muted">
              {t('badge')}
            </span>
          </p>
          {email === null ? null : (
            <div className="ml-auto flex min-w-0 items-center gap-2">
              <p className="min-w-0 truncate text-[0.875rem] text-inverse-muted" title={email}>
                <span className="sr-only">{t('signedInAs')} </span>
                {email}
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="text-inverse-muted hover:bg-inverse-hover hover:text-inverse-foreground"
                aria-disabled={leaving || undefined}
                onClick={() => void leave()}
              >
                <LogOut aria-hidden="true" />
                {t('signOut')}
              </Button>
            </div>
          )}
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6 md:py-8">
        {children}
      </main>
    </div>
  );
}
