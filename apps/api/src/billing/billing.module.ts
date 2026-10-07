import { Global, Module } from '@nestjs/common';
import { EntitlementResolver } from './entitlement-resolver.js';

/**
 * Billing (ADR 0018). Global like `LimitsModule`, which resolves limits through it: every write
 * path reaches entitlements through `LimitsService` or the gate, never through its own query.
 */
@Global()
@Module({ providers: [EntitlementResolver], exports: [EntitlementResolver] })
export class BillingModule {}
