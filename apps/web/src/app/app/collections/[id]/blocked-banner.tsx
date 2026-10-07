'use client';

// Design pass (slice 9, Task 16; 9b Task 6; frontend-design, web-design-guidelines,
// responsive-design): the collection's one most important fact when the Stepler operator blocked
// it (R7), so it leads the page above the tabs on every tab: a danger Alert with a title, the
// reason in the operator's words, then the appeal (slice 9b): its state in one line and
// «Подати апеляцію» (disabled while one is under review). The admin cannot unblock it;
// everything else on the page keeps working ([Q2]). `role="status"`: read once when the page
// opens, not as an interruption. The e-mail line stays for other questions.
import { Alert } from '@stepler/ui/components/alert';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { appealsKey, createCollectionAppeal, listAppeals } from '@/api/appeals';
import { collectionKey } from '@/api/collections';
import { AppealStatus } from './content/appeal-status';

export function BlockedBanner({
  collectionId,
  reason,
  contactEmail,
}: {
  collectionId: string;
  reason: string;
  /** `LEGAL_CONTACT_EMAIL`; the line is left out without it. */
  contactEmail: string | null;
}) {
  const t = useTranslations('collections.blocked');
  const queryClient = useQueryClient();
  const appeals = useQuery({
    queryKey: appealsKey(collectionId),
    queryFn: () => listAppeals(collectionId),
  });
  const latest =
    appeals.data?.items.find(
      (appeal) => appeal.targetType === 'COLLECTION' && appeal.targetId === collectionId,
    ) ?? null;
  return (
    <Alert variant="error" role="status" title={t('title')}>
      <p className="[overflow-wrap:anywhere]">{t('text', { reason })}</p>
      {appeals.data === undefined ? null : (
        <div className="pt-2">
          <AppealStatus
            appeal={latest}
            target="collection"
            tone="page"
            submit={(text) => createCollectionAppeal(collectionId, text)}
            onChanged={() =>
              queryClient.invalidateQueries({ queryKey: collectionKey(collectionId) })
            }
          />
        </div>
      )}
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
