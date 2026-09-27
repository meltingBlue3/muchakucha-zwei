import { useState } from 'react';
import { View } from 'react-native';

import { OptionRow } from '../../ui/compose-rows';
import { Banner, ConfirmActions, Stack, Text } from '../../ui/primitives';

export type SeriesScope = 'this_only' | 'this_and_following';
export type SeriesScopeMode = 'edit' | 'delete' | 'rule-change';

const MODE_COPY: Record<SeriesScopeMode, { body: string; title: string }> = {
  edit: {
    body: '这是一个重复安排。选择这次改动的影响范围。',
    title: '保存这次改动？',
  },
  delete: {
    body: '这是一个重复安排。选择要删除的范围，此操作不可撤销。',
    title: '删除这次重复？',
  },
  'rule-change': {
    body: '重复规则的更改会影响之后的每一次，不能只改这一次。',
    title: '更改重复规则？',
  },
};

export function seriesScopeTitle(mode: SeriesScopeMode): string { return MODE_COPY[mode].title; }

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
  const [scope, setScope] = useState<SeriesScope>(mode === 'rule-change' ? 'this_and_following' : 'this_only');
  const busy = submitting !== null;
  return (
    <Stack gap={3}>
      <Text>{MODE_COPY[mode].body}</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="影响范围">
        <OptionRow
          label="仅此一次"
          checked={scope === 'this_only'}
          disabled={busy || mode === 'rule-change'}
          {...(mode === 'rule-change' ? { detail: '重复规则的改动只能应用到这一次和之后。' } : {})}
          onPress={() => setScope('this_only')}
        />
        <OptionRow
          label="此后所有"
          detail="这一次和之后的重复，已经过去的不受影响。"
          checked={scope === 'this_and_following'}
          disabled={busy}
          onPress={() => setScope('this_and_following')}
        />
      </View>
      {error ? <Banner>{error}</Banner> : null}
      <ConfirmActions
        confirmLabel={confirmLabel ?? (mode === 'delete' ? '删除' : '保存')}
        destructive={mode === 'delete'}
        busy={busy}
        onCancel={onClose}
        onConfirm={() => onSelect(scope)}
      />
    </Stack>
  );
}
