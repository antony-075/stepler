'use client';

// Design pass (billing M1, Task 7; frontend-design, ui-ux-pro-max, web-design-guidelines,
// responsive-design). The account's access (ADR 0018 [P2]) in one place above every admin page:
// - only when it changes what the admin can do: read-only (warning: the most important fact of
//   the page, but nothing is lost yet), grace (warning, with the date), and the trial's last three
//   days (info); a new account and a paying one see nothing, so the page stays quiet;
// - the existing V1 `Alert` with one action, «Обрати тариф», linking to «Тариф і оплата» (an
//   outline button; the one filled button on a page stays the page's own main action);
// - its sentence carries `id="account-access-reason"`, which disabled write buttons point to with
//   `aria-describedby`, so a screen reader hears why a button does nothing;
// - `role="status"`: announced once, politely; the same width as the page column on every size,
//   the action wraps under the text on phones (the Alert does that), 44px touch target.
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { useQuery } from '@tanstack/react-query';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import Link from 'next/link';
import { fetchUsage, USAGE_KEY } from '@/api/collections';
import { ACCOUNT_ACCESS_REASON_ID, accountBanner } from './access-model';

const KYIV = 'Europe/Kyiv';
const BILLING_HREF = '/app/billing';

export function AccessBanner({ hideAction = false }: { hideAction?: boolean }) {
  const t = useTranslations('billing.access');
  const format = useFormatter();
  const now = useNow({ updateInterval: 3600_000 });
  const usage = useQuery({ queryKey: USAGE_KEY, queryFn: fetchUsage });
  if (usage.data === undefined) return null;
  const banner = accountBanner(usage.data.access, now);
  if (banner === null) return null;

  const action = hideAction ? undefined : (
    <Button asChild variant="outline">
      <Link href={BILLING_HREF}>{t('choosePlan')}</Link>
    </Button>
  );
  if (banner.kind === 'trial') {
    return (
      <Alert variant="info" role="status" title={t('trial', { days: banner.days })} action={action}>
        <span id={ACCOUNT_ACCESS_REASON_ID}>{t('trialText')}</span>
      </Alert>
    );
  }
  if (banner.kind === 'grace') {
    const date = format.dateTime(new Date(banner.until), { dateStyle: 'long', timeZone: KYIV });
    return (
      <Alert variant="warning" role="status" action={action}>
        <span id={ACCOUNT_ACCESS_REASON_ID}>{t('grace', { date })}</span>
      </Alert>
    );
  }
  return (
    <Alert
      variant="warning"
      role="status"
      title={t(`readOnlyTitle.${banner.reason}`)}
      action={action}
    >
      <span id={ACCOUNT_ACCESS_REASON_ID}>{t('readOnlyText')}</span>
    </Alert>
  );
}
