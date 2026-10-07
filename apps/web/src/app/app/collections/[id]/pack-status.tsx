'use client';

// Design pass (billing M1, Task 7; frontend-design, web-design-guidelines, responsive-design).
// What billing means for this one collection (ADR 0018 [P2], [P5]), above the tabs with the
// operator's block and the archive notice, so it shows on every tab:
// - a pack collection: its clocks in one quiet line while it collects; «Збір завершено» (warning)
//   after the window; «Термін зберігання минув» (warning) after the retention, whose sentence is
//   what disabled buttons point to (`collection-access-reason`);
// - a scheduled deletion: «Буде видалено {date}» with «Обрати тариф», the one date that matters;
// - an account collection that is merely read-only shows nothing here: the account banner above
//   the page already says it once. Dates in Kyiv time, words, never a countdown.
import type { Collection } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { COLLECTION_ACCESS_REASON_ID } from '../../access-model';

const KYIV = 'Europe/Kyiv';

export function PackStatus({ collection }: { collection: Collection }) {
  const t = useTranslations('collection.access');
  const format = useFormatter();
  const locale = useLocale();
  const date = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'long', timeZone: KYIV });
  const { pack, access, deleteAfter } = collection;
  const choose = (
    <Button asChild variant="outline">
      <Link href="/app/billing">{t('choosePlan')}</Link>
    </Button>
  );
  const deletion =
    deleteAfter === null ? null : (
      <span className="block">{t('deleteAfter', { date: date(deleteAfter) })}</span>
    );

  if (pack !== null && access.state === 'READ_ONLY') {
    return (
      <Alert variant="warning" role="status" title={t('packReadOnlyTitle')} action={choose}>
        <span id={COLLECTION_ACCESS_REASON_ID} className="block">
          {t('packReadOnlyText')}
        </span>
        {deletion}
      </Alert>
    );
  }
  if (pack !== null && access.state === 'COLLECTING_CLOSED') {
    return (
      <Alert variant="warning" role="status" title={t('packClosedTitle')}>
        {t('packClosedText', { date: date(pack.retentionEndsAt) })}
      </Alert>
    );
  }
  if (deletion !== null) {
    return (
      <Alert variant="warning" role="status" action={choose}>
        {deletion}
      </Alert>
    );
  }
  if (pack !== null) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('pack', {
          title: locale === 'en' ? pack.offerTitle.en : pack.offerTitle.uk,
          window: date(pack.windowEndsAt),
          retention: date(pack.retentionEndsAt),
        })}
      </p>
    );
  }
  return null;
}
