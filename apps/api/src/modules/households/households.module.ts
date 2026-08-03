import { DynamicModule, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { HouseholdsController } from './households.controller.js';
import { HouseholdsService } from './households.service.js';

@Module({})
export class HouseholdsModule {
  static register(environment: NodeJS.ProcessEnv = process.env): DynamicModule {
    return {
      module: HouseholdsModule,
      imports: [AuthModule.register(environment)],
      controllers: [HouseholdsController],
      providers: [HouseholdsService],
    };
  }
}
