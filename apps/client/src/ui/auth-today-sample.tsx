import { useMemo } from 'react';
import { Text, View } from 'react-native';

import { formatDate, formatWeekday, toTimeValue } from './date-values';
import { labelColorPresets, theme } from './theme';

type SampleItem = { time: string; title: string; color?: string };

// An illustration of a family's day, not anyone's data: three events, each with its label color, and one timed task.
const ITEMS: SampleItem[] = [
  { time: '09:30', title: '牙医复诊', color: labelColorPresets[8]! },
  { time: '12:30', title: '取快递（菜鸟驿站）' },
  { time: '16:30', title: '朵朵钢琴课', color: labelColorPresets[5]! },
  { time: '18:30', title: '家庭晚餐：外婆生日', color: labelColorPresets[11]! },
];

const minuteOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const timeColumn = theme.spacing[10] + theme.spacing[1];
const rowHeight = theme.spacing[10];

/**
 * The wide sign-in screen's picture of the product: today's date and a short
 * sample day with the current time drawn between its entries. Decorative, so
 * it is hidden from assistive technology.
 */
export function AuthTodaySample() {
  const now = useMemo(() => new Date(), []);
  const minutes = now.getHours() * 60 + now.getMinutes();
  const nowIndex = (() => { const index = ITEMS.findIndex(item => minuteOf(item.time) > minutes); return index < 0 ? ITEMS.length : index; })();
  const rows = ITEMS.map(item => <SampleRow key={item.time} item={item} />);
  const lines = [...rows.slice(0, nowIndex), <NowLine key="now" time={toTimeValue(now)} />, ...rows.slice(nowIndex)];
  return (
    <View testID="auth-decoration" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: '100%', maxWidth: theme.layout.authSampleWidth, paddingHorizontal: theme.spacing[5], paddingTop: theme.spacing[5], paddingBottom: theme.spacing[2], borderRadius: theme.borderRadii.md, borderWidth: theme.borderWidths.default, borderColor: theme.colors.separator, backgroundColor: theme.colors.surface, boxShadow: theme.shadow.soft }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing[2], marginBottom: theme.spacing[2] }}>
        <Text style={{ ...theme.typography.section, fontSize: theme.typography.section.fontSize + 1, fontWeight: '700', fontFamily: theme.fontFamilies.numericStrong, color: theme.colors.ink }}>{formatDate(now)}</Text>
        <Text style={{ ...theme.typography.meta, color: theme.colors.inkMuted }}>{`${formatWeekday(now)} · 3 个日程 · 1 件待办`}</Text>
      </View>
      {lines.map((line, index) => <View key={line.key} style={index > 0 && lines[index - 1]?.key !== 'now' ? { borderTopWidth: theme.borderWidths.default, borderTopColor: theme.colors.separator } : undefined}>{line}</View>)}
    </View>
  );
}

function SampleRow({ item }: { item: SampleItem }) {
  return (
    <View style={{ height: rowHeight, flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3] }}>
      <Text style={{ ...theme.typography.time, width: timeColumn, color: theme.colors.inkMuted, fontFamily: theme.fontFamilies.numeric }}>{item.time}</Text>
      {item.color
        ? <View style={{ width: theme.borderWidths.focus + 1, height: theme.spacing[4] + 2, borderRadius: theme.borderRadii.full, backgroundColor: item.color }} />
        : <View style={{ width: theme.spacing[4] - 1, height: theme.spacing[4] - 1, marginLeft: -theme.spacing[1] - 1, marginRight: -theme.spacing[1] + 2, borderRadius: theme.borderRadii.full, borderWidth: theme.borderWidths.default + 0.5, borderColor: theme.colors.inkMuted }} />}
      <Text numberOfLines={1} style={{ ...theme.typography.bodySm, flex: 1, color: theme.colors.ink }}>{item.title}</Text>
    </View>
  );
}

function NowLine({ time }: { time: string }) {
  return (
    <View style={{ height: theme.spacing[6], flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3] }}>
      <Text style={{ ...theme.typography.caption, width: timeColumn, color: theme.colors.accent, fontFamily: theme.fontFamilies.numericStrong }}>{time}</Text>
      <View style={{ width: theme.spacing[1] + 2, height: theme.spacing[1] + 2, marginLeft: -theme.spacing[1], borderRadius: theme.borderRadii.full, backgroundColor: theme.colors.accent }} />
      <View style={{ flex: 1, height: theme.borderWidths.focus - 0.5, backgroundColor: theme.colors.accent }} />
    </View>
  );
}
