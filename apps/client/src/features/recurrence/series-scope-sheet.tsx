import { i18n, useTranslation } from '../../i18n';
import { useState } from 'react';
import { View } from 'react-native';

import { OptionRow } from '../../ui/compose-rows';
import { Banner, ConfirmActions, Stack, Text } from '../../ui/primitives';

export type SeriesScope = 'this_only' | 'this_and_following';
export type SeriesScopeMode = 'edit' | 'delete' | 'rule-change';

export function seriesScopeTitle(mode: SeriesScopeMode): string { return i18n.t(`recurrence:scope.${mode}.title`); }

/**
 * The scope step shown inside the host window, as in a system calendar: pick
 * 仅此一次 or 此后所有, then confirm. A rule change can only apply from this
 * occurrence on, so 仅此一次 stays visible but unavailable, with the reason.
 */
export function SeriesScopeContent({ mode, error, onClose, onSelect, submitting = null, confirmLabel }: {
  mode: SeriesScopeMode;
  error?: string | null;
  onClose(): void;
  onSelect(scope: SeriesScope): void;
  submitting?: SeriesScope | null;
  /** Defaults to 删除 for deletion and 保存 otherwise. */
  confirmLabel?: string;
}) {
  const { t } = useTranslation(['recurrence', 'common']);
  const [scope, setScope] = useState<SeriesScope>(mode === 'rule-change' ? 'this_and_following' : 'this_only');
  const busy = submitting !== null;
  return (
    <Stack gap={3}>
      <Text>{t(`scope.${mode}.body`)}</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={t('scope.range')}>
        <OptionRow
          label={t('scope.thisOnly')}
          checked={scope === 'this_only'}
          disabled={busy || mode === 'rule-change'}
          {...(mode === 'rule-change' ? { detail: t('scope.ruleChangeDetail') } : {})}
          onPress={() => setScope('this_only')}
        />
        <OptionRow
          label={t('scope.following')}
          detail={t('scope.followingDetail')}
          checked={scope === 'this_and_following'}
          disabled={busy}
          onPress={() => setScope('this_and_following')}
        />
      </View>
      {error ? <Banner>{error}</Banner> : null}
      <ConfirmActions
        confirmLabel={confirmLabel ?? (mode === 'delete' ? t('common:delete') : t('common:save'))}
        destructive={mode === 'delete'}
        busy={busy}
        onCancel={onClose}
        onConfirm={() => onSelect(scope)}
      />
    </Stack>
  );
}
