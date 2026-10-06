import { Module } from '@nestjs/common';
import { ContentHiding } from './content-hiding.js';
import { ModerationReads } from './moderation-reads.js';

/**
 * Content moderation use cases (slice 9, ADR 0013): hiding, reports, blocking. The admin, guest
 * and operator controllers all call them; this module depends on no controller module, so the
 * operator console's module can take it alone (plan "Console architecture").
 */
@Module({
  providers: [ContentHiding, ModerationReads],
  exports: [ContentHiding, ModerationReads],
})
export class ModerationModule {}
