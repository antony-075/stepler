import { cn } from '@stepler/ui/lib/utils';
import { getTranslations } from 'next-intl/server';
import { SECTION, SECTION_SCROLL } from './sections';
import { SectionHeading } from './section-heading';

const ORGANIZER_STEPS = ['create', 'share', 'collect'] as const;
const GUEST_STEPS = ['scan', 'add', 'done'] as const;
/** The room under a step that the line to the next one runs through. */
const STEP_GAP = 'pb-8';

/**
 * «Як це працює»: the two journeys side by side from 768px (stacked on phones), three steps
 * each. They are sequences, so they are numbered; a line joins each step's number to the next.
 * The guest's column carries «Без застосунку й реєстрації», the promise that matters most to it.
 */
export async function HowItWorks() {
  const t = await getTranslations('home.how');
  return (
    <section
      id={SECTION.how}
      aria-labelledby="how-title"
      className={cn(SECTION_SCROLL, 'bg-background py-20 lg:py-28')}
    >
      <div className="stepler-container grid gap-12">
        <SectionHeading id="how-title" title={t('title')} />
        <div className="grid gap-6 md:grid-cols-2 lg:gap-8">
          <Journey
            title={t('organizer.title')}
            steps={ORGANIZER_STEPS.map((key) => ({
              key,
              title: t(`organizer.steps.${key}.title`),
              text: t(`organizer.steps.${key}.text`),
            }))}
          />
          <Journey
            title={t('guest.title')}
            badge={t('guest.badge')}
            steps={GUEST_STEPS.map((key) => ({
              key,
              title: t(`guest.steps.${key}.title`),
              text: t(`guest.steps.${key}.text`),
            }))}
          />
        </div>
      </div>
    </section>
  );
}

function Journey({
  title,
  badge,
  steps,
}: {
  title: string;
  badge?: string;
  steps: { key: string; title: string; text: string }[];
}) {
  return (
    <div
      data-reveal
      className="grid content-start gap-7 rounded-[1.75rem] bg-card p-6 shadow-card transition-[box-shadow,transform] duration-300 ease-out hover:-translate-y-1 hover:shadow-card-hover motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:p-10"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-xl font-semibold tracking-[-0.01em]">{title}</h3>
        {badge ? (
          <span className="rounded-full bg-pencil-soft px-3 py-1 text-sm font-medium text-link">
            {badge}
          </span>
        ) : null}
      </div>
      <ol className="grid">
        {steps.map((step, index) => (
          <li key={step.key} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4">
            <div className="flex flex-col items-center">
              <span
                aria-hidden="true"
                className="grid size-10 place-items-center rounded-full bg-primary font-mono text-sm font-medium text-primary-foreground tabular-nums"
              >
                {index + 1}
              </span>
              {index < steps.length - 1 ? (
                <span aria-hidden="true" className="w-px flex-1 bg-border-strong" />
              ) : null}
            </div>
            <div className={cn('grid gap-1 pt-2', index < steps.length - 1 && STEP_GAP)}>
              <p className="text-lg font-semibold">{step.title}</p>
              <p className="max-w-[40ch] text-pretty text-foreground-soft">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
