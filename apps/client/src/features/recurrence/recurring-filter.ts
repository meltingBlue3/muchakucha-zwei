/**
 * Pure, Jest-reachable module for the "recurring-only" filter (D-15) and
 * the two-state generation-window classifier (D-19). No React, React
 * Native, or Restyle imports — this must be callable with zero rendering.
 */

export type RecurringFilterKey = 'all' | 'recurring';

export const RECURRING_FILTERS: readonly { key: RecurringFilterKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'recurring', label: '仅看周期性' },
];

export const RECURRING_FILTER_GROUP_LABEL = '重复';

export function recurringFilterAccessibilityLabel(key: RecurringFilterKey): string {
  return key === 'all' ? '重复筛选：全部' : '重复筛选：仅看周期性';
}

export function isRecurringInstance(item: {
  recurrenceRuleId?: string | null | undefined;
}): boolean {
  return item.recurrenceRuleId !== null && item.recurrenceRuleId !== undefined;
}

export function applyRecurringFilter<T extends { recurrenceRuleId?: string | null | undefined }>(
  items: readonly T[],
  filter: RecurringFilterKey,
): T[] {
  if (filter === 'all') return [...items];
  return items.filter(isRecurringInstance);
}

export type GenerationWindowState = 'behind' | 'ahead' | 'none';

export function classifyGenerationWindow(input: {
  materializedThrough: string | null;
  todayIso: string;
  viewedDateIso: string | null;
  filtersActive: boolean;
}): GenerationWindowState {
  const { materializedThrough, todayIso, viewedDateIso, filtersActive } = input;
  if (materializedThrough === null || filtersActive) return 'none';
  if (todayIso > materializedThrough) return 'behind';
  if (viewedDateIso !== null && viewedDateIso > materializedThrough) return 'ahead';
  return 'none';
}

// Copy — every string below is copied byte-for-byte from
// 07-UI-SPEC.md (Copywriting table, D-19 and D-15 addendum rows).
export const GENERATION_BEHIND_HEADING = '重复安排还在补齐';
export const GENERATION_BEHIND_BODY =
  '周期性安排会在临近日期时自动生成，这一轮还没跑完。稍后下拉刷新就能看到。';
export const GENERATION_AHEAD_NOTE =
  '周期性安排会在临近日期时才生成，更远的重复还没出现在这里。';
export const RECURRING_EMPTY_TASKS =
  '还没有周期性任务。创建任务时打开"重复"，它就会出现在这里。';
export const RECURRING_EMPTY_EVENTS = '这一天没有周期性安排。';
