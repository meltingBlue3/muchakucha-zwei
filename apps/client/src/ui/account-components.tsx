import { rememberRouteTrigger } from '../platform/overlays/route-trigger';
import type { PropsWithChildren } from 'react';
import { Pressable } from 'react-native';
import HousePlus from 'lucide-react-native/icons/house-plus';
import Mail from 'lucide-react-native/icons/mail';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import { Heading, Stack, Text } from './primitives';
import { theme } from './theme';

export function AccountCard({ children }: PropsWithChildren) {
  return <Stack gap={6} style={{ backgroundColor: theme.colors.surface, borderRadius: theme.borderRadii.xl, borderWidth: theme.borderWidths.default, borderColor: theme.colors.separator, padding: theme.spacing[6] }}>{children}</Stack>;
}

export function HouseholdSetup({ onCreate, onJoin }: { onCreate(): void; onJoin(): void }) {
  return (
    <Stack gap={6}>
      <Stack gap={3}>
        <Heading>开始设置你的家庭</Heading>
      </Stack>
      {[
        { title: '创建家庭', description: '由你开始，之后再邀请家人一起加入。', action: onCreate, icon: HousePlus, primary: true },
        { title: '查看家庭邀请', description: '家人已经邀请你？前往收件箱接受邀请。', action: onJoin, icon: Mail, primary: false },
      ].map(({ title, description, action, icon: Icon, primary }) => (
        <Pressable key={title} accessibilityRole="button" accessibilityLabel={title} accessibilityHint={description} onPress={() => { rememberRouteTrigger(); action(); }}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3], padding: theme.spacing[5], borderRadius: theme.borderRadii.lg, borderWidth: theme.borderWidths.default, borderColor: primary ? theme.colors.primary : theme.colors.transparent, backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.surface })}>
          <Icon color={primary ? theme.colors.ink : theme.colors.inkMuted} size={theme.spacing[6]} strokeWidth={theme.controlSizes.iconStroke} />
          <Stack gap={2} style={{ flex: 1 }}><Text variant="label">{title}</Text><Text variant="bodySm">{description}</Text></Stack>
          <ChevronRight color={theme.colors.inkMuted} size={theme.controlSizes.icon} />
        </Pressable>
      ))}
    </Stack>
  );
}
