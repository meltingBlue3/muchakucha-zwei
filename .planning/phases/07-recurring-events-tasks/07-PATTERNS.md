# Phase 7: 周期性重复事件与任务 - Pattern Map

**Mapped:** 2026-08-12
**Files analyzed:** 30 (14 new, 16 modified)
**Analogs found:** 27 / 30

All excerpts below were re-read from live source this session. Line numbers are current as of commit `2b9c14d`.

---

## File Classification

### API — new files

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `apps/api/src/modules/recurrence/recurrence.module.ts` | module/config | — | `apps/api/src/modules/events/events.module.ts` | exact |
| `apps/api/src/modules/recurrence/recurrence.controller.ts` | controller | request-response | `apps/api/src/modules/events/events.controller.ts` | exact |
| `apps/api/src/modules/recurrence/recurrence.service.ts` | service | CRUD + transform | `apps/api/src/modules/tasks/tasks.service.ts` | exact |
| `apps/api/src/modules/recurrence/dto/recurrence.dto.ts` | model/DTO | request-response | `apps/api/src/modules/tasks/dto/create-task.dto.ts` | exact |
| `apps/api/src/modules/recurrence/recurrence-date.ts` | utility (pure) | transform | `apps/client/src/features/events/calendar-utils.ts` | role-match (pure date module, different tier) |
| `apps/api/src/modules/recurrence/recurrence-date.test.ts` | test (unit) | transform | `apps/api/src/infrastructure/mail/smtp-mail.adapter.test.ts` | role-match (only other `src/**/*.test.ts`) |
| `apps/api/src/modules/recurrence/recurrence-materializer.service.ts` | service (batch) | batch | *(no analog — see No Analog Found)* | none |
| `apps/api/src/modules/recurrence/recurrence-scheduler.ts` | provider (lifecycle) | event-driven | `apps/api/src/infrastructure/prisma/prisma.service.ts` | partial (lifecycle-hook idiom only) |
| `apps/api/prisma/migrations/<ts>_recurrence_rules/migration.sql` | migration | — | `apps/api/prisma/migrations/20260812000000_task_multiple_assignees/migration.sql` | exact |
| `apps/api/test/recurrence/recurrence-rules.int.test.ts` | test (integration) | request-response | `apps/api/test/tasks/tasks.int.test.ts` | exact |
| `apps/api/test/recurrence/materializer.int.test.ts` | test (integration) | batch | `apps/api/test/tasks/tasks.int.test.ts` | role-match |

### API — modified files

| Modified File | Role | Data Flow | Analog for the change | Match Quality |
|---------------|------|-----------|----------------------|---------------|
| `apps/api/prisma/schema.prisma` | model | — | existing `Task` / `TaskAssignee` models (lines 154-173, 243-253) | exact |
| `apps/api/src/app.module.ts` | config | — | its own `EventsModule` / `TasksModule` rows (lines 36-39) | exact |
| `apps/api/src/modules/events/events.service.ts` | service | CRUD | itself (`create`/`list`/`update`) | exact |
| `apps/api/src/modules/tasks/tasks.service.ts` | service | CRUD | itself (`VALID_STATUSES` line 14, `$transaction` 269-283) | exact |
| `apps/api/src/modules/tasks/dto/create-task.dto.ts` | model/DTO | — | itself (`TASK_STATUSES` line 5) | exact |
| `apps/api/src/modules/events/dto/create-event.dto.ts` | model/DTO | — | `create-task.dto.ts` | exact |
| `apps/api/src/openapi/generate-openapi.ts` | config (codegen template) | — | itself (`CreateTaskDto` block line 247, `createTask` line 764) | exact |

### Client — new files

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `apps/client/src/features/recurrence/recurrence-picker.tsx` | component (form section) | request-response | `apps/client/src/features/tasks/task-form.tsx` (chips + `updateField`) | exact |
| `apps/client/src/features/recurrence/recurrence-summary.tsx` | utility + component | transform | `apps/client/src/features/events/calendar-utils.ts` (pure formatting) | role-match |
| `apps/client/src/features/recurrence/recurrence-badge.tsx` | component (badge) | — | `apps/client/src/features/tasks/task-card.tsx:57-82` (badge Views) | exact |
| `apps/client/src/features/recurrence/series-scope-sheet.tsx` | component (dialog) | event-driven | `apps/client/src/ui/household-components.tsx:334-467` (`HouseholdSwitcher`) | exact |
| `apps/client/src/features/recurrence/__tests__/recurrence-picker-test.tsx` | test | — | `apps/client/src/features/profile/__tests__/profile-form-test.tsx` | role-match |
| `apps/client/src/features/recurrence/__tests__/series-scope-dialog-test.tsx` | test | — | `apps/client/src/features/households/__tests__/member-removal-test.tsx` | role-match |
| `apps/client/src/features/tasks/__tests__/task-status-test.tsx` | test | — | same as above | role-match |
| `e2e/events/recurrence.spec.ts` | test (e2e) | request-response | `e2e/events/calendar-api.spec.ts` | exact |

### Client — modified files

| Modified File | Role | Data Flow | Analog for the change | Match Quality |
|---------------|------|-----------|----------------------|---------------|
| `apps/client/src/features/events/event-form.tsx` | component (form) | request-response | `task-form.tsx` (same shape) | exact |
| `apps/client/src/features/tasks/task-form.tsx` | component (form) | request-response | itself | exact |
| `apps/client/src/features/events/event-card.tsx` | component (list-item) | — | `task-card.tsx` badge row | exact |
| `apps/client/src/features/tasks/task-card.tsx` | component (list-item) | — | itself (lines 57-88) | exact |
| `app/(protected)/.../events/[eventId]/index.tsx` | screen (detail) | request-response | itself (lines 126-151 info blocks) | exact |
| `app/(protected)/.../tasks/[taskId]/index.tsx` | screen (detail) | request-response | event detail screen | exact |
| `app/(protected)/.../events/[eventId]/edit.tsx` | screen (edit) | request-response | itself (lines 48-91, 143-207) | exact |
| `app/(protected)/.../tasks/[taskId]/edit.tsx` | screen (edit) | request-response | event edit screen | exact |
| `app/(protected)/households/[id]/today.tsx` | screen (list) | request-response | itself (lines 69-94, 157-178) | exact |

