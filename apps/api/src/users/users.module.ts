import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BillingPaymentsModule } from '../billing/billing-payments.module.js';
import { CollectionsModule } from '../collections/collections.module.js';
import { LegalModule } from '../legal/legal.module.js';
import {
  AccountDeletionController,
  AccountDeletionRequestController,
} from './account-deletion.controller.js';
import { AccountDeletionService } from './account-deletion.service.js';
import { LegalAcceptancesController } from './legal-acceptances.controller.js';
import { MeController } from './me.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [LegalModule, AuthModule, BillingPaymentsModule, CollectionsModule],
  controllers: [
    MeController,
    LegalAcceptancesController,
    AccountDeletionRequestController,
    AccountDeletionController,
  ],
  providers: [UsersService, AccountDeletionService],
  exports: [UsersService],
})
export class UsersModule {}
