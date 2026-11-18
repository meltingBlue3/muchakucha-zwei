import { createContext, useContext, useLayoutEffect, type ReactNode, type Dispatch, type SetStateAction } from 'react';
import { useDesktop } from './use-desktop';
import { View } from 'react-native';
import { Heading, Text } from './primitives';
import { theme } from './theme';

export type PageHeader = { title: string; subtitle?: ReactNode; controls?: ReactNode; action?: ReactNode };
export const PageHeaderContext = createContext<Dispatch<SetStateAction<PageHeader | null>> | null>(null);

/**
 * The large title of a household destination, with page actions such as a
 * filter on the right. `subtitle` is one quiet line beneath, such as a summary
 * of the day or the filters in effect.
 */
export function PageIntro({ title, subtitle, controls, action }: {
  title: string;
  subtitle?: ReactNode;
  /** Desktop only: a view switch such as 待办 / 已完成, set right after the title rather than with the actions. */
  controls?: ReactNode;
  action?: ReactNode;
}) {
  const setHeader = useContext(PageHeaderContext);
  const desktop = useDesktop();
  useLayoutEffect(() => {
    if (!desktop || !setHeader) return;
    setHeader({ title, subtitle, controls, action });
    return () => setHeader(null);
  }, [desktop, setHeader, title, subtitle, controls, action]);
  if (desktop && setHeader) return null;
  return (
    <View style={{ gap: theme.spacing[1] / 2 }}>
      {/* The title keeps its line: when it and the actions do not fit side by side, the actions wrap under it, still on the right. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: theme.spacing[4], rowGap: theme.spacing[2] }}>
        <Heading variant="display" style={{ flexShrink: 0, maxWidth: '100%' }}>{title}</Heading>
        {/* As tall as the title line, so the actions sit centered on it. */}
        {action ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2], height: theme.typography.display.lineHeight, marginLeft: 'auto' }}>{action}</View> : null}
      </View>
      {typeof subtitle === 'string' ? <Text variant="bodySm">{subtitle}</Text> : subtitle}
    </View>
  );
}
