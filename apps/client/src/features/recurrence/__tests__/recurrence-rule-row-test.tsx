import type { RecurrenceRuleListItemDto } from '@muchakucha/api-client';
import { render } from '@testing-library/react-native';

import { MuchakuchaThemeProvider } from '../../../ui/primitives';
import { RecurrenceKindBadge } from '../recurrence-kind-badge';
import { recurrenceInputFromResponse } from '../recurrence-picker';
import { formatRecurrenceSummary } from '../recurrence-summary';
import { formatRuleRow, nextDayIsoIn, RecurrenceRuleRow } from '../recurrence-rule-row';

const TZ = 'Asia/Shanghai';

// The RESPONSE shape: absent bounds are `null`, not `undefined`. Every
// fixture below keeps that shape on purpose — it is the trap the module
// exists to defuse.
const baseRule: RecurrenceRuleListItemDto = {
  id: 'rule-1',
  kind: 'task',
  title: '倒垃圾',
  freq: 'weekly',
  interval: 1,
  byWeekday: [2, 4, 6],
  startsOn: '2026-08-12',
  endsOn: null,
  count: null,
  timezone: TZ,
  startTimeLocal: null,
  durationMinutes: null,
  nextOccurrenceDate: '2026-08-18',
};

describe('formatRuleRow — null normalization and the never-ends suffix', () => {
  test('never renders a literal null when both bounds are absent, and appends 永不结束', () => {
    const formatted = formatRuleRow(baseRule, TZ);

    expect(formatted.summary).not.toMatch(/null/);
    expect(formatted.summary).toBe('每周二、四、六重复，永不结束');
    expect(formatted.summary.endsWith('，永不结束')).toBe(true);
  });

  test('omits the 永不结束 suffix when the rule has an end date', () => {
    const formatted = formatRuleRow({ ...baseRule, endsOn: '2027-08-12' }, TZ);

    expect(formatted.summary).toBe('每周二、四、六重复，到 2027-08-12 为止');
    expect(formatted.summary).not.toContain('永不结束');
  });

  test('omits the 永不结束 suffix when the rule has a count', () => {
    const formatted = formatRuleRow({ ...baseRule, count: 10 }, TZ);

    expect(formatted.summary).toBe('每周二、四、六重复，共 10 次');
    expect(formatted.summary).not.toContain('永不结束');
  });

  test('derives its summary from the same source the detail block uses', () => {
    // The row and the detail screen must agree word for word; the only
    // permitted difference is the appended 永不结束 suffix.
    const shared = formatRecurrenceSummary(recurrenceInputFromResponse(baseRule)!, TZ);

    expect(formatRuleRow(baseRule, TZ).summary.startsWith(shared.summary)).toBe(true);
  });
});

describe('formatRuleRow — next occurrence and ended state', () => {
  test('renders the server-computed next occurrence when one exists', () => {
    const formatted = formatRuleRow(baseRule, TZ);

    expect(formatted.nextLine).toBe('下一次 2026-08-18');
    expect(formatted.ended).toBe(false);
  });

  test('renders the ended copy — never a blank, a null, or a placeholder dash', () => {
    const formatted = formatRuleRow({ ...baseRule, nextOccurrenceDate: null }, TZ);

    expect(formatted.nextLine).toBe('这个重复已经结束');
    expect(formatted.ended).toBe(true);
    expect(formatted.nextLine).not.toMatch(/null|—|-{2,}/);
  });
});

describe('formatRuleRow — kind label and accessible name', () => {
  test('labels a task rule and leads its accessible name with that word', () => {
    const formatted = formatRuleRow(baseRule, TZ);

    expect(formatted.kindLabel).toBe('任务');
    expect(formatted.accessibilityLabel.startsWith('任务')).toBe(true);
    expect(formatted.accessibilityLabel).toBe(
      '任务周期规则：倒垃圾，每周二、四、六重复，永不结束',
    );
  });

  test('labels an event rule and leads its accessible name with that word', () => {
    const formatted = formatRuleRow({ ...baseRule, kind: 'event' }, TZ);

    expect(formatted.kindLabel).toBe('事件');
    expect(formatted.accessibilityLabel.startsWith('事件')).toBe(true);
  });

  test('degrades to a type-free accessible name when the kind cannot be derived', () => {
    const formatted = formatRuleRow({ ...baseRule, kind: null }, TZ);

    expect(formatted.kindLabel).toBeNull();
    expect(formatted.accessibilityLabel).toBe('周期规则：倒垃圾，每周二、四、六重复，永不结束');
  });
});

