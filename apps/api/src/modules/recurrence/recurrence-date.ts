/** Pure calendar arithmetic. No Nest, no Prisma, no I/O. */
export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

export interface WalkRule {
  freq: string;
  interval: number;
  byWeekday?: number[];
  startsOn: CalendarDate;
  endsOn?: CalendarDate | null;
  count?: number | null;
}

export const RECURRENCE_MAX_INSTANCES_PER_RUN = 400;

/**
 * Safety net for the candidate enumeration itself. The walk visits every
 * occurrence from `startsOn` so `count` keeps its absolute series index, while
 * `options.from` decides which of those are emitted — the enumeration is
 * therefore longer than the emitted slice for an old rule.
 */
export const RECURRENCE_MAX_WALK_STEPS = 20_000;

export interface WalkOptions {
  horizon: CalendarDate;
  /**
   * Lower bound for emitted occurrences (inclusive). Occurrences before it are
   * still enumerated — so `count` stays anchored to the start of the series —
   * but they do not consume the per-run cap. Without it the cap always kept
   * the OLDEST occurrences and long-lived rules stopped extending forever.
   */
  from?: CalendarDate;
}

interface WalkState {
  /** Occurrences enumerated since `startsOn`, emitted or skipped. */
  enumerated: number;
}

export function parseIsoDate(iso: string): CalendarDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (match === null) throw new Error('invalid ISO calendar date');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new Error('invalid ISO calendar date');
  }
  return { year, month, day };
}

