// Fixture models, actions and stand-in slots for the templates gallery (stories only). The real
// slots come from apps/web (frames, the legal notice, the language switch, the footer); these
// imitate their markup closely enough to judge a layout, with no app code.
import { EmptyState } from '@stepler/ui/components/empty-state';
import { Frame } from '@stepler/ui/components/frame';
import { FrameGrid } from '@stepler/ui/components/frame-grid';
import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import type { ReactNode } from 'react';
import { fn } from 'storybook/test';
import {
  type GuestPageModel,
  type GuestView,
  type TemplateActions,
  type TemplateImage,
  type TemplateSlots,
  VIEW_REGION_ID,
  VIEW_TAB_ID,
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
  view: 'add',
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

/** Wishes and a video among the photos, as a real collection has (every fourth a wish). */
const WISHES = [
  'Олю, Тарасе, кохайте одне одного так, як сьогодні!',
  'Гірко! Найкращий перший танець.',
];

/** Each frame in a wrapper, as the app's list renders it (`<div data-item>`). */
function frames(count: number, own: boolean) {
  return Array.from({ length: count }, (_, i) => (
    <div key={i} data-item={i}>
      {frame(count, own, i)}
    </div>
  ));
}

function frame(count: number, own: boolean, i: number) {
  const number = count - i;
  const numbered = own ? { number } : {};
  if (i % 4 === 1) {
    return (
      <Frame
        kind="text"
        {...numbered}
        text={WISHES[Math.floor(i / 4) % WISHES.length]}
        accessibleName={`Кадр ${number}, побажання`}
        onOpen={() => {}}
      />
    );
  }
  return (
    <Frame
      kind={i % 4 === 2 ? 'video' : 'photo'}
      {...numbered}
      {...(i % 4 === 2 ? { meta: '0:12' } : {})}
      media={<img alt="" src={samplePhoto((i * 47 + 12) % 360)} />}
      accessibleName={`Кадр ${number}, ${i % 4 === 2 ? 'відео' : 'фото'}`}
      onOpen={() => {}}
    />
  );
}

function FramesSection({
  id,
  slot,
  title,
  children,
}: {
  id: string;
  slot: 'guest-own-frames' | 'guest-all-frames';
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} data-slot={slot} className="grid gap-4">
      <h2 id={id} className="type-h2">
        {title}
      </h2>
      {children}
    </section>
  );
}

const ownEmpty = (
  <FramesSection id="own-title" slot="guest-own-frames" title="Ваші кадри, додані з цього пристрою">
    <p className="rounded-sheet border border-dashed border-input px-4 py-6 text-center text-sm text-muted-foreground">
      Тут з’являться ваші кадри.
    </p>
  </FramesSection>
);

const ownFull = (
  <FramesSection id="own-title" slot="guest-own-frames" title="Ваші кадри, додані з цього пристрою">
    <FrameGrid ariaLabel="Ваші кадри">{frames(6, true)}</FrameGrid>
  </FramesSection>
);

function allOf(count: number) {
  return (
    <FramesSection id="all-title" slot="guest-all-frames" title="Усі кадри">
      <FrameGrid ariaLabel="Усі кадри">{frames(count, false)}</FrameGrid>
    </FramesSection>
  );
}

const allFrames = allOf(12);

/** «Усі кадри» before anyone added a frame, as the app draws it (EmptyState, `#001`). */
const allEmpty = (
  <FramesSection id="all-title" slot="guest-all-frames" title="Усі кадри">
    <EmptyState
      frameNumber={1}
      headingLevel={3}
      title="Ви будете першим"
      description="Тут з’являться фото, відео й побажання гостей."
    />
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

/** A stand-in for the app's «Додати» / «Кадри» switch (`GuestViewTabs`), with its structure. */
function tabsFor(view: GuestView): ReactNode {
  const tab = (id: GuestView, label: string) => (
    <button
      type="button"
      role="tab"
      data-slot="guest-view-tab"
      id={VIEW_TAB_ID[id]}
      aria-selected={view === id}
      aria-controls={VIEW_REGION_ID[id]}
      className={cn(
        'inline-flex min-h-11 items-center justify-center px-3 text-sm font-medium',
        focusRing,
      )}
    >
      {label}
    </button>
  );
  return (
    <div
      role="tablist"
      aria-label="Сторінка"
      data-slot="guest-view-tabs"
      className="grid grid-cols-2"
    >
      {tab('add', 'Додати')}
      {tab('frames', 'Кадри')}
    </div>
  );
}

function slots(
  own: ReactNode | null,
  all: ReactNode | null = allFrames,
  view: GuestView | null = 'add',
): TemplateSlots {
  return {
    brand,
    languageSwitch,
    legalNotice,
    footer,
    tabs: view === null ? null : tabsFor(view),
    ownFrames: own,
    allFrames: all,
  };
}

export type Fixture = {
  model: GuestPageModel;
  actions: TemplateActions | null;
  slots: TemplateSlots;
  /** An image background (where the template allows one); else the template's defaults. */
  imageBackground?: true;
};

/** The plan's fixture set (Task 3): every template is checked against each of these. */
export const FIXTURES = {
  FirstVisit: { model: base, actions: filesActions, slots: slots(ownEmpty) },
  /** «Кадри» after an upload: the guest's frames and everyone's. */
  Contributed: {
    model: { ...base, view: 'frames' },
    actions: filesActions,
    slots: slots(ownFull, allFrames, 'frames'),
  },
  /** One view only, the frames: no tabs, no actions. */
  ViewOnly: {
    model: { ...base, view: 'frames' },
    actions: null,
    slots: slots(null, allFrames, null),
  },
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
  /** A brand-new collection: a short title, no cover, no welcome, nobody's frames yet. */
  EmptyFrames: {
    model: {
      ...base,
      title: 'День народження',
      description: null,
      welcomeMessage: null,
      countsLabel: '0 кадрів',
      lastAddedLabel: null,
      cover: null,
    },
    actions: filesActions,
    slots: slots(ownEmpty, allEmpty),
  },
  /** Real long Ukrainian words: they wrap only between words, never mid-word. */
  LongUkrainianTitle: {
    model: { ...base, title: 'День народження нашої улюбленої бабусі Галини' },
    actions: filesActions,
    slots: slots(ownEmpty),
  },
  /** A busy evening: the guest's own frames and a long shared gallery. */
  ManyFrames: {
    model: { ...base, view: 'frames', countsLabel: '248 кадрів' },
    actions: filesActions,
    slots: slots(ownFull, allOf(48), 'frames'),
  },
  ImageBackground: {
    model: { ...base, background: sampleImage(260, 1600, 1200) },
    actions: filesActions,
    slots: slots(ownFull),
    imageBackground: true,
  },
} satisfies Record<string, Fixture>;

export type FixtureName = keyof typeof FIXTURES;
