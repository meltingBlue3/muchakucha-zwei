import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { isISO8601, validate, type ValidationError } from 'class-validator';
import { EventsService } from '../events/events.service.js';
import { TasksService } from '../tasks/tasks.service.js';
import { NotesService } from '../notes/notes.service.js';
import { LabelsService } from '../labels/labels.service.js';
import { HouseholdsService } from '../households/households.service.js';
import { RecurrenceService } from '../recurrence/recurrence.service.js';
import { firstOccurrence, formatIsoDate, localDateTimeToInstant, parseIsoDate, type CalendarDate } from '../recurrence/recurrence-date.js';
import type { RecurrenceDto } from '../recurrence/dto/recurrence.dto.js';
import { assertEditVersion } from '../shared/edit-version.js';
import { allDayBounds, localDateOf, localMidnight, localStamp, shiftDate, wallClock, weekdayOf } from './assistant-time.js';
import { findLunarDates, formatAnchor, lunarCalendar, occurrenceFacts } from './assistant-lunar.js';
import type { AssistantActor, AssistantToolActor, AssistantToolCall, AssistantToolDefinition } from './assistant.types.js';
import {
  CreateEventArguments, CreateLabelArguments, CreateNoteArguments, CreateTaskArguments,
  DeleteContentArguments, DeleteLabelArguments, DeleteOccurrenceArguments, FindLunarDatesArguments,
  GetContentArguments, IdArguments, ListArguments, ListEventsArguments, ListSeriesArguments, ListTasksArguments, LunarCalendarArguments,
  UpdateEventArguments, UpdateLabelArguments, UpdateNoteArguments, UpdateTaskArguments,
  editProperties, eventListProperties, eventProperties, findLunarDatesProperties, getContentProperties, idProperties,
  labelProperties, labelSnapshotProperties, labelsProperty, listProperties, lunarCalendarProperties, noteProperties,
  occurrenceEditProperties, recurrenceProperty, seriesListProperties, taskListProperties, taskProperties,
} from './assistant-tool-arguments.js';

type Properties = Record<string, Record<string, unknown>>;
type Arguments = Record<string, unknown>;
interface ToolRegistration {
  definition: AssistantToolDefinition;
  prepare: (actor: AssistantToolActor, value: unknown) => Promise<Arguments>;
  execute: (actor: AssistantToolActor, value: unknown) => Promise<unknown>;
}
interface ContentVersion {
  id: string;
  createdBy: string;
  updatedAt: string;
  recurrence?: { updatedAt: string } | null;
}
interface ExpectedVersion {
  expectedUpdatedAt: string;
  expectedRuleUpdatedAt?: string;
}
type Household = NonNullable<Awaited<ReturnType<HouseholdsService['getHousehold']>>>;

const PAGE_PREVIEW_CHARACTERS = 1000;
/** Days lunar_calendar returns in one call, and with notableOnly, where only festivals and terms come back. */
const LUNAR_CALENDAR_DAYS = 62;
const LUNAR_NOTABLE_DAYS = 400;

function invalid(field: string, code: string): never {
  throw new BadRequestException({
    code: 'VALIDATION_FAILED', message: 'Assistant tool arguments are invalid.',
    details: [{ field, codes: [code] }],
  });
}

function validationDetails(errors: ValidationError[], prefix = ''): Array<{ field: string; codes: string[] }> {
  return errors.flatMap(error => {
    const field = prefix ? `${prefix}.${error.property}` : error.property;
    return [
      ...(error.constraints ? [{ field, codes: Object.keys(error.constraints) }] : []),
      ...validationDetails(error.children ?? [], field),
    ];
  });
}

/** DTO validation remains authoritative; these schema bounds also prevent inherited optional
 * decorators from accepting null and constrain fields deliberately omitted from a tool. */
