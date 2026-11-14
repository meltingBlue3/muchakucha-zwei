import { router } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Bell from 'lucide-react-native/icons/bell';
import CalendarDays from 'lucide-react-native/icons/calendar-days';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import CircleUserRound from 'lucide-react-native/icons/circle-user-round';
import House from 'lucide-react-native/icons/house';
import Inbox from 'lucide-react-native/icons/inbox';
import Languages from 'lucide-react-native/icons/languages';
import { LogoutAction } from '../../src/features/auth/logout-action';
import { sessionApiClient, sessionStateStore, sessionTransport } from '../../src/features/auth/session-runtime';
import { useCurrentUser } from '../../src/features/auth/use-current-user';
import { AccountScreen } from '../../src/features/households/household-screen';
import { ProfileForm } from '../../src/features/profile/profile-form';
import { setLunarCalendar, useLunarCalendar } from '../../src/features/lunar/lunar-calendar';
import { setJapaneseCalendar, useJapaneseCalendar } from '../../src/features/wareki/japanese-calendar';
import { LANGUAGES, LANGUAGE_NAMES, setLanguageChoice, useLanguageChoice, useTranslation, type LanguageChoice } from '../../src/i18n';
import { AppDialog } from '../../src/ui/app-dialog';
import { FilterOptions } from '../../src/ui/filter-options';
import { ListGroup, ListRow, RowSlot } from '../../src/ui/list-group';
import { PageIntro } from '../../src/ui/page-intro';
import { Stack, Text } from '../../src/ui/primitives';
import { SettingsRows, SettingsSection, SwitchRow } from '../../src/ui/settings-section';
import { theme } from '../../src/ui/theme';
import { useDesktop } from '../../src/ui/use-desktop';

const LINKS = [
  { key: 'inbox', icon: Inbox, path: '/inbox' },
  { key: 'households', icon: House, path: '/household-handoff' },
  { key: 'reminders', icon: Bell, path: '/reminders' },
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
 * (as 家庭名称 in 家庭设置), this device's calendar display and language, the
 * person's other pages as rows, and 退出登录 at the foot.
 */
export default function ProfileRoute() {
  const desktop = useDesktop();
  const user = useCurrentUser();
  const editTrigger = useRef<View>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const lunar = useLunarCalendar();
  const japanese = useJapaneseCalendar();
  const language = useLanguageChoice();
  const { t } = useTranslation('profile');
  // A language is offered under its own name, whatever the interface is in.
  const languageOptions = [
    { value: 'system', label: t('language.system'), name: t('language.system') },
    ...LANGUAGES.map(value => ({ value, label: LANGUAGE_NAMES[value], name: LANGUAGE_NAMES[value] })),
  ];
  return (
    <AccountScreen accessibilityLabel={t('pageTitle')}>
      <Stack gap={6}>
        <PageIntro title={desktop ? t('title') : t('pageTitle')} />
        {desktop ? <ProfileForm apiClient={sessionApiClient} sessionStateStore={sessionStateStore} sessionTransport={sessionTransport} /> : <SettingsSection title={t('title')} icon={<CircleUserRound size={theme.controlSizes.icon} color={theme.colors.inkMuted} strokeWidth={theme.controlSizes.iconStroke} />}>
          {desktop ? <ProfileForm apiClient={sessionApiClient} sessionStateStore={sessionStateStore} sessionTransport={sessionTransport} /> : <SettingsRows>
            <ProfileFact label={t('nickname')} value={user?.displayName ?? '—'} action={
              <Pressable ref={editTrigger} accessibilityRole="button" accessibilityLabel={t('editNickname')} disabled={!user} onPress={() => setEditing(true)} style={{ minHeight: theme.controlSizes.touchTarget, justifyContent: 'center', paddingHorizontal: theme.spacing[2] }}>
                <Text variant="label" color="link">{t('edit')}</Text>
              </Pressable>
            } />
            <ProfileFact label={t('username')} value={user?.username ?? '—'} note={t('usernameNote')} />
          </SettingsRows>}
        </SettingsSection>}
        <SettingsSection title={t('calendar.title')} icon={<CalendarDays size={theme.controlSizes.icon} color={theme.colors.inkMuted} strokeWidth={theme.controlSizes.iconStroke} />} detail={t('deviceOnly')}>
          <SettingsRows>
            <SwitchRow label={t('calendar.showLunar')} value={lunar} disabled={false} onChange={setLunarCalendar}>
              <Text variant="caption">{t('calendar.showLunarDetail')}</Text>
            </SwitchRow>
            <SwitchRow label={t('calendar.showJapanese')} value={japanese} disabled={false} onChange={setJapaneseCalendar}>
              <Text variant="caption">{t('calendar.showJapaneseDetail')}</Text>
            </SwitchRow>
          </SettingsRows>
        </SettingsSection>
        <SettingsSection title={t('language.title')} icon={<Languages size={theme.controlSizes.icon} color={theme.colors.inkMuted} strokeWidth={theme.controlSizes.iconStroke} />} detail={t('deviceOnly')}>
          <FilterOptions hideLabel label={t('language.title')} options={languageOptions} value={language} onChange={value => setLanguageChoice(value as LanguageChoice)} />
        </SettingsSection>
        {!desktop ? <ListGroup>
          {LINKS.map(({ key, icon: Icon, path }) => (
            <ListRow
              key={key}
              accessibilityLabel={t(`links.${key}.label`)}
              onPress={() => router.push(path)}
              leading={<RowSlot width={theme.controlSizes.touchTarget}><View style={{ alignItems: 'center' }}><Icon size={theme.controlSizes.icon} color={theme.colors.inkMuted} strokeWidth={theme.controlSizes.iconStroke} /></View></RowSlot>}
              trailing={<ChevronRight size={theme.controlSizes.icon} color={theme.colors.inkFaint} strokeWidth={theme.controlSizes.iconStroke} />}
            >
              <Text variant="body">{t(`links.${key}.label`)}</Text>
              <Text variant="meta">{t(`links.${key}.description`)}</Text>
            </ListRow>
          ))}
        </ListGroup> : null}
        {!desktop ? <Stack gap={1}>
          <LogoutAction apiClient={sessionApiClient} onLoggedOut={() => router.replace('/login')} sessionStateStore={sessionStateStore} sessionTransport={sessionTransport} />
          <Text variant="caption" style={{ textAlign: 'center' }}>{t('logoutNote')}</Text>
        </Stack> : null}
      </Stack>
      {editing ? (
        <AppDialog title={t('title')} busy={busy} onClose={() => setEditing(false)} trigger={editTrigger}>
          <ProfileForm onBusyChange={setBusy} apiClient={sessionApiClient} sessionStateStore={sessionStateStore} sessionTransport={sessionTransport} />
        </AppDialog>
      ) : null}
    </AccountScreen>
  );
}
