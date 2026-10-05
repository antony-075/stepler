import type { FontId } from '@stepler/contracts';
import {
  CircleOff,
  Hourglass,
  Inbox,
  Link2Off,
  Lock,
  type LucideIcon,
  Pause,
  SearchX,
  TriangleAlert,
} from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { resolveTheme } from '../core/resolve.ts';
import { themeTokens } from '../core/tokens.ts';
import type { TemplateSlots } from './model.ts';

/**
 * A whole-page screen in a template's look (owner remarks 99, 100): the link and collection
 * states, and the guest page while it loads. The template's background, fonts, colours, radii,
 * its header pieces (wordmark, language) and the footer, around one centred message, so a paused
 * link or a closed collection still looks like the page the guest was invited to. Copy-free:
 * the app passes every word in. Shared by every template (one place, from the theme tokens);
 * a template may restyle `.tpl-screen-*` in its own sheet.
 */
export type TemplateStatusIcon =
  | 'paused'
  | 'closed'
  | 'revoked'
  | 'not-found'
  | 'unavailable'
  | 'quota-full'
  | 'rate-limited'
  | 'error';

export type TemplateScreen =
  | {
      kind: 'status';
      icon: TemplateStatusIcon;
      /** `warning`: the accent ring (paused); otherwise quiet. */
      tone?: 'warning';
      title: string;
      text: string | null;
      /** A button the app renders (e.g. «Спробувати ще»), or `null`. */
      action: ReactNode | null;
      /** Under the message, e.g. how many files arrived before the link closed. */
      note?: string | null;
    }
  | {
      kind: 'loading';
      /** Said to screen readers while the page loads. */
      label: string;
    };

const ICONS: Record<TemplateStatusIcon, LucideIcon> = {
  paused: Pause,
  closed: Lock,
  revoked: Link2Off,
  'not-found': SearchX,
  unavailable: CircleOff,
  'quota-full': Inbox,
  'rate-limited': Hourglass,
  error: TriangleAlert,
};

export function GuestTemplateScreen({
  templateId,
  templateVersion,
  settings: stored,
  fontClassName,
  screen,
  slots,
}: {
  templateId: string;
  templateVersion: number;
  settings: unknown;
  fontClassName: (heading: FontId, body: FontId) => string;
  screen: TemplateScreen;
  slots: Pick<TemplateSlots, 'brand' | 'languageSwitch' | 'footer'>;
}) {
  const { def, settings } = resolveTheme(templateId, templateVersion, stored);
  const style = { ...themeTokens(def, settings), colorScheme: def.scheme } as CSSProperties;
  return (
    <div
      data-template={def.id}
      data-scheme={def.scheme}
      data-screen={screen.kind}
      style={style}
      className={fontClassName(settings.headingFont, def.bodyFont) || undefined}
    >
      <div className="tpl-screen">
        <header className="tpl-screen-bar">
          {slots.brand}
          {slots.languageSwitch}
        </header>
        <main className="tpl-screen-main">
          {screen.kind === 'loading' ? (
            <LoadingScreen label={screen.label} />
          ) : (
            <StatusScreen screen={screen} />
          )}
        </main>
        {slots.footer}
      </div>
    </div>
  );
}

function StatusScreen({ screen }: { screen: Extract<TemplateScreen, { kind: 'status' }> }) {
  const Icon = ICONS[screen.icon];
  return (
    <section data-slot="link-state" data-state={screen.icon} className="tpl-screen-card">
      <span
        aria-hidden="true"
        className="tpl-screen-icon"
        data-tone={screen.tone === 'warning' ? 'warning' : undefined}
      >
        <Icon />
      </span>
      <h1 className="tpl-screen-title">{screen.title}</h1>
      {screen.text === null ? null : <p className="tpl-screen-text">{screen.text}</p>}
      {screen.action === null ? null : <div className="tpl-screen-action">{screen.action}</div>}
      {screen.note === undefined || screen.note === null ? null : (
        <p className="tpl-screen-note">{screen.note}</p>
      )}
    </section>
  );
}

/** The page's shape while it loads: title, line, action, frames. Static under reduced motion. */
function LoadingScreen({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="tpl-screen-skeleton">
      <span className="tpl-skeleton tpl-skeleton-title" />
      <span className="tpl-skeleton tpl-skeleton-line" />
      <span className="tpl-skeleton tpl-skeleton-action" />
      <span className="tpl-skeleton-grid">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="tpl-skeleton tpl-skeleton-frame" />
        ))}
      </span>
    </div>
  );
}
