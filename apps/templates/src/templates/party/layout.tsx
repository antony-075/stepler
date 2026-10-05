// T5 «Вечірка» (`party`), to its artboards (plan Task 21, Appendix A; T5-phone and T5-desktop
// in docs/design/guest-templates). Design pass (frontend-design, ui-ux-pro-max,
// web-design-guidelines, responsive-design):
// - The party after dark: a near-black page with a soft glow of the accent in the corner, the
//   title huge and heavy (Unbounded 52/0.98, −0.035em; 100 on desktop), the cover as a round
//   emblem with the title running around it in capitals, the welcome, a glowing dot before the
//   count. The primary is a 60px pill in the accent with its glow; the wish a 52px ghost pill.
// - Frames as a bento: 3 columns of 117px rows (8 columns of 158px on desktop), the newest own
//   frame 2×2 with a ring that pulses twice; in «Усі кадри» a few tiles span two cells.
// - Motion only under `prefers-reduced-motion: no-preference`: the emblem's ring turns (24s a
//   turn) and the newest frame pulses twice; reduced motion keeps both still. The ring's text
//   is decoration (`aria-hidden`); the h1 names the collection.
// - From 1024px: the hero is `1fr | 380` (the title with the 168px emblem beside it; the aside
//   with the count, a 64px primary and a 54px ghost, the notice).
// - Dark only, Unbounded over Manrope, lime by default [D5]. Links and focus take the accent's
//   readable form.

import { ImagePlus, PenLine } from 'lucide-react';
import { type ReactNode, useId } from 'react';
import type { TemplateActions, TemplateImage, TemplateLayoutProps } from '../../react/model.ts';
import { TemplateBackdrop, TemplatePicture } from '../../react/parts.tsx';

const EMBLEM_SIZES = '(min-width: 1024px) 114px, 84px';

/** The ring's text: the title twice in capitals, star-separated, short enough to fit. */
function ringText(title: string): string {
  const name = title.toLocaleUpperCase('uk').slice(0, 34);
  return name.length > 16 ? `${name} ✦ ` : `${name} ✦ ${name} ✦ `;
}

export function PartyLayout({ model, actions, slots }: TemplateLayoutProps) {
  return (
    <div className="pt-page">
      <TemplateBackdrop image={model.background} />
      <div aria-hidden="true" className="pt-glow" />
      <header className="pt-bar">
        {slots.brand}
        <div className="pt-lang">{slots.languageSwitch}</div>
      </header>
      <section className="pt-hero">
        <div className="pt-identity" data-emblem={model.cover === null ? undefined : ''}>
          {/* Placed beside the welcome, under the title (CSS grid). */}
          {model.cover === null ? null : <PartyEmblem image={model.cover} title={model.title} />}
          <h1 className="pt-title">{model.title}</h1>
          {model.description === null ? null : (
            <p className="pt-description">{model.description}</p>
          )}
          {model.welcomeMessage === null ? null : (
            <p data-slot="guest-welcome" className="pt-welcome">
              {model.welcomeMessage}
            </p>
          )}
        </div>
        <div className="pt-aside">
          {model.countsLabel === null ? null : (
            <p className="pt-count">
              <span aria-hidden="true" className="pt-dot" />
              <span>{model.countsLabel}</span>
              {model.lastAddedLabel === null ? null : (
                <span className="pt-last">{model.lastAddedLabel}</span>
              )}
            </p>
          )}
          {actions === null ? null : (
            <PartyActions actions={actions} legalNotice={slots.legalNotice} />
          )}
        </div>
      </section>
      <main className="pt-sections">
        {slots.ownFrames}
        {slots.allFrames}
      </main>
      {slots.footer}
    </div>
  );
}

/** The cover in a circle, the title running around it (decorative; the h1 names it). */
function PartyEmblem({ image, title }: { image: TemplateImage; title: string }) {
  const pathId = useId();
  return (
    <div data-slot="guest-cover" className="pt-emblem">
      <svg aria-hidden="true" viewBox="0 0 124 124" className="pt-ring">
        <defs>
          <path id={pathId} d="M62 62 m-55 0 a55 55 0 1 1 110 0 a55 55 0 1 1 -110 0" />
        </defs>
        <text>
          <textPath href={`#${pathId}`} textLength="340" lengthAdjust="spacing">
            {ringText(title)}
          </textPath>
        </text>
      </svg>
      <div className="pt-emblem-picture">
        <TemplatePicture image={image} sizes={EMBLEM_SIZES} eager />
      </div>
    </div>
  );
}

/** A glowing accent pill, a ghost pill for the wish, then the notice and the keep-open note. */
function PartyActions({
  actions,
  legalNotice,
}: {
  actions: TemplateActions;
  legalNotice: ReactNode;
}) {
  const { primary, secondary, note } = actions;
  return (
    <div className="pt-actions">
      <button type="button" className="pt-primary" onClick={primary.onSelect}>
        {primary.icon === 'files' ? (
          <ImagePlus aria-hidden="true" />
        ) : (
          <PenLine aria-hidden="true" />
        )}
        {primary.label}
      </button>
      {secondary === null ? null : (
        <button type="button" className="pt-ghost" onClick={secondary.onSelect}>
          <PenLine aria-hidden="true" />
          {secondary.label}
        </button>
      )}
      {legalNotice}
      {note === null ? null : <p className="pt-note">{note}</p>}
    </div>
  );
}
