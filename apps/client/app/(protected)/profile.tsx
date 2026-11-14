import { sessionApiClient, sessionStateStore, sessionTransport } from '../../src/features/auth/session-runtime';
import { AccountScreen } from '../../src/features/households/household-screen';
import { ProfileForm } from '../../src/features/profile/profile-form';
import { useTranslation } from '../../src/i18n';
import { PageIntro } from '../../src/ui/page-intro';
import { Stack } from '../../src/ui/primitives';

/**
 * 个人资料: what belongs to the account, the username and the nickname. What
 * only this device shows, such as the language, lives on 设置.
 */
export default function ProfileRoute() {
  const { t } = useTranslation('profile');
  return (
    <AccountScreen accessibilityLabel={t('title')}>
      <Stack gap={6}>
        <PageIntro title={t('title')} />
        <ProfileForm apiClient={sessionApiClient} sessionStateStore={sessionStateStore} sessionTransport={sessionTransport} />
      </Stack>
    </AccountScreen>
  );
}
