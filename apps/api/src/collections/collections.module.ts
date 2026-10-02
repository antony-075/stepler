import { Module } from '@nestjs/common';
import { GuestAccessModule } from '../guest-access/guest-access.module.js';
import { CollectionsController } from './collections.controller.js';
import { CollectionsService } from './collections.service.js';

@Module({
  imports: [GuestAccessModule],
  controllers: [CollectionsController],
  providers: [CollectionsService],
})
export class CollectionsModule {}
