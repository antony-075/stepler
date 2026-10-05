import { Module } from '@nestjs/common';
import { ImagesModule } from '../images/images.module.js';
import { GuestPageController } from './guest-page.controller.js';
import { GuestPageService } from './guest-page.service.js';

/** The guest page editor: draft, publish, reset and the draft's images (plan Task 9, ADR 0017). */
@Module({
  imports: [ImagesModule],
  controllers: [GuestPageController],
  providers: [GuestPageService],
})
export class GuestPageModule {}