function checkSchema(value: unknown, schema: Record<string, unknown>, field = 'arguments'): void {
  if (value === null || value === undefined) invalid(field, 'null_not_allowed');
  if (schema.type === 'object') {
    if (typeof value !== 'object' || Array.isArray(value)) invalid(field, 'isObject');
    const properties = schema.properties as Properties;
    for (const [key, child] of Object.entries(value)) {
      if (!Object.hasOwn(properties, key)) invalid(`${field}.${key}`, 'whitelistValidation');
      checkSchema(child, properties[key]!, `${field}.${key}`);
    }
    for (const key of (schema.required as string[] | undefined) ?? []) {
      if (!Object.hasOwn(value, key)) invalid(`${field}.${key}`, 'isDefined');
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) invalid(field, 'isArray');
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) invalid(field, 'arrayMaxSize');
    if (schema.uniqueItems === true && new Set(value).size !== value.length) invalid(field, 'arrayUnique');
    value.forEach((child, index) => checkSchema(child, schema.items as Record<string, unknown>, `${field}.${index}`));
  } else if (schema.type === 'string') {
    if (typeof value !== 'string') invalid(field, 'isString');
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) invalid(field, 'maxLength');
    if (typeof schema.minLength === 'number' && value.trim().length < schema.minLength) invalid(field, 'minLength');
    if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern).test(value)) invalid(field, 'matches');
    if (schema.format === 'date' && !isISO8601(value, { strict: true })) invalid(field, 'isDateString');
    if (schema.format === 'date-time' && (!/T\d{2}:\d{2}.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value) || !isISO8601(value, { strict: true }))) {
      invalid(field, 'isDateTimeWithOffset');
    }
  } else if (schema.type === 'boolean') {
    if (typeof value !== 'boolean') invalid(field, 'isBoolean');
  } else if (schema.type === 'integer') {
    if (typeof value !== 'number' || !Number.isInteger(value)) invalid(field, 'isInt');
    if (typeof schema.minimum === 'number' && value < schema.minimum) invalid(field, 'min');
    if (typeof schema.maximum === 'number' && value > schema.maximum) invalid(field, 'max');
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) invalid(field, 'isIn');
}

async function parse<T extends object>(dto: ClassConstructor<T>, value: unknown, schema: Record<string, unknown>): Promise<T> {
  checkSchema(value, schema);
  const result = plainToInstance(dto, value, { enableImplicitConversion: false });
  const errors = await validate(result, {
    whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true,
    validationError: { target: false, value: false },
  });
  if (errors.length > 0) {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED', message: 'Assistant tool arguments are invalid.', details: validationDetails(errors),
    });
  }
  return result;
}

function searchable(value: object): string {
  const row = value as Record<string, unknown>;
  return [row.title, row.name, row.body, row.description, row.location, row.displayName, row.username,
    ...(Array.isArray(row.labels) ? row.labels.map(label => (label as { name?: unknown }).name) : []),
  ].filter((text): text is string => typeof text === 'string').join('\n').normalize('NFKC').toLowerCase();
}

function paginate<T extends object>(items: T[], args: ListArguments) {
  // Every space-separated term must appear, in any order: "周末 采购" finds "采购清单（周末）".
  const terms = args.query?.normalize('NFKC').toLowerCase().split(/\s+/).filter(Boolean) ?? [];
  const matches = terms.length ? items.filter(item => { const text = searchable(item); return terms.every(term => text.includes(term)); }) : items;
  const offset = args.offset ?? 0;
  const limit = args.limit ?? 20;
  const selected = matches.slice(offset, offset + limit);
  const rows = selected.map(item => {
    const result = { ...item } as Record<string, unknown>;
    const truncatedFields: string[] = [];
    for (const field of ['body', 'description']) {
      const value = result[field];
      if (typeof value === 'string' && value.length > PAGE_PREVIEW_CHARACTERS) {
        result[field] = value.slice(0, PAGE_PREVIEW_CHARACTERS);
        truncatedFields.push(field);
      }
    }
    return { ...result, truncatedFields };
  });
  const hasMore = offset + selected.length < matches.length;
  return {
    items: rows, total: matches.length, offset, limit, returned: rows.length,
    nextOffset: hasMore ? offset + selected.length : null,
    truncated: offset > 0 || hasMore || rows.some(row => row.truncatedFields.length > 0),
    coverage: 'Read remaining pages before making exhaustive claims; get a record to read truncated text. Results reflect saved records at query time.',
  };
}

