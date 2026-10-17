import { cn } from '@stepler/ui/lib/utils';
import { getTranslations } from 'next-intl/server';
import { DemoSteps } from './demo-steps';
import type { ScreenLocale } from './screens';
import { SECTION, SECTION_SCROLL } from './sections';
import { SectionHeading } from './section-heading';
import { WalkthroughVideo } from './walkthrough-video';

/**
 * «Подивіться, як це виглядає»: the page's one dark section (ink with a blue glow, owner
 * 2026-10-16: not a flat page), so the real screens and the video stand out. The recorded
 * walkthrough first, centred under a centred heading (half a minute, on request), then the same
 * flow as five still steps for those who would rather read than watch.
 */
export async function ProductDemo({ locale }: { locale: ScreenLocale }) {
  const t = await getTranslations('home.demo');
  return (
    <section
      id={SECTION.demo}
      aria-labelledby="demo-title"
      className={cn(SECTION_SCROLL, 'landing-dark-ground py-20 text-white lg:py-32')}
    >
      <div className="stepler-container grid gap-12 lg:gap-20">
        <SectionHeading
          id="demo-title"
          title={t('title')}
          intro={t('intro')}
          tone="inverse"
          className="mx-auto justify-items-center text-center"
        />
        <div data-reveal className="mx-auto w-full max-w-[68rem]">
          <WalkthroughVideo locale={locale} />
        </div>
        <DemoSteps locale={locale} />
      </div>
    </section>
  );
}
