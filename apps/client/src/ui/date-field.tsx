import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Text } from './primitives';
import type { Theme } from './theme';

/**
 * Parse a "YYYY-MM-DD" or "HH:mm" string into a local Date.
 * Returns a safe fallback Date when parsing fails.
 */
function parseValue(value: string, mode: 'date' | 'time'): Date {
  if (mode === 'date') {
    if (value !== '' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split('-').map((s) => Number(s));
      const date = new Date(y!, m! - 1, d!);
      if (!isNaN(date.getTime())) return date;
    }
    return new Date();
  }
  // mode === 'time'
  if (value !== '' && /^\d{2}:\d{2}$/.test(value)) {
    const [h, minute] = value.split(':').map((s) => Number(s));
    const d = new Date();
    d.setHours(h!, minute!, 0, 0);
    return d;
  }
  return new Date();
}

/** Format a local Date back to "YYYY-MM-DD" or "HH:mm". */
function formatValue(date: Date, mode: 'date' | 'time'): string {
  if (mode === 'date') {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const h = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${minute}`;
}

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
  /** Accessibility label for the pressable field. */
  accessibilityLabel?: string;
};

export function DateField({
  value,
  onChange,
  mode,
  label,
  placeholder,
  accessibilityLabel,
}: DateFieldProps) {
  const activeTheme = useTheme<Theme>();
  const [show, setShow] = useState(false);

  const dateValue = parseValue(value, mode);
  const isEmpty = value === '';
  const displayValue = isEmpty
    ? (placeholder ?? (mode === 'date' ? '选择日期' : '选择时间'))
    : value;

  const fieldStyle = {
    backgroundColor: activeTheme.colors.surface,
    borderWidth: 1,
    borderColor: activeTheme.colors.border,
    borderRadius: activeTheme.borderRadii.sm,
    paddingHorizontal: activeTheme.spacing[4],
    paddingVertical: activeTheme.spacing[3],
    minHeight: activeTheme.controlSizes.field,
    justifyContent: 'center' as const,
  };

  const handleChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    // On Android the native dialog auto-dismisses; on iOS the picker
    // stays visible inline so the user can keep adjusting.
    if (Platform.OS === 'android') {
      setShow(false);
    }
    if (selectedDate !== undefined) {
      onChange(formatValue(selectedDate, mode));
    }
  };

  // ---- Web fallback: native HTML <input type="date|time"> ----
  if (Platform.OS === 'web') {
    // Map RN-only style keys to CSS-compatible equivalents for the raw <input>.
    const webFieldStyle: React.CSSProperties = {
      backgroundColor: activeTheme.colors.surface,
      border: `1px solid ${activeTheme.colors.border}`,
      borderRadius: activeTheme.borderRadii.sm,
      paddingTop: activeTheme.spacing[3],
      paddingBottom: activeTheme.spacing[3],
      paddingLeft: activeTheme.spacing[4],
      paddingRight: activeTheme.spacing[4],
      fontSize: activeTheme.typography.body.fontSize,
      color: isEmpty ? activeTheme.colors.inkMuted : activeTheme.colors.ink,
      minHeight: activeTheme.controlSizes.field,
      fontFamily: 'inherit',
      outline: 'none',
      width: '100%',
      boxSizing: 'border-box',
    };
    return (
      <View style={{ flex: 1 }}>
        {label !== undefined ? <Text variant="label">{label}</Text> : null}
        <input
          type={mode}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={webFieldStyle}
          placeholder={placeholder}
          aria-label={accessibilityLabel ?? label}
        />
      </View>
    );
  }

  // ---- Native (iOS / Android) ----
  return (
    <View style={{ flex: 1 }}>
      {label !== undefined ? (
        <Text variant="label" style={{ marginBottom: activeTheme.spacing[1] }}>
          {label}
        </Text>
      ) : null}
      <Pressable
        onPress={() => setShow((prev) => !prev)}
        accessibilityLabel={accessibilityLabel ?? label ?? (mode === 'date' ? '日期' : '时间')}
        accessibilityRole="button"
        style={[fieldStyle, { flex: 1 }]}
      >
        <Text
          style={{
            color: isEmpty ? activeTheme.colors.inkMuted : activeTheme.colors.ink,
            fontSize: activeTheme.typography.body.fontSize,
          }}
        >
          {displayValue}
        </Text>
      </Pressable>
      {show && (
        <View style={{ marginTop: activeTheme.spacing[2] }}>
          <DateTimePicker
            value={dateValue}
            mode={mode}
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={handleChange}
          />
        </View>
      )}
    </View>
  );
}
