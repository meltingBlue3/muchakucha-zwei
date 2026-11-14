import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { CreateEventDto } from '../events/dto/create-event.dto.js';
import { UpdateEventDto } from '../events/dto/update-event.dto.js';
import { CreateTaskDto, TASK_PRIORITIES, TASK_STATUSES } from '../tasks/dto/create-task.dto.js';
import { UpdateTaskDto } from '../tasks/dto/update-task.dto.js';
import { CreateNoteDto } from '../notes/dto/create-note.dto.js';
import { UpdateNoteDto } from '../notes/dto/update-note.dto.js';
import { CreateLabelDto, UpdateLabelDto } from '../labels/dto/create-label.dto.js';
import { OBSERVANCE_NAMES } from './assistant-lunar.js';

export class ListArguments {
  @IsOptional() @IsString() @MaxLength(200)
  query?: string;

  @IsOptional() @IsInt() @Min(0) @Max(100_000)
  offset?: number;

  @IsOptional() @IsInt() @Min(1) @Max(50)
  limit?: number;
}

export class ListEventsArguments extends ListArguments {
  @IsOptional() @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate?: string;

  @IsOptional() @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate?: string;

  @IsOptional() @IsBoolean()
  recurring?: boolean;
}

export class ListTasksArguments extends ListArguments {
  @IsOptional() @IsIn(TASK_STATUSES)
  status?: (typeof TASK_STATUSES)[number];

  @IsOptional() @IsIn(TASK_PRIORITIES)
  priority?: (typeof TASK_PRIORITIES)[number];

  @IsOptional() @IsUUID('4')
  assigneeId?: string;

  @IsOptional() @IsBoolean()
  recurring?: boolean;

  @IsOptional() @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueFrom?: string;

  @IsOptional() @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueThrough?: string;
}

export class ListSeriesArguments extends ListArguments {
  @IsOptional() @IsBoolean()
  birthdays?: boolean;
}

export class LunarCalendarArguments {
  @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate!: string;

  @IsOptional() @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate?: string;

  @IsOptional() @IsBoolean()
  notableOnly?: boolean;
}

export class FindLunarDatesArguments {
  @IsOptional() @IsInt() @Min(1) @Max(12)
  month?: number;

  @IsOptional() @IsInt() @Min(1) @Max(30)
  day?: number;

  @IsOptional() @IsBoolean()
  leap?: boolean;

  @IsOptional() @IsInt() @Min(1900) @Max(2100)
  lunarYear?: number;

  @IsOptional() @IsIn(OBSERVANCE_NAMES)
  name?: string;

  @IsOptional() @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fromDate?: string;

  @IsOptional() @IsInt() @Min(1) @Max(10)
  count?: number;
}

export class IdArguments {
  @IsUUID('4')
  id!: string;
}

export class GetContentArguments extends IdArguments {
  @IsOptional() @IsInt() @Min(0) @Max(10_000_000)
  contentOffset?: number;

  @IsOptional() @IsInt() @Min(1) @Max(12_000)
  contentLimit?: number;
}

export class CreateEventArguments extends CreateEventDto {
  @IsOptional() @IsString() @MaxLength(5000)
  declare description?: string;
}

export class UpdateEventArguments extends UpdateEventDto {
  @IsUUID('4')
  id!: string;

  @IsOptional() @IsString() @MaxLength(5000)
  declare description?: string;
}

export class CreateTaskArguments extends CreateTaskDto {}

export class UpdateTaskArguments extends UpdateTaskDto {
  @IsUUID('4')
  id!: string;
}

export class CreateNoteArguments extends CreateNoteDto {
  @IsOptional() @IsString() @MaxLength(20_000)
  declare body?: string;
}

export class UpdateNoteArguments extends UpdateNoteDto {
  @IsUUID('4')
  id!: string;

  @IsOptional() @IsString() @MaxLength(20_000)
  declare body?: string;
}

export class DeleteContentArguments extends IdArguments {
  @IsDateString({ strict: true })
  expectedUpdatedAt!: string;
}

export class DeleteOccurrenceArguments extends DeleteContentArguments {
  @IsOptional() @IsDateString({ strict: true })
  expectedRuleUpdatedAt?: string;
}

export class CreateLabelArguments extends CreateLabelDto {}

export class UpdateLabelArguments extends UpdateLabelDto {
  @IsUUID('4')
  id!: string;

  @IsString() @Length(1, 40)
  expectedName!: string;

  @IsString() @Matches(/^#[0-9a-fA-F]{6}$/)
  expectedColor!: string;
}

export class DeleteLabelArguments extends IdArguments {
  @IsString() @Length(1, 40)
  expectedName!: string;

