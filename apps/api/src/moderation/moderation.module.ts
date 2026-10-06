import { Module } from '@nestjs/common';
import { ContentHiding } from './content-hiding.js';
import { ModerationReads } from './moderation-reads.js';
import { ReportsService } from './reports.service.js';

/**
 * Content moderation use cases (slice 9, ADR 0013): hiding, reports, blocking. The admin, guest
 * and operator controllers all call them; this module holds no controller and depends on no
 * controller module, so the operator console's module can take it alone (plan "Console
 * architecture"). The guest report route (`GuestReportsController`) is mounted by
 * `ContentModule`, next to the other guest content routes and their session guard.
 */
@Module({
  providers: [ContentHiding, ModerationReads, ReportsService],
  exports: [ContentHiding, ModerationReads, ReportsService],
})
export class ModerationModule {}
