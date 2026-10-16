// T1 «Класика» (`classic`), as designed (plan Task 17, Appendix A; artboards T1-phone and
// T1-desktop in docs/design/guest-templates). Design pass (frontend-design, ui-ux-pro-max,
// web-design-guidelines, responsive-design):
// - The calm default: the light table (`#F0F1EE`), one white sheet, Geologica, the pencil
//   accent. One question per screen: what is this (cover, title) and what do I do (the accent
//   action). Everything else is quieter and lower.
// - Phones and tablets: one column (720px at most), a 52px header with the wordmark and the
//   language, the 16:10 cover, the title, the welcome, the mono count, then the actions inline
//   (primary 56, outline 52) closed by the terms notice, then «Ваші кадри» and «Усі кадри» in 3
//   columns (4 from 640px) and the footer. Below 1024px the app's tabs «Додати» / «Кадри» sit
//   under the header and show one of the two at a time (owner remarks 2026-10-16).
// - From 1024px: a 472px white aside that stays in view (wordmark, a 4:3 cover, title 34,
//   welcome 17, the count; the actions and the notice right after them, never pinned to the
//   bottom of a tall empty aside: owner, item 82), beside a scrolling
//   column with the language at the top, the sections at 21px in 6-column grids (8 on wide
//   screens) and the footer.
// - Every tweak shows: the background (colour, gradient, an image under the veil), the accent
//   and its label, the heading font, corners (tiles, buttons, cards) and alignment.
// - Light only [D5]; the scheme never follows the visitor's setting.

import { ImagePlus, PenLine } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  type TemplateActions,
  type TemplateImage,
  type TemplateLayoutProps,
  viewRegionProps,
} from '../../react/model.ts';
import { TemplateBackdrop, TemplatePicture } from '../../react/parts.tsx';

/** The cover's rendered width: the phone column, the 720px tablet column, the 392px aside cover. */
const COVER_SIZES = '(min-width: 1024px) 392px, (min-width: 768px) 720px, calc(100vw - 32px)';

export function ClassicLayout({ model, actions, slots }: TemplateLayoutProps) {
  const tabs = slots.tabs !== null;
  return (
    <div className="classic-page">
      <TemplateBackdrop image={model.background} />
      <aside className="classic-aside">
        <div className="classic-bar">
          {slots.brand}
          <div className="classic-lang-phone">{slots.languageSwitch}</div>
        </div>
        {tabs ? <div className="tpl-view-tabs classic-tabs">{slots.tabs}</div> : null}
        <div className="tpl-region" {...viewRegionProps('add')}>
          <div className="classic-identity">
            {model.cover === null ? null : <ClassicCover image={model.cover} />}
            <h1 className="classic-title">{model.title}</h1>
            {model.description === null ? null : (
              <p className="classic-description">{model.description}</p>
            )}
            {model.welcomeMessage === null ? null : (
              <p data-slot="guest-welcome" className="classic-welcome">
                {model.welcomeMessage}
              </p>
            )}
            {model.countsLabel === null ? null : (
              <p className="classic-count">
                <span>{model.countsLabel}</span>
                {model.lastAddedLabel === null ? null : <span>{model.lastAddedLabel}</span>}
              </p>
            )}
          </div>
          {actions === null ? null : (
            <ClassicActions actions={actions} legalNotice={slots.legalNotice} />
          )}
        </div>
      </aside>
      <div className="classic-main">
        <div className="classic-lang-desktop">{slots.languageSwitch}</div>
        <main className="classic-sections" {...viewRegionProps('frames')}>
          {slots.ownFrames}
          {slots.allFrames}
        </main>
        {slots.footer}
      </div>
    </div>
  );
}

/**
 * The actions, the accent first: files when the link takes any, else the wish; the wish is then
 * the outline second action. The terms notice closes the block; the keep-open note follows.
 */
function ClassicActions({
  actions,
  legalNotice,
}: {
  actions: TemplateActions;
  legalNotice: ReactNode;
}) {
  const { primary, secondary, note } = actions;
  return (
    <div className="classic-actions">
      <button type="button" className="classic-primary" onClick={primary.onSelect}>
        {primary.icon === 'files' ? (
          <ImagePlus aria-hidden="true" />
        ) : (
          <PenLine aria-hidden="true" />
        )}
        {primary.label}
      </button>
      {secondary === null ? null : (
        <button type="button" className="classic-secondary" onClick={secondary.onSelect}>
          <PenLine aria-hidden="true" />
          {secondary.label}
        </button>
      )}
      {legalNotice}
      {note === null ? null : <p className="classic-note">{note}</p>}
    </div>
  );
}

/** The admin's cover above the title: eager (the first thing seen), its box fixed while loading. */
function ClassicCover({ image }: { image: TemplateImage }) {
  return (
    <div data-slot="guest-cover" className="classic-cover">
      <TemplatePicture image={image} sizes={COVER_SIZES} eager />
    </div>
  );
}
