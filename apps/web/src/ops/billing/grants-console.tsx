'use client';

// Design pass (billing M1, Task 5; frontend-design, ui-ux-pro-max, web-design-guidelines,
// responsive-design). A tool for one operator, so it reads like the moderation queues
// (DESIGN-SYSTEM §0.11), not like a product page. Decisions:
// - one job per screen: find an account by its exact e-mail, see its access, grant or revoke;
//   the e-mail lives in `?email=` so a reload or a shared link reopens the same account;
// - the account is one panel: e-mail as the heading, access as a badge in words (Активний /
//   Пільговий період / Лише перегляд) with the reason and date beside it, then the plan in force,
//   then the grant form; the only filled button is «Надати тариф», revoking is destructive;
// - every change goes through the shared reason dialog (1–500, required) and ends in a toast;
// - phones: the search field and button stack, the form fields go full width, no table at all;
//   dates in Kyiv time, numbers in words the operator reads aloud («20 колекцій, 1 ТБ»).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Access, OperatorBillingAccount, SubscriptionDto } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Badge } from '@stepler/ui/components/badge';
import { Button } from '@stepler/ui/components/button';
import { Field } from '@stepler/ui/components/field';
import { Input } from '@stepler/ui/components/input';
import {
  Panel,
  PanelContent,
  PanelDescription,
  PanelHeader,
  PanelTitle,
} from '@stepler/ui/components/panel';
import { Skeleton } from '@stepler/ui/components/skeleton';
import { useToast } from '@stepler/ui/components/toast';
import { useFormatter, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { isOpsApiError } from '../api/client';
import {
  billingKeys,
  fetchBillingAccount,
  fetchOffers,
  grantPlan,
  revokeGrant,
} from '../api/billing';
import type { OpsAction } from '../actions';
import { ReasonDialog } from '../reason-dialog';
import { type GrantChoice, GrantForm } from './grant-form';
import { formatPlanBytes } from './plan-format';

const KYIV = 'Europe/Kyiv';
const NOT_FOUND_ALERT = 'info';
const ERROR_ALERT = 'error';
const NO_STORAGE = '';

const ACCESS_BADGE = {
  ACTIVE: 'success',
  GRACE: 'warning',
  COLLECTING_CLOSED: 'warning',
  READ_ONLY: 'danger',
} as const;

export function GrantsConsole({ email }: { email: string | null }) {
  const t = useTranslations('ops.billing');
  const router = useRouter();
  const [draft, setDraft] = useState(email ?? '');
  const account = useQuery({
    queryKey: billingKeys.account(email ?? ''),
    queryFn: ({ signal }) => fetchBillingAccount(email ?? '', signal),
    enabled: email !== null,
    retry: false,
  });

  const search = (event: React.FormEvent) => {
    event.preventDefault();
    const value = draft.trim();
    if (value === '') return;
    router.replace(`/ops/billing/grants?${new URLSearchParams({ email: value }).toString()}`);
  };

  return (
    <section aria-labelledby="ops-billing-title" className="grid max-w-3xl gap-5">
      <div className="grid gap-1">
        <h1 id="ops-billing-title" className="type-h1">
          {t('title')}
        </h1>
        <p className="text-muted-foreground">{t('intro')}</p>
      </div>
      <form role="search" noValidate onSubmit={search} className="grid gap-3 sm:flex sm:items-end">
        <Field id="ops-billing-email" label={t('email')} className="sm:flex-1">
          {(control) => (
            <Input
              {...control}
              type="email"
              autoComplete="off"
              spellCheck={false}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          )}
        </Field>
        <Button type="submit" variant="outline">
          {t('find')}
        </Button>
      </form>

      {email === null ? null : account.isPending ? (
        <AccountSkeleton />
      ) : account.isError ? (
        <Alert variant={isOpsApiError(account.error, 'NOT_FOUND') ? NOT_FOUND_ALERT : ERROR_ALERT}>
          {isOpsApiError(account.error, 'NOT_FOUND')
            ? t('notFound', { email })
            : isOpsApiError(account.error, 'VALIDATION_FAILED')
              ? t('invalidEmail')
              : t('failed')}
        </Alert>
      ) : (
        <AccountPanel account={account.data} />
      )}
    </section>
  );
}

function AccountPanel({ account }: { account: OperatorBillingAccount }) {
  const t = useTranslations('ops');
  const format = useFormatter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [action, setAction] = useState<OpsAction | null>(null);
  const [choice, setChoice] = useState<GrantChoice | null>(null);
  const offers = useQuery({
    queryKey: billingKeys.offers,
    queryFn: ({ signal }) => fetchOffers(signal),
  });
  const subscriptionOffers = (offers.data?.items ?? []).filter(
    (offer) => offer.kind === 'SUBSCRIPTION',
  );
  const plan = account.subscription;
  const date = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'medium', timeZone: KYIV });

  const mutation = useMutation({
    mutationFn: (reason: string) =>
      action === 'revokeGrant' && plan !== null
        ? revokeGrant(plan.id, reason)
        : grantPlan({
            userId: account.userId,
            offerId: choice?.offerId ?? '',
            endsAt: choice?.endsAt ?? null,
            reason,
          }),
  });

  const confirm = async (reason: string) => {
    const done = action;
    try {
      await mutation.mutateAsync(reason);
    } catch (error) {
      throw new Error(
        isOpsApiError(error, 'SUBSCRIPTION_EXISTS')
          ? t('billing.paidExists')
          : isOpsApiError(error, 'NOT_FOUND')
            ? t('actions.gone')
            : isOpsApiError(error, 'VALIDATION_FAILED')
              ? t('billing.endDateError')
              : t('actions.failed'),
        { cause: error },
      );
    }
    await queryClient.invalidateQueries({ queryKey: billingKeys.all });
    if (done !== null) toast({ variant: 'success', title: t(`actions.${done}.done`) });
  };

  return (
    <Panel aria-labelledby="ops-billing-account">
      <PanelHeader>
        <PanelTitle id="ops-billing-account" className="break-all">
          {account.email}
        </PanelTitle>
        <PanelDescription>
          {t('billing.createdAt', { date: date(account.createdAt) })}
        </PanelDescription>
      </PanelHeader>
      <PanelContent className="grid gap-6">
        <div className="grid gap-2">
          <h2 className="type-h3">{t('billing.accessTitle')}</h2>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Badge variant={ACCESS_BADGE[account.access.state]}>
              {t(`billing.states.${account.access.state}`)}
            </Badge>
            <span className="text-foreground-soft">{accessLine(t, account.access, date)}</span>
          </p>
        </div>

        <div className="grid gap-2">
          <h2 className="type-h3">{t('billing.planTitle')}</h2>
          {plan === null ? (
            <p className="text-muted-foreground">{t('billing.noPlan')}</p>
          ) : (
            <PlanLine plan={plan} date={date} format={format.number} />
          )}
          {plan?.source === 'COMPLIMENTARY' ? (
            <div>
              <Button variant="outline" onClick={() => setAction('revokeGrant')}>
                {t('actions.revokeGrant.button')}
              </Button>
            </div>
          ) : null}
        </div>

        <div className="grid gap-3 border-t pt-6">
          <h2 className="type-h3">
            {plan?.source === 'COMPLIMENTARY' ? t('billing.replaceTitle') : t('billing.grantTitle')}
          </h2>
          {plan?.source === 'LIQPAY' ? (
            <Alert variant="info">{t('billing.paidExists')}</Alert>
          ) : offers.isPending ? (
            <Skeleton className="h-11 w-full md:max-w-md" />
          ) : offers.isError || subscriptionOffers.length === 0 ? (
            <Alert variant="error">{t('billing.offersFailed')}</Alert>
          ) : (
            <GrantForm
              offers={subscriptionOffers}
              replacing={plan?.source === 'COMPLIMENTARY'}
              onSubmit={(next) => {
                setChoice(next);
                setAction('grant');
              }}
            />
          )}
        </div>
      </PanelContent>
      <ReasonDialog
        action={action}
        onOpenChange={(open) => {
          if (!open) setAction(null);
        }}
        onConfirm={confirm}
      />
    </Panel>
  );
}

