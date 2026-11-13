import { useState } from 'react';
import type { View } from 'react-native';

import { getRouteTrigger, rememberRouteTrigger } from '../platform/overlays/route-trigger';
import { AppDialog } from './app-dialog';
import { ConfirmActions, Stack, Text } from './primitives';
import { useTranslation } from '../i18n';

/**
 * Asked when a wide-screen pane with unsaved changes is about to give way to
 * another item. The click that caused it was in the list, so the question
 * opens in the middle of the screen instead of replacing the editor in the
 * pane, which keeps the changes in place behind it. `discards` is for an editor
 * that keeps no draft, whose changes are lost on switching.
 */
export function UnsavedSwitchDialog({ discards = false, onKeepEditing, onSwitch }: { discards?: boolean; onKeepEditing(): void; onSwitch(): void }) {
  const { t } = useTranslation(['shared', 'common']);
  // Focus goes back to whatever was focused when the question opened: the row that was clicked.
  const [trigger] = useState(() => { rememberRouteTrigger(); return { current: getRouteTrigger() as View | null }; });
  return (
    <AppDialog title={t('unsavedTitle')} busy={false} onClose={onKeepEditing} trigger={trigger}>
      <Stack gap={3}>
        <Text>{t(discards ? 'switchDiscardNotice' : 'switchDraftNotice')}</Text>
        <ConfirmActions cancelLabel={t('common:continueEditing')} confirmLabel={t(discards ? 'switchDiscard' : 'switchKeepDraft')} destructive={discards} onCancel={onKeepEditing} onConfirm={onSwitch} />
      </Stack>
    </AppDialog>
  );
}
