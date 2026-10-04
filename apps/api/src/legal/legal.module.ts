import { Module } from '@nestjs/common';
import { LegalService } from './legal.service.js';

/** Imported by auth (recording at sign-in) and users (`GET /me`, the fallback endpoint). */
@Module({ providers: [LegalService], exports: [LegalService] })
export class LegalModule {}
