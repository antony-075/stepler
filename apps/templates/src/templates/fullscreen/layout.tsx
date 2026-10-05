// T2 «На весь екран» (`fullscreen`), to its artboards (plan Task 18, Appendix A; T2-phone and
// T2-desktop in docs/design/guest-templates). Design pass (frontend-design, ui-ux-pro-max,
// web-design-guidelines, responsive-design):
// - The evening itself first: the cover fills the first screen (100svh) under a scrim that is
//   lightest at the top and darkest under the title; the count, the 46px white title and the
//   welcome sit low on it. Text on the picture always reads: the band under it never drops
//   below the alpha that keeps white at 4.5:1 over any picture (`--tpl-text-band`), whatever
//   the admin's dimming. With no cover: the same hero in the sheet's `#1B1917`.
// - A dark sheet (radius 28, a 40×4 handle) slides 28px over the hero with «Ваші кадри», «Усі
//   кадри» and the footer. On phones and tablets the actions live in a glass bar fixed 12px
//   from the edges (primary 54, the wish as a text button, the terms notice); the sheet keeps
//   room under its footer so the bar never covers it. Without backdrop-filter the bar is an
//   opaque `#1E1916`.
// - From 1024px: the hero is a sticky panel of 60% (title 80/1, welcome 20) and the right
//   column scrolls: the language, a `#24211E` action card (radius 24), then the sections in 3
//   columns and the footer.
// - Dark only [D5]; Manrope with the apricot accent by default. The focus ring is white.

import { ImagePlus, PenLine } from 'lucide-react';
import type { ReactNode } from 'react';
import type { TemplateActions, TemplateLayoutProps } from '../../react/model.ts';
import { TemplatePicture } from '../../react/parts.tsx';

const HERO_SIZES = '(min-width: 1024px) 60vw, 100vw';

export function FullscreenLayout({ model, actions, slots }: TemplateLayoutProps) {
  return (
    <div className="fs-page" data-actions={actions === null ? undefined : ''}>
      <section className="fs-hero" data-cover={model.cover === null ? undefined : ''}>
        {model.cover === null ? null : (
          <div data-slot="guest-cover" className="fs-hero-picture">
            <TemplatePicture image={model.cover} sizes={HERO_SIZES} eager />
          </div>
        )}
        <div aria-hidden="true" className="fs-scrim" />
        <div className="fs-hero-content">
          <header className="fs-bar">
            {slots.brand}
            <div className="fs-lang fs-lang-phone">{slots.languageSwitch}</div>
          </header>
          <div className="fs-identity">
            {model.countsLabel === null ? null : (
              <p className="fs-count">
                <span>{model.countsLabel}</span>
                {model.lastAddedLabel === null ? null : <span>{model.lastAddedLabel}</span>}
              </p>
            )}
            <h1 className="fs-title">{model.title}</h1>
            {model.description === null ? null : (
              <p className="fs-description">{model.description}</p>
            )}
            {model.welcomeMessage === null ? null : (
              <p data-slot="guest-welcome" className="fs-welcome">
                {model.welcomeMessage}
              </p>
            )}
          </div>
        </div>
      </section>
      <div className="fs-sheet">
        <div aria-hidden="true" className="fs-handle" />
        <div className="fs-lang fs-lang-desktop">{slots.languageSwitch}</div>
        {actions === null ? null : (
          <div className="fs-card">
            <FullscreenActions actions={actions} legalNotice={slots.legalNotice} />
          </div>
        )}
        <main className="fs-sections">
          {slots.ownFrames}
          {slots.allFrames}
        </main>
        {slots.footer}
      </div>
      {actions === null ? null : (
        <div className="fs-glass">
          <FullscreenActions actions={actions} legalNotice={slots.legalNotice} />
        </div>
      )}
    </div>
  );
}

/** Primary (accent), the wish (outline in the card, a text button in the bar), the notice. */
function FullscreenActions({
  actions,
  legalNotice,
}: {
  actions: TemplateActions;
  legalNotice: ReactNode;
}) {
  const { primary, secondary, note } = actions;
  return (
    <div className="fs-actions">
      {note === null ? null : <p className="fs-note">{note}</p>}
      <button type="button" className="fs-primary" onClick={primary.onSelect}>
        {primary.icon === 'files' ? (
          <ImagePlus aria-hidden="true" />
        ) : (
          <PenLine aria-hidden="true" />
        )}
        {primary.label}
      </button>
      {secondary === null ? null : (
        <button type="button" className="fs-secondary" onClick={secondary.onSelect}>
          <PenLine aria-hidden="true" />
          {secondary.label}
        </button>
      )}
      {legalNotice}
    </div>
  );
}
