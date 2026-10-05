import { Global, Module } from '@nestjs/common';
import { ImageUrls } from '../images/image-urls.js';
import { MediaUrls } from './media-urls.js';

/**
 * Presigned media links, stateless over the storage port and the limits: used by content,
 * collections and the guest context alike, so global rather than imported three ways (the guest
 * access module cannot import the collections module without a cycle).
 */
@Global()
@Module({ providers: [MediaUrls, ImageUrls], exports: [MediaUrls, ImageUrls] })
export class MediaLinksModule {}
