import { cn } from '@stepler/ui/lib/utils';
import {
  Gauge,
  ImageIcon,
  LayoutTemplate,
  ShieldCheck,
  Smartphone,
  type LucideIcon,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { PhoneFrame } from './phone-frame';
import { phoneScreen, type ScreenLocale } from './screens';
import { SECTION_SCROLL } from './sections';

const ITEMS: { key: string; icon: LucideIcon }[] = [
  { key: 'original', icon: ImageIcon },
  { key: 'noApp', icon: Smartphone },
  { key: 'style', icon: LayoutTemplate },
  { key: 'control', icon: ShieldCheck },
  { key: 'reliable', icon: Gauge },
];

/**
 * Why Stepler, as a hierarchy rather than a grid of equal cards: the one promise that sums it up
 * («Усе з події — в одній колекції») large on the left, the five that make it true as a ruled list
 * on the right, each with a small icon (decorative: the title says it).
 */
export async function Benefits({ locale }: { locale: ScreenLocale }) {
  const t = await getTranslations('home.benefits');
  return (
    <section
      aria-labelledby="benefits-title"
      className={cn(SECTION_SCROLL, 'bg-card py-20 lg:py-28')}
    >
      <div className="stepler-container">
        <div className="grid gap-x-20 gap-y-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="grid content-start gap-5 lg:sticky lg:top-24 lg:self-start">
            <h2
              id="benefits-title"
              className="text-[clamp(1.875rem,1.3rem+2.2vw,3rem)] leading-[1.08] font-[660] tracking-[-0.026em] text-balance"
            >
              {t('lead.title')}
            </h2>
            <p className="max-w-[46ch] text-lg leading-relaxed text-pretty text-foreground-soft">
              {t('lead.text')}
            </p>
            <PhoneFrame
              screen={phoneScreen(locale, 'guest-frames')}
              alt={t('lead.alt')}
              className="mt-6 hidden w-[15rem] lg:block"
            />
          </div>
          <ul className="grid divide-y divide-border border-y border-border">
            {ITEMS.map(({ key, icon: Icon }) => (
              <li
                key={key}
                data-reveal
                className="group grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-4 py-6 sm:py-7"
              >
                <span className="grid size-11 place-items-center rounded-xl bg-pencil-soft text-link transition-[background-color,color,transform] duration-300 ease-out group-hover:-rotate-6 group-hover:bg-(--brand-blue) group-hover:text-white motion-reduce:transition-none motion-reduce:group-hover:rotate-0">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <div className="grid content-start gap-1">
                  <h3 className="text-lg font-semibold">{t(`items.${key}.title`)}</h3>
                  <p className="max-w-[52ch] text-pretty text-foreground-soft">
                    {t(`items.${key}.text`)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