function contentPage<T extends object>(item: T, field: 'body' | 'description', args: GetContentArguments) {
  const text = (item as Record<string, unknown>)[field];
  const offset = args.contentOffset ?? 0;
  const limit = args.contentLimit ?? 12_000;
  const length = typeof text === 'string' ? text.length : 0;
  return {
    ...item,
    ...(typeof text === 'string' ? { [field]: text.slice(offset, offset + limit) } : {}),
    contentField: field, contentOffset: offset, contentLength: length,
    contentTruncated: offset > 0 || offset + limit < length,
    nextContentOffset: offset + limit < length ? offset + limit : null,
  };
}

function assertDateRange(from: string | undefined, through: string | undefined): void {
  if (from !== undefined && through !== undefined && from > through) invalid('dateRange', 'end_before_start');
}

// The caller's own reminder is a personal setting, not content the assistant reads or edits.
function withoutReminder<T extends { myReminder?: unknown }>(item: T): Omit<T, 'myReminder'> {
  const { myReminder: _personal, ...content } = item;
  return content;
}

type SeriesMarks = Parameters<typeof occurrenceFacts>[0];

/** An occurrence of a lunar or birthday series also carries its lunar date and the age it marks. */
function withEventTimes<T extends { startTime: string; endTime: string; allDay: boolean; occurrenceDate?: string | null; recurrence?: SeriesMarks; myReminder?: unknown }>(event: T, timeZone: string) {
  const mode = event.allDay ? 'date' : 'datetime';
  return {
    ...withoutReminder(event), startLocal: localStamp(event.startTime, timeZone, mode), endLocal: localStamp(event.endTime, timeZone, mode),
    ...occurrenceFacts(event.recurrence, event.occurrenceDate),
  };
}

function withDueTime<T extends { dueDate?: string | null; occurrenceDate?: string | null; recurrence?: SeriesMarks; myReminder?: unknown }>(task: T, timeZone: string) {
  return { ...withoutReminder(task), dueLocal: task.dueDate ? localStamp(task.dueDate, timeZone, 'due') : null, ...occurrenceFacts(task.recurrence, task.occurrenceDate) };
}

/** An impossible date such as 2026-02-30 is left as is for validateDueDate to reject. */
function normalizeDueDate(args: Arguments, timeZone: string): Arguments {
  return typeof args.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.dueDate) && isISO8601(args.dueDate, { strict: true })
    ? { ...args, dueDate: localMidnight(args.dueDate, timeZone).toISOString() } : args;
}

function normalizeAllDay(args: Arguments, timeZone: string): Arguments {
  if (args.allDay !== true) return args;
  const start = typeof args.startTime === 'string' ? args.startTime : undefined;
  const end = typeof args.endTime === 'string' ? args.endTime : undefined;
  return { ...args, ...allDayBounds(start, end, timeZone) };
}

/**
 * A new series starts on its rule's first date, whatever date startTime carries: the events service keeps
 * only startTime's local time and the event's length. Moving the proposal there shows the user the date
 * that will be written. A lunar rule's startsOn moves too, which leaves its dates unchanged.
 */
function normalizeSeriesStart(args: Arguments): Arguments {
  const recurrence = args.recurrence as RecurrenceDto | undefined;
  if (recurrence === undefined || typeof args.startTime !== 'string' || typeof args.endTime !== 'string') return args;
  let first: CalendarDate | undefined;
  let start: Date;
  try {
    first = firstOccurrence({
      freq: recurrence.freq, interval: recurrence.interval ?? 1, byWeekday: recurrence.byWeekday ?? [],
      startsOn: parseIsoDate(recurrence.startsOn), endsOn: recurrence.endsOn === undefined ? null : parseIsoDate(recurrence.endsOn),
      count: recurrence.count ?? null, lunar: recurrence.lunar ?? null,
    });
    if (first === undefined) return args;
    const [hour = 0, minute = 0] = wallClock(new Date(args.startTime), recurrence.timezone).time.split(':').map(Number);
    start = localDateTimeToInstant(first, hour, minute, recurrence.timezone);
  } catch {
    // An impossible date or zone is left for the events service to reject with its own field.
    return args;
  }
  const length = Date.parse(args.endTime) - Date.parse(args.startTime);
  return {
    ...args, startTime: start.toISOString(), endTime: new Date(start.getTime() + length).toISOString(),
    ...(recurrence.lunar === undefined ? {} : { recurrence: { ...recurrence, startsOn: formatIsoDate(first) } }),
  };
}

