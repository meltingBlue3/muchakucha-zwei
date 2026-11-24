import { useSyncExternalStore } from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import { Text } from './primitives';
import { useWorkspaceStore } from './workspace-state';
import { useTranslation } from '../i18n';

/** Drafts save silently; only a failed save is worth interrupting the form for. */
export function DraftNotice({ style }: { style?: StyleProp<TextStyle> } = {}) {
  const { t } = useTranslation('shared');
  const store = useWorkspaceStore();
  const failed = useSyncExternalStore(store.subscribe, store.persistenceFailed, store.persistenceFailed);
  if (!failed) return null;
  return (
    <Text variant="caption" color="destructive" style={style}>
      {t('draftSaveFailed')}
    </Text>
  );
}
