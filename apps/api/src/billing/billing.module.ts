import { Global, Module } from '@nestjs/common';
import { BillingController } from './billing.controller.js';
import { CheckoutService } from './checkout.service.js';
import { EntitlementGate } from './entitlement-gate.js';
import { EntitlementResolver } from './entitlement-resolver.js';
import { GrantsService } from './grants.service.js';
import { PAYMENT_PROVIDERS } from './provider/provider-factory.js';
import { FISCAL_RECEIPTS } from './fiscal/fiscal-receipts.js';
import { PAYMENT_PROVIDER } from './provider/payment-provider.js';
import { PaymentQueries } from './payment-queries.js';

/**
 * Billing (ADR 0018). Global like `LimitsModule`, which resolves limits through it: every write
 * path reaches entitlements through `LimitsService` or the gate, never through its own query.
 */
@Global()
@Module({
  controllers: [BillingController],
  providers: [
    EntitlementResolver,
    EntitlementGate,
    GrantsService,
    CheckoutService,
    PaymentQueries,
    ...PAYMENT_PROVIDERS,
  ],
  exports: [EntitlementResolver, EntitlementGate, GrantsService, PAYMENT_PROVIDER, FISCAL_RECEIPTS],
})
export class BillingModule {}
