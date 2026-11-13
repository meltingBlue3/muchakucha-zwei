import { router } from 'expo-router';

import { useTranslation } from '../../src/i18n';
import { AuthShell, Button, StatusPanel } from '../../src/ui/primitives';

export default function OfflineRoute() {
  const { t } = useTranslation('auth');
  return (
    <AuthShell>
      <StatusPanel
        action={<Button label={t('offline.retry')} onPress={() => router.replace('/' as never)} />}
        body={t('offline.detail')}
        heading={t('offline.title')}
        kind="offline"
      />
    </AuthShell>
  );
}
