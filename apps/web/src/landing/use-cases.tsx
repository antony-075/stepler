import { cn } from '@stepler/ui/lib/utils';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { CASE_PHOTOS, PHOTO_QUALITY } from './photos';
import { SECTION, SECTION_SCROLL } from './sections';
import { SectionHeading } from './section-heading';

type CaseKey = keyof typeof CASE_PHOTOS;

/**
 * Where each case sits in the 12-column mosaic from 1024px, so the five read as different
 * occasions rather than a row of equal cards: the wedding tall on the left, the birthday and the
 * family beside it, the trip and the company event as a wide pair under them. Two columns from
 * 640px, one on phones. Captions sit under the photos, never on them.
 */
const LAYOUT: Record<CaseKey, { cell: string; ratio: string; sizes: string }> = {
  wedding: {
    cell: 'sm:col-span-2 lg:col-span-7 lg:row-span-2',
    ratio: 'aspect-[4/3] lg:aspect-auto lg:min-h-0 lg:flex-1',
    sizes: '(min-width: 1024px) 56vw, 100vw',
  },
  birthday: {
    cell: 'lg:col-span-5',
    ratio: 'aspect-[16/9]',
    sizes: '(min-width: 1024px) 40vw, (min-width: 640px) 50vw, 100vw',
  },
  family: {
    cell: 'lg:col-span-5',
    ratio: 'aspect-[16/9]',
    sizes: '(min-width: 1024px) 40vw, (min-width: 640px) 50vw, 100vw',
  },
  trip: {
    cell: 'lg:col-span-6',
    ratio: 'aspect-[16/9]',
    sizes: '(min-width: 1024px) 48vw, (min-width: 640px) 50vw, 100vw',
  },
  corporate: {
    cell: 'lg:col-span-6',
    ratio: 'aspect-[16/9]',
    sizes: '(min-width: 1024px) 48vw, (min-width: 640px) 50vw, 100vw',
  },
};

/** next/image's blurred preview from the static import, while the photo loads. */
const BLUR = 'blur';

const CASES: readonly CaseKey[] = ['wedding', 'birthday', 'family', 'trip', 'corporate'];

export async function UseCases() {
  const t = await getTranslations('home.cases');
  return (
    <section
      id={SECTION.cases}
      aria-labelledby="cases-title"
      className={cn(SECTION_SCROLL, 'bg-background py-20 lg:py-28')}
    >
      <div className="stepler-container grid gap-12">
        <SectionHeading id="cases-title" title={t('title')} intro={t('intro')} />
        <ul className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-12 lg:gap-x-8">
          {CASES.map((key) => {
            const layout = LAYOUT[key];
            return (
              <li key={key} data-reveal className={cn('group flex flex-col gap-4', layout.cell)}>
                <div className={cn('relative overflow-hidden rounded-2xl bg-muted', layout.ratio)}>
                  <Image
                    src={CASE_PHOTOS[key]}
                    alt={t(`items.${key}.alt`)}
                    fill
                    placeholder={BLUR}
                    quality={PHOTO_QUALITY}
                    sizes={layout.sizes}
                    className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04] motion-reduce:transition-none"
                  />
                </div>
                <div className="grid gap-1">
                  <h3 className="text-xl font-semibold tracking-[-0.01em]">
                    {t(`items.${key}.title`)}
                  </h3>
                  <p className="max-w-[48ch] text-pretty text-foreground-soft">
                    {t(`items.${key}.text`)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
