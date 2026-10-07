import { Module } from '@nestjs/common';
import { GuestAccessModule } from '../guest-access/guest-access.module.js';
import { AppealsController } from '../moderation/appeals.controller.js';
import { GuestReportsController } from '../moderation/guest-reports.controller.js';
import { ModerationModule } from '../moderation/moderation.module.js';
import { AdminContentController } from './admin-content.controller.js';
import { AdminContentService } from './admin-content.service.js';
import { ContentDeletionModule } from './content-deletion.module.js';
import { ContentQueries } from './content-queries.js';
import { FrameNumbers } from './frame-numbers.js';
import { GuestContentController } from './guest-content.controller.js';
import { GuestContentService } from './guest-content.service.js';
import { TextsService } from './texts.service.js';

/** Content items (spec §7.3): frame numbers, texts, and the admin and guest views of them. */
@Module({
  imports: [GuestAccessModule, ModerationModule, ContentDeletionModule],
  controllers: [
    AdminContentController,
    GuestContentController,
    GuestReportsController,
    AppealsController,
  ],
  providers: [FrameNumbers, ContentQueries, TextsService, AdminContentService, GuestContentService],
  exports: [FrameNumbers],
})
export class ContentModule {}
