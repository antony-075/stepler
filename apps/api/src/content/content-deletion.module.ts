import { Module } from '@nestjs/common';
import { ContentDeletion } from './content-deletion.js';

/**
 * `ContentDeletion` alone, so the operator module (slice 9) can delete content without taking the
 * content controllers or the guest access module along (plan "Console architecture").
 */
@Module({ providers: [ContentDeletion], exports: [ContentDeletion] })
export class ContentDeletionModule {}
