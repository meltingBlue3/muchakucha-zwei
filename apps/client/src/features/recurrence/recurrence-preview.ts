import type { RecurrenceRuleListItemDto } from '@muchakucha/api-client';

const DAY = 86400000;
const iso = (date: Date) => date.toISOString().slice(0, 10);
const utc = (value: string) => new Date(`${value}T00:00:00Z`);
const clamp = (year: number, month: number, day: number) => new Date(Date.UTC(year, month, Math.min(day, new Date(Date.UTC(year, month + 1, 0)).getUTCDate())));

/** Calendar-date preview only: the server supplies the first upcoming date,
 * while bounds and count remain anchored to the original series start. */
export function recurrencePreview(rule: RecurrenceRuleListItemDto, limit = 5): string[] {
  if (!rule.nextOccurrenceDate || rule.interval < 1 || (rule.count !== null && rule.count <= 0)) return [];
  const start = utc(rule.startsOn);
  if (Number.isNaN(start.getTime())) return [];
  const selected = [...new Set(rule.byWeekday.length ? rule.byWeekday : [start.getUTCDay()])].sort((a, b) => a - b);
  const weekStart = start.getTime() - start.getUTCDay() * DAY;
  const result: string[] = [];
  let count = 0;
  for (let step = 0; step < 20000; step++) {
    const dates = rule.freq === 'daily' ? [new Date(start.getTime() + step * rule.interval * DAY)]
      : rule.freq === 'weekly' ? selected.map(day => new Date(weekStart + (step * rule.interval * 7 + day) * DAY))
      : rule.freq === 'monthly' ? [clamp(start.getUTCFullYear(), start.getUTCMonth() + step * rule.interval, start.getUTCDate())]
      : rule.freq === 'yearly' ? [clamp(start.getUTCFullYear() + step * rule.interval, start.getUTCMonth(), start.getUTCDate())]
      : [];
    if (!dates.length) break;
    for (const candidate of dates) {
      if (Number.isNaN(candidate.getTime())) return result;
      const date = iso(candidate);
      if (date < rule.startsOn) continue;
      if (rule.endsOn && date > rule.endsOn) return result;
      count++;
      if (rule.count !== null && count > rule.count) return result;
      if (date >= rule.nextOccurrenceDate) result.push(date);
      if (result.length >= limit) return result;
    }
  }
  return result;
}
