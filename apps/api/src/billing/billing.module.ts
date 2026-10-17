import { Global, Module } from '@nestjs/common';
import { EntitlementGate } from './entitlement-gate.js';
import { EntitlementResolver } from './entitlement-resolver.js';
import { FISCAL_RECEIPTS } from './fiscal/fiscal-receipts.js';
import { GrantsService } from './grants.service.js';
import { OffersService } from './offers.service.js';
import { PAYMENT_PROVIDER } from './provider/payment-provider.js';
import { PAYMENT_PROVIDERS } from './provider/provider-factory.js';

/**
 * Billing (ADR 0018). Global like `LimitsModule`, which resolves limits through it: every write
 * path reaches entitlements through `LimitsService` or the gate, never through its own query.
 * Payments (checkout, callback, reconciliation) live in `BillingPaymentsModule`, which needs the
 * guest-link side to create a paid pack's collection.
 */
@Global()
@Module({
  providers: [
    EntitlementResolver,
    EntitlementGate,
    GrantsService,
    OffersService,
    ...PAYMENT_PROVIDERS,
  ],
  exports: [
    EntitlementResolver,
    EntitlementGate,
    GrantsService,
    OffersService,
    PAYMENT_PROVIDER,
    FISCAL_RECEIPTS,
  ],
})
export class BillingModule {}
