import { createContext, useContext, useLayoutEffect, type ReactNode, type Dispatch, type SetStateAction } from 'react';
import { useDesktop } from './use-desktop';
import { View } from 'react-native';
import { Heading, Text } from './primitives';
import { theme } from './theme';

export type PageHeader = { title: string; subtitle?: ReactNode; action?: ReactNode };
export const PageHeaderContext = createContext<Dispatch<SetStateAction<PageHeader | null>> | null>(null);

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
  const setHeader = useContext(PageHeaderContext);
  const desktop = useDesktop();
  useLayoutEffect(() => {
    if (!desktop || !setHeader) return;
    setHeader({ title, subtitle, action });
    return () => setHeader(null);
  }, [desktop, setHeader, title, subtitle, action]);
  if (desktop && setHeader) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: theme.spacing[4] }}>
      <View style={{ flex: 1, minWidth: 0, gap: theme.spacing[1] / 2 }}>
        <Heading variant="display">{title}</Heading>
        {typeof subtitle === 'string' ? <Text variant="bodySm">{subtitle}</Text> : subtitle}
      </View>
      {/* Centered on the title line, so a subtitle never pulls the actions down. */}
      {action ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2], height: theme.typography.display.lineHeight }}>{action}</View> : null}
    </View>
  );
}