---

## Pattern Assignments

### `apps/api/src/modules/recurrence/recurrence.module.ts` (module, —)

**Analog:** `apps/api/src/modules/events/events.module.ts` (whole file, 9 lines)

```typescript
import { Module } from '@nestjs/common';
import { EventsController } from './events.controller.js';
import { EventsService } from './events.service.js';

@Module({
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
```

Copy verbatim, substituting names. **Mandatory `.js` extension on relative imports** (NodeNext ESM). Register as a *plain* class in `app.module.ts` alongside `EventsModule` — the `.register(environment)` dynamic form is used only by `Auth`/`Users`/`Households`:

```typescript
// Source: apps/api/src/app.module.ts:33-39
        AuthModule.register(environment),
        UsersModule.register(environment),
        HouseholdsModule.register(environment),
        EventsModule,
        TasksModule,
        NotesModule,
        LabelsModule,
```

Use `.register(environment)` **only** if `RECURRENCE_HORIZON_DAYS` / worker-enable flags must come from env. Env-gating precedent in the same file:

```typescript
// Source: apps/api/src/app.module.ts:16-17
    const bypassE2eRateLimits =
      environment.NODE_ENV === 'test' && environment.E2E_DISABLE_RATE_LIMITS === 'true';
```

---

### `apps/api/src/modules/recurrence/recurrence.controller.ts` (controller, request-response)

**Analog:** `apps/api/src/modules/events/events.controller.ts`

**Imports + param class + class decorators** (lines 1-43):

```typescript
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard, type AccessTokenClaims } from '../auth/access-token.guard.js';
import { EventsService } from './events.service.js';
import { CreateEventDto, EventListResponseDto, EventResponseDto } from './dto/create-event.dto.js';
import { UpdateEventDto } from './dto/update-event.dto.js';
import { IsUUID } from 'class-validator';

interface AuthenticatedRequest {
  auth: AccessTokenClaims;
}

class HouseholdIdParam {
  @IsUUID('4')
  householdId!: string;
}

@ApiTags('events')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('households/:householdId/events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}
```

**Handler shape — every route carries an explicit `operationId`** (lines 45-54, 91-100):

```typescript
  @Post()
  @ApiOperation({ operationId: 'createEvent' })
  @ApiCreatedResponse({ type: EventResponseDto })
  create(
    @Req() request: AuthenticatedRequest,
    @Param() params: HouseholdIdParam,
    @Body() input: CreateEventDto,
  ): Promise<EventResponseDto> {
    return this.eventsService.create(request.auth.sub, params.householdId, input);
  }

  @Delete(':eventId')
  @HttpCode(204)
  @ApiOperation({ operationId: 'deleteEvent' })
  @ApiNoContentResponse()
  async delete(
    @Req() request: AuthenticatedRequest,
    @Param() params: HouseholdIdParam & { eventId: string },
  ): Promise<void> {
    await this.eventsService.delete(request.auth.sub, params.householdId, params.eventId);
  }
```

Note `@Param() params: HouseholdIdParam & { eventId: string }` — sub-resource ids are intersected onto the validated param class, not given their own class. The `api/v1` prefix is global (`main.ts:26,207`), never per-controller.

**Sub-resource routes** (`.../events/:eventId/series`) — precedent for multiple controllers in one file is `apps/api/src/modules/labels/labels.controller.ts:38,91,122`.

---

### `apps/api/src/modules/recurrence/recurrence.service.ts` (service, CRUD)

**Analog:** `apps/api/src/modules/tasks/tasks.service.ts` (byte-identical auth pair in `events.service.ts:40-57`)

**Constructor + authorization preamble** (`tasks.service.ts:47-69`):

```typescript
@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Authorization helpers ----

  private async resolveActorRole(
    actorId: string,
    householdId: string,
  ): Promise<'OWNER' | 'ADMIN' | 'MEMBER' | null> {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_householdId: { userId: actorId, householdId } },
      include: { household: { select: { ownerMembershipId: true } } },
    });
    if (membership === null) return null;
    if (membership.id === membership.household.ownerMembershipId) return 'OWNER';
    return membership.role as 'ADMIN' | 'MEMBER';
  }

  private canMutate(actorRole: 'OWNER' | 'ADMIN' | 'MEMBER', taskCreatorId: string, actorId: string): boolean {
    if (actorRole === 'MEMBER') return taskCreatorId === actorId;
    return true; // OWNER or ADMIN
  }
```

**Every mutating method opens with this exact pair of lines** (`tasks.service.ts:92-93`, repeated at 143-144, 171-172, 190-191, 299-300):

```typescript
    const role = await this.resolveActorRole(actorId, householdId);
    if (role === null) throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });
```

**Ownership re-check on the sub-resource** (`tasks.service.ts:193-203`) — the IDOR guard to copy for `recurrenceRuleId`; note 404 not 403 for cross-household, and 403 only for insufficient role:

```typescript
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (task === null || task.householdId !== householdId) {
      throw new NotFoundException({ code: 'TASK_NOT_FOUND', message: 'Task not found.' });
    }

    if (!this.canMutate(role, task.createdBy, actorId)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only the task creator, admin, or owner can edit this task.',
      });
    }
```

