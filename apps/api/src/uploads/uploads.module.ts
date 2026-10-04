import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module.js';
import { GuestAccessModule } from '../guest-access/guest-access.module.js';
import { UploadCompletion } from './upload-completion.js';
import { UploadsController } from './uploads.controller.js';
import { UploadsService } from './uploads.service.js';

/** Direct-upload sessions: initiate, sign parts, complete with verification, cancel (spec §10). */
@Module({
  imports: [GuestAccessModule, ContentModule],
  controllers: [UploadsController],
  providers: [UploadsService, UploadCompletion],
})
export class UploadsModule {}
