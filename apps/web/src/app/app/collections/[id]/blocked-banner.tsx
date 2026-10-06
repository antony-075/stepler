'use client';

// Design pass (slice 9, Task 16; frontend-design, web-design-guidelines, responsive-design): the
// collection's one most important fact when the Stepler operator blocked it (R7), so it leads the
// page above the tabs on every tab: a danger Alert with a title, the reason in the operator's
// words, and where to write. No button: the admin cannot unblock it; everything else on the page
// keeps working ([Q2]). `role="status"`: read once when the page opens, not as an interruption.
import { Alert } from '@stepler/ui/components/alert';
import { useTranslations } from 'next-intl';

export function BlockedBanner({
  reason,
  contactEmail,
}: {
  reason: string;
  /** `LEGAL_CONTACT_EMAIL`; the line is left out without it. */
  contactEmail: string | null;
}) {
  const t = useTranslations('collections.blocked');
  return (
    <Alert variant="error" role="status" title={t('title')}>
      <p className="[overflow-wrap:anywhere]">{t('text', { reason })}</p>
      {contactEmail === null ? null : (
        <p>
          {t.rich('contact', {
            email: () => (
              <a href={`mailto:${contactEmail}`} className="text-link underline underline-offset-2">
                {contactEmail}
              </a>
            ),
          })}
        </p>
      )}
    </Alert>
  );
}