  @IsString() @Matches(/^#[0-9a-fA-F]{6}$/)
  expectedColor!: string;
}

type Schema = Record<string, unknown>;
const string = (maxLength: number, description?: string): Schema => ({
  type: 'string', maxLength, ...(description === undefined ? {} : { description }),
});
const timestamp: Schema = { type: 'string', format: 'date-time', description: 'ISO 8601 timestamp with UTC Z or an explicit offset.' };
const date: Schema = { type: 'string', format: 'date', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
const uuid: Schema = { type: 'string', format: 'uuid' };
const uuidArray: Schema = { type: 'array', items: uuid, maxItems: 100, uniqueItems: true };
const title: Schema = { ...string(200), minLength: 1 };
const description = string(5000, 'Omit to preserve when updating; empty string clears the description.');
const recurrence: Schema = {
  type: 'object', additionalProperties: false, required: ['freq', 'startsOn', 'timezone'],
  properties: {
    freq: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'yearly'] },
    interval: { type: 'integer', minimum: 1, maximum: 52 },
    byWeekday: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 6 }, maxItems: 7, uniqueItems: true },
    startsOn: { ...date, description: 'The first date of the series. A daily, weekly, monthly or Gregorian yearly rule repeats from it (a yearly one on its month and day). With lunar it may be any date up to the first occurrence. The first event lands on the rule’s first date; startTime and endTime give only its time of day and length.' },
    endsOn: date, count: { type: 'integer', minimum: 1, maximum: 1000 },
    timezone: string(64, 'IANA timezone, for example Asia/Shanghai.'),
    startTimeLocal: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
    durationMinutes: { type: 'integer', minimum: 0, maximum: 1440 },
    lunar: {
      type: 'object', additionalProperties: false, required: ['month', 'day'],
      description: 'Only with freq yearly: repeat on this Chinese lunar month and day (农历), such as {"month":10,"day":15} for 十月十五; 冬月 is 11 and 腊月 is 12. startsOn may be any date before the first occurrence.',
      properties: { month: { type: 'integer', minimum: 1, maximum: 12 }, day: { type: 'integer', minimum: 1, maximum: 30 } },
    },
    occasion: { type: 'string', enum: ['birthday'], description: 'Marks a yearly all-day event series as someone\'s birthday.' },
    birthYear: { type: 'integer', minimum: 1900, maximum: 2100, description: 'Only for a birthday whose year of birth the user stated; the lunar year for a lunar birthday.' },
  },
};

export const listProperties = {
  query: string(200, 'Case-insensitive search across titles, body/description, location and label names; every space-separated term must appear.'),
  offset: { type: 'integer', minimum: 0, maximum: 100_000, default: 0 },
  limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
};
export const idProperties = { id: uuid };
export const getContentProperties = {
  ...idProperties,
  contentOffset: { type: 'integer', minimum: 0, maximum: 10_000_000, default: 0 },
  contentLimit: { type: 'integer', minimum: 1, maximum: 12_000, default: 12_000 },
};
export const eventProperties = {
  title, description, startTime: timestamp, endTime: timestamp,
  allDay: { type: 'boolean' }, location: string(255),
};
export const taskProperties = {
  title, description,
  status: { type: 'string', enum: TASK_STATUSES },
  priority: { type: 'string', enum: TASK_PRIORITIES },
  assigneeIds: uuidArray,
  dueDate: string(64, 'YYYY-MM-DD for a local date without a time, or an ISO date-time with an offset; empty string clears it when updating.'),
};
export const noteProperties = { title, body: string(20_000, 'Markdown body. Empty string clears the body.') };
export const labelProperties = { name: { ...string(40), minLength: 1 }, color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' } };
export const editProperties = { expectedUpdatedAt: timestamp };
export const occurrenceEditProperties = { ...editProperties, expectedRuleUpdatedAt: timestamp };
export const labelSnapshotProperties = { expectedName: labelProperties.name, expectedColor: labelProperties.color };
export const labelsProperty = { labelIds: uuidArray };
export const recurrenceProperty = { recurrence };
export const eventListProperties = { ...listProperties, startDate: date, endDate: date, recurring: { type: 'boolean' } };
export const seriesListProperties = { ...listProperties, birthdays: { type: 'boolean', description: 'Only birthday series.' } };
export const lunarCalendarProperties = { startDate: date, endDate: date, notableOnly: { type: 'boolean' } };
export const findLunarDatesProperties = {
  month: { type: 'integer', minimum: 1, maximum: 12, description: 'Lunar month: 1 is 正月, 11 is 冬月, 12 is 腊月.' },
  day: { type: 'integer', minimum: 1, maximum: 30, description: 'Lunar day: 1 is 初一, 30 is 三十.' },
  leap: { type: 'boolean', description: 'Only with lunarYear: the leap month (闰月) that repeats this month number.' },
  lunarYear: { type: 'integer', minimum: 1900, maximum: 2100, description: 'Converts one exact date, such as a lunar birth date. A lunar year is named by the Gregorian year its 正月初一 falls in.' },
  name: { type: 'string', enum: OBSERVANCE_NAMES, description: 'A festival or solar term, instead of month and day.' },
  fromDate: { ...date, description: 'Earliest date to return; defaults to today in the user’s time zone.' },
  count: { type: 'integer', minimum: 1, maximum: 10, default: 1 },
};
export const taskListProperties = {
  ...listProperties, status: taskProperties.status, priority: taskProperties.priority,
  assigneeId: uuid, recurring: { type: 'boolean' }, dueFrom: date, dueThrough: date,
};
