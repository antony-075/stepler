import { Module } from '@nestjs/common';
import { GuestAccessModule } from '../guest-access/guest-access.module.js';
import { FrameNumbers } from './frame-numbers.js';
import { GuestContentController } from './guest-content.controller.js';
import { TextsService } from './texts.service.js';

/** Content items (spec §7.3): frame numbers, texts, and the admin and guest views of them. */
@Module({
  imports: [GuestAccessModule],
  controllers: [GuestContentController],
  providers: [FrameNumbers, TextsService],
})
export class ContentModule {}
