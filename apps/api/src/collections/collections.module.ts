import { Module } from '@nestjs/common';
import { GuestAccessModule } from '../guest-access/guest-access.module.js';
import { CollectionImageController } from '../images/collection-image.controller.js';
import { ImagesModule } from '../images/images.module.js';
import { CollectionDeletion } from './collection-deletion.js';
import { CollectionsController } from './collections.controller.js';
import { CollectionsService } from './collections.service.js';

/** The owner's collections and their admin-only image («Картинка колекції»). */
@Module({
  imports: [GuestAccessModule, ImagesModule],
  controllers: [CollectionsController, CollectionImageController],
  providers: [CollectionsService, CollectionDeletion],
  exports: [CollectionsService, CollectionDeletion],
})
export class CollectionsModule {}
