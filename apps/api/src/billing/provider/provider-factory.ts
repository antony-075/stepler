import type { Provider } from '@nestjs/common';
import { API_ENV } from '../../config/config.module.js';
import type { ApiEnv } from '../../config/env.js';
import { AppError } from '../../errors/app-error.js';
import {
  FISCAL_RECEIPTS,
  type FiscalReceipts,
  LiqPayRroReceipts,
  NoFiscalReceipts,
} from '../fiscal/fiscal-receipts.js';
import { LiqPayProvider } from '../liqpay/liqpay.provider.js';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider.js';

/**
 * `BILLING_PROVIDER=disabled`: honest, not fake (rule 18). Every call fails with
 * `503 PAYMENT_PROVIDER_UNAVAILABLE`; nothing is ever granted through it.
 */
export class DisabledPaymentProvider implements PaymentProvider {
  private unavailable(): never {
    throw new AppError('PAYMENT_PROVIDER_UNAVAILABLE', 503);
  }
  checkoutForm(): never {
    return this.unavailable();
  }
  verifyCallback(): never {
    return this.unavailable();
  }
  status(): Promise<never> {
    return Promise.reject(new AppError('PAYMENT_PROVIDER_UNAVAILABLE', 503));
  }
  refund(): Promise<never> {
    return this.status();
  }
  unsubscribe(): Promise<never> {
    return this.status();
  }
  updateSubscription(): Promise<never> {
    return this.status();
  }
}

type BillingProviderEnv = Pick<
  ApiEnv,
  'BILLING_PROVIDER' | 'LIQPAY_PUBLIC_KEY' | 'LIQPAY_PRIVATE_KEY' | 'LIQPAY_API_BASE'
>;

export function createPaymentProvider(env: BillingProviderEnv): PaymentProvider {
  if (
    env.BILLING_PROVIDER !== 'liqpay' ||
    env.LIQPAY_PUBLIC_KEY === undefined ||
    env.LIQPAY_PRIVATE_KEY === undefined
  ) {
    return new DisabledPaymentProvider();
  }
  return new LiqPayProvider({
    publicKey: env.LIQPAY_PUBLIC_KEY,
    privateKey: env.LIQPAY_PRIVATE_KEY,
    apiBase: env.LIQPAY_API_BASE,
  });
}

export function createFiscalReceipts(env: Pick<ApiEnv, 'BILLING_FISCAL_MODE'>): FiscalReceipts {
  return env.BILLING_FISCAL_MODE === 'liqpay_rro'
    ? new LiqPayRroReceipts()
    : new NoFiscalReceipts();
}

/** The port and the fiscal mode from the validated env (API and worker share the fields). */
export const PAYMENT_PROVIDERS: Provider[] = [
  { provide: PAYMENT_PROVIDER, inject: [API_ENV], useFactory: createPaymentProvider },
  { provide: FISCAL_RECEIPTS, inject: [API_ENV], useFactory: createFiscalReceipts },
];
