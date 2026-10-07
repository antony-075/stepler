import {
  type GrantCreate,
  type OperatorBillingAccount,
  operatorBillingAccountSchema,
  type OperatorOfferList,
  operatorOfferListSchema,
  type SubscriptionDto,
  subscriptionDtoSchema,
} from '@stepler/contracts';
import { opsRequest } from './client';

/** Query keys of the billing section (ADR 0018); a grant or revoke invalidates `all`. */
export const billingKeys = {
  all: ['ops', 'billing'] as const,
  account: (email: string) => ['ops', 'billing', 'account', email] as const,
  offers: ['ops', 'billing', 'offers'] as const,
};

export const fetchBillingAccount = (
  email: string,
  signal?: AbortSignal,
): Promise<OperatorBillingAccount> =>
  opsRequest(`/operator/billing/accounts?${new URLSearchParams({ email }).toString()}`, {
    schema: operatorBillingAccountSchema,
    ...(signal === undefined ? {} : { signal }),
  });

export const fetchOffers = (signal?: AbortSignal): Promise<OperatorOfferList> =>
  opsRequest('/operator/billing/offers', {
    schema: operatorOfferListSchema,
    ...(signal === undefined ? {} : { signal }),
  });

export const grantPlan = (body: GrantCreate): Promise<SubscriptionDto> =>
  opsRequest('/operator/billing/grants', { method: 'POST', body, schema: subscriptionDtoSchema });

export const revokeGrant = (id: string, reason: string): Promise<SubscriptionDto> =>
  opsRequest(`/operator/billing/grants/${id}/revoke`, {
    method: 'POST',
    body: { reason },
    schema: subscriptionDtoSchema,
  });
