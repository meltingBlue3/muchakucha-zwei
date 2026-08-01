import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './infrastructure/prisma/prisma.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({})
export class AppModule {
  static register(environment: NodeJS.ProcessEnv = process.env): DynamicModule {
    return {
      module: AppModule,
      imports: [
        PrismaModule,
        ThrottlerModule.forRoot([
          {
            name: 'default',
            limit: 60,
            ttl: 60_000,
          },
        ]),
        UsersModule.register(environment),
      ],
      providers: [
        {
          provide: APP_GUARD,
          useClass: ThrottlerGuard,
        },
      ],
    };
  }
}
