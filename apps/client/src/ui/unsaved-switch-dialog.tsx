import { useState } from 'react';
import type { View } from 'react-native';

import { getRouteTrigger, rememberRouteTrigger } from '../platform/overlays/route-trigger';
import { AppDialog } from './app-dialog';
import { ConfirmActions, Stack, Text } from './primitives';

/**
 * Asked when a wide-screen pane with unsaved changes is about to give way to
 * another item. The click that caused it was in the list, so the question
 * opens in the middle of the screen instead of replacing the editor in the
 * pane, which keeps the changes in place behind it. `discards` is for an editor
 * that keeps no draft, whose changes are lost on switching.
 */
export function UnsavedSwitchDialog({ discards = false, onKeepEditing, onSwitch }: { discards?: boolean; onKeepEditing(): void; onSwitch(): void }) {
  // Focus goes back to whatever was focused when the question opened: the row that was clicked.
  const [trigger] = useState(() => { rememberRouteTrigger(); return { current: getRouteTrigger() as View | null }; });
  return (
    <AppDialog title="修改还没有保存" busy={false} onClose={onKeepEditing} trigger={trigger}>
      <Stack gap={3}>
        <Text>{discards ? '切换后，这些修改会丢失。' : '切换后修改会存为草稿，回来可以接着编辑。'}</Text>
        <ConfirmActions cancelLabel="继续编辑" confirmLabel={discards ? '放弃修改并切换' : '保留草稿并切换'} destructive={discards} onCancel={onKeepEditing} onConfirm={onSwitch} />
      </Stack>
    </AppDialog>
  );
}
