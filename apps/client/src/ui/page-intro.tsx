import { createContext, useContext, type ReactNode } from 'react';
import { View } from 'react-native';
import { Heading, Text } from './primitives';
import { theme } from './theme';

/** AppShell places the shared creation control in the desktop title row. */
export const PageCreateActionContext = createContext<ReactNode>(null);

/**
 * The large title of a household destination, with page actions such as a
 * filter on the right. `subtitle` is one quiet line beneath, such as a summary
 * of the day or the filters in effect.
 */
export function PageIntro({ title, subtitle, action }: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  const createAction = useContext(PageCreateActionContext);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: theme.spacing[4] }}>
      <View style={{ flex: 1, minWidth: 0, gap: theme.spacing[1] / 2 }}>
        <Heading variant="display">{title}</Heading>
        {typeof subtitle === 'string' ? <Text variant="bodySm">{subtitle}</Text> : subtitle}
      </View>
      {/* Centered on the title line, so a subtitle never pulls the actions down. */}
      {action || createAction ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2], height: theme.typography.display.lineHeight }}>{action}{createAction}</View> : null}
    </View>
  );
}
