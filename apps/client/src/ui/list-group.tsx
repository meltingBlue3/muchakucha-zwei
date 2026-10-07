import { Children, Fragment, isValidElement, useState, type ReactNode } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { insetFocusRing } from '../platform/focus-ring/focus-ring';
import { Text } from './primitives';
import { theme } from './theme';

/**
 * A run of related rows on one white panel, divided by hairlines. Lists are
 * grouped this way instead of giving every item its own card, so a screen
 * shows twice as much and still reads as calm.
 */
export function ListGroup({ children }: { children: ReactNode }) {
  const rows = Children.toArray(children).filter(isValidElement);
  if (rows.length === 0) return null;
  // The now marker is itself a divider, so it takes the place of a hairline.
  const isMarker = (index: number) => rows[index]?.type === NowMarker;
  return (
    <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.borderRadii.lg, overflow: 'hidden' }}>
      {rows.map((row, index) => (
        <Fragment key={row.key ?? index}>
          {index > 0 && !isMarker(index) && !isMarker(index - 1) ? <View style={{ height: theme.borderWidths.default, backgroundColor: theme.colors.separator, marginLeft: theme.spacing[4] }} /> : null}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

/**
 * The current time inside a timeline: a vermilion line with the clock time in
 * the time column, between what has passed and what is still to come.
 */
export function NowMarker({ time }: { time: string }) {
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`现在 ${time}`} style={{ flexDirection: 'row', alignItems: 'center', height: theme.spacing[3] }}>
      <Text variant="time" color="accent" style={{ width: theme.layout.timeColumn + theme.spacing[1], paddingLeft: theme.spacing[4], fontFamily: theme.fontFamilies.numericStrong }}>{time}</Text>
      <View style={{ width: theme.spacing[2] - 2, height: theme.spacing[2] - 2, borderRadius: theme.borderRadii.full, backgroundColor: theme.colors.accent }} />
      <View style={{ flex: 1, height: theme.borderWidths.focus - 0.5, backgroundColor: theme.colors.accent }} />
    </View>
  );
}

/**
 * The small heading above a group, such as 「今天」 or 「待安排（2）」. It is a
 * level-2 heading so the groups can be skimmed with a screen reader.
 */
export function GroupLabel({ children, tone = 'muted', trailing }: { children: string; tone?: 'muted' | 'accent'; trailing?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing[2], paddingHorizontal: theme.spacing[1], marginBottom: theme.spacing[2], minHeight: theme.spacing[6] }}>
      <Text accessibilityRole="header" aria-level={2} variant="label" color={tone === 'accent' ? 'accent' : 'inkMuted'} style={{ flexShrink: 1 }}>{children}</Text>
      {trailing}
    </View>
  );
}

/**
 * One item in a ListGroup. The body opens the item; `leading` holds a control
 * such as a completion mark, and `trailing` holds avatars or a menu. Body and
 * controls are siblings, never nested, so Web never gets a button inside a
 * button. Pressing the body tints the whole row.
 */
export function ListRow({ accessibilityLabel, onPress, leading, trailing, footer, children, selected = false }: {
  accessibilityLabel: string;
  onPress(): void;
  leading?: ReactNode;
  trailing?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  /** The row whose detail is open beside the list. */
  selected?: boolean;
}) {
  const [pressed, setPressed] = useState(false);
  // Controls sit on the title line: a one-line row is centered, and a longer
  // row grows downward without pulling the check mark or menu with it.
  const rowHeight = theme.controlSizes.touchTarget + theme.spacing[2];
  const controlInset = (rowHeight - theme.controlSizes.touchTarget) / 2;
  return (
    // The open row lets the paper show through and carries an ink bar: a
    // darker fill would push red due dates and faint metadata under 4.5:1.
    <View style={{ backgroundColor: pressed ? theme.colors.surfaceMuted : selected ? theme.colors.canvas : theme.colors.surface }}>
      {selected ? <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: theme.spacing[2], bottom: theme.spacing[2], width: theme.spacing[1] - 1, borderTopRightRadius: theme.borderRadii.full, borderBottomRightRadius: theme.borderRadii.full, backgroundColor: theme.colors.ink }} /> : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', minHeight: rowHeight, paddingLeft: leading ? theme.spacing[1] : theme.spacing[2], paddingRight: theme.spacing[2] }}>
        {leading ? <View style={{ flexDirection: 'row', alignItems: 'flex-start', alignSelf: 'stretch', paddingTop: controlInset }}>{leading}</View> : null}
        <Pressable
          {...insetFocusRing}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          // A button cannot be aria-selected, so the web marks the open item as current.
          {...(selected ? Platform.OS === 'web' ? { 'aria-current': true } : { accessibilityState: { selected } } : {})}
          onPress={onPress}
          onPressIn={() => setPressed(true)}
          onPressOut={() => setPressed(false)}
          style={{ flex: 1, minWidth: 0, minHeight: rowHeight, paddingTop: (rowHeight - theme.typography.body.lineHeight) / 2, paddingBottom: theme.spacing[3], paddingHorizontal: theme.spacing[2] }}
        >
          {children}
        </Pressable>
        {trailing ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[1], height: theme.controlSizes.touchTarget, marginTop: controlInset }}>{trailing}</View> : null}
      </View>
      {footer}
    </View>
  );
}

/** A leading cell as tall as a control, so a time or an icon lines up with the row's title. */
export function RowSlot({ width, children }: { width: number; children: ReactNode }) {
  return <View style={{ width, height: theme.controlSizes.touchTarget, justifyContent: 'center' }}>{children}</View>;
}

/** A thin colored bar marking an event row, in the color of its first label. */
export function EventBar({ color }: { color: string }) {
  return <View style={{ width: theme.spacing[1] - 1, alignSelf: 'stretch', marginVertical: theme.spacing[3], borderRadius: theme.borderRadii.full, backgroundColor: color }} />;
}
