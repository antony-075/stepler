import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module.js';
import { GuestAccessModule } from '../guest-access/guest-access.module.js';
import { UploadCompletion } from './upload-completion.js';
import { UploadInspector } from './upload-inspector.js';
import { UploadsController } from './uploads.controller.js';
import { UploadsService } from './uploads.service.js';

/**
 * Direct-upload sessions: initiate, sign parts, complete with verification, cancel (spec §10).
 * The inspector (parts, size, content signature) is shared with the admin's cover upload.
 */
@Module({
  imports: [GuestAccessModule, ContentModule],
  controllers: [UploadsController],
  providers: [UploadsService, UploadCompletion, UploadInspector],
  exports: [UploadInspector],
})
export class UploadsModule {}
