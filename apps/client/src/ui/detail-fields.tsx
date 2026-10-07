import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Stack, Text } from './primitives';
import { theme } from './theme';

/** The grouped key facts of an item in its detail window. */
export function DetailPanel({ children }: { children: ReactNode }) {
  return (
    <Stack gap={3} style={{ backgroundColor: theme.colors.surfaceSubtle, padding: theme.spacing[4], borderRadius: theme.borderRadii.lg }}>
      {children}
    </Stack>
  );
}

/**
 * One fact: its name in a narrow left column and its value beside it, so a
 * window lists several facts in little height. A long value such as a place or
 * a repeat summary wraps within its column; `notes` are small print under it.
 */
export function DetailField({ label, value, urgent = false, notes = [] }: { label: string; value: string; urgent?: boolean; notes?: Array<string | null | undefined> }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing[3] }}>
      {/* Nudged down so the name sits on the first line of a taller value. */}
      <Text variant="label" color="inkMuted" style={{ width: theme.layout.fieldLabelColumn, paddingTop: (theme.typography.body.lineHeight - theme.typography.label.lineHeight) / 2 }}>{label}</Text>
      <Stack gap={1} style={{ flex: 1, minWidth: 0 }}>
        <Text color={urgent ? 'destructive' : 'ink'}>{value}</Text>
        {notes.filter((note): note is string => Boolean(note)).map(note => <Text key={note} variant="caption" color="inkMuted">{note}</Text>)}
      </Stack>
    </View>
  );
}