export function formatIsoDate(date: CalendarDate): string {
  return `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function compareDates(left: CalendarDate, right: CalendarDate): number {
  return formatIsoDate(left).localeCompare(formatIsoDate(right));
}

export function addDays(from: CalendarDate, amount: number): CalendarDate {
  let year = from.year;
  let month = from.month;
  let day = from.day;
  const direction = Math.sign(amount);
  for (let remaining = Math.abs(amount); remaining > 0; remaining -= 1) {
    day += direction;
    if (direction > 0 && day > daysInMonth(year, month)) {
      day = 1;
      month += 1;
      if (month > 12) { month = 1; year += 1; }
    } else if (direction < 0 && day < 1) {
      month -= 1;
      if (month < 1) { month = 12; year -= 1; }
      day = daysInMonth(year, month);
    }
  }
  return { year, month, day };
}

export function clampDay(year: number, month: number, anchorDay: number): CalendarDate {
  return { year, month, day: Math.min(anchorDay, daysInMonth(year, month)) };
}

export function addMonths(from: CalendarDate, months: number, anchorDay: number): CalendarDate {
  const zeroBasedMonth = from.month - 1 + months;
  const year = from.year + Math.floor(zeroBasedMonth / 12);
  const month = ((zeroBasedMonth % 12) + 12) % 12 + 1;
  return clampDay(year, month, anchorDay);
}

export function addYears(
  from: CalendarDate,
  years: number,
  anchorMonth: number,
  anchorDay: number,
): CalendarDate {
  return clampDay(from.year + years, anchorMonth, anchorDay);
}

export function addWeeks(from: CalendarDate, weeks: number): CalendarDate {
  return addDays(from, weeks * 7);
}

function weekday(date: CalendarDate): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

export function nextWeekdayOnOrAfter(from: CalendarDate, targetWeekday: number): CalendarDate {
  const daysAhead = (targetWeekday - weekday(from) + 7) % 7;
  return addDays(from, daysAhead);
}

function mayInclude(rule: WalkRule, date: CalendarDate, horizon: CalendarDate): boolean {
  return compareDates(date, horizon) <= 0 &&
    (rule.endsOn == null || compareDates(date, rule.endsOn) <= 0);
}

function appendOccurrence(
  occurrences: CalendarDate[],
  rule: WalkRule,
  date: CalendarDate,
  options: WalkOptions,
  state: WalkState,
): boolean {
  if (!mayInclude(rule, date, options.horizon)) return false;
  state.enumerated += 1;
  if (options.from === undefined || compareDates(date, options.from) >= 0) {
    occurrences.push(date);
  }
  return occurrences.length < RECURRENCE_MAX_INSTANCES_PER_RUN &&
    (rule.count == null || state.enumerated < rule.count);
}

export function walkOccurrences(rule: WalkRule, options: WalkOptions): CalendarDate[] {
  const occurrences: CalendarDate[] = [];
  const state: WalkState = { enumerated: 0 };
  if (rule.count !== null && rule.count !== undefined && rule.count <= 0) return occurrences;

  if (rule.freq === 'daily') {
    let current = rule.startsOn;
    for (let step = 0; step < RECURRENCE_MAX_WALK_STEPS; step += 1) {
      if (!mayInclude(rule, current, options.horizon)) break;
      if (!appendOccurrence(occurrences, rule, current, options, state)) break;
      current = addDays(current, rule.interval);
    }
    return occurrences;
  }

  if (rule.freq === 'weekly') {
    const startsOnWeekday = weekday(rule.startsOn);
    const selected = [...new Set(
      (rule.byWeekday?.length === 0 || rule.byWeekday === undefined)
        ? [startsOnWeekday]
        : rule.byWeekday.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
    )].sort((left, right) => left - right);
    const firstWeekStart = addDays(rule.startsOn, -startsOnWeekday);

    for (let weekIndex = 0; weekIndex < RECURRENCE_MAX_WALK_STEPS; weekIndex += 1) {
      const weekStart = addWeeks(firstWeekStart, weekIndex * rule.interval);
      if (!mayInclude(rule, weekStart, options.horizon) && compareDates(weekStart, options.horizon) > 0) break;
      for (const selectedWeekday of selected) {
        const candidate = nextWeekdayOnOrAfter(weekStart, selectedWeekday);
        if (compareDates(candidate, rule.startsOn) < 0) continue;
        if (!mayInclude(rule, candidate, options.horizon)) {
          if (compareDates(candidate, options.horizon) > 0 ||
            (rule.endsOn != null && compareDates(candidate, rule.endsOn) > 0)) return occurrences;
          continue;
        }
        if (!appendOccurrence(occurrences, rule, candidate, options, state)) return occurrences;
      }
    }
    return occurrences;
  }

  if (rule.freq === 'monthly') {
    for (let index = 0; index < RECURRENCE_MAX_WALK_STEPS; index += 1) {
      const candidate = addMonths(rule.startsOn, index * rule.interval, rule.startsOn.day);
      if (!mayInclude(rule, candidate, options.horizon)) break;
      if (!appendOccurrence(occurrences, rule, candidate, options, state)) break;
    }
    return occurrences;
  }

  if (rule.freq === 'yearly') {
    for (let index = 0; index < RECURRENCE_MAX_WALK_STEPS; index += 1) {
      const candidate = addYears(
        rule.startsOn,
        index * rule.interval,
        rule.startsOn.month,
        rule.startsOn.day,
      );
      if (!mayInclude(rule, candidate, options.horizon)) break;
      if (!appendOccurrence(occurrences, rule, candidate, options, state)) break;
    }
  }
  return occurrences;
}

/**
 * Computes a rule's next occurrence ON OR AFTER `from` by walking the rule,
 * not by querying already-generated rows. Under D-11's per-frequency
 * lookahead a healthy weekly rule routinely has zero future instance rows —
 * the generation window only materializes what's due soon, but "when is this
 * rule due next" is a question about the RULE, independent of how far
 * generation has run. Querying rows would answer "empty" for a perfectly
 * healthy rule.
 *
 * `lookaheadDays = 400` covers a yearly rule from any `from` date: the walk
 * only needs to see one year ahead in the worst case, and 400 leaves margin
 * for a `from` that lands just after this year's anniversary.
 */
export function nextOccurrenceFor(
  rule: WalkRule,
  from: CalendarDate,
  lookaheadDays = 400,
): CalendarDate | null {
  const occurrences = walkOccurrences(rule, { horizon: addDays(from, lookaheadDays), from });
  return occurrences[0] ?? null;
}

/**
 * The current calendar date in `timeZone`. D-11 anchors the generation window
 * on the RULE's local midnight, not the server's — a 0-day daily lookahead in
 * Asia/Shanghai must produce today's row at 00:00 CST, not at 08:00 CST when
 * the UTC date finally rolls over.
 *
 * `en-CA` renders as YYYY-MM-DD, which `parseIsoDate` already validates. The
 * default `now` parameter is the only clock-injection seam tests get — do not
 * turn this into constructor-injected clock plumbing.
 */
export function currentCalendarDateIn(timeZone: string, now: Date = new Date()): CalendarDate {
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return parseIsoDate(iso);
}

function offsetMinutesAt(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const zone = parts.find((part) => part.type === 'timeZoneName')?.value;
  // Intl renders a zero offset as the bare string "GMT" (or "UTC" in some ICU
  // builds), which the offset pattern below deliberately does not match.
  if (zone === 'GMT' || zone === 'UTC') return 0;
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(zone ?? '');
  // Anything else is unparsed, not UTC. Silently treating it as UTC would
  // reinterpret every occurrence in that zone by whole hours with no log line.
  if (match === null) {
    throw new Error(`unresolvable UTC offset for time zone ${timeZone} (got ${String(zone)})`);
  }
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
}

/**
 * Resolves a local wall time to an instant.
 *
 * DST policy (RFC 5545 §3.3.5):
 *
 * - **Nonexistent times (spring-forward gap).** `2027-03-14 02:30` does not
 *   exist in `America/New_York`; clocks jump 02:00 EST → 03:00 EDT. Such a
 *   time is shifted FORWARD by the length of the gap, so it resolves to
 *   03:30 EDT. Returning the naive two-pass result instead would land at
 *   01:30 EST — an hour *earlier* than the requested wall time.
 * - **Ambiguous times (fall-back overlap).** `2027-11-07 01:30` happens twice.
 *   The FIRST (pre-transition, still-DST) occurrence is used, which is what
 *   the two-pass resolution naturally yields.
 */
export function localDateTimeToInstant(date: CalendarDate, hour: number, minute: number, timeZone: string): Date {
  const naive = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
  // Pass 1 uses the offset in effect at the naive instant (the offset BEFORE a
  // transition), pass 2 re-resolves at that candidate.
  const first = naive - offsetMinutesAt(naive, timeZone) * 60_000;
  const resolved = naive - offsetMinutesAt(first, timeZone) * 60_000;
  // A valid wall time is a fixed point: re-applying the offset in effect at
  // `resolved` must reproduce `resolved`. Inside a spring-forward gap no fixed
  // point exists, and `first` is exactly the requested wall time shifted
  // forward by the gap — the RFC 5545 answer.
  const isFixedPoint = naive - offsetMinutesAt(resolved, timeZone) * 60_000 === resolved;
  return new Date(isFixedPoint ? resolved : first);
}
