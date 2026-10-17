// T3 «Журнал» (`journal`), to its artboards (plan Task 19, Appendix A; T3-phone and T3-desktop
// in docs/design/guest-templates). Design pass (frontend-design, ui-ux-pro-max,
// web-design-guidelines, responsive-design):
// - A printed album on warm paper: everything centred, Cormorant 42px headings over Lora, a
//   small ornament (two rules and a burgundy diamond), the welcome in italic, the count in old
//   style figures, the cover as a 3:4 print on a 10px mat with a soft shadow. Buttons are almost
//   square (radius 2): the primary burgundy 52, the wish an outline 48 in italic.
// - Phones and tablets, two views (owner remarks 2026-10-16; the compact title bar and the sticky
//   action bar after an upload went with them): the app's tabs under the header. «Додати»: the
//   hero and its actions; «Кадри»: «Ваші кадри» led by the first own frame large (4:3 across both
//   columns), then «Усі кадри». The footer under both.
// - From 1024px: a 560px aside that stays in view (title 54, the 252×336 print, the two
//   buttons side by side 50px, the notice, the footer at its bottom) beside the frames in 6
//   columns, the first own frame 2×2.
// - Alignment and corners follow the settings (owner, item 111): centred by default, the radii
//   from the tokens on the buttons, the print and the frames. Light only [D5].

import { ImagePlus, PenLine } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  type TemplateActions,
  type TemplateLayoutProps,
  viewRegionProps,
} from '../../react/model.ts';
import { TemplatePicture } from '../../react/parts.tsx';

const PRINT_SIZES = '(min-width: 1024px) 252px, 210px';

export function JournalLayout({ model, actions, slots }: TemplateLayoutProps) {
  const tabs = slots.tabs !== null;
  return (
    <div className="jr-page" data-actions={actions === null ? undefined : ''}>
      <aside className="jr-aside">
        <header className="jr-bar">
          {slots.brand}
          {slots.languageSwitch}
        </header>
        {tabs ? <div className="tpl-view-tabs jr-tabs">{slots.tabs}</div> : null}
        <div className="tpl-region" {...viewRegionProps('add')}>
          <div className="jr-identity">
            <h1 className="jr-title">{model.title}</h1>
            <div aria-hidden="true" className="jr-ornament">
              <span />
              <span />
              <span />
            </div>
            {model.description === null ? null : (
              <p className="jr-description">{model.description}</p>
            )}
            {model.welcomeMessage === null ? null : (
              <p data-slot="guest-welcome" className="jr-welcome">
                {model.welcomeMessage}
              </p>
            )}
            {model.countsLabel === null ? null : (
              <p className="jr-count">
                <span>{model.countsLabel}</span>
                {model.lastAddedLabel === null ? null : <span>{model.lastAddedLabel}</span>}
              </p>
            )}
            {model.cover === null ? null : (
              <figure data-slot="guest-cover" className="jr-print">
                <TemplatePicture image={model.cover} sizes={PRINT_SIZES} eager />
              </figure>
            )}
          </div>
          {actions === null ? null : (
            <div className="jr-hero-actions">
              <JournalActions actions={actions} legalNotice={slots.legalNotice} />
            </div>
          )}
        </div>
        <div className="jr-aside-footer">{slots.footer}</div>
      </aside>
      <div className="jr-main">
        <main className="jr-sections" {...viewRegionProps('frames')}>
          {slots.ownFrames}
          {slots.allFrames}
        </main>
        <div className="jr-main-footer">{slots.footer}</div>
      </div>
    </div>
  );
}

/**
 * The primary (burgundy) and the wish (an italic outline), then the terms notice and the note.
 */
function JournalActions({
  actions,
  legalNotice,
}: {
  actions: TemplateActions;
  legalNotice: ReactNode;
}) {
  const { primary, secondary, note } = actions;
  return (
    <div className="jr-actions">
      <button type="button" className="jr-primary" onClick={primary.onSelect}>
        {primary.icon === 'files' ? (
          <ImagePlus aria-hidden="true" />
        ) : (
          <PenLine aria-hidden="true" />
        )}
        {primary.label}
      </button>
      {secondary === null ? null : (
        <button type="button" className="jr-secondary" onClick={secondary.onSelect}>
          <PenLine aria-hidden="true" />
          {secondary.label}
        </button>
      )}
      {legalNotice}
      {note === null ? null : <p className="jr-note">{note}</p>}
    </div>
  );
}
