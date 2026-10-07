import { useCallback, useMemo, useRef, useState, type ComponentType, type ReactNode, type RefObject } from 'react';
import { Platform, Pressable, View } from 'react-native';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import Check from 'lucide-react-native/icons/check';

import { PickerActions } from './picker-panels';
import { FormMessage, Stack, Text } from './primitives';
import { theme } from './theme';
import { useWindowStep, type RouteWindowStep } from './window-step';

/**
 * Building blocks of the Google Calendar-style compose sheet shared by the
 * event and task forms: separated sections, icon rows, summary rows that
 * open an option list, and the option rows themselves.
 */

/** A separated group of rows. */
export function FormSection({ children }: { children: ReactNode }) {
  return (
    <View style={{ borderTopWidth: theme.borderWidths.default, borderTopColor: theme.colors.separator, paddingVertical: theme.spacing[2] }}>
      {children}
    </View>
  );
}

/** Icon column plus content; rows without an icon keep the same text edge. */
export function FormRow({ icon, align = 'center', children }: { icon?: ReactNode; align?: 'center' | 'start'; children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: align === 'start' ? 'flex-start' : 'center', gap: theme.spacing[2], minHeight: theme.controlSizes.touchTarget }}>
      <View importantForAccessibility="no-hide-descendants" aria-hidden style={{ width: theme.controlSizes.touchTarget, minHeight: theme.controlSizes.touchTarget, alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </View>
      {children}
    </View>
  );
}

/** Left edge of row content, for messages and inline panels under a row. */
export const ROW_CONTENT_INSET = theme.controlSizes.touchTarget + theme.spacing[2];

/** A validation message under a row, aligned with the row's content. */
export function RowMessage({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <View style={{ paddingLeft: ROW_CONTENT_INSET }}>
      <FormMessage {...(id === undefined ? {} : { id })}>{children}</FormMessage>
    </View>
  );
}

/** Row icons share one size, stroke and muted color. */
export function rowIcon(Icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>) {
  return <Icon size={theme.controlSizes.icon} color={theme.colors.inkMuted} strokeWidth={theme.controlSizes.iconStroke} />;
}

/** Borderless single-line input style for row content. */
export const rowInputStyle = {
  flex: 1,
  paddingVertical: theme.spacing[3],
  fontSize: theme.typography.body.fontSize,
  fontFamily: theme.fontFamilies.regular,
  lineHeight: theme.typography.body.lineHeight,
  color: theme.colors.ink,
  minHeight: theme.controlSizes.touchTarget,
};

/** The large borderless title at the top of a compose sheet. */
export const titleInputStyle = {
  ...rowInputStyle,
  fontSize: theme.typography.heading.fontSize,
  lineHeight: theme.typography.heading.lineHeight,
  fontWeight: theme.typography.heading.fontWeight,
  paddingVertical: theme.spacing[4],
};

/** A row showing the current choice; pressing it opens the choices. */
export function SummaryRow({ name, summary, icon, open, disabled = false, onPress, trigger, muted = false }: {
  name: string;
  summary: string;
  icon?: ReactNode;
  open: boolean;
  disabled?: boolean;
  onPress(): void;
  trigger: RefObject<View | null>;
  /** Placeholder-style summary for an empty optional value. */
  muted?: boolean;
}) {
  return (
    <FormRow icon={icon}>
      <Pressable
        ref={trigger}
        accessibilityRole="button"
        accessibilityLabel={`${name}，${summary}`}
        accessibilityState={{ disabled, expanded: open }}
        aria-haspopup="dialog"
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2], minHeight: theme.controlSizes.touchTarget, paddingHorizontal: theme.spacing[2], marginLeft: -theme.spacing[2], borderRadius: theme.borderRadii.md, backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.transparent })}
      >
        <Text color={muted ? 'inkMuted' : 'ink'} style={{ flex: 1 }}>{summary}</Text>
        <ChevronDown size={theme.controlSizes.icon} color={theme.colors.inkMuted} strokeWidth={theme.controlSizes.iconStroke} />
      </Pressable>
    </FormRow>
  );
}

type WebKeyEvent = { key: string; currentTarget: EventTarget & HTMLElement; preventDefault(): void };

/** Arrow keys move focus between options without choosing, since choosing may close the list. */
function moveFocus(event: WebKeyEvent) {
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  const group = event.currentTarget.closest('[role="radiogroup"], [role="group"]');
  const options = Array.from(group?.querySelectorAll<HTMLElement>('[role="radio"]:not([aria-disabled="true"]), [role="checkbox"]:not([aria-disabled="true"])') ?? []);
  const index = options.indexOf(event.currentTarget);
  const delta = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1;
  options[(index + delta + options.length) % options.length]?.focus();
}

