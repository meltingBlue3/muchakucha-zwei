import { useSyncExternalStore } from 'react';
import { Text } from './primitives';
import { useWorkspaceStore } from './workspace-state';

export function DraftNotice() {
  const store = useWorkspaceStore();
  const failed = useSyncExternalStore(store.subscribe, store.persistenceFailed, store.persistenceFailed);
  return (
    <Text variant="caption" color={failed ? 'destructive' : 'inkMuted'}>
      {failed ? '草稿未能保存到此设备，请勿关闭应用；编辑后会重新尝试保存。' : '草稿自动保存在此设备，关闭后可继续编辑。'}
    </Text>
  );
}
