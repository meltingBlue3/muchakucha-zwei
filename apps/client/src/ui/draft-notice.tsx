import { useSyncExternalStore } from 'react';
import { Text } from './primitives';
import { useWorkspaceStore } from './workspace-state';

/** Drafts save silently; only a failed save is worth interrupting the form for. */
export function DraftNotice() {
  const store = useWorkspaceStore();
  const failed = useSyncExternalStore(store.subscribe, store.persistenceFailed, store.persistenceFailed);
  if (!failed) return null;
  return (
    <Text variant="caption" color="destructive">
      草稿未能保存到此设备，请勿关闭应用；编辑后会重新尝试保存。
    </Text>
  );
}
