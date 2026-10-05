import { Module } from '@nestjs/common';
import { GuestPageRepository } from '../guest-page/guest-page.repository.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { CollectionImagesService } from './collection-images.service.js';
import { ImageUploadsService } from './image-uploads.service.js';

/**
 * The admin's images of a collection (plan Task 7, ADR 0017): slot-typed rows referenced by
 * guest page versions or the collection, their uploads (the inspector is the guest uploads') and
 * their garbage collection. Controllers live with what they change: the legacy cover routes in
 * collections, the draft image routes in the guest page module.
 */
@Module({
  imports: [UploadsModule],
  providers: [CollectionImagesService, ImageUploadsService, GuestPageRepository],
  exports: [CollectionImagesService, ImageUploadsService, GuestPageRepository],
})
export class ImagesModule {}
