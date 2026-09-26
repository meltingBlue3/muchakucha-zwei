import { useRef, useState, useSyncExternalStore } from 'react';
import { Pressable, type View } from 'react-native';
import { theme } from './theme';
import { AppDialog } from './app-dialog';
import { Button, Stack, Text } from './primitives';
import { useWorkspaceStore } from './workspace-state';

export function DraftNotice({ draftKey, busy, onDiscard }: { draftKey: string; busy: boolean; onDiscard(): void }) {
  const store = useWorkspaceStore();
  const prefix = draftKey.slice(0, draftKey.lastIndexOf(':') + 1);
  const failed = useSyncExternalStore(store.subscribe, store.persistenceFailed, store.persistenceFailed);
  const hasDraft = useSyncExternalStore(store.subscribe, () => store.hasDrafts(prefix), () => false);
  const [confirming, setConfirming] = useState(false);
  const trigger = useRef<View>(null);
  return (
    <Stack gap={2}>
      <Text variant="caption" color={failed ? 'destructive' : 'inkMuted'}>
        {failed ? '草稿未能保存到此设备，请勿关闭应用；编辑后会重新尝试保存。' : '草稿保存在此设备，重启后可继续。保存、丢弃、退出登录或离开家庭后清除。'}
      </Text>
      {hasDraft ? <Pressable ref={trigger} accessibilityRole="button" accessibilityLabel="丢弃草稿" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => setConfirming(true)} style={{ minHeight: theme.controlSizes.touchTarget, justifyContent: 'center' }}><Text variant="label" color="link">丢弃草稿</Text></Pressable> : null}
      {confirming ? (
        <AppDialog title="丢弃草稿？" busy={busy} trigger={trigger} onClose={() => setConfirming(false)}>
          <Stack gap={3}>
            <Text>这会清除当前编辑的未保存内容，已经保存到家庭的内容不会删除。</Text>
            <Button label="继续编辑" tone="secondary" disabled={busy} onPress={() => setConfirming(false)} />
            <Button label="确认丢弃草稿" disabled={busy} onPress={() => { store.clear(prefix); setConfirming(false); onDiscard(); }} />
          </Stack>
        </AppDialog>
      ) : null}
    </Stack>
  );
}
