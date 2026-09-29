import { Global, Module } from '@nestjs/common';
import { OBJECT_STORAGE } from './object-storage.js';
import { S3ObjectStorage } from './s3-object-storage.js';

@Global()
@Module({
  providers: [{ provide: OBJECT_STORAGE, useClass: S3ObjectStorage }],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