function validateDueDate(value: string | undefined): void {
  if (value !== undefined && value !== '' && !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}.*(?:Z|[+-]\d{2}:\d{2}))?$/i.test(value)) {
    invalid('dueDate', 'isDateTimeWithOffset');
  }
  if (value !== undefined && value !== '' && !isISO8601(value, { strict: true })) invalid('dueDate', 'isDateString');
}

@Injectable()
export class AssistantToolsService {
  private readonly registry = new Map<string, ToolRegistration>();

  constructor(
    private readonly events: EventsService,
    private readonly tasks: TasksService,
    private readonly notes: NotesService,
    private readonly labels: LabelsService,
    private readonly households: HouseholdsService,
    private readonly recurrence: RecurrenceService,
  ) {
    this.registerReadTools();
    this.registerLunarTools();
    this.registerEventTools();
    this.registerTaskTools();
    this.registerNoteTools();
    this.registerLabelTools();
  }

  definitions(): AssistantToolDefinition[] {
    return structuredClone([...this.registry.values()].map(entry => entry.definition));
  }

  /** Run before displaying a proposal. This never writes business data. The returned call carries the
   * normalized arguments, so the user confirms exactly what will be written. */
  async prepare(actor: AssistantToolActor, call: AssistantToolCall): Promise<AssistantToolCall> {
    return { ...call, arguments: await this.lookup(call.name).prepare(actor, call.arguments) };
  }

  /** The caller is responsible for accepting mutations only after explicit confirmation. */
  async execute(actor: AssistantToolActor, call: AssistantToolCall): Promise<unknown> {
    return this.lookup(call.name).execute(actor, call.arguments);
  }

  private lookup(name: string): ToolRegistration {
    const tool = this.registry.get(name);
    if (!tool) throw new BadRequestException({ code: 'ASSISTANT_TOOL_NOT_FOUND', message: 'Unknown assistant tool.' });
    return tool;
  }

  private register<T extends object>(
    name: string, description: string, dto: ClassConstructor<T>, properties: Properties, required: string[],
    mutates: boolean, run: (actor: AssistantToolActor, args: T) => Promise<unknown>,
    before: (actor: AssistantToolActor, args: T) => Promise<void> = async () => {},
    normalize?: (args: Arguments, timeZone: string) => Arguments,
  ): void {
    if (this.registry.has(name)) throw new Error(`Duplicate assistant tool: ${name}`);
    const parameters = { type: 'object', properties, required, additionalProperties: false };
    const prepare = async (actor: AssistantToolActor, value: unknown): Promise<{ args: T; input: Arguments }> => {
      let input = value as Arguments;
      if (normalize) {
        // Validate what the model sent before converting it, then validate the conversion.
        await parse(dto, value, parameters);
        input = normalize(input, actor.timeZone);
      }
      const args = await parse(dto, input, parameters);
      await before(actor, args);
      return { args, input };
    };
    this.registry.set(name, {
      definition: { name, description: `${description} Omit optional fields when unused; null is never accepted.`, parameters, mutates },
      prepare: async (actor, value) => (await prepare(actor, value)).input,
      execute: async (actor, value) => run(actor, (await prepare(actor, value)).args),
    });
  }

