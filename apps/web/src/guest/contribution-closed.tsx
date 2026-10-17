'use client';

// Design pass (billing M1, Task 7; frontend-design, ui-ux-pro-max, web-design-guidelines,
// responsive-design). A guest on a collection that no longer takes contributions (ADR 0018 [P2]):
// - no upload or wish button at all (an action that can only fail is worse than none); instead,
//   in the place «Ваші кадри» takes in every template, one calm block: a heading in words
//   («Збір завершено» / «Колекція доступна лише для перегляду») and one sentence; it never says
//   why (billing is the owner's business), and it points at the gallery when the link shows one;
// - drawn with the template's own tokens (border, muted text, the template's radius through
//   `rounded-sheet`), so it belongs to whichever guest page it is on; mobile-first, full width
//   of the section column; `role="status"` so a screen reader hears it once.
import type { GuestContribution } from '@stepler/contracts';
import { useTranslations } from 'next-intl';

export function ContributionClosed({
  contribution,
  galleryVisible,
}: {
  contribution: Exclude<GuestContribution, 'OPEN'>;
  galleryVisible: boolean;
}) {
  const t = useTranslations('guest.contribution');
  const closed = contribution === 'COLLECTING_CLOSED';
  return (
    <section
      role="status"
      aria-labelledby="guest-contribution-closed"
      data-slot="guest-contribution-closed"
      className="grid gap-1.5 rounded-sheet border px-4 py-4 sm:px-5"
    >
      <h2 id="guest-contribution-closed" className="type-h2">
        {closed ? t('closedTitle') : t('readOnlyTitle')}
      </h2>
      <p className="text-pretty text-muted-foreground">
        {closed ? t('closedText') : t('readOnlyText')}
        {galleryVisible ? <span className="block">{t('gallery')}</span> : null}
      </p>
    </section>
  );
}
