'use client';

import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { ConfirmDialog } from '@stepler/ui/components/confirm-dialog';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Trash2, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { requestAccountDeletion } from '@/api/account-deletion';
import { isApiError } from '@/api/client';
import { fetchMe, ME_QUERY_KEY } from '@/api/me';
import { errorMessageKey } from '@/errors/error-message';

/**
 * «Видалення акаунта» (ADR 0020), the account page's danger zone, styled like a collection's:
 * nothing is deleted here. The dialog sends a one-time link to the account's address; the
 * link's page shows what goes and deletes, so a stolen session alone cannot delete the account.
 */
export function DeleteAccount() {
  const t = useTranslations();
  const me = useQuery({ queryKey: ME_QUERY_KEY, queryFn: fetchMe });
  const [open, setOpen] = useState(false);
  const send = useMutation({ mutationFn: requestAccountDeletion });

  if (me.data === undefined) return null;
  const email = me.data.email;
  const code = isApiError(send.error) ? send.error.code : 'INTERNAL';

  return (
    <section
      aria-labelledby="account-danger"
      data-slot="account-danger"
      className="grid gap-4 rounded-sheet border border-destructive bg-destructive-soft p-4 shadow-card sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:p-6"
    >
      <TriangleAlert
        aria-hidden="true"
        className="hidden size-5 shrink-0 text-destructive sm:block"
      />
      <div className="grid gap-1">
        <h2 id="account-danger" className="type-h3 flex items-center gap-2 text-destructive">
          <TriangleAlert aria-hidden="true" className="size-4 shrink-0 sm:hidden" />
          {t('accountDeletion.title')}
        </h2>
        <p id="account-delete-hint" className="max-w-[60ch] text-sm text-pretty">
          {t('accountDeletion.hint')}
        </p>
      </div>
      <Button
        variant="destructive"
        className="w-full sm:w-auto"
        aria-describedby="account-delete-hint"
        onClick={() => {
          send.reset();
          setOpen(true);
        }}
      >
        <Trash2 aria-hidden="true" />
        {t('accountDeletion.open')}
      </Button>
      {send.isSuccess ? (
        <Alert variant="success" className="sm:col-span-3">
          {t('accountDeletion.sent', { email })}
        </Alert>
      ) : null}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t('accountDeletion.dialogTitle')}
        description={t('accountDeletion.dialogText', { email })}
        confirmLabel={t('accountDeletion.dialogConfirm')}
        cancelLabel={t('accountDeletion.cancel')}
        pendingLabel={t('accountDeletion.sending')}
        onConfirm={async () => {
          await send.mutateAsync();
        }}
        errorMessage={t(errorMessageKey(code))}
      />
    </section>
  );
}