  private registerReadTools(): void {
    this.register('list_events', 'Search saved calendar events with pagination. startDate and endDate are inclusive calendar dates in the user\'s time zone; results are events overlapping that range. startLocal/endLocal are local times. Recurring results cover materialized occurrences only; materializedThrough is the generation watermark.',
      ListEventsArguments, eventListProperties, [], false, async (actor, args) => {
        assertDateRange(args.startDate, args.endDate);
        // The service range is in UTC days; widen it so every zone's local days are covered, then cut exactly.
        const result = await this.events.list(actor.userId, actor.householdId, {
          startDate: args.startDate === undefined ? undefined : shiftDate(args.startDate, -1),
          endDate: args.endDate === undefined ? undefined : shiftDate(args.endDate, 1),
          recurring: args.recurring === undefined ? undefined : String(args.recurring),
        });
        const from = args.startDate === undefined ? undefined : localMidnight(args.startDate, actor.timeZone).getTime();
        const until = args.endDate === undefined ? undefined : localMidnight(shiftDate(args.endDate, 1), actor.timeZone).getTime();
        const matches = result.events.filter(event => (from === undefined || Date.parse(event.endTime) > from)
          && (until === undefined || Date.parse(event.startTime) < until));
        return {
          ...paginate(matches.map(event => withEventTimes(event, actor.timeZone)), args), timeZone: actor.timeZone,
          materializedThrough: result.materializedThrough, recurringCoverage: 'materialized_occurrences_only',
        };
      });
    this.register('list_tasks', 'Search saved tasks by text, status, priority, assignee user ID and due-date range. dueFrom and dueThrough are inclusive calendar dates in the user\'s time zone; dueLocal is the local due date, with a time unless due at midnight. Results are paginated; recurring results include materialized occurrences only.',
      ListTasksArguments, taskListProperties, [], false, async (actor, args) => {
        assertDateRange(args.dueFrom, args.dueThrough);
        const result = await this.tasks.list(actor.userId, actor.householdId, {
          status: args.status, priority: args.priority, assigneeId: args.assigneeId,
          recurring: args.recurring === undefined ? undefined : String(args.recurring),
        });
        const matches = result.tasks.filter(task => {
          if (args.dueFrom === undefined && args.dueThrough === undefined) return true;
          if (!task.dueDate) return false;
          const date = localDateOf(task.dueDate, actor.timeZone);
          return (args.dueFrom === undefined || date >= args.dueFrom) && (args.dueThrough === undefined || date <= args.dueThrough);
        });
        return {
          ...paginate(matches.map(task => withDueTime(task, actor.timeZone)), args), timeZone: actor.timeZone,
          materializedThrough: result.materializedThrough, recurringCoverage: 'materialized_occurrences_only',
        };
      });
    this.register('list_notes', 'Search note titles and full Markdown body; returned previews and rows are bounded. Follow nextOffset and use get_note for full text.',
      ListArguments, listProperties, [], false, async (actor, args) => paginate((await this.notes.list(actor.userId, actor.householdId)).notes, args));
    this.register('list_labels', 'Search household labels. Copy current name and color as expectedName and expectedColor before updating or deleting.',
      ListArguments, listProperties, [], false, async (actor, args) => paginate((await this.labels.list(actor.userId, actor.householdId)).labels, args));
    this.register('household_members', 'Search household members to resolve names into userId values for task assigneeIds. Never guess IDs.',
      ListArguments, listProperties, [], false, async (actor, args) => paginate((await this.household(actor)).members, args));
    this.register('get_event', 'Read one event and its current updatedAt and recurrence.updatedAt before changing it. Long descriptions support character pagination.',
      GetContentArguments, getContentProperties, ['id'], false, async (actor, args) => contentPage(withEventTimes(await this.events.getById(actor.userId, actor.householdId, args.id), actor.timeZone), 'description', args));
    this.register('get_task', 'Read one task and its current updatedAt and recurrence.updatedAt before changing it. Long descriptions support character pagination.',
      GetContentArguments, getContentProperties, ['id'], false, async (actor, args) => contentPage(withDueTime(await this.tasks.getById(actor.userId, actor.householdId, args.id), actor.timeZone), 'description', args));
    this.register('get_note', 'Read a note and updatedAt before changing it. Follow nextContentOffset until null to read the full Markdown body.',
      GetContentArguments, getContentProperties, ['id'], false, async (actor, args) => contentPage(await this.notes.getById(actor.userId, actor.householdId, args.id), 'body', args));
    this.register('get_label', 'Read a label before changing it; preserve name and color as the expected snapshot.',
      IdArguments, idProperties, ['id'], false, (actor, args) => this.label(actor, args.id));
  }

