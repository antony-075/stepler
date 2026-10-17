import { cn } from '@stepler/ui/lib/utils';
import { EyeOff, Flag, Link2Off, MapPinOff, Server, Trash2, type LucideIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { SECTION, SECTION_SCROLL } from './sections';

const ITEMS: { key: string; icon: LucideIcon }[] = [
  { key: 'visibility', icon: EyeOff },
  { key: 'links', icon: Link2Off },
  { key: 'server', icon: Server },
  { key: 'location', icon: MapPinOff },
  { key: 'manage', icon: Trash2 },
  { key: 'reports', icon: Flag },
];

/**
 * Privacy and control: one ink panel (the inverse surface, the same in both themes), so the
 * controls read as one set and the page changes pace before the prices. Only what the product
 * does today; no badges, no certifications, no «100% secure».
 */
export async function Privacy() {
  const t = await getTranslations('home.privacy');
  return (
    <section
      id={SECTION.privacy}
      aria-labelledby="privacy-title"
      className={cn(SECTION_SCROLL, 'bg-card py-20 lg:py-28')}
    >
      <div className="stepler-container">
        <div
          data-reveal
          className="landing-dark-ground grid gap-12 overflow-hidden rounded-[1.75rem] px-6 py-12 text-white sm:px-10 sm:py-14 lg:px-16 lg:py-20"
        >
          <div className="grid max-w-[44rem] gap-4">
            <h2
              id="privacy-title"
              className="text-[clamp(1.875rem,1.3rem+2.2vw,3rem)] leading-[1.08] font-[660] tracking-[-0.026em] text-balance"
            >
              {t('title')}
            </h2>
            <p className="max-w-[52ch] text-lg leading-relaxed text-pretty text-inverse-muted">
              {t('intro')}
            </p>
          </div>
          <ul className="grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
            {ITEMS.map(({ key, icon: Icon }) => (
              <li key={key} className="grid content-start gap-3">
                <Icon aria-hidden="true" className="size-6 text-(--inverse-ring)" />
                <h3 className="text-lg font-semibold">{t(`items.${key}.title`)}</h3>
                <p className="max-w-[40ch] text-pretty text-inverse-muted">
                  {t(`items.${key}.text`)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
