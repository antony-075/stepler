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
      await queryClient.invalidateQueries({ queryKey: ['me'] });
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
    return (
      <div className="grid gap-4">
        <p role="alert">{t(errorMessageKey(failure))}</p>
        {retryable ? (
          <Button
            onClick={() => {
              void retry();
            }}
          >
            {t('verify.retry')}
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link href="/login">{t('verify.backToLogin')}</Link>
          </Button>
        )}
      </div>
    );
  }

  if (preview.data === undefined) {
    return <p role="status">{t('verify.checking')}</p>;
  }

  return (
    <div className="grid gap-4">
      <h1 className="font-display text-xl leading-tight font-medium tracking-tight sm:text-2xl">
        {t('verify.title')}
      </h1>
      <p>{t('verify.signInAs', { email: preview.data.email })}</p>
      <p className="text-sm text-muted-foreground">{t('verify.notYou')}</p>
      <Button size="lg" disabled={verify.isPending} onClick={() => verify.mutate()}>
        {verify.isPending ? t('verify.signingIn') : t('verify.submit')}
      </Button>
    </div>
  );
}

function failureCode(error: unknown) {
  if (error === null || error === undefined) return null;
  return isApiError(error) ? error.code : 'INTERNAL';
}
