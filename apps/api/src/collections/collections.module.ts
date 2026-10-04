import { Module } from '@nestjs/common';
import { GuestAccessModule } from '../guest-access/guest-access.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { CollectionsController } from './collections.controller.js';
import { CollectionsService } from './collections.service.js';
import { CoverController } from './cover.controller.js';
import { CoverUploadsService } from './cover-uploads.service.js';
import { CoversService } from './covers.service.js';

/** The owner's collections and their cover (slice 8a; the upload inspector is shared). */
@Module({
  imports: [GuestAccessModule, UploadsModule],
  controllers: [CollectionsController, CoverController],
  providers: [CollectionsService, CoversService, CoverUploadsService],
})
export class CollectionsModule {}
