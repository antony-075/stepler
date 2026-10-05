'use client';

import type { LegalDocumentKey } from '@stepler/contracts';
import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { legalPath } from '@/legal/slugs';

/**
 * The guest's terms notice (spec §15, F8: a short notice with links, no checkbox), under the
 * contribution buttons. The documents open in a new tab so the guest page keeps its state
 * (upload queue, name); `/g/*` sends `Referrer-Policy: no-referrer`, so the link token never
 * travels as a Referer. The sentence itself is placeholder copy the lawyer replaces in
 * `messages/*.json` under `guest.legalNotice`; the `<terms>` and `<privacy>` tags mark the links.
 */
export function GuestLegalNotice({ className }: { className?: string }) {
  const t = useTranslations('guest');
  return (
    <p
      data-slot="guest-legal-notice"
      className={cn('text-center type-caption text-pretty text-muted-foreground', className)}
    >
      {t.rich('legalNotice', {
        terms: (chunks) => <LegalLink document="TERMS">{chunks}</LegalLink>,
        privacy: (chunks) => <LegalLink document="PRIVACY">{chunks}</LegalLink>,
      })}
    </p>
  );
}

function LegalLink({ document, children }: { document: LegalDocumentKey; children: ReactNode }) {
  const t = useTranslations('legal');
  return (
    <a
      href={legalPath(document)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'rounded-frame text-link underline decoration-1 underline-offset-[0.2em] hover:text-link-hover',
        focusRing,
      )}
    >
      {children}
      <span className="sr-only"> {t('opensInNewTab')}</span>
    </a>
  );
}
