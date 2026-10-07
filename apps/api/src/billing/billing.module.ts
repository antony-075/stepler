import { Global, Module } from '@nestjs/common';
import { EntitlementGate } from './entitlement-gate.js';
import { EntitlementResolver } from './entitlement-resolver.js';
import { GrantsService } from './grants.service.js';

/**
 * Billing (ADR 0018). Global like `LimitsModule`, which resolves limits through it: every write
 * path reaches entitlements through `LimitsService` or the gate, never through its own query.
 */
@Global()
@Module({
  providers: [EntitlementResolver, EntitlementGate, GrantsService],
  exports: [EntitlementResolver, EntitlementGate, GrantsService],
})
export class BillingModule {}
