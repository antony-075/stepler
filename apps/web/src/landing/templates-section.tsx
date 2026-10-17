import { cn } from '@stepler/ui/lib/utils';
import { Check } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { WindowFrame } from './phone-frame';
import { desktopScreen, type ScreenLocale } from './screens';
import { SECTION, SECTION_SCROLL } from './sections';
import { SectionHeading } from './section-heading';
import { TemplateShowcase } from './template-showcase';

const TWEAKS = ['cover', 'welcome', 'background', 'colour', 'font', 'preview'] as const;

/**
 * The guest page designs (the heading and the thumbnails left, the phone right), then the editor
 * itself: what the organizer changes on top of a design, as a short list beside the real editor
 * screen. On a soft tinted ground, so the section reads apart from its neighbours.
 */
export async function TemplatesSection({ locale }: { locale: ScreenLocale }) {
  const t = await getTranslations('home.templates');
  return (
    <section
      id={SECTION.templates}
      aria-labelledby="templates-title"
      className={cn(
        SECTION_SCROLL,
        'bg-[linear-gradient(180deg,var(--background),var(--pencil-soft)_55%,var(--background))] py-20 lg:py-32',
      )}
    >
      <div className="stepler-container grid gap-20 lg:gap-28">
        <TemplateShowcase
          locale={locale}
          heading={<SectionHeading id="templates-title" title={t('title')} intro={t('intro')} />}
        />
        <div
          data-reveal
          className="grid items-center gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-14"
        >
          <div className="grid content-start gap-5">
            <h3 className="text-[clamp(1.5rem,1.25rem+1vw,2rem)] leading-tight font-[650] tracking-[-0.02em] text-balance">
              {t('editor.title')}
            </h3>
            <ul className="grid gap-3">
              {TWEAKS.map((key) => (
                <li key={key} className="flex items-start gap-3 text-foreground-soft">
                  <Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-link" />
                  {t(`editor.items.${key}`)}
                </li>
              ))}
            </ul>
          </div>
          <WindowFrame screen={desktopScreen(locale, 'admin-editor')} alt={t('editorAlt')} />
        </div>
      </div>
    </section>
  );
}
