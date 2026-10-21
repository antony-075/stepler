import { Module } from '@nestjs/common';
import { GuestAccessModule } from '../guest-access/guest-access.module.js';
import { GuestLinksService } from '../guest-access/guest-links.service.js';
import { GuestPageRepository } from '../guest-page/guest-page.repository.js';
import { BillingController } from './billing.controller.js';
import { CheckoutForms } from './checkout-forms.js';
import { CheckoutService } from './checkout.service.js';
import { LiqPayCallbackController } from './liqpay/liqpay-callback.controller.js';
import { DEFAULT_LINK_CREATOR, PackGrants } from './pack-grants.js';
import { OperatorBillingService } from './operator-billing.service.js';
import { PaymentEvents } from './payment-events.service.js';
import { PaymentQueries } from './payment-queries.js';
import { PaymentTransitions } from './payment-transitions.js';
import { ReconciliationService } from './reconciliation.service.js';
import { RefundsService } from './refunds.service.js';
import { SubscriptionClocks } from './subscription-clocks.js';
import { SubscriptionProviderSync } from './subscription-provider-sync.js';
import { SubscriptionTransitions } from './subscription-transitions.js';
import { SubscriptionsService } from './subscriptions.service.js';

/**
 * Payments for packs (ADR 0018, PR M2): the catalogue and checkouts, LiqPay's callback, the
 * state machine and what a payment grants. The provider port comes from the global
 * `BillingModule`.
 */
@Module({
  imports: [GuestAccessModule],
  controllers: [BillingController, LiqPayCallbackController],
  providers: [
    CheckoutService,
    CheckoutForms,
    SubscriptionsService,
    PaymentQueries,
    PaymentEvents,
    PaymentTransitions,
    SubscriptionTransitions,
    SubscriptionProviderSync,
    PackGrants,
    ReconciliationService,
    SubscriptionClocks,
    OperatorBillingService,
    RefundsService,
    GuestPageRepository,
    { provide: DEFAULT_LINK_CREATOR, useExisting: GuestLinksService },
  ],
  // For the operator console (ADR 0018, plan Task 21).
  exports: [OperatorBillingService, RefundsService, SubscriptionProviderSync],
})
export class BillingPaymentsModule {}