describe('formatRuleRow — notes carried through from the shared summary', () => {
  test('notes the rule timezone only when it differs from the device', () => {
    expect(formatRuleRow(baseRule, TZ).timeZoneNote).toBeNull();
    expect(formatRuleRow(baseRule, 'Europe/Berlin').timeZoneNote).toBe(
      '按 Asia/Shanghai 的日期重复。',
    );
  });

  test('explains month-end clamping for a monthly rule starting on the 29th or later', () => {
    expect(
      formatRuleRow({ ...baseRule, freq: 'monthly', startsOn: '2026-08-31' }, TZ).clampNote,
    ).toBe('有些月份没有这一天，会自动改到当月最后一天。');
    expect(
      formatRuleRow({ ...baseRule, freq: 'monthly', startsOn: '2026-08-12' }, TZ).clampNote,
    ).toBeNull();
  });
});

describe('nextDayIsoIn — the split anchor', () => {
  test('reads the calendar day in the rule timezone, not the device one', () => {
    // 20:00 UTC is already the 13th in Shanghai (UTC+8), so tomorrow is the 14th.
    expect(nextDayIsoIn('Asia/Shanghai', new Date('2026-08-12T20:00:00Z'))).toBe('2026-08-14');
    // 05:00 UTC is still the 11th in Midway (UTC-11), so tomorrow is the 12th.
    expect(nextDayIsoIn('Pacific/Midway', new Date('2026-08-12T05:00:00Z'))).toBe('2026-08-12');
  });

  test('rolls over a month end', () => {
    expect(nextDayIsoIn('UTC', new Date('2026-08-31T12:00:00Z'))).toBe('2026-09-01');
  });

  test('rolls over a year end', () => {
    expect(nextDayIsoIn('UTC', new Date('2026-12-31T12:00:00Z'))).toBe('2027-01-01');
  });
});

describe('RecurrenceRuleRow', () => {
  const renderRow = async (rule: RecurrenceRuleListItemDto) =>
    render(
      <MuchakuchaThemeProvider>
        <RecurrenceRuleRow rule={rule} deviceTimeZone={TZ} onPress={() => undefined} />
      </MuchakuchaThemeProvider>,
    );

  test('renders the badge, template title, summary, and next occurrence', async () => {
    const view = await renderRow(baseRule);

    expect(view.getByText('任务')).toBeTruthy();
    expect(view.getByText('倒垃圾')).toBeTruthy();
    expect(view.getByText('每周二、四、六重复，永不结束')).toBeTruthy();
    expect(view.getByText('下一次 2026-08-18')).toBeTruthy();
    expect(view.getByLabelText('任务周期规则：倒垃圾，每周二、四、六重复，永不结束')).toBeTruthy();
  });

  test('keeps the long title to two lines while the accessible name keeps it whole', async () => {
    const longTitle = '把楼下所有可回收的纸箱压扁然后搬到小区西门的回收站再登记一次';
    const view = await renderRow({ ...baseRule, title: longTitle });

    expect(view.getByText(longTitle).props.numberOfLines).toBe(2);
    expect(view.getByLabelText(new RegExp(longTitle))).toBeTruthy();
  });

  test('says an ended rule has ended in words, not only through opacity', async () => {
    const view = await renderRow({ ...baseRule, nextOccurrenceDate: null });

    expect(view.getByText('这个重复已经结束')).toBeTruthy();
  });

  test('omits the badge entirely when the kind cannot be derived', async () => {
    const view = await renderRow({ ...baseRule, kind: null });

    expect(view.queryByText('任务')).toBeNull();
    expect(view.queryByText('事件')).toBeNull();
    expect(view.getByText('倒垃圾')).toBeTruthy();
  });
});

describe('RecurrenceKindBadge', () => {
  test('carries its semantics in text, so colour is never the only cue', async () => {
    const view = await render(
      <MuchakuchaThemeProvider>
        <RecurrenceKindBadge kind="event" />
      </MuchakuchaThemeProvider>,
    );

    expect(view.getByText('事件')).toBeTruthy();
  });
});
