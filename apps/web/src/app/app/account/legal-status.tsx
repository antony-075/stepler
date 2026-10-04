'use client';

/*
 * Design pass («Правові документи» on «Акаунт», ADR 0016 / L3): a read-only list in the
 * SettingBlock's control column, one row per document: the title as a new-tab link (with an
 * external-link icon and a screen-reader note), then two muted lines: the current version, and
 * either «Прийнято <date> (версія vN)» with a success check or «Не прийнято». No button: a
 * forced re-acceptance goes through /accept-terms. Rows are ≥ 44px; on phones the block stacks
 * under its heading like the other settings.
 */
import { currentLegalVersion, type LegalDocumentKey } from '@stepler/contracts';
import { Skeleton } from '@stepler/ui/components/skeleton';
import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { CircleCheck, ExternalLink } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { fetchMe, ME_QUERY_KEY } from '@/api/me';
import { legalPath } from '@/legal/slugs';

const TITLE_KEYS = { TERMS: 'legal.terms.title', PRIVACY: 'legal.privacy.title' } as const;

export function LegalStatusBlock() {
  const t = useTranslations();
  const format = useFormatter();
  const me = useQuery({ queryKey: ME_QUERY_KEY, queryFn: fetchMe });

  if (me.data === undefined) {
    // The shell shows the load error; here only the space is held.
    return <Skeleton className="h-28 w-full max-w-md" />;
  }

  return (
    <ul className="grid max-w-xl gap-4">
      {me.data.legal.documents.map((doc) => (
        <li key={doc.document} className="grid gap-0.5">
          <DocumentLink document={doc.document}>{t(TITLE_KEYS[doc.document])}</DocumentLink>
          <span className="text-sm text-muted-foreground">
            {t('account.legal.current', { version: currentLegalVersion(doc.document).version })}
          </span>
          {doc.acceptedVersion !== null && doc.acceptedAt !== null ? (
            <span className="flex items-start gap-1.5 text-sm text-muted-foreground">
              <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
              {t('account.legal.acceptedAt', {
                date: format.dateTime(new Date(doc.acceptedAt), 'short'),
                version: doc.acceptedVersion,
              })}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">{t('account.legal.notAccepted')}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function DocumentLink({ document, children }: { document: LegalDocumentKey; children: ReactNode }) {
  const t = useTranslations('acceptTerms');
  return (
    <a
      href={legalPath(document)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex min-h-11 items-center gap-1.5 justify-self-start rounded-control font-semibold text-link underline decoration-1 underline-offset-[0.2em] hover:text-link-hover',
        focusRing,
      )}
    >
      {children}
      <ExternalLink aria-hidden="true" className="size-4 shrink-0" />
      <span className="sr-only">{t('opensInNewTab')}</span>
    </a>
  );
}