  private registerLunarTools(): void {
    this.register('lunar_calendar', `Read the Chinese lunar date (农历), festivals and solar terms of each Gregorian day from startDate through endDate, inclusive; endDate defaults to startDate. Up to ${LUNAR_CALENDAR_DAYS} days, or ${LUNAR_NOTABLE_DAYS} with notableOnly, which returns only days with a festival or solar term. Covers lunar years 1900 to 2100.`,
      LunarCalendarArguments, lunarCalendarProperties, ['startDate'], false, async (_actor, args) => {
        const end = args.endDate ?? args.startDate;
        assertDateRange(args.startDate, end);
        const days = (Date.parse(end) - Date.parse(args.startDate)) / 86_400_000 + 1;
        if (days > (args.notableOnly === true ? LUNAR_NOTABLE_DAYS : LUNAR_CALENDAR_DAYS)) invalid('endDate', 'range_too_long');
        return lunarCalendar(args.startDate, end, args.notableOnly === true);
      });
    this.register('find_lunar_dates', 'Find Gregorian dates on or after fromDate for a lunar month and day, or for a festival or solar term by name. Without lunarYear a lunar date repeats as a lunar birthday does: in the ordinary month even for someone born in a leap month, and on 廿九 when the month has no 三十; these are the dates a yearly lunar recurrence produces. With lunarYear it converts that one exact date, such as a birth date, and leap picks the leap month of that year. Each date lists its weekday, lunar date, lunar year and observances; a note explains a moved or missing date.',
      FindLunarDatesArguments, findLunarDatesProperties, [], false, async (actor, args) => {
        const lunarDate = args.month !== undefined || args.day !== undefined || args.leap !== undefined || args.lunarYear !== undefined;
        if (args.name !== undefined && lunarDate) invalid('name', 'name_or_lunar_date');
        if (args.name === undefined && (args.month === undefined || args.day === undefined)) invalid('month', 'name_or_lunar_date');
        if (args.leap !== undefined && args.lunarYear === undefined) invalid('leap', 'requires_lunar_year');
        const from = args.fromDate ?? localDateOf(new Date(), actor.timeZone);
        return { from, ...findLunarDates(args, from) };
      });
    this.register('list_recurring_series', 'Search repeating schedules (event and task series) by title. Each lists its rule and nextLocal, the next date computed from the rule even when not generated yet; null once the series has ended. Results are sorted by next date. A lunar series names its date in lunarDate. Birthday series have occasion birthday, and nextAge is the age on the next birthday (周岁, in lunar years for a lunar birthday). birthdays true returns only birthday series.',
      ListSeriesArguments, seriesListProperties, [], false, async (actor, args) => {
        const { rules } = await this.recurrence.listRules(actor.userId, actor.householdId);
        const series = rules.filter(rule => args.birthdays !== true || rule.occasion === 'birthday').map(({ updatedAt: _version, nextOccurrenceDate: next, ...rule }) => {
          const { age } = occurrenceFacts(rule, next);
          return {
            ...rule, nextLocal: next === null ? null : `${next} ${weekdayOf(next)}`,
            ...(rule.lunar === null ? {} : { lunarDate: formatAnchor(rule.lunar) }), ...(age === undefined ? {} : { nextAge: age }),
          };
        });
        return paginate(series, args);
      });
  }

