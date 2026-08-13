import type { RecurrenceRuleListItemDto } from '@muchakucha/api-client';
import { useTheme } from '@shopify/restyle';
import { Pressable, View } from 'react-native';

import { Stack, Text } from '../../ui/primitives';
import type { Theme } from '../../ui/theme';
import { RecurrenceKindBadge, recurrenceKindLabel } from './recurrence-kind-badge';
import { recurrenceInputFromResponse } from './recurrence-picker';
import { formatRecurrenceSummary } from './recurrence-summary';

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
  return `${kindLabel ?? ''}周期规则：${title}，${summary}`;
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
  rule: RecurrenceRuleListItemDto;
  deviceTimeZone: string;
  onPress(): void;
}

export function RecurrenceRuleRow({ rule, deviceTimeZone, onPress }: RecurrenceRuleRowProps) {
  const activeTheme = useTheme<Theme>();
  const formatted = formatRuleRow(rule, deviceTimeZone);

  return (
    <Pressable
      accessibilityLabel={formatted.accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled: false }}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: activeTheme.colors.surface,
        borderColor: activeTheme.colors.border,
        borderRadius: activeTheme.borderRadii.md,
        borderWidth: activeTheme.borderWidths.default,
        minHeight: activeTheme.controlSizes.touchTarget,
        // `opacity` is never the only signal that a rule has ended — the
        // `nextLine` below says so in words as well.
        opacity: formatted.ended ? 0.6 : pressed ? 0.8 : 1,
        padding: activeTheme.spacing[4],
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
          <Text variant="body" numberOfLines={2} style={{ flexShrink: 1 }}>
            {formatted.title}
          </Text>
        </View>
        <Text variant="caption" color="inkMuted">
          {formatted.summary}
        </Text>
        <Text variant="caption" color={formatted.ended ? 'inkMuted' : 'ink'}>
          {formatted.nextLine}
        </Text>
      </Stack>
    </Pressable>
  );
}
