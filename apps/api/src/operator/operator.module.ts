import { Module } from '@nestjs/common';
import { ContentDeletionModule } from '../content/content-deletion.module.js';
import { ModerationModule } from '../moderation/moderation.module.js';
import { OperatorActionsController } from './operator-actions.controller.js';
import { OperatorActions } from './operator-actions.service.js';
import { OperatorQueries } from './operator-queries.js';
import { OperatorReportsController } from './operator-reports.controller.js';
import { OperatorScope } from './operator-scope.js';

/**
 * The Stepler operator console's API (`/api/v1/operator/*`, slice 9, ADR 0013). Depends on the
 * moderation use cases and content deletion only (audit, jobs and media links are global), never
 * on the admin or guest controllers, so it can be mounted in a separate app later with no code
 * moved (plan "Console architecture").
 */
@Module({
  imports: [ModerationModule, ContentDeletionModule],
  controllers: [OperatorReportsController, OperatorActionsController],
  providers: [OperatorScope, OperatorQueries, OperatorActions],
})
export class OperatorModule {}
