import type { LegalDocumentVersion } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import { getFormatter, getTranslations } from 'next-intl/server';

/** «Чернетка — текст буде замінено»: a static note (not a live region), printed with an edge. */
export async function DraftBanner() {
  const t = await getTranslations('legal');
  return (
    <Alert variant="warning" role="note" className="print:border print:border-border">
      {t('draftBanner')}
    </Alert>
  );
}

/** «Версія v1 · діє з 4 жовт. 2026 р.» with a machine-readable date. */
export async function LegalMeta({ meta }: { meta: LegalDocumentVersion }) {
  const [t, format] = await Promise.all([getTranslations('legal'), getFormatter()]);
  // The registry's YYYY-MM-DD is a calendar day; midnight UTC shows as that day in Europe/Kyiv.
  const date = format.dateTime(new Date(`${meta.effectiveDate}T00:00:00Z`), 'short');
  return (
    <p className="type-small text-muted-foreground">
      {t.rich('meta', {
        version: meta.version,
        date,
        time: (chunks) => <time dateTime={meta.effectiveDate}>{chunks}</time>,
      })}
    </p>
  );
}

/** «Контакти»: the one channel for privacy requests and content complaints (F6, F2). */
export async function ContactBlock({ email }: { email: string }) {
  const t = await getTranslations('legal');
  return (
    <section aria-labelledby="legal-contact" className="mt-10 border-t pt-6">
      <h2 id="legal-contact" className="type-h2">
        {t('contact.title')}
      </h2>
      <p className="mt-3 text-[1.0625rem] leading-[1.6]">
        {t.rich('contact.text', {
          address: email,
          email: (chunks) => (
            <a
              href={`mailto:${email}`}
              className={cn(
                'rounded-frame text-link underline decoration-1 underline-offset-[0.2em] hover:text-link-hover',
                focusRing,
              )}
            >
              {chunks}
            </a>
          ),
        })}
      </p>
    </section>
  );
}

/** The rendered Markdown body: repo-controlled content only (documents.test.ts rejects raw HTML). */
export function LegalArticle({ html, className }: { html: string; className?: string }) {
  return (
    <article className={cn('legal-prose', className)} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
