import { router } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import CircleUserRound from 'lucide-react-native/icons/circle-user-round';
import House from 'lucide-react-native/icons/house';
import Inbox from 'lucide-react-native/icons/inbox';
import { LogoutAction } from '../../src/features/auth/logout-action';
import { sessionApiClient, sessionStateStore, sessionTransport } from '../../src/features/auth/session-runtime';
import { useCurrentUser } from '../../src/features/auth/use-current-user';
import { AccountScreen } from '../../src/features/households/household-screen';
import { ProfileForm } from '../../src/features/profile/profile-form';
import { AppDialog } from '../../src/ui/app-dialog';
import { ListGroup, ListRow, RowSlot } from '../../src/ui/list-group';
import { PageIntro } from '../../src/ui/page-intro';
import { Stack, Text } from '../../src/ui/primitives';
import { SettingsRows, SettingsSection } from '../../src/ui/settings-section';
import { theme } from '../../src/ui/theme';

const LINKS = [
  { key: 'inbox', label: '收件箱', description: '查看和处理收到的家庭邀请', icon: Inbox, path: '/inbox' },
  { key: 'households', label: '我的家庭', description: '查看家庭安排，或创建、加入一个家庭', icon: House, path: '/household-handoff' },
] as const;

/** One fact of the profile: its name in the left column, the value, and an optional action. */
function ProfileFact({ label, value, note, action }: { label: string; value: string; note?: string; action?: ReactNode }) {
  // Name, value and action share a first line as tall as a control; a note wraps below the value.
  const line = theme.controlSizes.touchTarget;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing[3], paddingVertical: theme.spacing[2] }}>
      <Text variant="label" color="inkMuted" style={{ width: theme.layout.fieldLabelColumn, paddingTop: (line - theme.typography.label.lineHeight) / 2 }}>{label}</Text>
      <Stack gap={1} style={{ flex: 1, minWidth: 0, paddingTop: (line - theme.typography.body.lineHeight) / 2, minHeight: line }}>
        <Text numberOfLines={1}>{value}</Text>
        {note ? <Text variant="caption">{note}</Text> : null}
      </Stack>
      {action}
    </View>
  );
}

/**
 * 个人中心: the nickname and username as facts with 编辑 beside the nickname
 * (as 家庭名称 in 家庭设置), the person's other pages as rows, and 退出登录
 * at the foot.
 */
export default function ProfileRoute() {
  const user = useCurrentUser();
  const editTrigger = useRef<View>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <AccountScreen accessibilityLabel="个人中心">
      <Stack gap={6}>
        <PageIntro title="个人中心" />
        <SettingsSection title="个人资料" icon={<CircleUserRound size={theme.controlSizes.icon} color={theme.colors.inkMuted} strokeWidth={theme.controlSizes.iconStroke} />}>
          <SettingsRows>
            <ProfileFact label="昵称" value={user?.displayName ?? '—'} action={
              <Pressable ref={editTrigger} accessibilityRole="button" accessibilityLabel="编辑昵称" disabled={!user} onPress={() => setEditing(true)} style={{ minHeight: theme.controlSizes.touchTarget, justifyContent: 'center', paddingHorizontal: theme.spacing[2] }}>
                <Text variant="label" color="link">编辑</Text>
              </Pressable>
            } />
            <ProfileFact label="用户名" value={user?.username ?? '—'} note="用于登录，暂不支持修改。" />
          </SettingsRows>
        </SettingsSection>
        <ListGroup>
          {LINKS.map(({ key, label, description, icon: Icon, path }) => (
            <ListRow
              key={key}
              accessibilityLabel={label}
              onPress={() => router.push(path)}
              leading={<RowSlot width={theme.controlSizes.touchTarget}><View style={{ alignItems: 'center' }}><Icon size={theme.controlSizes.icon} color={theme.colors.inkMuted} strokeWidth={theme.controlSizes.iconStroke} /></View></RowSlot>}
              trailing={<ChevronRight size={theme.controlSizes.icon} color={theme.colors.inkFaint} strokeWidth={theme.controlSizes.iconStroke} />}
            >
              <Text variant="body">{label}</Text>
              <Text variant="meta">{description}</Text>
            </ListRow>
          ))}
        </ListGroup>
        <Stack gap={1}>
          <LogoutAction apiClient={sessionApiClient} onLoggedOut={() => router.replace('/login')} sessionStateStore={sessionStateStore} sessionTransport={sessionTransport} />
          <Text variant="caption" style={{ textAlign: 'center' }}>只影响这台设备，家庭里的内容会保留。</Text>
        </Stack>
      </Stack>
      {editing ? (
        <AppDialog title="个人资料" busy={busy} onClose={() => setEditing(false)} trigger={editTrigger}>
          <ProfileForm onBusyChange={setBusy} apiClient={sessionApiClient} sessionStateStore={sessionStateStore} sessionTransport={sessionTransport} />
        </AppDialog>
      ) : null}
    </AccountScreen>
  );
}
