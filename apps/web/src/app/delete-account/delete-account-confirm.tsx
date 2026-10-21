'use client';

import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { confirmAccountDeletion, previewAccountDeletion } from '@/api/account-deletion';
import { isApiError } from '@/api/client';
import { BrandLoading } from '@/components/brand-loading';
import { errorMessageKey } from '@/errors/error-message';

// The page's h1, sized as a section heading: the panel is the whole page.
const TITLE = 'type-h2';

/**
 * The mailed deletion link (ADR 0020). Loading the page only previews the link (read-only), so
 * mail scanners that open it delete nothing. It names the account and lists what goes; only
 * «Видалити акаунт назавжди» deletes. LiqPay not answering, or a checkout still payable, keeps
 * the account and the link: the page says why and the button works again.
 */
export function DeleteAccountConfirm({ token }: { token: string | null }) {
  const t = useTranslations('accountDeletion');
  const tRoot = useTranslations();
  const queryClient = useQueryClient();

  const preview = useQuery({
    queryKey: ['account-deletion-preview', token],
    enabled: token !== null,
    retry: false,
    queryFn: () => previewAccountDeletion(token ?? ''),
  });
  const remove = useMutation({
    mutationFn: () => confirmAccountDeletion(token ?? ''),
    onSuccess: () => {
      // Signed out now: nothing of the old account may stay in this tab.
      queryClient.clear();
    },
  });

  if (remove.isSuccess) {
    return (
      <div className="grid gap-4">
        <h1 className={TITLE}>{t('doneTitle')}</h1>
        <p className="text-pretty">{t('doneText')}</p>
        <Button asChild size="lg" variant="outline">
          <Link href="/">{t('home')}</Link>
        </Button>
      </div>
    );
  }

  const removeCode = isApiError(remove.error)
    ? remove.error.code
    : remove.isError
      ? 'INTERNAL'
      : null;
  const invalid =
    token === null ||
    removeCode === 'AUTH_TOKEN_INVALID' ||
    (preview.isError &&
      (!isApiError(preview.error) || preview.error.code === 'AUTH_TOKEN_INVALID'));
  if (invalid) {
    return (
      <div className="grid gap-4">
        <h1 className={TITLE}>{t('invalidTitle')}</h1>
        <p role="alert" className="text-muted-foreground">
          {t('invalidText')}
        </p>
        <Button asChild size="lg">
          <Link href="/app/account">{t('toAccount')}</Link>
        </Button>
      </div>
    );
  }
  if (preview.isError) {
    const code = isApiError(preview.error) ? preview.error.code : 'INTERNAL';
    return (
      <div className="grid gap-4">
        <h1 className={TITLE}>{t('unavailableTitle')}</h1>
        <p role="alert" className="text-muted-foreground">
          {tRoot(errorMessageKey(code))}
        </p>
        <Button size="lg" onClick={() => void preview.refetch()}>
          {t('retry')}
        </Button>
      </div>
    );
  }
  if (preview.data === undefined) {
    return <BrandLoading label={t('checking')} message={t('checking')} className="py-6" />;
  }

  const { email, collections, subscription } = preview.data;
  const goes = [
    collections === 0 ? t('goesNoCollections') : t('goesCollections', { count: collections }),
    ...(subscription ? [t('goesSubscription')] : []),
    t('goesSignIn'),
  ];
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <h1 className={TITLE}>{t('confirmTitle')}</h1>
        <p className="text-pretty">{t('confirmLead', { email })}</p>
      </div>
      <ul className="grid gap-2">
        {goes.map((line) => (
          <li key={line} className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 text-pretty">
            <X aria-hidden="true" className="mt-1 size-4 text-destructive" />
            {line}
          </li>
        ))}
      </ul>
      <p className="text-sm text-pretty text-muted-foreground">{t('kept')}</p>
      {removeCode !== null ? (
        <Alert variant="error">
          {removeCode === 'PAYMENT_PENDING'
            ? t('pendingPayment')
            : removeCode === 'PAYMENT_PROVIDER_UNAVAILABLE'
              ? t('providerUnavailable')
              : tRoot(errorMessageKey(removeCode))}
        </Alert>
      ) : null}
      <Button
        size="lg"
        variant="destructive"
        disabled={remove.isPending}
        onClick={() => remove.mutate()}
      >
        {remove.isPending ? t('deleting') : t('confirm')}
      </Button>
      <Button asChild size="lg" variant="outline">
        <Link href="/app/account">{t('keep')}</Link>
      </Button>
    </div>
  );
}