type Translate = ReturnType<typeof useTranslations<'ops'>>;

/** The access reason in words, with its date where it has one. */
function accessLine(t: Translate, access: Access, date: (iso: string) => string): string {
  const until = access.endsAt === null ? null : date(access.endsAt);
  switch (access.reason) {
    case 'TRIAL':
      return until === null
        ? t('billing.reasons.TRIAL_OPEN')
        : t('billing.reasons.TRIAL', { date: until });
    case 'COMPLIMENTARY':
      return until === null
        ? t('billing.reasons.COMPLIMENTARY_OPEN')
        : t('billing.reasons.COMPLIMENTARY', { date: until });
    case 'SUBSCRIPTION':
      return until === null
        ? t('billing.reasons.SUBSCRIPTION_OPEN')
        : t('billing.reasons.SUBSCRIPTION', { date: until });
    case 'SUBSCRIPTION_PAST_DUE':
      return t('billing.reasons.SUBSCRIPTION_PAST_DUE', { date: until ?? '' });
    case 'TRIAL_ENDED':
    case 'SUBSCRIPTION_ENDED':
    case 'NONE':
      return t(`billing.reasons.${access.reason}`);
    default:
      // Pack reasons belong to collections, never to an account.
      return t('billing.reasons.NONE');
  }
}

function PlanLine({
  plan,
  date,
  format,
}: {
  plan: SubscriptionDto;
  date: (iso: string) => string;
  format: ReturnType<typeof useFormatter>['number'];
}) {
  const t = useTranslations('ops.billing');
  const values = {
    title: plan.offerTitle,
    collections: plan.limits.activeCollections ?? 0,
    storage:
      plan.limits.storageBytes === null
        ? NO_STORAGE
        : formatPlanBytes(format, plan.limits.storageBytes),
    links: plan.limits.guestLinks ?? 0,
  };
  const what =
    plan.source === 'COMPLIMENTARY' ? t('planComplimentary', values) : t('planPaid', values);
  const when =
    plan.currentPeriodEnd === null ? t('noEnd') : t('until', { date: date(plan.currentPeriodEnd) });
  return <p className="text-foreground-soft">{t('planLine', { what, when })}</p>;
}

function AccountSkeleton() {
  return (
    <div aria-hidden="true" className="grid gap-3 rounded-sheet border bg-card p-6">
      <Skeleton className="h-6 w-64 max-w-full" />
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-5 w-72 max-w-full" />
      <Skeleton className="h-11 w-full md:max-w-md" />
    </div>
  );
}
