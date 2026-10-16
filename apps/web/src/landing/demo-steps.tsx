'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@stepler/ui/components/tabs';
import { cn } from '@stepler/ui/lib/utils';
import { useTranslations } from 'next-intl';
import { PhoneFrame, WindowFrame } from './phone-frame';
import { desktopScreen, phoneScreen, type Screen, type ScreenLocale } from './screens';

const STEPS = ['create', 'share', 'open', 'add', 'collect'] as const;
type Step = (typeof STEPS)[number];

function stepScreen(
  locale: ScreenLocale,
  step: Step,
): { kind: 'phone' | 'window'; screen: Screen } {
  switch (step) {
    case 'create':
      return { kind: 'window', screen: desktopScreen(locale, 'admin-new') };
    case 'share':
      return { kind: 'window', screen: desktopScreen(locale, 'admin-share') };
    case 'open':
      return { kind: 'phone', screen: phoneScreen(locale, 'guest-postcard') };
    case 'add':
      return { kind: 'phone', screen: phoneScreen(locale, 'guest-upload') };
    case 'collect':
      return { kind: 'window', screen: desktopScreen(locale, 'admin-collection') };
  }
}

function StepScreen({
  locale,
  step,
  alt,
  stage,
}: {
  locale: ScreenLocale;
  step: Step;
  alt: string;
  /** On the fixed-size stage (from 1024px) a phone fills its height; in the list, a width. */
  stage: boolean;
}) {
  const { kind, screen } = stepScreen(locale, step);
  if (kind === 'window') return <WindowFrame screen={screen} alt={alt} className="w-full" />;
  return stage ? (
    <PhoneFrame screen={screen} alt={alt} fit="height" />
  ) : (
    <PhoneFrame screen={screen} alt={alt} className="w-[min(72%,19rem)]" />
  );
}

/**
 * The five steps of the real flow, each with its real screen.
 * On the dark demo section, with no stage behind the screens (owner 2026-10-16).
 * - From 1024px: the steps as a vertical tab list on the left (arrow keys move between them,
 *   Radix Tabs; an accent bar grows beside the chosen one), its screen on the right, sliding and
 *   fading in when chosen (not under reduced motion). The box keeps one size, so switching never
 *   moves the page.
 * - Below: no interaction to learn: the steps one after another, each with its screen.
 */
export function DemoSteps({ locale }: { locale: ScreenLocale }) {
  const t = useTranslations('home.demo');
  return (
    <>
      <ol className="grid gap-14 lg:hidden">
        {STEPS.map((step, index) => (
          <li key={step} className="grid gap-5">
            <div className="text-white">
              <StepText
                index={index}
                title={t(`steps.${step}.title`)}
                text={t(`steps.${step}.text`)}
              />
            </div>
            <div className="flex justify-center">
              <StepScreen locale={locale} step={step} alt={t(`steps.${step}.alt`)} stage={false} />
            </div>
          </li>
        ))}
      </ol>

      <Tabs
        defaultValue={STEPS[0]}
        orientation="vertical"
        className="hidden gap-12 lg:grid lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]"
      >
        <TabsList
          aria-label={t('stepsLabel')}
          className="flex h-auto w-full flex-col items-stretch gap-1 overflow-visible border-b-0"
        >
          {STEPS.map((step, index) => (
            <TabsTrigger
              key={step}
              value={step}
              className={cn(
                'group relative h-auto justify-start overflow-hidden rounded-2xl border border-transparent px-5 py-4 text-left whitespace-normal text-white/60',
                'transition-[background-color,border-color,color] duration-(--duration-slow) hover:bg-white/[0.04] hover:text-white/85 motion-reduce:transition-none',
                'data-[state=active]:border-white/12 data-[state=active]:bg-white/[0.07] data-[state=active]:text-white',
                'before:absolute before:inset-y-4 before:left-0 before:w-[3px] before:origin-top before:scale-y-0 before:rounded-full before:bg-(--brand-blue) before:transition-transform before:duration-(--duration-stack) data-[state=active]:before:scale-y-100 motion-reduce:before:transition-none',
                '[&>[data-slot=tabs-underline]]:hidden',
              )}
            >
              <StepText
                index={index}
                title={t(`steps.${step}.title`)}
                text={t(`steps.${step}.text`)}
              />
            </TabsTrigger>
          ))}
        </TabsList>
        {STEPS.map((step) => (
          <TabsContent
            key={step}
            value={step}
            className="mt-0 flex aspect-[4/3] items-center justify-center p-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-[0.97] motion-safe:slide-in-from-right-3 motion-safe:duration-300"
          >
            <StepScreen locale={locale} step={step} alt={t(`steps.${step}.alt`)} stage />
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}

function StepText({ index, title, text }: { index: number; title: string; text: string }) {
  return (
    <span className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 gap-y-1">
      <span
        aria-hidden="true"
        className="grid size-8 place-items-center rounded-full border border-current/30 font-mono text-[0.8125rem] tabular-nums transition-colors duration-(--duration-slow) group-data-[state=active]:border-(--brand-blue) group-data-[state=active]:bg-(--brand-blue) group-data-[state=active]:text-white"
      >
        {index + 1}
      </span>
      <span className="self-center text-lg leading-snug font-semibold">{title}</span>
      <span className="col-start-2 text-[0.9375rem] leading-relaxed font-normal text-pretty opacity-80">
        {text}
      </span>
    </span>
  );
}
