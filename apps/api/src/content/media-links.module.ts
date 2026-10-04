import { Global, Module } from '@nestjs/common';
import { CoverUrls } from '../collections/cover-urls.js';
import { MediaUrls } from './media-urls.js';

/**
 * Presigned media links, stateless over the storage port and the limits: used by content,
 * collections and the guest context alike, so global rather than imported three ways (the guest
 * access module cannot import the collections module without a cycle).
 */
@Global()
@Module({ providers: [MediaUrls, CoverUrls], exports: [MediaUrls, CoverUrls] })
export class MediaLinksModule {}
