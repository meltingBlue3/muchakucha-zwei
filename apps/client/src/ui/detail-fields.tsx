import type { ReactNode } from 'react';
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
 * One fact: its name above its value, so long values such as a place or a
 * repeat summary wrap naturally. `notes` are small print under the value.
 */
export function DetailField({ label, value, urgent = false, notes = [] }: { label: string; value: string; urgent?: boolean; notes?: Array<string | null | undefined> }) {
  return (
    <Stack gap={1}>
      <Text variant="label" color="inkMuted">{label}</Text>
      <Text color={urgent ? 'destructive' : 'ink'}>{value}</Text>
      {notes.filter((note): note is string => Boolean(note)).map(note => <Text key={note} variant="caption" color="inkMuted">{note}</Text>)}
    </Stack>
  );
}
