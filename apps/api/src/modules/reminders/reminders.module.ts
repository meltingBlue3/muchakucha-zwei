import { Module, type DynamicModule } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { ExpoReminderPush } from './expo-reminder-push.js';
import { FcmReminderPush } from './fcm-reminder-push.js';
import { ReminderPushController } from './reminder-push.controller.js';
import { ReminderPushService } from './reminder-push.service.js';
import { RemindersController } from './reminders.controller.js';
import { RemindersService } from './reminders.service.js';

@Module({ controllers: [RemindersController, ReminderPushController], providers: [RemindersService] })
export class RemindersModule {
  static register(environment: NodeJS.ProcessEnv): DynamicModule {
    return {
      module: RemindersModule,
      providers: [{
        provide: ReminderPushService,
        inject: [PrismaService, RemindersService],
        useFactory: (prisma: PrismaService, reminders: RemindersService) => new ReminderPushService(
          prisma,
          reminders,
          new ExpoReminderPush(environment.EXPO_PUSH_ACCESS_TOKEN),
          environment.REMINDER_PUSH_ENABLED === 'true',
          environment.NODE_ENV === 'test',
          environment.REMINDER_PUSH_ENABLED === 'true' && environment.REMINDER_FCM_CREDENTIALS_FILE
            ? FcmReminderPush.fromFile(environment.REMINDER_FCM_CREDENTIALS_FILE)
            : undefined,
        ),
      }],
    };
  }
}
