'use client';

/*
 * Design pass (ADR 0016 fallback; DESIGN-SYSTEM §6.0 single-step frame, §9 forms):
 * - One step on the AuthPage card, like /auth/verify: h1 sized as a section heading, a
 *   one-sentence reason, then the two documents as a short list (title link in a new tab, the
 *   version and effective date muted underneath), the checkbox row, the primary action, and a
 *   ghost «Вийти» for someone who does not agree.
 * - The submit is never disabled before the request (§9): submitting without the box shows an
 *   inline error under it (role="alert") and moves focus to the box.
 * - Phones: the panel is full-width with 16px gutters; the actions stack, primary first, full
 *   width; from `sm` they sit in one row. Rows and buttons are ≥ 44px; nothing is hover-only.
 * - A stale version (400 LEGAL_VERSION_OUTDATED): refetch `me`, show the message, untick the box,
 *   so the person looks at the new version before accepting again.
 */
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import { currentLegalVersion, type LegalStatus } from '@stepler/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { apiRequest, isApiError } from '@/api/client';
import { acceptLegal, fetchMe, ME_QUERY_KEY } from '@/api/me';
import { errorMessageKey } from '@/errors/error-message';
import { LegalConsent } from '@/legal/legal-consent';
import { legalPath } from '@/legal/slugs';
import { BrandLoading } from '@/components/brand-loading';

const MUST_CHECK_ID = 'accept-terms-error';

export function AcceptTermsPanel() {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ME_QUERY_KEY, queryFn: fetchMe });
  const [checked, setChecked] = useState(false);
  const [mustCheck, setMustCheck] = useState(false);
  const checkbox = useRef<HTMLButtonElement>(null);

  const accept = useMutation({
    mutationFn: (legal: LegalStatus) =>
      acceptLegal({
        acceptances: legal.documents.map((doc) => ({
          document: doc.document,
          version: doc.requiredVersion,
        })),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(ME_QUERY_KEY, data);
      if (data.legal.accepted) router.replace('/app');
    },
    onError: (error) => {
      if (!isApiError(error, 'LEGAL_VERSION_OUTDATED')) return;
      setChecked(false);
      void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
    },
  });
  const logout = useMutation({
    mutationFn: () => apiRequest('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      queryClient.clear();
      router.replace('/login');
    },
  });

  const unauthenticated = isApiError(me.error, 'UNAUTHENTICATED');
  useEffect(() => {
    if (unauthenticated) router.replace('/login');
  }, [unauthenticated, router]);

  if (me.data === undefined) {
    if (me.error === null || unauthenticated) {
      return <BrandLoading label={t('app.loading')} className="py-10" />;
    }
    const loadFailure = isApiError(me.error) ? me.error.code : 'INTERNAL';
    return (
      <div className="grid gap-4">
        <p role="alert">{t(errorMessageKey(loadFailure))}</p>
        <Button size="lg" onClick={() => void me.refetch()}>
          {t('verify.retry')}
        </Button>
      </div>
    );
  }

  const legal = me.data.legal;
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!checked) {
      setMustCheck(true);
      checkbox.current?.focus();
      return;
    }
    accept.mutate(legal);
  };
  const failure = isApiError(accept.error) ? accept.error.code : accept.error ? 'INTERNAL' : null;

  return (
    <form noValidate className="grid gap-5" onSubmit={onSubmit}>
      <div className="grid gap-2">
        <h1 className="type-h2 text-balance">{t('acceptTerms.title')}</h1>
        <p className="text-pretty text-muted-foreground">{t('acceptTerms.lead')}</p>
      </div>

      <ul aria-label={t('acceptTerms.documentsLabel')} className="grid gap-1">
        {legal.documents.map((doc) => (
          <DocumentRow key={doc.document} document={doc.document} version={doc.requiredVersion} />
        ))}
      </ul>

      {failure !== null && <Alert variant="error">{t(errorMessageKey(failure))}</Alert>}

      <div className="grid gap-1">
        <LegalConsent
          id="accept-terms-checkbox"
          messageKey="acceptTerms.checkbox"
          checkboxRef={checkbox}
          checked={checked}
          onCheckedChange={(value) => {
            setChecked(value);
            if (value) setMustCheck(false);
          }}
          disabled={accept.isPending}
          invalid={mustCheck}
          describedBy={mustCheck ? MUST_CHECK_ID : undefined}
        />
        {mustCheck && (
          <p
            id={MUST_CHECK_ID}
            role="alert"
            className="flex items-start gap-1.5 pl-8 text-sm leading-[1.45] text-destructive"
          >
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0">{t('acceptTerms.mustCheck')}</span>
          </p>
        )}
      </div>

      <div className="grid gap-2 sm:flex sm:flex-row-reverse sm:justify-start">
        <Button type="submit" size="lg" disabled={accept.isPending}>
          {accept.isPending ? t('acceptTerms.submitting') : t('acceptTerms.submit')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          disabled={logout.isPending}
          onClick={() => logout.mutate()}
        >
          {t('acceptTerms.logout')}
        </Button>
      </div>
    </form>
  );
}

const TITLE_KEYS = { TERMS: 'legal.terms.title', PRIVACY: 'legal.privacy.title' } as const;

function DocumentRow({ document, version }: { document: 'TERMS' | 'PRIVACY'; version: string }) {
  const t = useTranslations();
  const format = useFormatter();
  const { effectiveDate } = currentLegalVersion(document);
  const date = format.dateTime(new Date(`${effectiveDate}T00:00:00Z`), 'short');
  return (
    <li>
      <a
        href={legalPath(document)}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'grid min-h-11 content-center gap-0.5 rounded-control py-1.5 text-link hover:text-link-hover',
          focusRing,
        )}
      >
        <span className="inline-flex items-center gap-1.5 font-semibold underline decoration-1 underline-offset-[0.2em]">
          {t(TITLE_KEYS[document])}
          <ExternalLink aria-hidden="true" className="size-4 shrink-0" />
          <span className="sr-only">{t('acceptTerms.opensInNewTab')}</span>
        </span>
        <span className="type-small text-muted-foreground">
          {t('acceptTerms.documentMeta', { version, date })}
        </span>
      </a>
    </li>
  );
}
