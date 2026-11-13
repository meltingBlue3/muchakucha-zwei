import { useTranslation } from '../../i18n';
import type { RecurrenceRuleListItemDto } from '@muchakucha/api-client';
import { useTheme } from '@shopify/restyle';
import { Pressable, View } from 'react-native';

import { Stack, Text } from '../../ui/primitives';
import type { Theme } from '../../ui/theme';
import { RecurrenceKindBadge, recurrenceKindLabel } from './recurrence-kind-badge';
import { recurrenceInputFromResponse } from './recurrence-options';
import { formatRecurrenceSummary } from './recurrence-summary';
import { useDesktop } from '../../ui/use-desktop';
import { formatDate, parseDateValue, toDateValue } from '../../ui/date-values';
import { insetFocusRing } from '../../platform/focus-ring/focus-ring';
import CalendarDays from 'lucide-react-native/icons/calendar-days';
import CircleCheck from 'lucide-react-native/icons/circle-check';

const NEVER_ENDS_SUFFIX = '，永不结束';
const ENDED_LINE = '这个重复已经结束';
const NEXT_PREFIX = '下一次 ';

/**
 * The split anchor used by the rule detail screen: "tomorrow" in the RULE's
 * own timezone, which is exactly the anchor the server uses for both the
 * rule-level edit (07-13) and the rule-level end (07-12).
 *
 * The device's local timezone must not participate: the calendar day is read
 * out of `timeZone` first, and the +1 day is then done on the plain
 * `YYYY-MM-DD` string through `Date.UTC`, which has no local-offset input.
 */
export function nextDayIsoIn(timeZone: string, now: Date = new Date()): string {
  // 'en-CA' formats as YYYY-MM-DD, which is the ISO calendar date we want.
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const [year = '', month = '', day = ''] = today.split('-');
  const tomorrow = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + 1));
  return tomorrow.toISOString().slice(0, 10);
}

export interface FormattedRuleRow {
  title: string;
  summary: string;
  clampNote: string | null;
  timeZoneNote: string | null;
  nextLine: string;
  ended: boolean;
  kindLabel: string | null;
  accessibilityLabel: string;
}

function accessibilityLabelFor(kindLabel: string | null, title: string, summary: string): string {
  // 07-UI-SPEC.md line 612: `{任务或事件}周期规则：{标题}，{频率摘要}`. With no
  // derivable kind the type word is simply omitted; nothing else changes.
  return `${kindLabel ?? ''}重复安排：${title}，${summary}`;
}

/**
 * Turns one rule list item into the exact strings the row renders.
 *
 * The `recurrenceInputFromResponse` normalization is mandatory, not stylistic:
 * `formatRecurrenceSummary` takes the REQUEST shape (absent fields are
 * `undefined`) while the rule endpoints return the RESPONSE shape (absent
 * fields are `null`), and `null !== undefined` renders literal
 * "，到 null 为止" text at the user.
 */
export function formatRuleRow(
  rule: RecurrenceRuleListItemDto,
  deviceTimeZone: string,
  now: Date = new Date(),
): FormattedRuleRow {
  const kindLabel = recurrenceKindLabel(rule.kind);
  const normalized = recurrenceInputFromResponse(rule);

  if (normalized === null) {
    // Unreachable for a well-formed response; degrade to the one field that
    // is always meaningful rather than rendering a half-built summary.
    return {
      title: rule.title,
      summary: '',
      clampNote: null,
      timeZoneNote: null,
      nextLine: ENDED_LINE,
      ended: true,
      kindLabel,
      accessibilityLabel: accessibilityLabelFor(kindLabel, rule.title, ''),
    };
  }

  const formatted = formatRecurrenceSummary(normalized, deviceTimeZone);
  // The suffix is additive to the summary the detail screen shows verbatim,
  // so it only appears when NEITHER bound exists — an existing bound is
  // already spelled out inside the summary itself.
  const summary =
    normalized.endsOn === undefined && normalized.count === undefined
      ? `${formatted.summary}${NEVER_ENDS_SUFFIX}`
      : formatted.summary;
  // `nextOccurrenceDate` alone under-detects "ended": `nextOccurrenceFor`
  // walks from TODAY (inclusive), and ending a rule deliberately preserves
  // today's occurrence (the whole point of the tomorrow anchor — see
  // `nextDayIsoIn`). A rule whose only remaining occurrence is today
  // therefore still reports `nextOccurrenceDate = today`, even though no
  // further occurrence will ever be generated. Cross-check against `endsOn`:
  // a date bound strictly before tomorrow (i.e. on or before today, in the
  // rule's own timezone) means every occurrence the rule will ever produce
  // has already happened.
  const ended =
    rule.nextOccurrenceDate === null ||
    (rule.endsOn !== null && rule.endsOn < nextDayIsoIn(rule.timezone, now));

  return {
    title: rule.title,
    summary,
    clampNote: formatted.clampNote,
    timeZoneNote: formatted.timeZoneNote,
    nextLine: ended ? ENDED_LINE : `${NEXT_PREFIX}${rule.nextOccurrenceDate ?? ''}`,
    ended,
    kindLabel,
    accessibilityLabel: accessibilityLabelFor(kindLabel, rule.title, summary),
  };
}

