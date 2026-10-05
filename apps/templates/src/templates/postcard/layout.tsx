// T4 «Листівка» (`postcard`), to its artboards (plan Task 20, Appendix A; T4-phone and
// T4-desktop in docs/design/guest-templates). Design pass (frontend-design, ui-ux-pro-max,
// web-design-guidelines, responsive-design):
// - A postcard from the party: dotted paper in the admin's colour, a cream card inside an
//   airmail border (red, cream, navy stripes), the cover as a polaroid tilted −3° under a strip
//   of tape, a round postmark with the count tilted −12°, the title in Comfortaa 27, then two
//   stamps for buttons (perforated edges, ~92px tall, tilted −2° and +1.5°): the red one adds
//   frames, the navy outline one writes a wish. The terms notice closes the card.
// - Frames are polaroids (white border, a deeper bottom edge, a soft shadow) in 3 columns,
//   each tilted a little by its place (−2…+2°, from `nth-child`, ADR 0015 as amended for T4);
//   wishes are yellow sticky notes with tape. Rotations are static and stay under reduced
//   motion; only the hover lift stops.
// - After an upload on phones and tablets: a compact airmail strip (the cover thumbnail, the
//   title, the count) instead of the card, and a sticky cream bar with a 5px airmail stripe,
//   the two stamps at 50px and the notice. The footer is always there.
// - From 1024px: a 1120px card `284 | 1fr | 1px | 300`: the polaroid, the title with the welcome
//   on lined paper, a rule, the stamps and the notice, a 96px postmark stamped across the card's
//   bottom edge; then polaroid grids in 8 columns.
// - The primary stamp is the page's one clear button (owner, item 85): full width of its column,
//   icon and label side by side, lifted; the wish stamp under it is lower and quieter.
// - Alignment and corners follow the settings (owner, item 111): the card's text block takes
//   the alignment; the radii go on the card, the polaroids and the stamps' faces (the
//   perforated edge stays). Light only [D5].

import { ImagePlus, PenLine } from 'lucide-react';
import type { ReactNode } from 'react';
import type { TemplateActions, TemplateLayoutProps } from '../../react/model.ts';
import { TemplatePicture } from '../../react/parts.tsx';

const POLAROID_SIZES = '(min-width: 1024px) 264px, 196px';

export function PostcardLayout({ model, actions, slots }: TemplateLayoutProps) {
  const contributed = model.phase === 'contributed';
  return (
    <div
      className="pc-page"
      data-phase={model.phase}
      data-actions={actions === null ? undefined : ''}
    >
      <header className="pc-bar">
        {slots.brand}
        <div className="pc-lang">{slots.languageSwitch}</div>
      </header>
      <div className="pc-airmail pc-card-frame">
        <div className="pc-card">
          {model.cover === null ? null : (
            <div className="pc-cover-cell">
              <figure data-slot="guest-cover" className="pc-polaroid">
                <TemplatePicture image={model.cover} sizes={POLAROID_SIZES} eager />
                <span aria-hidden="true" className="pc-tape" />
              </figure>
              {model.countsLabel === null ? null : (
                <p className="pc-postmark pc-postmark-cover">
                  <span>{model.countsLabel}</span>
                </p>
              )}
            </div>
          )}
          <div className="pc-text">
            <h1 className="pc-title">{model.title}</h1>
            {model.description === null ? null : (
              <p className="pc-description">{model.description}</p>
            )}
            {model.welcomeMessage === null ? null : (
              <p data-slot="guest-welcome" className="pc-welcome">
                {model.welcomeMessage}
              </p>
            )}
          </div>
          <div aria-hidden="true" className="pc-rule" />
          <div className="pc-side">
            {actions === null ? null : (
              <PostcardActions actions={actions} legalNotice={slots.legalNotice} />
            )}
            {model.countsLabel === null ? null : (
              <p className="pc-postmark pc-postmark-side">
                <span>{model.countsLabel}</span>
              </p>
            )}
          </div>
        </div>
      </div>
      {contributed ? (
        <div className="pc-airmail pc-strip">
          <div className="pc-strip-inner">
            {model.cover === null ? null : (
              <div className="pc-strip-thumb">
                <TemplatePicture image={model.cover} sizes="56px" />
              </div>
            )}
            <div className="pc-strip-text">
              {/* Phones and tablets after an upload: the title of the page (the card is hidden). */}
              <h1 className="pc-strip-title">{model.title}</h1>
              {model.countsLabel === null ? null : (
                <p className="pc-strip-count">{model.countsLabel}</p>
              )}
              {/* The welcome stays with the title after an upload (owner, item 109). */}
              {model.welcomeMessage === null ? null : (
                <p data-slot="guest-welcome" className="pc-strip-welcome">
                  {model.welcomeMessage}
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
      <main className="pc-sections">
        {slots.ownFrames}
        {slots.allFrames}
      </main>
      {/* Before the footer: at the end of the page the bar rests above it, never over it. */}
      {actions === null || !contributed ? null : (
        <div className="pc-sticky">
          <PostcardActions actions={actions} legalNotice={slots.legalNotice} compact />
        </div>
      )}
      {slots.footer}
    </div>
  );
}

/** The two stamps (red: files, navy outline: the wish), then the terms notice and the note. */
function PostcardActions({
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
    <div className="pc-actions" data-compact={compact ? '' : undefined}>
      <button type="button" className="pc-stamp pc-stamp-red" onClick={primary.onSelect}>
        <span className="pc-stamp-face">
          {primary.icon === 'files' ? (
            <ImagePlus aria-hidden="true" />
          ) : (
            <PenLine aria-hidden="true" />
          )}
          <span className="pc-stamp-label">{primary.label}</span>
        </span>
      </button>
      {secondary === null ? null : (
        <button type="button" className="pc-stamp pc-stamp-navy" onClick={secondary.onSelect}>
          <span className="pc-stamp-face">
            <PenLine aria-hidden="true" />
            <span className="pc-stamp-label">{secondary.label}</span>
          </span>
        </button>
      )}
      {legalNotice}
      {note === null ? null : <p className="pc-note">{note}</p>}
    </div>
  );
}