**Structured validation error envelope** (`tasks.service.ts:77-82`) — copy shape for D-06 mutual exclusion:

```typescript
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
        details: [{ field: 'assigneeIds', codes: ['not_household_member'], message: 'All assignees must be household members.' }],
      });
```

Literal codes in use: `HOUSEHOLD_NOT_FOUND`, `EVENT_NOT_FOUND`, `TASK_NOT_FOUND`, `VALIDATION_FAILED`, `FORBIDDEN`. New codes keep SCREAMING_SNAKE (`RECURRENCE_RULE_NOT_FOUND`).

**Partial-update accumulator** (`tasks.service.ts:205-232`) — the idiom for building `data` only from defined inputs:

```typescript
    const data: Record<string, unknown> = {};

    if (input.title !== undefined) {
      const trimmed = input.title.trim();
      if (trimmed.length < TITLE_MIN || trimmed.length > TITLE_MAX) {
        throw new BadRequestException({
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed.',
          details: [{ field: 'title', codes: ['length'] }],
        });
      }
      data.title = trimmed;
    }
```

**Row → DTO mapper** (`tasks.service.ts:319-341`) — hand-written `private toResponse(row: TaskRow)` with an explicit local `interface TaskRow` (lines 17-39) so Prisma types never leak (AGENTS.md C-06). Dates always via `.toISOString()`, nullable dates via `row.dueDate?.toISOString() ?? null`. Write a `RecurrenceRuleRow` interface + `toResponse` in the same shape; `occurrenceDate` / `startsOn` / `endsOn` should emit `YYYY-MM-DD`, **not** `.toISOString()` — that is the one deliberate deviation.

**Transaction for D-08** — the existing array form (`tasks.service.ts:269-283`):

```typescript
      await this.prisma.$transaction([
        // Remove assignees that are no longer selected
        this.prisma.taskAssignee.deleteMany({
          where: { taskId, userId: { notIn: assigneeIds } },
        }),
        // Upsert the currently selected assignees
        ...assigneeIds.map((userId) =>
          this.prisma.taskAssignee.upsert({
            where: { taskId_userId: { taskId, userId } },
            create: { taskId, userId },
            update: {},
          }),
        ),
      ]);
```

