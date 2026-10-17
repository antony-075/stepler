'use client';

import {
  meResponseSchema,
  signedInResponseSchema,
  verificationPreviewResponseSchema,
} from '@stepler/contracts';
import { Button } from '@stepler/ui/components/button';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiRequest, isApiError } from '@/api/client';
import { ME_QUERY_KEY } from '@/api/me';
import { signInErrorMessage } from '@/errors/error-message';
import { BrandLoading } from '@/components/brand-loading';

/**
 * The e-mail confirmation link (ADR 0019). Loading this page only previews the link (read-only),
 * so e-mail scanners that open it do not use it up; it is used only when the person presses
 * «Підтвердити пошту», which also signs them in. The page shows whose address it confirms, so
 * someone sent another account's link sees a foreign address before pressing.
 */
export function VerifyPanel({
  token,
  contactEmail,
}: {
  token: string | null;
  /** `LEGAL_CONTACT_EMAIL`, for a blocked account's message (slice 9); `null` when unset. */
  contactEmail: string | null;
}) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();

  const preview = useQuery({
    queryKey: ['verification-preview', token],
    enabled: token !== null,
    queryFn: () =>
      apiRequest('/auth/verification/preview', {
        method: 'POST',
        body: { token },
        schema: verificationPreviewResponseSchema,
      }),
  });
  const verify = useMutation({
    mutationFn: () =>
      apiRequest('/auth/verification/confirm', {
        method: 'POST',
        body: { token },
        schema: signedInResponseSchema,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      router.replace('/app');
    },
  });

  /**
   * If a verify response was lost after the server used the link, the session may already
   * exist: go to the app instead of showing "link invalid".
   */
  async function retry(): Promise<void> {
    if (verify.isError) {
      const signedIn = await apiRequest('/me', { schema: meResponseSchema }).then(
        () => true,
        () => false,
      );
      if (signedIn) {
        router.replace('/app');
        return;
      }
    }
    verify.reset();
    await preview.refetch();
  }

  const failure =
    token === null ? 'AUTH_TOKEN_INVALID' : failureCode(preview.error ?? verify.error);
  if (failure !== null) {
    const retryable = failure === 'UPSTREAM_UNAVAILABLE' || failure === 'DEPENDENCY_UNAVAILABLE';
    const message = signInErrorMessage(t, failure, contactEmail);
    // A retryable failure offers Retry; otherwise the way out is a new link. Plain text under a
    // heading, not an Alert: the error is the whole content of this page.
    return (
      <div className="grid gap-4">
        <h1 className={TITLE}>
          {retryable ? t('verify.unavailableTitle') : t('verify.invalidTitle')}
        </h1>
        <p role="alert" className="text-muted-foreground">
          {message}
        </p>
        {retryable ? (
          <Button
            size="lg"
            onClick={() => {
              void retry();
            }}
          >
            {t('verify.retry')}
          </Button>
        ) : (
          <Button asChild size="lg">
            <Link href="/login">{t('verify.backToLogin')}</Link>
          </Button>
        )}
      </div>
    );
  }

  if (preview.data === undefined) {
    return (
      <BrandLoading label={t('verify.checking')} message={t('verify.checking')} className="py-6" />
    );
  }

  return (
    <div className="grid gap-4">
      <h1 className={TITLE}>{t('verify.title')}</h1>
      <p>{t('verify.confirmAs', { email: preview.data.email })}</p>
      <p className="text-sm text-muted-foreground">{t('verify.notYou')}</p>
      <Button size="lg" disabled={verify.isPending} onClick={() => verify.mutate()}>
        {verify.isPending ? t('verify.signingIn') : t('verify.submit')}
      </Button>
    </div>
  );
}

// The page's h1, sized as a section heading: the panel is the whole page.
const TITLE = 'type-h2';

function failureCode(error: unknown) {
  if (error === null || error === undefined) return null;
  return isApiError(error) ? error.code : 'INTERNAL';
}
