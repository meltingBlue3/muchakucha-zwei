import type { SeriesScopeMode } from './series-scope-sheet';

/**
 * The shape both a `RecurrenceResponseDto` (server truth) and a
 * `RecurrenceDto` (form value) can be compared through.
 */
interface ComparableRule {
  freq: string;
  /** Accepted but never compared — see `canonicalize`. */
  startsOn?: string | null | undefined;
  interval?: number | null | undefined;
  byWeekday?: number[] | null | undefined;
  endsOn?: string | null | undefined;
  count?: number | null | undefined;
  timezone: string;
  startTimeLocal?: string | null | undefined;
  durationMinutes?: number | null | undefined;
}

interface CanonicalRule {
  freq: string;
  interval: number;
  byWeekday: number[];
  endsOn: string | null;
  count: number | null;
  timezone: string;
  startTimeLocal: string | null;
  durationMinutes: number | null;
}

/**
 * `startsOn` is deliberately excluded.
 *
 * RecurrencePicker rewrites the form value's `startsOn` to the date of the
 * occurrence being edited, while the response carries the *rule's* start date.
 * The two therefore differ for every occurrence after the series start — and
 * for the first one too whenever `byWeekday` pushes the first materialized
 * occurrence past `startsOn`. Comparing it classified every recurring edit as
 * a rule change, which greys out 仅此一次 and makes per-occurrence edits
 * unreachable (D-07).
 *
 * Optional/absent, null and default values are folded together so that key
 * order and `undefined`-vs-`null` differences between the two shapes cannot
 * masquerade as a rule change either.
 */
function canonicalize(rule: ComparableRule | null | undefined): CanonicalRule | null {
  if (rule === null || rule === undefined) return null;
  return {
    freq: rule.freq,
    interval: rule.interval ?? 1,
    byWeekday: [...(rule.byWeekday ?? [])].sort((left, right) => left - right),
    endsOn: rule.endsOn ?? null,
    count: rule.count ?? null,
    timezone: rule.timezone,
    startTimeLocal: rule.startTimeLocal ?? null,
    durationMinutes: rule.durationMinutes ?? null,
  };
}

/**
 * Classifies a save on a recurring occurrence: `rule-change` only when the
 * recurrence rule itself actually changed, otherwise a plain `edit` that may
 * still be applied to just this occurrence.
 */
export function seriesScopeModeFor(
  current: ComparableRule | null | undefined,
  next: ComparableRule | null | undefined,
): SeriesScopeMode {
  return JSON.stringify(canonicalize(current)) === JSON.stringify(canonicalize(next))
    ? 'edit'
    : 'rule-change';
}