interface RecurrenceRuleRowProps {
  selected?: boolean;
  rule: RecurrenceRuleListItemDto;
  deviceTimeZone: string;
  onPress(): void;
}

export function RecurrenceRuleRow({ rule, deviceTimeZone, onPress, selected = false }: RecurrenceRuleRowProps) {
  const activeTheme = useTheme<Theme>();
  useTranslation('recurrence');
  const desktop = useDesktop();
  const formatted = formatRuleRow(rule, deviceTimeZone);
  if (desktop) {
    const next = rule.nextOccurrenceDate;
    const isToday = next !== null && next !== undefined && next === toDateValue(new Date());
    const time = rule.startTimeLocal ? rule.startTimeLocal.slice(0, 5) : '';
    const nextText = formatted.ended ? '已结束' : next ? isToday ? `今天${time ? ` ${time}` : ''}` : formatDate(parseDateValue(next)) : '';
    const KindIcon = rule.kind === 'event' ? CalendarDays : CircleCheck;
    return <Pressable {...insetFocusRing} accessibilityRole="button" accessibilityLabel={formatted.accessibilityLabel} {...(selected ? { 'aria-current': true } : {})} onPress={onPress} style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ flexDirection: 'row', alignItems: 'center', gap: activeTheme.spacing[4], minHeight: activeTheme.layout.desktopRowHeight + activeTheme.spacing[2], paddingHorizontal: activeTheme.spacing[6], backgroundColor: selected ? activeTheme.colors.canvas : pressed || hovered ? activeTheme.colors.surfaceSubtle : activeTheme.colors.surface })}>
      {selected ? <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: activeTheme.borderWidths.focus, backgroundColor: activeTheme.colors.ink }} /> : null}
      <View style={{ width: activeTheme.layout.recurrenceKindColumn, flexDirection: 'row', alignItems: 'center', gap: activeTheme.spacing[1] + 2 }}>{rule.kind ? <KindIcon size={activeTheme.controlSizes.icon - 5} color={activeTheme.colors.inkMuted} strokeWidth={activeTheme.controlSizes.iconStroke} /> : null}<Text variant="meta">{formatted.kindLabel ?? '—'}</Text></View>
      {/* An ended rule is quieter in colour, not faded: fading took its small text under 4.5:1. 已结束 says it in words. */}
      <Text variant="bodySm" color={formatted.ended ? 'inkMuted' : 'ink'} numberOfLines={1} style={{ width: activeTheme.layout.recurrenceTitleColumn }}>{formatted.title}</Text>
      <Text variant="meta" numberOfLines={1} style={{ flex: 1 }}>{formatted.summary}</Text>
      <Text variant="time" numberOfLines={1} color={isToday && !formatted.ended ? 'accent' : 'inkMuted'} style={{ width: activeTheme.layout.recurrenceNextColumn, textAlign: 'right' }}>{nextText}</Text>
    </Pressable>;
  }

  return (
    <Pressable
      accessibilityLabel={formatted.accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled: false }}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? activeTheme.colors.surfaceMuted : activeTheme.colors.surface,
        minHeight: activeTheme.controlSizes.touchTarget,
        // An ended rule is told by words (the `nextLine` below) and a quieter
        // title, never by fading the row, which took its small text under 4.5:1.
        paddingHorizontal: activeTheme.spacing[4],
        paddingVertical: activeTheme.spacing[3],
      })}
    >
      <Stack gap={1}>
        <View
          style={{
            alignItems: 'center',
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: activeTheme.spacing[2],
          }}
        >
          {rule.kind !== null && <RecurrenceKindBadge kind={rule.kind} />}
          <Text variant="body" color={formatted.ended ? 'inkMuted' : 'ink'} numberOfLines={2} style={{ flexShrink: 1 }}>
            {formatted.title}
          </Text>
        </View>
        <Text variant="meta">
          {formatted.summary}
        </Text>
        <Text variant="meta" color={formatted.ended ? 'inkMuted' : 'ink'}>
          {formatted.nextLine}
        </Text>
      </Stack>
    </Pressable>
  );
}
