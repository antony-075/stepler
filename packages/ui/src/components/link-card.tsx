import { TriangleAlert } from 'lucide-react';
import { createContext, type ReactNode, useContext, useId } from 'react';
import { cn } from '../lib/utils';
import { Badge, type BadgeVariant } from './badge';
import { QrFrame } from './qr-frame';

/*
 * Design (DESIGN-SYSTEM.md §5.15, §6.7; owner review 2026-10-02: the old panel was "all in a
 * heap", and this section is "very sensitive", so clarity beats density):
 * - One card per guest link holds everything about it, in four parts in the order an admin
 *   needs them: share it, decide what guests can do, switch it on or off, and the dangerous
 *   actions last. Each part is its own row with a heading and one plain sentence, split by
 *   hairlines, so nothing reads as one pile of buttons.
 * - A part's heading and sentence sit on the left of its controls once the card is wide
 *   (`@container`, from 48rem), the way settings rows read; on phones they stack.
 * - The danger part is set apart the way the settings' danger zone is: the soft destructive
 *   fill, a warning icon by the heading, the text in the foreground colour. Colour is never the
 *   only signal: the icon and the words say it too.
 * - The QR is the one large object (180px under a 375px screen, 200px from 375px, 160px beside
 *   the link once there is room), white in both themes so it scans.
 */

type LinkCardStatus = 'active' | 'paused';

const STATUS_VARIANT: Record<LinkCardStatus, BadgeVariant> = {
  active: 'success',
  paused: 'warning',
};

/** The card's heading level, so its parts can be one level below. */
const LevelContext = createContext<2 | 3>(2);

type LinkCardProps = {
  /** The link's name (e.g. «Основне посилання» or an additional link's label). */
  title: string;
  /** `h2` on its own, `h3` inside a titled group (additional links). */
  level?: 2 | 3;
  status: LinkCardStatus;
  /** The status in words; the tag's dot is decoration. */
  statusLabel: string;
  /** One quiet line under the title (what this link is for, when it was made). */
  meta?: ReactNode;
  /** `LinkCardSection`s. */
  children: ReactNode;
  className?: string;
};

function LinkCard({
  title,
  level = 2,
  status,
  statusLabel,
  meta,
  children,
  className,
}: LinkCardProps) {
  const titleId = useId();
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <section
      data-slot="link-card"
      data-status={status}
      aria-labelledby={titleId}
      className={cn(
        '@container/link-card grid min-w-0 overflow-hidden rounded-sheet border bg-card text-card-foreground',
        className,
      )}
    >
      <header className="grid gap-1 p-4 sm:px-6 sm:pt-5 sm:pb-4">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
          <Heading id={titleId} className="type-h2 min-w-0 [overflow-wrap:anywhere]">
            {title}
          </Heading>
          <Badge variant={STATUS_VARIANT[status]}>{statusLabel}</Badge>
        </div>
        {meta === undefined ? null : (
          <p className="text-sm text-pretty text-muted-foreground [overflow-wrap:anywhere]">
            {meta}
          </p>
        )}
      </header>
      <LevelContext.Provider value={level}>{children}</LevelContext.Provider>
    </section>
  );
}

type LinkCardSectionProps = {
  title: string;
  /** One plain sentence on what this part does. */
  description?: ReactNode;
  /** `danger`: rotate or revoke; the soft destructive fill and a warning icon. */
  tone?: 'default' | 'danger';
  children: ReactNode;
  className?: string;
};

function LinkCardSection({
  title,
  description,
  tone = 'default',
  children,
  className,
}: LinkCardSectionProps) {
  const level = useContext(LevelContext);
  const Heading = level === 2 ? 'h3' : 'h4';
  const titleId = useId();
  const danger = tone === 'danger';
  return (
    <section
      data-slot="link-card-section"
      data-tone={tone}
      aria-labelledby={titleId}
      className={cn(
        'grid min-w-0 gap-4 border-t p-4 sm:px-6 sm:py-5',
        '@[48rem]/link-card:grid-cols-[15rem_minmax(0,1fr)] @[48rem]/link-card:gap-10',
        { 'border-t-destructive bg-destructive-soft': danger },
        className,
      )}
    >
      <div className="grid content-start gap-1">
        <Heading
          id={titleId}
          className="flex items-center gap-2 text-base leading-[1.35] font-semibold"
        >
          {danger ? (
            <TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-destructive" />
          ) : null}
          {title}
        </Heading>
        {description === undefined ? null : (
          <p
            className={cn('text-sm leading-[1.45] text-pretty', {
              'text-muted-foreground': !danger,
            })}
          >
            {description}
          </p>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/**
 * The share part's layout: the QR, then (or beside it, once the part is wide enough) the link
 * field and the download. `qr={null}` draws an empty frame for a link that cannot be shown.
 */
function LinkShare({
  qr,
  field,
  actions,
}: {
  qr: ReactNode;
  field: ReactNode;
  actions?: ReactNode;
}) {
  return (
    // The part's own width decides the layout (a container cannot query itself: two divs).
    <div className="@container/link-share min-w-0">
      <div className="grid min-w-0 gap-4 @[30rem]/link-share:grid-cols-[auto_minmax(0,1fr)] @[30rem]/link-share:items-start @[30rem]/link-share:gap-6">
        <QrFrame className="size-[180px] justify-self-center min-[375px]:size-[200px] @[30rem]/link-share:size-[160px] @[30rem]/link-share:justify-self-start">
          {qr}
        </QrFrame>
        <div className="grid min-w-0 gap-3">
          {field}
          {actions === undefined ? null : (
            <div className="flex min-w-0 flex-col gap-2 *:w-full @[30rem]/link-share:flex-row @[30rem]/link-share:flex-wrap @[30rem]/link-share:*:w-auto">
              {actions}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export {
  LinkCard,
  LinkCardSection,
  LinkShare,
  type LinkCardProps,
  type LinkCardSectionProps,
  type LinkCardStatus,
};
