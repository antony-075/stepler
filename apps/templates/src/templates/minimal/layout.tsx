// T6 «Мінімалізм» (`minimal`), to its artboards (plan Task 22, Appendix A; T6-phone and
// T6-desktop in docs/design/guest-templates). Design pass (frontend-design, ui-ux-pro-max,
// web-design-guidelines, responsive-design):
// - White space and type: a 52px header, 72px of air, the title in Golos Text up to 46/1.04 at
//   weight 500, the welcome at 17, the count at 14, then a ruled action row (hairlines above
//   and below): one blue 48px button and the wish as an underlined text button. The notice
//   follows; sections at 20/500 with 72px between them, 3-column grids with 12px gaps.
// - No cover by default; above the title (`top`, 16:10), or beside it (`side`): a 4:5 picture
//   40% wide on phones, at the right of the title block in the desktop column.
// - From 1024px: a 576px left column that stays in view (title 64/1.02, so long words fit it
//   whole; welcome 19, the ruled actions, the footer at its bottom) and the frames on the right (padding 104/80, 3 columns
//   with 28px gaps, 88px between sections).
// - Phones and tablets, two views (owner remarks 2026-10-16): the app's tabs under the header;
//   «Додати» is the identity with its actions, «Кадри» the sections. From 1024px both, no tabs.
// - A solid background only (locked); light only [D5]. Links are the text colour, underlined.

import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  type TemplateActions,
  type TemplateLayoutProps,
  viewRegionProps,
} from '../../react/model.ts';
import { TemplatePicture } from '../../react/parts.tsx';

const COVER_SIZES = {
  top: '(min-width: 1024px) 432px, calc(100vw - 32px)',
  side: '(min-width: 1024px) 180px, 40vw',
} as const;

export function MinimalLayout({ model, actions, slots, settings }: TemplateLayoutProps) {
  const tabs = slots.tabs !== null;
  const placement = settings.coverPlacement === 'side' ? 'side' : 'top';
  return (
    <div className="mn-page">
      <aside className="mn-aside">
        <header className="mn-bar">
          {slots.brand}
          {slots.languageSwitch}
        </header>
        {tabs ? <div className="tpl-view-tabs mn-tabs">{slots.tabs}</div> : null}
        <div className="tpl-region" {...viewRegionProps('add')}>
          <div
            className="mn-identity"
            data-placement={model.cover === null ? undefined : placement}
          >
            {model.cover === null ? null : (
              <div data-slot="guest-cover" className="mn-cover">
                <TemplatePicture image={model.cover} sizes={COVER_SIZES[placement]} eager />
              </div>
            )}
            <div className="mn-text">
              <h1 className="mn-title">{model.title}</h1>
              {model.description === null ? null : (
                <p className="mn-description">{model.description}</p>
              )}
              {model.welcomeMessage === null ? null : (
                <p data-slot="guest-welcome" className="mn-welcome">
                  {model.welcomeMessage}
                </p>
              )}
              {model.countsLabel === null ? null : (
                <p className="mn-count">
                  <span>{model.countsLabel}</span>
                  {model.lastAddedLabel === null ? null : <span>{model.lastAddedLabel}</span>}
                </p>
              )}
            </div>
          </div>
          {actions === null ? null : (
            <MinimalActions actions={actions} legalNotice={slots.legalNotice} />
          )}
        </div>
        <div className="mn-aside-footer">{slots.footer}</div>
      </aside>
      <div className="mn-main">
        <main className="mn-sections" {...viewRegionProps('frames')}>
          {slots.ownFrames}
          {slots.allFrames}
        </main>
        <div className="mn-main-footer">{slots.footer}</div>
      </div>
    </div>
  );
}

/** The ruled row: one blue button and the wish as an underlined text button; then the notice. */
function MinimalActions({
  actions,
  legalNotice,
}: {
  actions: TemplateActions;
  legalNotice: ReactNode;
}) {
  const { primary, secondary, note } = actions;
  return (
    <div className="mn-actions">
      <button type="button" className="mn-primary" onClick={primary.onSelect}>
        {primary.icon === 'files' ? <Plus aria-hidden="true" /> : null}
        {primary.label}
      </button>
      {secondary === null ? null : (
        <button type="button" className="mn-secondary" onClick={secondary.onSelect}>
          {secondary.label}
        </button>
      )}
      {legalNotice}
      {note === null ? null : <p className="mn-note">{note}</p>}
    </div>
  );
}
