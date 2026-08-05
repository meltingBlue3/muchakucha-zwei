import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './infrastructure/prisma/prisma.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { EventsModule } from './modules/events/events.module.js';
import { TasksModule } from './modules/tasks/tasks.module.js';
import { NotesModule } from './modules/notes/notes.module.js';
import { LabelsModule } from './modules/labels/labels.module.js';
import { HouseholdsModule } from './modules/households/households.module.js';
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
        AuthModule.register(environment),
        UsersModule.register(environment),
        HouseholdsModule.register(environment),
        EventsModule,
        TasksModule,
        NotesModule,
        LabelsModule,
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