  private registerEventTools(): void {
    this.register('create_event', 'Propose creating an event. Times must include UTC/offset. With allDay true, times are widened to whole local days in the user\'s time zone. Optional recurrence creates a series; do not infer missing times or recurrence scope.',
      CreateEventArguments, { ...eventProperties, ...recurrenceProperty }, ['title', 'startTime', 'endTime'], true,
      (actor, args) => this.events.create(actor.userId, actor.householdId, args),
      async (actor, args) => {
        await this.household(actor);
        if (Date.parse(args.endTime) <= Date.parse(args.startTime)) invalid('endTime', 'must_be_after_start');
      }, (args, timeZone) => normalizeSeriesStart(normalizeAllDay(args, timeZone)));
    this.register('update_event', 'Propose updating this event occurrence only; this does not change its series. Copy expectedUpdatedAt from get_event and expectedRuleUpdatedAt from recurrence.updatedAt for recurring occurrences. labelIds replaces labels.',
      UpdateEventArguments, { ...idProperties, ...occurrenceEditProperties, ...eventProperties, ...labelsProperty }, ['id', 'expectedUpdatedAt'], true,
      (actor, { id, ...args }) => this.events.update(actor.userId, actor.householdId, id, args),
      async (actor, args) => {
        const current = await this.events.getById(actor.userId, actor.householdId, args.id);
        await this.requireEdit(actor, current, args);
        this.requireChanges(args, ['id', 'expectedUpdatedAt', 'expectedRuleUpdatedAt']);
        if (Date.parse(args.endTime ?? current.endTime) <= Date.parse(args.startTime ?? current.startTime)) invalid('endTime', 'must_be_after_start');
      }, normalizeAllDay);
    this.register('delete_event', 'Propose deleting this event occurrence only. A recurring occurrence is cancelled, preserving its series. Read current event/rule versions before proposing.',
      DeleteOccurrenceArguments, { ...idProperties, ...occurrenceEditProperties }, ['id', 'expectedUpdatedAt'], true,
      async (actor, { id, ...version }) => {
        await this.events.delete(actor.userId, actor.householdId, id, version);
        return { id, deleted: true, scope: 'this_only' };
      }, async (actor, args) => this.requireEdit(actor, await this.events.getById(actor.userId, actor.householdId, args.id), args, true));
  }

  private registerTaskTools(): void {
    this.register('create_task', 'Propose creating a task. Resolve assignee user IDs through household_members. Optional recurrence creates a series.',
      CreateTaskArguments, { ...taskProperties, ...recurrenceProperty }, ['title'], true,
      (actor, args) => this.tasks.create(actor.userId, actor.householdId, args),
      async (actor, args) => { await this.household(actor); validateDueDate(args.dueDate); }, normalizeDueDate);
    this.register('update_task', 'Propose updating this task occurrence only, including completion status, assignees or labels. Copy current task/rule versions from get_task. Empty arrays clear assignees/labels; empty dueDate clears the date. This does not change the series.',
      UpdateTaskArguments, { ...idProperties, ...occurrenceEditProperties, ...taskProperties, ...labelsProperty }, ['id', 'expectedUpdatedAt'], true,
      (actor, { id, ...args }) => this.tasks.update(actor.userId, actor.householdId, id, args),
      async (actor, args) => {
        await this.requireEdit(actor, await this.tasks.getById(actor.userId, actor.householdId, args.id), args);
        this.requireChanges(args, ['id', 'expectedUpdatedAt', 'expectedRuleUpdatedAt']);
        validateDueDate(args.dueDate);
      }, normalizeDueDate);
    this.register('delete_task', 'Propose deleting this task occurrence only; a recurring occurrence becomes cancelled and its series is retained. Read current task/rule versions before proposing.',
      DeleteOccurrenceArguments, { ...idProperties, ...occurrenceEditProperties }, ['id', 'expectedUpdatedAt'], true,
      async (actor, { id, ...version }) => {
        await this.tasks.delete(actor.userId, actor.householdId, id, version);
        return { id, deleted: true, scope: 'this_only' };
      }, async (actor, args) => this.requireEdit(actor, await this.tasks.getById(actor.userId, actor.householdId, args.id), args, true));
  }

  private registerNoteTools(): void {
    this.register('create_note', 'Propose creating a Markdown note.',
      CreateNoteArguments, noteProperties, ['title'], true,
      (actor, args) => this.notes.create(actor.userId, actor.householdId, args), async actor => { await this.household(actor); });
    this.register('update_note', 'Propose updating a note. Copy expectedUpdatedAt from get_note. Body replaces the entire Markdown body; read all chunks first to preserve content when editing part of a note.',
      UpdateNoteArguments, { ...idProperties, ...editProperties, ...noteProperties }, ['id', 'expectedUpdatedAt'], true,
      (actor, { id, ...args }) => this.notes.update(actor.userId, actor.householdId, id, args),
      async (actor, args) => {
        await this.requireEdit(actor, await this.notes.getById(actor.userId, actor.householdId, args.id), args);
        this.requireChanges(args, ['id', 'expectedUpdatedAt']);
      });
    this.register('delete_note', 'Propose deleting a note. Copy expectedUpdatedAt from the current get_note result.',
      DeleteContentArguments, { ...idProperties, ...editProperties }, ['id', 'expectedUpdatedAt'], true,
      async (actor, { id, ...version }) => { await this.notes.delete(actor.userId, actor.householdId, id, version); return { id, deleted: true }; },
      async (actor, args) => this.requireEdit(actor, await this.notes.getById(actor.userId, actor.householdId, args.id), args, true));
  }

