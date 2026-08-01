import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './infrastructure/prisma/prisma.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({})
export class AppModule {
  static register(environment: NodeJS.ProcessEnv = process.env): DynamicModule {
    const bypassE2eRateLimits =
      environment.NODE_ENV === 'test' && environment.E2E_DISABLE_RATE_LIMITS === 'true';

    return {
      module: AppModule,
      imports: [
        PrismaModule,
        ThrottlerModule.forRoot({
          skipIf: () => bypassE2eRateLimits,
          throttlers: [
            {
              name: 'default',
              limit: 60,
              ttl: 60_000,
            },
          ],
        }),
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
