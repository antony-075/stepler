import { Module } from '@nestjs/common';
import { BillingPaymentsModule } from '../billing/billing-payments.module.js';
import { ModerationModule } from '../moderation/moderation.module.js';
import { OperatorAppealQueries } from './operator-appeal-queries.js';
import { OperatorAppealsController } from './operator-appeals.controller.js';
import { OperatorBillingController } from './operator-billing.controller.js';
import { OperatorActionsController } from './operator-actions.controller.js';
import { OperatorActions } from './operator-actions.service.js';
import { OperatorQueries } from './operator-queries.js';
import { OperatorReportsController } from './operator-reports.controller.js';
import { OperatorScope } from './operator-scope.js';

/**
 * The Stepler operator console's API (`/api/v1/operator/*`, slice 9, ADR 0013). Depends on the
 * moderation use cases only (audit, jobs and media links are global), never
 * on the admin or guest controllers, so it can be mounted in a separate app later with no code
 * moved (plan "Console architecture").
 */
@Module({
  imports: [ModerationModule, BillingPaymentsModule],
  controllers: [
    OperatorReportsController,
    OperatorActionsController,
    OperatorAppealsController,
    // Billing use cases come from the global BillingModule (ADR 0018).
    OperatorBillingController,
  ],
  providers: [OperatorScope, OperatorQueries, OperatorActions, OperatorAppealQueries],
})
export class OperatorModule {}
