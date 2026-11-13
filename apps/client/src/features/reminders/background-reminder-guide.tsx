import { useRef, useState } from 'react';
import { View } from 'react-native';
import { backgroundReminderGuide, openBackgroundReminderSettings } from '../../platform/reminders/background-reminder-guide';
import { AppDialog } from '../../ui/app-dialog';
import { Banner, Button, Inline, Stack, Text } from '../../ui/primitives';
import { theme } from '../../ui/theme';

export function BackgroundReminderGuide({ onClose }: { onClose(): void }) {
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
        <Text variant="label">允许后台运行</Text>
        <Text variant="bodySm">{backgroundReminderGuide === 'realme'
          ? '在本应用的「应用详情」里进入「耗电管理」，开启「允许应用后台行为」。'
          : '在本应用的「应用详情」里找到电池或耗电设置，允许应用在后台运行。'}</Text>
        <Button label="打开应用详情" tone="secondary" size="compact" style={{ alignSelf: 'flex-start' }} onPress={() => void openSettings()} />
        {error ? <Banner>无法打开应用详情。请在手机设置的应用列表里找到本应用。</Banner> : null}
      </Stack>
      <Stack gap={1}>
        <Text variant="label">允许自启动</Text>
        <Text variant="bodySm">{backgroundReminderGuide === 'realme'
          ? '前往「系统设置 → 应用 → 自启动」，为本应用开启自启动。'
          : '如果手机提供「自启动」或「自动启动」设置，请为本应用开启。'}</Text>
      </Stack>
      <Text variant="meta">如果在系统设置里点了「强行停止」，请重新打开 App，让它重新安排尚未到期的提醒。</Text>
      <Button label="完成" onPress={onClose} />
    </Stack>
  );
}

export function BackgroundReminderSettingsRow() {
  const trigger = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <Stack gap={1} style={{ paddingVertical: theme.spacing[2] }}>
        <Text>后台提醒</Text>
        <Text variant="meta">退到后台或从最近任务划掉后，如果手机限制应用运行，提醒可能延迟或收不到。</Text>
        <Button ref={trigger} label="查看设置步骤" tone="secondary" size="compact" style={{ alignSelf: 'flex-start' }} onPress={() => setOpen(true)} />
      </Stack>
      {open ? <AppDialog title="后台提醒" trigger={trigger} busy={false} onClose={close}>
        <BackgroundReminderGuide onClose={close} />
      </AppDialog> : null}
    </>
  );
}

export function BackgroundReminderHint({ onOpen, onDismiss }: { onOpen(): void; onDismiss(): void }) {
  return (
    <Stack gap={1}>
      <Text variant="meta">希望退出 App 后也能收到提醒？</Text>
      <Inline gap={2} style={{ flexWrap: 'wrap' }}>
        <Button label="查看后台设置" tone="secondary" size="compact" onPress={onOpen} />
        <Button label="稍后再说" tone="secondary" size="compact" onPress={onDismiss} />
      </Inline>
    </Stack>
  );
}
