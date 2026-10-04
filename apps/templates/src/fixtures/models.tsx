// Fixture models, actions and stand-in slots for the templates gallery (stories only). The real
// slots come from apps/web (frames, the legal notice, the language switch, the footer); these
// imitate their markup closely enough to judge a layout, with no app code.
import { Frame } from '@stepler/ui/components/frame';
import { FrameGrid } from '@stepler/ui/components/frame-grid';
import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import type { ReactNode } from 'react';
import { fn } from 'storybook/test';
import type {
  GuestPageModel,
  TemplateActions,
  TemplateImage,
  TemplateSlots,
} from '../react/model.ts';
import { samplePhoto } from './sample-photo.ts';

export function sampleImage(hue: number, width = 1600, height = 1000): TemplateImage {
  const src = samplePhoto(hue);
  return { src, srcSet: `${src} 480w, ${src} 1600w`, sizes: '100vw', width, height };
}

const base: GuestPageModel = {
  title: 'Весілля Олі та Тараса',
  description: 'Субота, 14 червня.',
  welcomeMessage: 'Дякуємо, що ви з нами! Додавайте фото з вечора — усі кадри побачать гості.',
  countsLabel: '86 кадрів',
  lastAddedLabel: 'останній о 21:10',
  cover: sampleImage(24),
  background: null,
  phase: 'first-visit',
};

/** The click spies, shared by every story; a play function clears them before it clicks. */
export const onFiles = fn().mockName('onFiles');
export const onText = fn().mockName('onText');

const filesActions: TemplateActions = {
  primary: { label: 'Додати фото й відео', icon: 'files', onSelect: onFiles },
  secondary: { label: 'Написати побажання', onSelect: onText },
  note: null,
};

const textActions: TemplateActions = {
  primary: { label: 'Написати побажання', icon: 'text', onSelect: onText },
  secondary: null,
  note: null,
};

function frames(count: number, own: boolean) {
  return Array.from({ length: count }, (_, i) => (
    <Frame
      key={i}
      kind="photo"
      {...(own ? { number: count - i } : {})}
      media={<img alt="" src={samplePhoto((i * 47 + 12) % 360)} />}
      accessibleName={`Кадр ${count - i}, фото`}
      onOpen={() => {}}
    />
  ));
}

function FramesSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="grid gap-4">
      <h2 id={id} className="type-h2">
        {title}
      </h2>
      {children}
    </section>
  );
}

const ownEmpty = (
  <FramesSection id="own-title" title="Ваші кадри, додані з цього пристрою">
    <p className="rounded-sheet border border-dashed border-input px-4 py-6 text-center text-sm text-muted-foreground">
      Тут з’являться ваші кадри.
    </p>
  </FramesSection>
);

const ownFull = (
  <FramesSection id="own-title" title="Ваші кадри, додані з цього пристрою">
    <FrameGrid ariaLabel="Ваші кадри">{frames(4, true)}</FrameGrid>
  </FramesSection>
);

const allFrames = (
  <FramesSection id="all-title" title="Усі кадри">
    <FrameGrid ariaLabel="Усі кадри">{frames(9, false)}</FrameGrid>
  </FramesSection>
);

const legalNotice = (
  <p
    data-slot="guest-legal-notice"
    className="pt-1 text-center type-caption text-pretty text-muted-foreground"
  >
    Додаючи вміст, ви погоджуєтеся з{' '}
    <a href="#terms" className={cn('rounded-frame text-link underline', focusRing)}>
      Умовами використання
    </a>{' '}
    і підтверджуєте, що ознайомилися з{' '}
    <a href="#privacy" className={cn('rounded-frame text-link underline', focusRing)}>
      Політикою конфіденційності
    </a>
    .
  </p>
);

const footer = (
  <footer className="border-t py-3 text-sm text-muted-foreground">
    <div className="stepler-container flex flex-wrap items-center justify-between gap-x-6">
      <p className="py-2.5">© 2026 Stepler</p>
      <nav aria-label="Правові документи">
        <ul className="flex flex-wrap gap-x-5">
          <li>
            <a href="#terms" className={cn('inline-flex min-h-11 items-center', focusRing)}>
              Умови використання
            </a>
          </li>
          <li>
            <a href="#privacy" className={cn('inline-flex min-h-11 items-center', focusRing)}>
              Політика конфіденційності
            </a>
          </li>
        </ul>
      </nav>
    </div>
  </footer>
);

const brand = (
  <a
    href="#home"
    translate="no"
    className={cn(
      '-ml-1 inline-flex min-h-11 min-w-11 items-center rounded-control px-1 text-xl text-foreground no-underline',
      focusRing,
    )}
  >
    <span className="font-wordmark lowercase">Stepler</span>
  </a>
);

const languageSwitch = (
  <button
    type="button"
    aria-label="Мова"
    className={cn('h-11 rounded-control border bg-card px-3 text-sm', focusRing)}
  >
    Українська
  </button>
);

function slots(own: ReactNode | null, all: ReactNode | null = allFrames): TemplateSlots {
  return { brand, languageSwitch, legalNotice, footer, ownFrames: own, allFrames: all };
}

export type Fixture = {
  model: GuestPageModel;
  actions: TemplateActions | null;
  slots: TemplateSlots;
};

/** The plan's fixture set (Task 3): every template is checked against each of these. */
export const FIXTURES = {
  FirstVisit: { model: base, actions: filesActions, slots: slots(ownEmpty) },
  Contributed: {
    model: { ...base, phase: 'contributed' },
    actions: { ...filesActions, primary: { ...filesActions.primary, label: 'Додати ще' } },
    slots: slots(ownFull),
  },
  ViewOnly: { model: base, actions: null, slots: slots(null) },
  TextOnly: { model: base, actions: textActions, slots: slots(ownEmpty) },
  NoCover: { model: { ...base, cover: null }, actions: filesActions, slots: slots(ownEmpty) },
  LongTitle: {
    model: { ...base, title: 'Найдовшавесільнаназваколекції'.repeat(4).slice(0, 100) },
    actions: filesActions,
    slots: slots(ownEmpty),
  },
  LongWelcome: {
    model: {
      ...base,
      welcomeMessage:
        `Дякуємо, що ви з нами! ${'Додавайте фото й відео з вечора, '.repeat(6)}`.slice(0, 160),
    },
    actions: filesActions,
    slots: slots(ownEmpty),
  },
} satisfies Record<string, Fixture>;

export type FixtureName = keyof typeof FIXTURES;
