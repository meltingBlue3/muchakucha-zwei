import { DynamicModule, Module } from '@nestjs/common';
import { HouseholdsController } from './households.controller.js';
import { HouseholdsService } from './households.service.js';

@Module({})
export class HouseholdsModule {
  static register(_environment: NodeJS.ProcessEnv = process.env): DynamicModule {
    return {
      module: HouseholdsModule,
      imports: [],
      controllers: [HouseholdsController],
      providers: [HouseholdsService],
    };
  }
}
