import type { ReactNode } from 'react';
import { View } from 'react-native';
import Pencil from 'lucide-react-native/icons/pencil';
import { Button, IconButton, Stack, Text } from './primitives';
import { theme } from './theme';
import { useDesktop } from './use-desktop';

/**
 * 编辑 in the header of an item's detail. The wide pane shows a pencil beside
 * its close button, or a small pill with the word where the item fills the
 * reading area (a note); a phone window keeps the worded button.
 */
export function DetailEditButton({ accessibilityLabel, onPress, disabled = false, worded = false }: { accessibilityLabel: string; onPress(): void; disabled?: boolean; worded?: boolean }) {
  const desktop = useDesktop();
  const pencil = (color: string) => <Pencil size={theme.controlSizes.icon - 5} color={color} strokeWidth={theme.controlSizes.iconStroke} />;
  if (desktop && !worded) return <IconButton appearance="plain" label={accessibilityLabel} disabled={disabled} icon={pencil(theme.colors.inkMuted)} onPress={onPress} />;
  return <Button label="编辑" accessibilityLabel={accessibilityLabel} tone="secondary" size="compact" disabled={disabled} {...(desktop ? { icon: pencil } : {})} onPress={onPress} />;
}

/** The grouped key facts of an item in its detail window. */
export function DetailPanel({ children }: { children: ReactNode }) {
  const desktop = useDesktop();
  return (
    <Stack gap={desktop ? 0 : 3} style={desktop ? undefined : { backgroundColor: theme.colors.surfaceSubtle, padding: theme.spacing[4], borderRadius: theme.borderRadii.lg }}>
      {children}
    </Stack>
  );
}

/**
 * One fact: its name in a narrow left column and its value beside it, so a
 * window lists several facts in little height. A long value such as a place or
 * a repeat summary wraps within its column; `notes` are small print under it.
 * A value that is more than words, such as avatars or label chips, is passed
 * as an element. The wide pane sets the facts as a dense 36px list.
 */
export function DetailField({ label, value, urgent = false, notes = [] }: { label: string; value: ReactNode; urgent?: boolean; notes?: Array<string | null | undefined> }) {
  const desktop = useDesktop();
  const row = desktop ? theme.layout.desktopField : theme.typography.body.lineHeight;
  const valueLine = desktop ? theme.textVariants.bodySm.lineHeight : theme.typography.body.lineHeight;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing[3] }}>
      {/* Nudged down so the name sits on the first line of a taller value. */}
      <Text variant={desktop ? 'meta' : 'label'} color={desktop ? 'inkFaint' : 'inkMuted'} style={{ width: theme.layout.fieldLabelColumn, paddingTop: desktop ? (row - theme.textVariants.meta.lineHeight) / 2 : (theme.typography.body.lineHeight - theme.typography.label.lineHeight) / 2 }}>{label}</Text>
      <Stack gap={1} style={{ flex: 1, minWidth: 0, ...(desktop ? { minHeight: row, paddingVertical: (row - valueLine) / 2 } : {}) }}>
        {typeof value === 'string' ? <Text variant={desktop ? 'bodySm' : 'body'} color={urgent ? 'destructive' : 'ink'}>{value}</Text> : value}
        {notes.filter((note): note is string => Boolean(note)).map(note => <Text key={note} variant="caption" color="inkMuted">{note}</Text>)}
      </Stack>
    </View>
  );
}