  private registerLabelTools(): void {
    this.register('create_label', 'Propose creating a household label. Only owners and admins may manage labels.',
      CreateLabelArguments, labelProperties, ['name', 'color'], true,
      (actor, args) => this.labels.create(actor.userId, actor.householdId, args), async actor => this.requireLabelAdmin(actor));
    this.register('update_label', 'Propose updating a household label. Copy expectedName and expectedColor from get_label; they protect against changing a label that was modified after reading it.',
      UpdateLabelArguments, { ...idProperties, ...labelSnapshotProperties, ...labelProperties }, ['id', 'expectedName', 'expectedColor'], true,
      (actor, { id, expectedName, expectedColor, ...args }) => this.labels.update(actor.userId, actor.householdId, id, args, { name: expectedName, color: expectedColor }),
      async (actor, args) => {
        await this.requireLabelSnapshot(actor, args);
        this.requireChanges(args, ['id', 'expectedName', 'expectedColor']);
      });
    this.register('delete_label', 'Propose deleting a household label and removing its assignments from events and tasks. Copy the current expectedName and expectedColor from get_label.',
      DeleteLabelArguments, { ...idProperties, ...labelSnapshotProperties }, ['id', 'expectedName', 'expectedColor'], true,
      async (actor, args) => {
        await this.labels.delete(actor.userId, actor.householdId, args.id, { name: args.expectedName, color: args.expectedColor });
        return { id: args.id, deleted: true };
      }, (actor, args) => this.requireLabelSnapshot(actor, args));
  }

  private async household(actor: AssistantActor): Promise<Household> {
    const household = await this.households.getHousehold(actor.userId, actor.householdId);
    if (household === null) throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });
    return household;
  }

  private async requireEdit(actor: AssistantActor, current: ContentVersion, expected: ExpectedVersion, deleting = false): Promise<void> {
    const household = await this.household(actor);
    const member = household.members.find(value => value.userId === actor.userId);
    if (!member) throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });
    if (deleting && member.role === 'MEMBER' && current.createdBy !== actor.userId) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Only the creator, admin, or owner can delete this content.' });
    }
    assertEditVersion(new Date(current.updatedAt), expected.expectedUpdatedAt);
    if (current.recurrence) assertEditVersion(new Date(current.recurrence.updatedAt), expected.expectedRuleUpdatedAt, 'expectedRuleUpdatedAt');
  }

  private async label(actor: AssistantActor, id: string) {
    const label = (await this.labels.list(actor.userId, actor.householdId)).labels.find(value => value.id === id);
    if (!label) throw new NotFoundException({ code: 'LABEL_NOT_FOUND', message: 'Label not found.' });
    return label;
  }

  private async requireLabelAdmin(actor: AssistantActor): Promise<void> {
    const household = await this.household(actor);
    const member = household.members.find(value => value.userId === actor.userId);
    if (!member) throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });
    if (member.role === 'MEMBER') throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Only admins and owners can manage labels.' });
  }

  private async requireLabelSnapshot(actor: AssistantActor, args: DeleteLabelArguments): Promise<void> {
    await this.requireLabelAdmin(actor);
    const current = await this.label(actor, args.id);
    if (current.name !== args.expectedName || current.color !== args.expectedColor) {
      throw new ConflictException({ code: 'EDIT_CONFLICT', message: 'Label has changed. Read it again before proposing a change.' });
    }
  }

  private requireChanges(args: object, metadata: string[]): void {
    if (!Object.entries(args).some(([key, value]) => value !== undefined && !metadata.includes(key))) invalid('arguments', 'no_changes');
  }
}
