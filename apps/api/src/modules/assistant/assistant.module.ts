import { type DynamicModule, Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { NotesModule } from '../notes/notes.module.js';
import { LabelsModule } from '../labels/labels.module.js';
import { HouseholdsService } from '../households/households.service.js';
import { AssistantController } from './assistant.controller.js';
import { AssistantCredentials } from './assistant-credentials.js';
import { AssistantProvider } from './assistant-provider.js';
import { AssistantSettingsService } from './assistant-settings.service.js';
import { AssistantToolsService } from './assistant-tools.service.js';
import { AssistantService } from './assistant.service.js';

@Module({})
export class AssistantModule {
  static register(environment: NodeJS.ProcessEnv = process.env): DynamicModule {
    return { module: AssistantModule,
      imports: [EventsModule, TasksModule, NotesModule, LabelsModule],
      controllers: [AssistantController],
      providers: [HouseholdsService, AssistantSettingsService, AssistantService, AssistantToolsService, AssistantProvider,
        { provide: AssistantCredentials, useFactory: () => new AssistantCredentials(environment.ASSISTANT_ENCRYPTION_KEY) }],
    };
  }
}
