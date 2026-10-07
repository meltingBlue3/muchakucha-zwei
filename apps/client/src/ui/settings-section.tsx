import type { ReactNode } from 'react';
import { Heading, Inline, Stack, Text } from './primitives';
import { theme } from './theme';

/** One white panel of a settings page: an icon and title, then its rows. */
export function SettingsSection({ title, icon, detail, action, children }: {
  title: string;
  icon: ReactNode;
  detail?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Stack gap={4} style={{ backgroundColor: theme.colors.surface, borderRadius: theme.borderRadii.lg, padding: theme.spacing[5] }}>
      <Inline gap={3}>
        {icon}
        <Stack gap={0} style={{ flex: 1 }}>
          <Heading variant="section">{title}</Heading>
          {detail ? <Text variant="meta">{detail}</Text> : null}
        </Stack>
        {action}
      </Inline>
      {children}
    </Stack>
  );
}
