import { Module } from '@nestjs/common';
import { GuestAccessModule } from '../guest-access/guest-access.module.js';
import { CollectionImageController } from '../images/collection-image.controller.js';
import { ImagesModule } from '../images/images.module.js';
import { CollectionsController } from './collections.controller.js';
import { CollectionsService } from './collections.service.js';
import { CoverController } from './cover.controller.js';

/**
 * The owner's collections, their admin-only image («Картинка колекції»), and the slice 8a cover
 * routes, which now set the published cover through the slot-typed images (plan Task 7;
 * removed in PR J).
 */
@Module({
  imports: [GuestAccessModule, ImagesModule],
  controllers: [CollectionsController, CoverController, CollectionImageController],
  providers: [CollectionsService],
  exports: [CollectionsService],
})
export class CollectionsModule {}
