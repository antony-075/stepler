// T3 «Журнал» (`journal`), to its artboards (plan Task 19, Appendix A; T3-phone and T3-desktop
// in docs/design/guest-templates). Design pass (frontend-design, ui-ux-pro-max,
// web-design-guidelines, responsive-design):
// - A printed album on warm paper: everything centred, Cormorant 42px headings over Lora, a
//   small ornament (two rules and a burgundy diamond), the welcome in italic, the count in old
//   style figures, the cover as a 3:4 print on a 10px mat with a soft shadow. Buttons are almost
//   square (radius 2): the primary burgundy 52, the wish an outline 48 in italic.
// - After the guest has added frames (phones and tablets): the title shrinks to a 48px italic
//   bar, «Ваші кадри» leads with the first own frame large (4:3 across both columns), and the
//   actions move into a sticky paper bar (primary plus a 52px square pencil for the wish) with
//   the terms notice under them. The footer stays at the end in every phase (the artboard
//   leaves it out after an upload).
// - From 1024px: a 560px aside that stays in view (title 54, the 252×336 print, the two
//   buttons side by side 50px, the notice, the footer at its bottom) beside the frames in 6
//   columns, the first own frame 2×2.
// - Locked: alignment (centre) and corners (the template's own radii). Light only [D5].

import { ImagePlus, PenLine } from 'lucide-react';
import type { ReactNode } from 'react';
import type { TemplateActions, TemplateLayoutProps } from '../../react/model.ts';
import { TemplatePicture } from '../../react/parts.tsx';

const PRINT_SIZES = '(min-width: 1024px) 252px, 210px';

export function JournalLayout({ model, actions, slots }: TemplateLayoutProps) {
  const contributed = model.phase === 'contributed';
  return (
    <div
      className="jr-page"
      data-phase={model.phase}
      data-actions={actions === null ? undefined : ''}
    >
      <aside className="jr-aside">
        <header className="jr-bar">{slots.languageSwitch}</header>
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
        <div className="jr-aside-footer">{slots.footer}</div>
      </aside>
      <div className="jr-main">
        {contributed ? (
          // Phones and tablets after an upload: the title as a compact bar (the hero is hidden).
          <h1 className="jr-compact-title">{model.title}</h1>
        ) : null}
        <main className="jr-sections">
          {slots.ownFrames}
          {slots.allFrames}
        </main>
        {/* Before the footer: at the end of the page the bar rests above it, never over it. */}
        {actions === null || !contributed ? null : (
          <div className="jr-sticky">
            <JournalActions actions={actions} legalNotice={slots.legalNotice} compact />
          </div>
        )}
        <div className="jr-main-footer">{slots.footer}</div>
      </div>
    </div>
  );
}

/**
 * The primary (burgundy) and the wish (an italic outline; in the sticky bar a square pencil
 * named by its label), then the terms notice and the keep-open note.
 */
function JournalActions({
  actions,
  legalNotice,
  compact = false,
}: {
  actions: TemplateActions;
  legalNotice: ReactNode;
  compact?: boolean;
}) {
  const { primary, secondary, note } = actions;
  return (
    <div className="jr-actions" data-compact={compact ? '' : undefined}>
      <button type="button" className="jr-primary" onClick={primary.onSelect}>
        {primary.icon === 'files' ? (
          <ImagePlus aria-hidden="true" />
        ) : (
          <PenLine aria-hidden="true" />
        )}
        {primary.label}
      </button>
      {secondary === null ? null : compact ? (
        <button
          type="button"
          className="jr-pencil"
          aria-label={secondary.label}
          onClick={secondary.onSelect}
        >
          <PenLine aria-hidden="true" />
        </button>
      ) : (
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
