import { i18n } from '../../i18n';

export type RecurringFilterKey = 'all' | 'recurring';

export const RECURRING_FILTERS = ['all', 'recurring'] as const;

export function recurringFilterAccessibilityLabel(key: RecurringFilterKey): string {
  return i18n.t('recurrence:filter.name', { label: i18n.t(`recurrence:filter.${key}`) });
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

export function generationBehindHeading(): string { return i18n.t('recurrence:generationBehindTitle'); }
export function generationBehindBody(): string { return i18n.t('recurrence:generationBehindBody'); }
export function generationAheadNote(): string { return i18n.t('recurrence:generationAhead'); }
export function recurringEmptyTasks(): string { return i18n.t('recurrence:emptyTasks'); }
export function recurringEmptyEvents(): string { return i18n.t('recurrence:emptyEvents'); }
