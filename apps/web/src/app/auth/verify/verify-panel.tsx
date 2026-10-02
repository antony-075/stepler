'use client';

import {
  magicLinkPreviewResponseSchema,
  magicLinkVerifyResponseSchema,
  meResponseSchema,
} from '@stepler/contracts';
import { Button } from '@stepler/ui/components/button';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiRequest, isApiError } from '@/api/client';
import { ME_QUERY_KEY } from '@/api/me';
import { errorMessageKey } from '@/errors/error-message';

/**
 * Loading this page only previews the link (read-only), so email scanners that open it do
 * not use it up. The link is consumed only when the person presses Sign in (Review Focus 1).
 */
export function VerifyPanel({ token }: { token: string | null }) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();

  const preview = useQuery({
    queryKey: ['magic-link-preview', token],
    enabled: token !== null,
    queryFn: () =>
      apiRequest('/auth/magic-link/preview', {
        method: 'POST',
        body: { token },
        schema: magicLinkPreviewResponseSchema,
      }),
  });
  const verify = useMutation({
    mutationFn: () =>
      apiRequest('/auth/magic-link/verify', {
        method: 'POST',
        body: { token },
        schema: magicLinkVerifyResponseSchema,
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
    token === null ? 'MAGIC_LINK_INVALID' : failureCode(preview.error ?? verify.error);
  if (failure !== null) {
    const retryable = failure === 'UPSTREAM_UNAVAILABLE' || failure === 'DEPENDENCY_UNAVAILABLE';
    const message = t(errorMessageKey(failure));
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
      <p role="status" className="text-muted-foreground">
        {t('verify.checking')}
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      <h1 className={TITLE}>{t('verify.title')}</h1>
      <p>{t('verify.signInAs', { email: preview.data.email })}</p>
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