⚠️ **The array form cannot express D-08** (it needs the new rule's id mid-transaction). Use `await this.prisma.$transaction(async (tx) => { ... })`. This is the only interactive-transaction site in the phase and the repo's first.

---

### `apps/api/src/modules/recurrence/dto/recurrence.dto.ts` (model/DTO, request-response)

**Analog:** `apps/api/src/modules/tasks/dto/create-task.dto.ts` (whole file, 71 lines)

**Exported const tuple + derived type — the enum idiom for `freq` / `byWeekday`** (lines 1-9):

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { LabelResponseDto } from '../../labels/dto/create-label.dto.js';

export const TASK_STATUSES = ['pending', 'in_progress', 'completed'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
```

**Optional enum field** (lines 23-27) and **array field** (lines 35-39):

```typescript
  @ApiPropertyOptional({ description: '任务状态', enum: TASK_STATUSES, default: 'pending' })
  @IsOptional()
  @IsString()
  @IsIn(TASK_STATUSES)
  status?: TaskStatus;

  @ApiPropertyOptional({ description: '负责人成员 ID 列表（每个 ID 必须是当前家庭成员）', type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  assigneeIds?: string[];
```

**Response DTO — one-line-per-field style** (lines 47-70):

```typescript
export class TaskResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() householdId!: string;
  @ApiProperty({ nullable: true }) description!: string | null;
  @ApiProperty({ enum: TASK_STATUSES }) status!: TaskStatus;
  @ApiProperty({ type: [String] }) assigneeIds!: string[];
  @ApiProperty({ nullable: true }) dueDate!: string | null;

  @ApiProperty({ type: [LabelResponseDto] })
  labels!: LabelResponseDto[];
}

export class TaskListResponseDto {
  @ApiProperty({ type: [TaskResponseDto] })
  tasks!: TaskResponseDto[];

  @ApiProperty()
  total!: number;
}
```

Descriptions in **Chinese** (tasks/labels/notes convention; events DTO is English — follow the newer Chinese one).

⚠️ **No existing DTO in this repo has a nested object.** The `recurrence?: RecurrenceDto` field on `CreateEventDto`/`CreateTaskDto` has no analog and MUST add `@ValidateNested()` + `@Type(() => RecurrenceDto)` from `class-transformer`, or the global pipe (`main.ts:220-231`, `whitelist: true` / `forbidNonWhitelisted: true` / `transform: true`) silently strips it and returns 201.

---

### `apps/api/src/modules/recurrence/recurrence-date.ts` (utility, pure transform)

**Analog:** `apps/client/src/features/events/calendar-utils.ts` (the only pure date module in the repo — client tier, but the right shape)

**File-header + exported-interface convention** (lines 1-21):

```typescript
/** Pure date helpers for the calendar month grid. No React dependency. */

const DAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'] as const;

export interface CalendarDay {
  date: Date;
  dayOfMonth: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  iso: string; // YYYY-MM-DD
}

export function getDayNames(): readonly string[] {
  return DAY_NAMES;
}
```

Copy: a one-line `/** ... No Nest, no Prisma, no I/O. */` header, exported interfaces before functions, named exports (no default), `as const` tuples for fixed vocabularies. Weekday ordering must match `DAY_NAMES` (Sunday→Saturday) so the UI summary and the calendar header agree.

**Anti-pattern present in existing code — do NOT extend it** (`events.service.ts:130-133`):

```typescript
        const startUtc = new Date(startDate);
        startUtc.setUTCDate(startUtc.getUTCDate() - 1);
        startTime.gte = startUtc;
```

D-10 forbids day arithmetic on UTC timestamps in the recurrence walk. Work on `{year, month, day}` integer triples; convert to an instant exactly once.

---

### `apps/api/src/modules/recurrence/recurrence-date.test.ts` (test, unit)

**Analog:** `apps/api/src/infrastructure/mail/smtp-mail.adapter.test.ts` — the *only* existing file matching the `unit` project glob `src/**/*.test.ts`.

```typescript
import { describe, expect, test } from 'vitest';
import { MAIL_PORT, type MailPort } from './mail.port.js';
import { loadSmtpMailConfig, SmtpMailAdapter } from './smtp-mail.adapter.js';

describe('provider-neutral SMTP mail adapter', () => {
  test('defines a stable injection token and local Mailpit defaults', () => {
    expect(MAIL_PORT).toBeTypeOf('symbol');
    expect(loadSmtpMailConfig({ NODE_ENV: 'test' })).toEqual({ ... });
  });
```

Copy: explicit `vitest` named imports (no globals), `.js`-suffixed relative imports, one `describe` per module with behavior-sentence `test` names. Run via `pnpm --filter api test:quick`.

---

### `apps/api/src/modules/recurrence/recurrence-scheduler.ts` (provider, event-driven)

**Analog (partial):** `apps/api/src/infrastructure/prisma/prisma.service.ts` — the lifecycle-interface idiom only. There is no scheduler anywhere in the repo.

```typescript
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
```

Copy the `implements OnApplicationBootstrap, OnModuleDestroy` declaration style and always-paired setup/teardown. Env-gate the interval on `NODE_ENV === 'test'` (precedent: `app.module.ts:16-17`) — the integration project runs `fileParallelism: false` against one shared DB, and a leaked timer keeps Vitest alive.

⚠️ `prisma.service.ts:15` also establishes that Prisma runs on a **pooled** adapter (`new PrismaPg({ connectionString: ... })`) — so session-level `pg_advisory_lock` is unsafe; use `pg_try_advisory_xact_lock` inside `$transaction`.

---

### `apps/api/prisma/schema.prisma` (model, —)

**Analog:** the existing `Task` and `TaskAssignee` models in the same file.

**Model conventions** (lines 154-173):

```prisma
model Task {
  id          String     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  householdId String     @map("household_id") @db.Uuid
  title       String     @db.VarChar(200)
  status      String     @default("pending") @db.VarChar(20)
  dueDate     DateTime?  @map("due_date") @db.Timestamptz(3)
  createdBy   String     @map("created_by") @db.Uuid
  createdAt   DateTime   @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt   DateTime   @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(3)

  household   Household      @relation(fields: [householdId], references: [id], onDelete: Cascade)
  creator     User           @relation("CreatedTasks", fields: [createdBy], references: [id], onDelete: Cascade)
  labels      TaskLabel[]
  assignees   TaskAssignee[]

  @@index([householdId, status], map: "Task_household_status_idx")
  @@map("tasks")
}
```

Rules to carry into `RecurrenceRule`: UUID PK via `dbgenerated("gen_random_uuid()")`, camelCase field + `@map("snake_case")`, `@@map("snake_case_plural")` table name, **explicitly named** indexes in `PascalCase_snake_suffix_idx` form, string enums as `@db.VarChar(n)` (there are **no** Prisma `enum` blocks in this schema — `status`/`priority`/`role` are all `String`), timestamps `@db.Timestamptz(3)`.

**Composite-key join table** (lines 243-253) — the shape for the `@@unique([recurrenceRuleId, occurrenceDate])` constraint style:

```prisma
model TaskAssignee {
  taskId String @map("task_id") @db.Uuid
  userId String @map("user_id") @db.Uuid

  task Task @relation(fields: [taskId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([taskId, userId])
  @@index([userId], map: "TaskAssignee_user_idx")
  @@map("task_assignees")
}
```

⚠️ Deviation required by D-01/Pitfall 10: `occurrenceDate`, `startsOn`, `endsOn`, `materializedThrough` use `DateTime @db.Date`, **not** `@db.Timestamptz(3)`. This is the only place in the schema where `@db.Date` is correct.

---

### `apps/api/prisma/migrations/<ts>_recurrence_rules/migration.sql` (migration, —)

**Analog:** `apps/api/prisma/migrations/20260812000000_task_multiple_assignees/migration.sql` (whole file, 34 lines) — hand-authored, section-commented, ordered.

```sql
-- CreateTable
CREATE TABLE "task_assignees" (
    "task_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "task_assignees_pkey" PRIMARY KEY ("task_id","user_id")
);

-- CreateIndex
CREATE INDEX "TaskAssignee_user_idx" ON "task_assignees"("user_id");

-- AddForeignKey
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing single-assignee data into the new join table before the
-- column is dropped, so tasks that already had an assignee keep it.
INSERT INTO "task_assignees" ("task_id", "user_id")
SELECT "id", "assignee_id" FROM "tasks" WHERE "assignee_id" IS NOT NULL;

-- AlterTable
ALTER TABLE "tasks" DROP COLUMN "assignee_id";
```

Copy: `-- CreateTable` / `-- CreateIndex` / `-- AddForeignKey` / `-- AlterTable` section comments, snake_case tables and columns, PascalCase index names, `<table>_<col>_fkey` / `<table>_pkey` constraint names, prose comments explaining non-obvious ordering. Directory name follows the newer `YYYYMMDDHHMMSS_snake_case` convention. `Task.recurrenceRuleId` / `Event.recurrenceRuleId` FK uses `ON DELETE SET NULL` (D-01), not `CASCADE`. Add the D-06 `CHECK` constraint (`endsOn` XOR `count`) here — it has no in-file precedent in this migration but is mandated by AGENTS.md C-05.

Applied with `prisma migrate deploy` (`apps/api/test/setup-integration.ts:58`), never `migrate dev`.

---

### `apps/api/src/openapi/generate-openapi.ts` (config, codegen template)

**Analog:** its own `CreateTaskDto` / `createTask` blocks — this file is a hand-maintained template literal, not a generator.

**Model template block** (lines 247-283):

```typescript
export interface CreateTaskDto {
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  assigneeIds?: string[];
  dueDate?: string;
}

export interface TaskResponseDto {
  id: string;
  householdId: string;
  status: string;
  dueDate?: string | null;
  labels: LabelResponseDto[];
}

export interface TaskListResponseDto {
  tasks: TaskResponseDto[];
  total: number;
}
```

**Client-method template block** (lines 764-799) — note the escaped backticks (`\``) because this lives inside a template literal, and the `...(x === undefined ? {} : { x })` idiom demanded by `exactOptionalPropertyTypes: true`:

```typescript
  async createTask(
    accessToken: string,
    householdId: string,
    body: CreateTaskDto,
    signal?: AbortSignal,
  ): Promise<TaskResponseDto> {
    return this.authenticated<TaskResponseDto>(
      'POST',
      \`/api/v1/households/\${encodeURIComponent(householdId)}/tasks\`,
      accessToken,
      body,
      signal,
    );
  }
```

⚠️ The plan must contain an explicit task **"edit `modelsSource` and `clientSource` in `generate-openapi.ts`"** — adding `@ApiProperty` decorators alone does NOT change the TypeScript client. Then run `pnpm openapi:generate` and commit `packages/api-client/`; `pnpm openapi:check` fails on drift.

---

### `apps/api/test/recurrence/*.int.test.ts` (test, integration)

**Analog:** `apps/api/test/tasks/tasks.int.test.ts:1-124`

**Fixture header + JWT minting** (lines 1-11):

```typescript
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createApplication } from '../../src/main.js';
import { getTestDatabaseUrl, resetDatabase } from '../reset-database.js';

const accessSecret = 'test-only-access-secret-that-is-longer-than-thirty-two-bytes';
const jwt = new JwtService({ secret: accessSecret, signOptions: { algorithm: 'HS256', expiresIn: 15 * 60 } });
```

**Raw-SQL fixture helpers** (lines 23-79) — `withDatabase`, `insertActor`, `createHousehold` (via HTTP inject), `addMemberViaDb` (via raw SQL):

```typescript
async function withDatabase<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: getTestDatabaseUrl() });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

async function addMemberViaDb(householdId: string, actor: ActorFixture, role: string = 'MEMBER'): Promise<void> {
  await withDatabase(async (client) => {
    await client.query(
      `INSERT INTO "memberships" ("user_id", "household_id", "role") VALUES ($1, $2, $3)`,
      [actor.userId, householdId, role],
    );
  });
}
```

**Typed request helper via Fastify inject** (lines 81-99):

```typescript
async function taskApi(
  accessToken: string, householdId: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, payload?: unknown,
): Promise<{ statusCode: number; json: () => any }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (app.getHttpAdapter().getInstance() as any).inject({
    method,
    url: `/api/v1/households/${encodeURIComponent(householdId)}/tasks${path}`,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(payload !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(payload !== undefined ? { payload } : {}),
  });
  return response as { statusCode: number; json: () => any };
}
```

**Lifecycle hooks** (lines 101-124):

```typescript
beforeAll(async () => {
  passwordHash = await argon2.hash('tasks-fixture-password', { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  app = await createApplication({ ...process.env, NODE_ENV: 'test', JWT_ACCESS_SECRET: accessSecret, DATABASE_URL: getTestDatabaseUrl() });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => { await app?.close(); });

beforeEach(async () => { await resetDatabase(); });
```

**Copy these helpers into the new files rather than extracting shared fixtures** — they are duplicated per test file today, and refactoring would touch every existing integration test.

---

### `apps/client/src/features/recurrence/recurrence-picker.tsx` (component, form section)

**Analog:** `apps/client/src/features/tasks/task-form.tsx`

**Imports + `useState`/`updateField` form state** (lines 1-8, 58-83). Note: `react-hook-form` is installed but **not** used by either form — do not introduce it.

```tsx
import { useCallback, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { CreateTaskDto, TaskResponseDto } from '@muchakucha/api-client';
import type { Theme } from '../../ui/theme';
import { Stack, Text } from '../../ui/primitives';
import { DateField } from '../../ui/date-field';

  const activeTheme = useTheme<Theme>();
  const [form, setForm] = useState<TaskInput>(() => { ... });
  const [error, setError] = useState<string | null>(null);

  const updateField = useCallback(<K extends keyof TaskInput>(key: K, value: TaskInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
  }, []);
```

**Chip style helpers — token-only, reuse verbatim** (lines 124-133):

```tsx
  const chipStyle = (isSelected: boolean) => ({
    paddingHorizontal: activeTheme.spacing[3],
    paddingVertical: activeTheme.spacing[2],
    borderRadius: activeTheme.borderRadii.full,
    backgroundColor: isSelected ? activeTheme.colors.coral : activeTheme.colors.surfaceMuted,
    marginRight: activeTheme.spacing[2],
    marginBottom: activeTheme.spacing[2],
  });

  const chipTextColor = (isSelected: boolean) => (isSelected ? 'surface' as const : 'inkMuted' as const);
```

**Multi-select chip (weekday picker template)** (lines 213-239) — has the correct a11y roles:

```tsx
          {members.map((m) => {
            const selected = form.assigneeIds.includes(m.userId);
            return (
              <Pressable
                key={m.userId}
                onPress={() =>
                  updateField('assigneeIds',
                    selected
                      ? form.assigneeIds.filter((id) => id !== m.userId)
                      : [...form.assigneeIds, m.userId],
                  )
                }
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                style={({ pressed }) => [chipStyle(selected), { opacity: pressed ? 0.7 : 1 }]}
                accessibilityLabel={`分配给 ${m.displayName}`}
              >
                <Text variant="bodySm" color={chipTextColor(selected)}>{m.displayName}</Text>
              </Pressable>
            );
          })}
```

**Single-select chip (frequency / end-condition template)** (lines 154-170) — ⚠️ **weaker precedent, do NOT copy the a11y part.** It has only `accessibilityLabel`; UI-SPEC requires `accessibilityRole="radio"` + `accessibilityState={{ checked }}` + a `radiogroup` container:

```tsx
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {STATUSES.map((s) => (
            <Pressable
              key={s.value}
              onPress={() => updateField('status', s.value)}
              style={({ pressed }) => [chipStyle(form.status === s.value), { opacity: pressed ? 0.7 : 1 }]}
              accessibilityLabel={s.label}
            >
              <Text variant="bodySm" color={chipTextColor(form.status === s.value)}>{s.label}</Text>
            </Pressable>
          ))}
        </View>
```

**Form section wrapper + `DateField` usage** (lines 152-153, 244-251) — the `<Stack gap={1}>` + `Text variant="label"` block is the unit `<RecurrencePicker>` must be inserted as:

```tsx
      <Stack gap={1}>
        <Text variant="label">状态</Text>
        ...
      </Stack>

      <DateField
        value={form.dueDate}
        onChange={(v) => updateField('dueDate', v)}
        mode="date"
        label="截止日期（可选）"
        placeholder="YYYY-MM-DD"
        accessibilityLabel="截止日期"
      />
```

**Const-tuple option lists** (lines 10-21) — copy for frequency / weekday / end-condition vocabularies:

```tsx
const STATUSES = [
  { value: 'pending', label: '待办' },
  { value: 'in_progress', label: '进行中' },
  { value: 'completed', label: '已完成' },
] as const;
```

**Insertion points:** `task-form.tsx` between the `DateField` (line 244) and the Description block (line 254); `event-form.tsx` between "结束" and "地点".

---

### `apps/client/src/features/recurrence/series-scope-sheet.tsx` (component, dialog)

**Analog:** `apps/client/src/ui/household-components.tsx:334-467` (`HouseholdSwitcher`) — the repo's only `Modal`.

**Unmount-on-close (the RNW trap)** (lines 331-334):

```tsx
    // React Native Web keeps a closed Modal subtree in the DOM. Unmounting it
    // prevents duplicate hidden household labels from polluting navigation and
    // accessibility queries while the switcher is inactive.
    if (!visible) return null;
```

**Web branch — centered panel + click-scrim** (lines 423-447):

```tsx
    if (Platform.OS === 'web') {
      return (
        <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
          <Pressable
            onPress={onClose}
            style={{
              alignItems: 'center',
              backgroundColor: theme.colors.overlay,
              flex: 1,
              justifyContent: 'center',
              padding: theme.spacing[6],
            }}
          >
            <Pressable onPress={() => undefined}>
              {content}
            </Pressable>
          </Pressable>
        </Modal>
      );
    }
```

**Native branch — bottom sheet** (lines 449-467):

```tsx
    return (
      <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable onPress={onClose} style={{ backgroundColor: theme.colors.overlay, flex: 1 }} />
          {content}
        </View>
      </Modal>
    );
```

**Panel shell — platform-branched radius/width/shadow, safe-area padding** (lines 320-354, 416):

```tsx
    const insets = useSafeAreaInsets();
    ...
        style={{
          backgroundColor: theme.colors.surface,
          borderRadius: Platform.OS === 'web' ? theme.borderRadii.lg : 0,
          ...(Platform.OS === 'web'
            ? { maxHeight: theme.layout.switcherMaxHeight }
            : { height: '75%' as unknown as number }),
          width: Platform.OS === 'web' ? theme.layout.switcherWidth : '100%',
          ...(Platform.OS === 'web' ? { boxShadow: theme.elevation.softWeb as string } : {}),
          overflow: 'hidden',
        }}
    ...
          <View style={{ padding: theme.spacing[4], paddingBottom: theme.spacing[4] + insets.bottom }}>
```

Also copy: `<Heading ref={headingRef}>` for focus management, `minHeight/minWidth: theme.controlSizes.touchTarget` on every pressable, `accessibilityState={{ selected }}`.

**Destructive-action button styling** — take from `events/[eventId]/edit.tsx:186-203` rather than the switcher:

```tsx
                  <Pressable
                    onPress={handleDelete}
                    disabled={deleting}
                    hitSlop={activeTheme.spacing[1]}
                    style={({ pressed }) => ({
                      flex: 1,
                      alignItems: 'center',
                      paddingVertical: activeTheme.spacing[3],
                      borderRadius: activeTheme.borderRadii.sm,
                      backgroundColor: deleting ? activeTheme.colors.disabled : activeTheme.colors.destructive,
                      opacity: pressed ? 0.7 : 1,
                    })}
                    accessibilityLabel="确认删除事件"
                  >
                    <Text variant="button" color="surface">
                      {deleting ? '删除中…' : '确认删除'}
                    </Text>
                  </Pressable>
```

---

### `apps/client/src/features/recurrence/recurrence-badge.tsx` (component, badge)

**Analog:** `apps/client/src/features/tasks/task-card.tsx:11, 57-82`

```tsx
const BADGE_PADDING_V = 2;
const BADGE_PADDING_V_OUTLINE = 1;
...
            <View
              style={{
                backgroundColor: statusColors[task.status] ?? activeTheme.colors.border,
                paddingHorizontal: activeTheme.spacing[2],
                paddingVertical: BADGE_PADDING_V,
                borderRadius: activeTheme.borderRadii.sm,
              }}
            >
              <Text variant="caption" color="surface">
                {statusLabel(task.status)}
              </Text>
            </View>
```

`BADGE_PADDING_V = 2` is the single sanctioned bare-value exception (UI-SPEC). Icon import style is exact subpath — `import Circle from 'lucide-react-native/icons/circle';` (`task-card.tsx:4`) → `import Repeat from 'lucide-react-native/icons/repeat';`.

**Card `accessibilityLabel` to extend** (`task-card.tsx:43`, `event-card.tsx:20`):

```tsx
      accessibilityLabel={`任务：${task.title}`}
      accessibilityLabel={`事件：${event.title}`}
```

**`opacity` / strike-through precedent for the `已取消` branch** (`task-card.tsx:50, 129-135`):

```tsx
        opacity: task.status === 'completed' ? 0.6 : pressed ? 0.8 : 1,
...
        <Text
          variant="label"
          numberOfLines={1}
          style={task.status === 'completed' ? { textDecorationLine: 'line-through' } : undefined}
        >
```

---

### Detail screens — "重复" info block

**Analog:** `app/(protected)/households/[id]/events/[eventId]/index.tsx:126-151`

```tsx
        <Stack gap={1}>
          <Text variant="label" color="inkMuted">开始</Text>
          <Text variant="body">{formatFullDateTime(event.startTime, event.allDay)}</Text>
        </Stack>

        {event.location !== null && event.location !== '' && (
          <Stack gap={1}>
            <Text variant="label" color="inkMuted">地点</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: activeTheme.spacing[1] }}>
              <MapPin size={16} color={activeTheme.colors.inkMuted} strokeWidth={1.5} />
              <Text variant="body">{event.location}</Text>
            </View>
          </Stack>
        )}
```

Insert the recurrence block after "结束" (line 134) / after "截止日期" on the task detail screen. The `tealSoft` info-pill for `RecurrenceSummary` copies lines 112-124 of the same file:

```tsx
          <View
            style={{
              alignSelf: 'flex-start',
              backgroundColor: activeTheme.colors.tealSoft,
              paddingHorizontal: activeTheme.spacing[3],
              paddingVertical: activeTheme.spacing[1],
              borderRadius: activeTheme.borderRadii.full,
            }}
          >
            <Text variant="caption" color="teal">全天事件</Text>
          </View>
```

---

### Edit screens — scope-sheet insertion

**Analog:** `app/(protected)/households/[id]/events/[eventId]/edit.tsx` (whole file)

**Fetch / submit / delete handler triad** (lines 25-91) — the `<SeriesScopeSheet>` gate must sit *before* the API call inside `handleSubmit` / `handleDelete`:

```tsx
  const handleSubmit = useCallback(
    async (data: CreateEventDto) => {
      setIsSubmitting(true);
      setError(null);
      try {
        const token = await sessionTransport.getAccessToken();
        if (token === null) { setError('登录已过期。'); return; }
        await sessionApiClient.updateEvent(token, id!, eventId!, data);
        await sessionApiClient.tagEvent(token, id!, eventId!, { labelIds: selectedLabelIds });
        router.back();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : '保存失败，请重试。';
        setError(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [id, eventId, router, selectedLabelIds],
  );
```

**Post-delete navigation comment worth preserving** (lines 82-84):

```tsx
      // Go straight back to the calendar list, not router.back() — a single
      // pop would land on the now-deleted event's detail screen.
      router.dismissTo(`/households/${encodeURIComponent(id!)}/events`);
```

**Existing inline delete confirmation** (lines 143-207) — must remain **unchanged** for `recurrenceRuleId === null` items; the sheet is an additional branch, not a replacement.

---

### `today.tsx` — `cancelled` exclusion

**Analog:** the file itself.

**Partition loop** (lines 69-94) — the `cancelled` guard goes beside line 76:

```tsx
    for (const task of tasks) {
      if (task.status === 'completed') continue;
      if (isOverdue(task.dueDate ?? null)) {
        overdue.push(task);
      } else if (isToday(task.dueDate ?? null) || task.dueDate === null || task.dueDate === '') {
        dueToday.push(task);
      } else if (isApproachingDeadline(task.dueDate ?? null, 7)) {
        approaching.push(task);
      } else {
        other.push(task);
      }
    }
```

**Status cycle** (lines 157-171) — a `cancelled` task must not resurrect as `pending`:

```tsx
    const nextStatus =
      task.status === 'pending' ? 'in_progress'
        : task.status === 'in_progress' ? 'completed'
        : 'pending';
```

---

## Shared Patterns

### Authorization (SAFE-01 boundary)
**Source:** `apps/api/src/modules/tasks/tasks.service.ts:53-69, 92-93, 193-196`
**Apply to:** every new API service method, including `.../series` sub-resources.

```typescript
const role = await this.resolveActorRole(actorId, householdId);
if (role === null) throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });

const row = await this.prisma.<model>.findUnique({ where: { id } });
if (row === null || row.householdId !== householdId) {
  throw new NotFoundException({ code: '<X>_NOT_FOUND', message: '<X> not found.' });
}
if (!this.canMutate(role, row.createdBy, actorId)) {
  throw new ForbiddenException({ code: 'FORBIDDEN', message: '...' });
}
```

**Anti-pattern:** returning 403 for a non-member — household existence must not leak. Never trust a `recurrenceRuleId` from a request body without re-resolving its `householdId`.

### Error envelope
**Source:** `apps/api/src/modules/tasks/tasks.service.ts:97-102`; normalized by the global filter at `apps/api/src/main.ts:137-175`
**Apply to:** every service and controller in the phase.

```typescript
throw new BadRequestException({
  code: 'VALIDATION_FAILED',
  message: 'Request validation failed.',
  details: [{ field: 'title', codes: ['length'], message: `Title must be ${TITLE_MIN}–${TITLE_MAX} characters.` }],
});
```

`details[].field` is what the client maps to an inline `FormMessage` (UI-SPEC). For D-06 use `field: 'recurrence.endsOn'`, `codes: ['ends_on_and_count_mutually_exclusive']`.

### Guard + Swagger controller decorators
**Source:** `apps/api/src/modules/events/events.controller.ts:38-43`
**Apply to:** every new controller.

```typescript
@ApiTags('events')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('households/:householdId/events')
```

Plus `@ApiOperation({ operationId: '...' })` on every route — the OpenAPI document keys off it.

### `exactOptionalPropertyTypes` conditional spread
**Source:** `apps/api/src/main.ts:168`; `apps/api/test/tasks/tasks.int.test.ts:94-96`
**Apply to:** all new API + client code assigning optional fields.

```typescript
      ...(payload !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(payload !== undefined ? { payload } : {}),
```

`tsconfig.base.json` sets `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`. Array-index destructuring yields `T | undefined` — precedent for the escape hatch is `apps/client/src/ui/date-field.tsx:16` (`new Date(y!, m! - 1, d!)`), but prefer an explicit parse-and-validate function in `recurrence-date.ts`.

### Client theming — token-only styling
**Source:** `apps/client/src/features/tasks/task-form.tsx:59, 112-133`
**Apply to:** every file under `apps/client/src/features/recurrence/`.

```tsx
  const activeTheme = useTheme<Theme>();

  const inputStyle = {
    backgroundColor: activeTheme.colors.surface,
    borderWidth: 1,
    borderColor: activeTheme.colors.border,
    borderRadius: activeTheme.borderRadii.sm,
    paddingHorizontal: activeTheme.spacing[4],
    paddingVertical: activeTheme.spacing[3],
    fontSize: activeTheme.typography.body.fontSize,
    color: activeTheme.colors.ink,
    minHeight: activeTheme.controlSizes.field,
  };
```

No bare colors / spacings / radii / font sizes / shadows. Sole exceptions: `borderWidth: 1` and `BADGE_PADDING_V = 2`.

### Client data access
**Source:** `app/(protected)/.../events/[eventId]/edit.tsx:7, 29-36`
**Apply to:** every screen touched this phase.

```tsx
import { sessionApiClient, sessionTransport } from '.../src/features/auth/session-runtime';

const token = await sessionTransport.getAccessToken();
if (token === null) { setError('登录已过期。'); return; }
const result = await sessionApiClient.getEvent(token, id, eventId);
```

Always `try/catch` → Chinese `setError(...)` → `finally` reset the loading flag. Never optimistic-update (UI-SPEC).

---

## No Analog Found

Files with no close match in the codebase — the planner should use RESEARCH.md Code Examples 1-4 instead.

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `apps/api/src/modules/recurrence/recurrence-materializer.service.ts` | service (batch) | batch | No background/batch worker exists in the repo. Repo-wide grep for `nestjs/schedule\|node-cron\|bullmq\|@Cron\|setInterval\|agenda\|pg-boss` returns zero matches. Also introduces the repo's **first** `$queryRaw` call (advisory lock) and first `createMany({ skipDuplicates: true })`. Use RESEARCH.md Example 3. |
| `apps/api/src/modules/recurrence/recurrence-date.ts` (timezone half) | utility | transform | No date/time library and no `Intl.DateTimeFormat`/`timeZone` usage anywhere in the repo. The local-wall-time→UTC conversion is genuinely new; RESEARCH.md Example 2 is `[ASSUMED]` and must be proven by DST unit tests. The calendar-walk half does have a shape analog (`calendar-utils.ts`). |
| Nested DTO (`recurrence?: RecurrenceDto` on `CreateEventDto` / `CreateTaskDto`) | model/DTO | request-response | Every DTO field in the repo today is a primitive or `string[]`. No `@ValidateNested()` / `@Type()` precedent exists. See Pitfall 1. |

Partial-analog warnings (analog exists but must be deviated from):

- **`@db.Date` columns** — the whole schema uses `@db.Timestamptz(3)`; recurrence date columns are the deliberate exception (Pitfall 10).
- **Single-select chip a11y** — `task-form.tsx:154-193` has only `accessibilityLabel`; UI-SPEC requires `radiogroup`/`radio` + `accessibilityState`.
- **`setUTCDate` day arithmetic** — present at `events.service.ts:130-141`; explicitly must not be extended into recurrence (D-10).
- **Interactive `$transaction`** — only the array form exists (`tasks.service.ts:269`); D-08 requires the callback form (Pitfall 6).

---

## Metadata

**Analog search scope:**
`apps/api/src/modules/{events,tasks,labels}/`, `apps/api/src/{app.module.ts,main.ts,openapi/,infrastructure/}`, `apps/api/prisma/{schema.prisma,migrations/}`, `apps/api/test/`, `apps/client/src/{features/{events,tasks,labels,auth,profile,households},ui}/`, `apps/client/app/(protected)/households/[id]/`, `e2e/`

**Files read this session:** 22
**Pattern extraction date:** 2026-08-12
