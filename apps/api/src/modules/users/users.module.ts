import { DynamicModule, Module } from '@nestjs/common';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({})
export class UsersModule {
  static register(_environment: NodeJS.ProcessEnv = process.env): DynamicModule {
    return {
      module: UsersModule,
      imports: [],
      controllers: [UsersController],
      providers: [UsersService],
    };
  }
}
