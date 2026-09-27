import { useCallback, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Text } from './primitives';
import type { Theme } from './theme';
import { formatDateLabel, parseDateValue, parseTimeValue, toDateValue, toTimeValue } from './date-values';
import { AppDialog } from './app-dialog';
import { DatePickerPanel, PickerActions, TimePickerPanel } from './picker-panels';
import { useWindowStep, type RouteWindowStep } from './window-step';

export { formatDateLabel } from './date-values';

type DateFieldProps = {
  /** Current value: "YYYY-MM-DD" for date, "HH:mm" for time. */
  value: string;
  /** Called with the formatted value when the user picks a date / time. */
  onChange: (value: string) => void;
  /** Picker mode. */
  mode: 'date' | 'time';
  /** Visible label above the field. Omit when the label is provided externally. */
  label?: string;
  /** Placeholder text shown when value is empty. */
  placeholder?: string;
  /** Where the picker opens while the value is empty; defaults to today / now. */
  pickerDefault?: string;
  /** Accessibility label for the pressable field. */
  accessibilityLabel?: string;
  /** Prevents opening or changing the picker while a parent form is submitting. */
  disabled?: boolean;
  /** `plain` renders borderless row text, as in a calendar compose sheet. */
  appearance?: 'field' | 'plain';
  /** Horizontal alignment of a `plain` value; an end-aligned value keeps its natural width. */
  align?: 'start' | 'end';
};

const PICKER_TITLES = { date: '选择日期', time: '选择时间' } as const;

/**
 * Pickers follow Google Calendar on each platform: Android opens the system
 * Material 3 dialogs, iOS shows the native calendar or wheel in a window
 * step, and Web shows a Material-style calendar or a quarter-hour list.
 * Inside a step, where the window cannot host another step, the picker opens
 * in a dialog stacked above it instead of taking space from that step.
 */
export function DateField({
  value,
  onChange,
  mode,
  label,
  placeholder,
  pickerDefault,
  accessibilityLabel,
  disabled = false,
  appearance = 'field',
  align = 'start',
}: DateFieldProps) {
  const activeTheme = useTheme<Theme>();
  const [open, setOpen] = useState(false);
  const trigger = useRef<View>(null);
  const plain = appearance === 'plain';
  const isEmpty = value === '';
  const displayValue = isEmpty
    ? (placeholder ?? (mode === 'date' ? '选择日期' : '选择时间'))
    : mode === 'date' ? formatDateLabel(value) : value;
  const name = accessibilityLabel ?? label ?? (mode === 'date' ? '日期' : '时间');

  const close = useCallback(() => setOpen(false), []);
  const apply = useCallback((next: string) => { setOpen(false); onChange(next); }, [onChange]);
  const pickerValue = value === '' && pickerDefault !== undefined ? pickerDefault : value;
  const panel = open ? <PickerPanel mode={mode} value={pickerValue} onConfirm={apply} onCancel={close} /> : null;
  const step = useMemo<RouteWindowStep | null>(() => open && Platform.OS !== 'android' ? {
    title: PICKER_TITLES[mode],
    content: panel,
    onClose: close,
    onReturn: () => (trigger.current as unknown as { focus?(): void } | null)?.focus?.(),
  } : null, [open, mode, panel, close]);
  const inWindow = useWindowStep(step);

  const press = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: mode === 'date' ? parseDateValue(pickerValue) : parseTimeValue(pickerValue),
        mode,
        design: 'material',
        title: PICKER_TITLES[mode],
        is24Hour: true,
        firstDayOfWeek: 1,
        positiveButton: { label: '确定' },
        negativeButton: { label: '取消' },
        onChange: (event: DateTimePickerEvent, selected?: Date) => {
          if (event.type === 'set' && selected !== undefined) onChange(mode === 'date' ? toDateValue(selected) : toTimeValue(selected));
        },
      });
      return;
    }
    setOpen(current => !current);
  };

  const fieldStyle = plain ? {
    minHeight: activeTheme.controlSizes.touchTarget,
    justifyContent: 'center' as const,
    alignItems: align === 'end' ? 'flex-end' as const : 'flex-start' as const,
  } : {
    backgroundColor: activeTheme.colors.surface,
    borderWidth: 1,
    borderColor: activeTheme.colors.border,
    borderRadius: activeTheme.borderRadii.sm,
    paddingHorizontal: activeTheme.spacing[4],
    paddingVertical: activeTheme.spacing[3],
    minHeight: activeTheme.controlSizes.field,
    justifyContent: 'center' as const,
  };

  return (
    <View style={plain && align === 'end' ? undefined : { flex: 1 }}>
      {label !== undefined ? (
        <Text variant="label" style={{ marginBottom: activeTheme.spacing[1] }}>{label}</Text>
      ) : null}
      <Pressable
        ref={trigger}
        onPress={press}
        disabled={disabled}
        accessibilityLabel={`${name}，${displayValue}`}
        accessibilityRole="button"
        accessibilityState={{ disabled, expanded: open }}
        style={({ pressed }) => [fieldStyle, { opacity: pressed ? 0.7 : 1 }]}
      >
        <Text color={isEmpty ? 'inkMuted' : 'ink'}>{displayValue}</Text>
      </Pressable>
      {!inWindow && open ? <AppDialog title={PICKER_TITLES[mode]} busy={false} onClose={close} trigger={trigger}>{panel}</AppDialog> : null}
    </View>
  );
}

function PickerPanel({ mode, value, onConfirm, onCancel }: { mode: 'date' | 'time'; value: string; onConfirm(value: string): void; onCancel(): void }) {
  if (Platform.OS === 'ios') return <IosPickerPanel mode={mode} value={value} onConfirm={onConfirm} onCancel={onCancel} />;
  return mode === 'date'
    ? <DatePickerPanel value={value} onConfirm={onConfirm} onCancel={onCancel} />
    : <TimePickerPanel value={value} onConfirm={onConfirm} onCancel={onCancel} />;
}

/** Native iOS calendar or wheel, confirmed explicitly like the other platforms. */
function IosPickerPanel({ mode, value, onConfirm, onCancel }: { mode: 'date' | 'time'; value: string; onConfirm(value: string): void; onCancel(): void }) {
  const [draft, setDraft] = useState(() => mode === 'date' ? parseDateValue(value) : parseTimeValue(value));
  return (
    <View>
      <DateTimePicker
        value={draft}
        mode={mode}
        display={mode === 'date' ? 'inline' : 'spinner'}
        locale="zh-Hans-CN"
        onChange={(_event, selected) => { if (selected !== undefined) setDraft(selected); }}
      />
      <PickerActions onCancel={onCancel} onConfirm={() => onConfirm(mode === 'date' ? toDateValue(draft) : toTimeValue(draft))} />
    </View>
  );
}
