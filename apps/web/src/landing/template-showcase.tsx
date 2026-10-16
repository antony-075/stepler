'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@stepler/ui/components/tabs';
import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { PhoneFrame } from './phone-frame';
import { phoneScreen, type ScreenLocale } from './screens';
import { TEMPLATE_KEYS, type TemplateKey } from './templates';

/** The thumbnails are decorative: each tab is named by its design. */
const DECORATIVE = '';

/**
 * The guest page designs, side by side (owner 2026-10-16: horizontal, the designs left, the
 * phone right, no empty space around it).
 * - Left: the section's heading (passed in), then the designs as a grid of thumbnails of their
 *   real guest pages (Radix Tabs: arrow keys, Home/End, touch), the chosen one lifted with an
 *   accent ring, never colour alone (`aria-selected`), and one line on its look under them.
 * - Right, from 1024px: the chosen page large in a phone, sticky while the left column scrolls;
 *   a new choice cross-fades in (not under reduced motion). The phone keeps its ratio, so
 *   switching never moves the page.
 * - Phones and tablets: the heading, the thumbnails in one row that scrolls sideways inside
 *   itself (snapping, never the page), the phone, the line.
 */
export function TemplateShowcase({
  locale,
  heading,
}: {
  locale: ScreenLocale;
  heading: ReactNode;
}) {
  const t = useTranslations('home.templates');
  const tName = useTranslations('templates');
  const [current, setCurrent] = useState<TemplateKey>(TEMPLATE_KEYS[0]);
  const phone = (
    <div className="relative mx-auto w-[min(70%,18rem)] lg:w-[min(100%,19.5rem)]">
      <PhoneFrame
        key={current}
        screen={phoneScreen(locale, `guest-${current}`)}
        alt={t('alt', { name: tName(`${current}.name`) })}
        className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-[0.98] motion-safe:duration-300"
      />
    </div>
  );
  return (
    <Tabs
      value={current}
      onValueChange={(value) => setCurrent(value as TemplateKey)}
      className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start lg:gap-16"
    >
      <div className="grid content-start gap-10">
        {heading}
        <TabsList
          aria-label={t('tabsLabel')}
          className="-mx-(--stepler-gutter) grid h-auto snap-x snap-mandatory auto-cols-[7.25rem] grid-flow-col gap-3 overflow-x-auto border-b-0 px-(--stepler-gutter) pt-1 pb-3 sm:auto-cols-[8rem] lg:mx-0 lg:grid-flow-row lg:grid-cols-3 lg:gap-4 lg:overflow-visible lg:px-0"
        >
          {TEMPLATE_KEYS.map((key) => (
            <TabsTrigger
              key={key}
              value={key}
              className={cn(
                'group h-auto snap-start flex-col items-stretch gap-2.5 rounded-2xl p-1.5 pb-3 text-[0.9375rem] font-medium whitespace-normal text-foreground-soft',
                'transition-[background-color,box-shadow,transform,color] duration-(--duration-slow) ease-out hover:-translate-y-0.5 hover:bg-card hover:text-foreground motion-reduce:transition-none motion-reduce:hover:translate-y-0',
                'data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-card',
                '[&>[data-slot=tabs-underline]]:hidden',
                focusRing,
              )}
            >
              <span className="relative block aspect-[4/5] overflow-hidden rounded-xl bg-muted ring-2 ring-transparent transition-shadow duration-(--duration-slow) group-data-[state=active]:ring-(--brand-blue)">
                <Image
                  src={phoneScreen(locale, `guest-${key}`).src}
                  alt={DECORATIVE}
                  fill
                  unoptimized
                  className="object-cover object-top transition-transform duration-500 ease-out group-hover:scale-[1.04] motion-reduce:transition-none"
                />
              </span>
              {tName(`${key}.name`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="lg:hidden">{phone}</div>
        {TEMPLATE_KEYS.map((key) => (
          <TabsContent
            key={key}
            value={key}
            className="mt-0 grid gap-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300"
          >
            <h3 className="text-2xl font-[650] tracking-[-0.015em]">{tName(`${key}.name`)}</h3>
            <p className="max-w-[46ch] text-lg leading-relaxed text-pretty text-foreground-soft">
              {t(`items.${key}`)}
            </p>
          </TabsContent>
        ))}
      </div>
      <div className="hidden lg:sticky lg:top-24 lg:block">{phone}</div>
    </Tabs>
  );
}
