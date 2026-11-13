import { useTranslation } from '../../i18n';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { backgroundReminderGuide, openBackgroundReminderSettings } from '../../platform/reminders/background-reminder-guide';
import { AppDialog } from '../../ui/app-dialog';
import { Banner, Button, Inline, Stack, Text } from '../../ui/primitives';
import { theme } from '../../ui/theme';

export function BackgroundReminderGuide({ onClose }: { onClose(): void }) {
  const { t } = useTranslation(['reminders', 'common']);
  const [error, setError] = useState(false);
  const openSettings = async () => {
    setError(false);
    try {
      await openBackgroundReminderSettings();
    } catch {
      setError(true);
    }
  };

  return (
    <Stack gap={4}>
      <Stack gap={1}>
        <Text variant="label">{t('background.allow')}</Text>
        <Text variant="bodySm">{backgroundReminderGuide === 'realme'
          ? t('background.oppoBattery')
          : t('background.battery')}</Text>
        <Button label={t('background.appInfo')} tone="secondary" size="compact" style={{ alignSelf: 'flex-start' }} onPress={() => void openSettings()} />
        {error ? <Banner>{t('background.appInfoError')}</Banner> : null}
      </Stack>
      <Stack gap={1}>
        <Text variant="label">{t('background.autoStart')}</Text>
        <Text variant="bodySm">{backgroundReminderGuide === 'realme'
          ? t('background.oppoAutoStart')
          : t('background.autoStartHelp')}</Text>
      </Stack>
      <Text variant="meta">{t('background.forceStop')}</Text>
      <Button label={t('common:done')} onPress={onClose} />
    </Stack>
  );
}

export function BackgroundReminderSettingsRow() {
  const { t } = useTranslation('reminders');
  const trigger = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <Stack gap={1} style={{ paddingVertical: theme.spacing[2] }}>
        <Text>{t('background.title')}</Text>
        <Text variant="meta">{t('background.limits')}</Text>
        <Button ref={trigger} label={t('background.steps')} tone="secondary" size="compact" style={{ alignSelf: 'flex-start' }} onPress={() => setOpen(true)} />
      </Stack>
      {open ? <AppDialog title={t('background.title')} trigger={trigger} busy={false} onClose={close}>
        <BackgroundReminderGuide onClose={close} />
      </AppDialog> : null}
    </>
  );
}

export function BackgroundReminderHint({ onOpen, onDismiss }: { onOpen(): void; onDismiss(): void }) {
  const { t } = useTranslation('reminders');
  return (
    <Stack gap={1}>
      <Text variant="meta">{t('background.hint')}</Text>
      <Inline gap={2} style={{ flexWrap: 'wrap' }}>
        <Button label={t('background.viewSettings')} tone="secondary" size="compact" onPress={onOpen} />
        <Button label={t('background.later')} tone="secondary" size="compact" onPress={onDismiss} />
      </Inline>
    </Stack>
  );
}
