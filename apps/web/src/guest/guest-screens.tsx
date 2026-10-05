'use client';

// The guest page's whole-page screens (owner remarks 99, 100): loading, and the link and
// collection states. In the link's template when its look is known (the server fetched it while
// rendering `/g/{token}`, or the editor's preview has the page), so the guest never sees the
// app's look first; the plain Stepler header and column otherwise (an unknown link). The copy is
// the same either way. Nothing here reaches a guest API: the editor's preview uses it too.

import type { GuestLinkThemeResponse } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { Skeleton } from '@stepler/ui/components/skeleton';
import {
  GuestTemplateScreen,
  type TemplateScreen,
  type TemplateStatusIcon,
} from '@stepler/templates/react';
import { useTranslations } from 'next-intl';
import { LinkStatePage } from '@/app/g/[token]/link-state-page';
import { GuestChrome } from './guest-chrome';
import type { GuestPageState } from './guest-state';
import { staticSlots } from './static-slots';
import { fontVariables } from './template-fonts';

/** A link's look: its template, version and settings (as stored; resolved by the template). */
export type GuestTheme = Pick<GuestLinkThemeResponse, 'templateId' | 'templateVersion'> & {
  settings: unknown;
};

const ICON: Record<GuestPageState, TemplateStatusIcon> = {
  paused: 'paused',
  revoked: 'revoked',
  archived: 'closed',
  unavailable: 'unavailable',
  'not-found': 'not-found',
  'quota-full': 'quota-full',
  'rate-limited': 'rate-limited',
  failed: 'error',
};

/** The copy key of each state (`guestLink.*`); `failed` has a single line, no title. */
const COPY: Record<Exclude<GuestPageState, 'failed'>, string> = {
  paused: 'paused',
  revoked: 'revoked',
  archived: 'archived',
  unavailable: 'unavailable',
  'not-found': 'notFound',
  'quota-full': 'quotaFull',
  'rate-limited': 'rateLimited',
};

/** The screen while the guest context loads. */
export function GuestLoadingScreen({ theme }: { theme: GuestTheme | null }) {
  const t = useTranslations('guestLink');
  if (theme !== null) {
    return <InTemplate theme={theme} screen={{ kind: 'loading', label: t('loading') }} />;
  }
  return (
    <GuestChrome>
      <div
        role="status"
        aria-busy="true"
        aria-label={t('loading')}
        className="mx-auto grid w-full max-w-[720px] gap-4 lg:max-w-none"
      >
        <Skeleton className="h-10 w-4/5" />
        <Skeleton className="h-5 w-3/5" />
      </div>
    </GuestChrome>
  );
}

/** A link or collection state, with «Спробувати ще» where a retry can help. */
export function GuestStateScreen({
  theme,
  state,
  retry,
  added = 0,
}: {
  theme: GuestTheme | null;
  state: GuestPageState;
  retry?: () => void;
  added?: number;
}) {
  const t = useTranslations('guestLink');
  const retryable = state === 'rate-limited' || state === 'failed';
  const again =
    retryable && retry !== undefined ? (
      <Button variant="outline" className="w-full sm:w-auto" onClick={retry}>
        {t('retry')}
      </Button>
    ) : null;
  const note = added > 0 ? t('addedBeforeClosed', { count: added }) : null;
  const key = state === 'failed' ? null : COPY[state];
  const title = key === null ? t('failed') : t(`${key}.title`);
  const text = key === null || state === 'rate-limited' ? null : t(`${key}.text`);

  if (theme !== null) {
    return (
      <InTemplate
        theme={theme}
        screen={{
          kind: 'status',
          icon: ICON[state],
          ...(state === 'paused' ? { tone: 'warning' as const } : {}),
          title,
          text,
          action: again,
          note,
        }}
      />
    );
  }
  return (
    <GuestChrome>
      <div className="mx-auto grid w-full max-w-[720px] gap-4">
        {state === 'failed' ? (
          <Alert variant="error" action={again}>
            {title}
          </Alert>
        ) : (
          <LinkStatePage
            {...(state === 'paused' ? { tone: 'warning' as const } : {})}
            title={title}
            {...(text === null ? {} : { text })}
            {...(again === null ? {} : { action: again })}
          />
        )}
        {note === null ? null : <p className="text-muted-foreground">{note}</p>}
      </div>
    </GuestChrome>
  );
}

function InTemplate({ theme, screen }: { theme: GuestTheme; screen: TemplateScreen }) {
  const { brand, languageSwitch, footer } = staticSlots();
  return (
    <GuestTemplateScreen
      templateId={theme.templateId}
      templateVersion={theme.templateVersion}
      settings={theme.settings}
      fontClassName={fontVariables}
      screen={screen}
      slots={{ brand, languageSwitch, footer }}
    />
  );
}
