import { Module } from '@nestjs/common';
import { LegalModule } from '../legal/legal.module.js';
import { LegalAcceptancesController } from './legal-acceptances.controller.js';
import { MeController } from './me.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [LegalModule],
  controllers: [MeController, LegalAcceptancesController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
