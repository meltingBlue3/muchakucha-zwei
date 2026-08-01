import { DynamicModule, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({})
export class UsersModule {
  static register(environment: NodeJS.ProcessEnv = process.env): DynamicModule {
    return {
      module: UsersModule,
      imports: [AuthModule.register(environment)],
      controllers: [UsersController],
      providers: [UsersService],
    };
  }
}