function OptionMark({ checked, disabled, multiple }: { checked: boolean; disabled: boolean; multiple: boolean }) {
  const color = disabled ? theme.colors.disabled : checked ? theme.colors.primary : theme.colors.inkMuted;
  if (multiple) {
    return (
      <View style={{ width: theme.controlSizes.icon, height: theme.controlSizes.icon, borderRadius: theme.spacing[1], borderWidth: theme.borderWidths.focus, borderColor: color, backgroundColor: checked ? color : theme.colors.transparent, alignItems: 'center', justifyContent: 'center' }}>
        {checked ? <Check size={theme.controlSizes.icon - theme.spacing[1]} color={theme.colors.surface} strokeWidth={3} /> : null}
      </View>
    );
  }
  return (
    <View style={{ width: theme.controlSizes.icon, height: theme.controlSizes.icon, borderRadius: theme.borderRadii.full, borderWidth: theme.borderWidths.focus, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
      {checked ? <View style={{ width: theme.spacing[2] + theme.spacing[1] / 2, height: theme.spacing[2] + theme.spacing[1] / 2, borderRadius: theme.borderRadii.full, backgroundColor: color }} /> : null}
    </View>
  );
}

/** A Material-style list option: radio for single choice, checkbox for multiple. */
export function OptionRow({ label, detail, checked, disabled = false, multiple = false, leading, onPress }: {
  label: string;
  detail?: string;
  checked: boolean;
  disabled?: boolean;
  multiple?: boolean;
  /** Decoration after the mark, such as a color dot. */
  leading?: ReactNode;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole={multiple ? 'checkbox' : 'radio'}
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      aria-checked={checked}
      disabled={disabled}
      onPress={onPress}
      {...(Platform.OS === 'web' ? { onKeyDown: moveFocus } : {})}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[4], minHeight: theme.controlSizes.touchTarget + theme.spacing[1], paddingHorizontal: theme.spacing[2], borderRadius: theme.borderRadii.md, backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.transparent })}
    >
      <OptionMark checked={checked} disabled={disabled} multiple={multiple} />
      {leading}
      <View style={{ flex: 1 }}>
        <Text color={disabled ? 'inkMuted' : 'ink'}>{label}</Text>
        {detail ? <Text variant="bodySm">{detail}</Text> : null}
      </View>
    </Pressable>
  );
}

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  detail?: string;
  leading?: ReactNode;
}

/**
 * A summary row that opens a list of options in a window step, like Google
 * Calendar's repeat and color menus. A single choice applies immediately; a
 * multiple choice is confirmed with 完成. Outside a window the list expands inline.
 */
export function ChoiceField<T extends string>({ name, title, icon, summary, options, value, multiple = false, disabled = false, muted = false, emptyValue, onChange, children }: {
  /** Accessible name of the row and the option group. */
  name: string;
  /** Title of the option window. */
  title: string;
  icon?: ReactNode;
  summary: string;
  options: ReadonlyArray<ChoiceOption<T>>;
  value: readonly T[];
  multiple?: boolean;
  disabled?: boolean;
  muted?: boolean;
  /** For a multiple choice, an option meaning "none" that clears the others. */
  emptyValue?: T;
  onChange(value: T[]): void;
  /** Extra content under the list, such as a hint. */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<T[]>([]);
  const trigger = useRef<View>(null);
  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback((option: T) => setDraft(current => {
    if (option === emptyValue) return [];
    return current.includes(option) ? current.filter(item => item !== option) : [...current, option];
  }), [emptyValue]);

  const step = useMemo<RouteWindowStep | null>(() => open ? {
    title,
    onClose: close,
    onReturn: () => (trigger.current as unknown as { focus?(): void } | null)?.focus?.(),
    content: (
      <Stack gap={2}>
        <View accessibilityRole={multiple ? undefined : 'radiogroup'} role={multiple ? 'group' : undefined} accessibilityLabel={name}>
          {options.map(option => {
            const checked = multiple
              ? option.value === emptyValue ? draft.length === 0 : draft.includes(option.value)
              : value.includes(option.value);
            return (
              <OptionRow
                key={option.value}
                label={option.label}
                {...(option.detail ? { detail: option.detail } : {})}
                leading={option.leading}
                checked={checked}
                multiple={multiple}
                onPress={() => {
                  if (multiple) { toggle(option.value); return; }
                  onChange([option.value]);
                  close();
                }}
              />
            );
          })}
        </View>
        {children}
        {multiple ? <PickerActions onCancel={close} onConfirm={() => { onChange(draft); close(); }} confirmLabel="完成" /> : null}
      </Stack>
    ),
  } : null, [open, title, close, multiple, name, options, emptyValue, draft, value, children, toggle, onChange]);
  const inWindow = useWindowStep(step);

  return (
    <Stack gap={0}>
      <SummaryRow
        name={name}
        summary={summary}
        icon={icon}
        open={open}
        disabled={disabled}
        muted={muted}
        trigger={trigger}
        onPress={() => {
          if (!open) setDraft([...value]);
          setOpen(!open);
        }}
      />
      {!inWindow && step ? <View style={{ paddingLeft: ROW_CONTENT_INSET, paddingBottom: theme.spacing[3] }}>{step.content}</View> : null}
    </Stack>
  );
}
