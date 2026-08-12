import {
  applyRecurringFilter,
  classifyGenerationWindow,
  GENERATION_AHEAD_NOTE,
  GENERATION_BEHIND_BODY,
  GENERATION_BEHIND_HEADING,
  isRecurringInstance,
  RECURRING_EMPTY_EVENTS,
  RECURRING_EMPTY_TASKS,
} from '../recurring-filter';

describe('isRecurringInstance', () => {
  test('true when recurrenceRuleId is a non-empty string', () => {
    expect(isRecurringInstance({ recurrenceRuleId: 'rule-1' })).toBe(true);
  });

  test.each([
    [{ recurrenceRuleId: null }],
    [{ recurrenceRuleId: undefined }],
    [{}],
  ])('false for %j', (item) => {
    expect(isRecurringInstance(item)).toBe(false);
  });
});

describe('applyRecurringFilter', () => {
  const items = [
    { id: 'a', recurrenceRuleId: 'r1' },
    { id: 'b', recurrenceRuleId: null },
    { id: 'c', recurrenceRuleId: 'r2' },
  ];

  test("'all' returns items unchanged and in order", () => {
    expect(applyRecurringFilter(items, 'all')).toEqual(items);
  });

  test("'recurring' keeps only items whose recurrenceRuleId is non-null, preserving order", () => {
    expect(applyRecurringFilter(items, 'recurring')).toEqual([
      { id: 'a', recurrenceRuleId: 'r1' },
      { id: 'c', recurrenceRuleId: 'r2' },
    ]);
  });
});

describe('classifyGenerationWindow', () => {
  test("materializedThrough null is always 'none'", () => {
    expect(
      classifyGenerationWindow({
        materializedThrough: null,
        todayIso: '2026-08-13',
        viewedDateIso: '2026-08-20',
        filtersActive: false,
      }),
    ).toBe('none');
  });

  test("any active filter is always 'none'", () => {
    expect(
      classifyGenerationWindow({
        materializedThrough: '2026-08-10',
        todayIso: '2026-08-13',
        viewedDateIso: '2026-08-20',
        filtersActive: true,
      }),
    ).toBe('none');
  });

  test("today later than the watermark is 'behind', even when the viewed date is also later", () => {
    expect(
      classifyGenerationWindow({
        materializedThrough: '2026-08-10',
        todayIso: '2026-08-13',
        viewedDateIso: '2026-08-20',
        filtersActive: false,
      }),
    ).toBe('behind');
  });

  test("today not later, but the viewed date is later, yields 'ahead'", () => {
    expect(
      classifyGenerationWindow({
        materializedThrough: '2026-08-15',
        todayIso: '2026-08-13',
        viewedDateIso: '2026-08-20',
        filtersActive: false,
      }),
    ).toBe('ahead');
  });

  test("viewedDateIso null never yields 'ahead'", () => {
    expect(
      classifyGenerationWindow({
        materializedThrough: '2026-08-10',
        todayIso: '2026-08-08',
        viewedDateIso: null,
        filtersActive: false,
      }),
    ).toBe('none');
  });

  test("neither today nor the viewed date later than the watermark is 'none'", () => {
    expect(
      classifyGenerationWindow({
        materializedThrough: '2026-08-15',
        todayIso: '2026-08-13',
        viewedDateIso: '2026-08-14',
        filtersActive: false,
      }),
    ).toBe('none');
  });
});

describe('generation-window and recurring-filter copy', () => {
  test('never contains an arabic digit', () => {
    const combined = [
      GENERATION_BEHIND_HEADING,
      GENERATION_BEHIND_BODY,
      GENERATION_AHEAD_NOTE,
      RECURRING_EMPTY_TASKS,
      RECURRING_EMPTY_EVENTS,
    ].join('');
    expect(combined).toMatch(/^[^0-9]*$/);
  });
});
