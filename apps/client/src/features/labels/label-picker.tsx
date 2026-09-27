import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { LabelResponseDto } from '@muchakucha/api-client';
import { sessionApiClient, sessionTransport } from '../auth/session-runtime';
import { LabelChip } from './label-chip';
import type { Theme } from '../../ui/theme';
import { Spinner, Text } from '../../ui/primitives';

interface LabelPickerProps {
  householdId: string;
  selectedLabelIds: string[];
  onChange: (labelIds: string[]) => void;
}

export function LabelPicker({ householdId, selectedLabelIds, onChange }: LabelPickerProps) {
  const activeTheme = useTheme<Theme>();
  const [allLabels, setAllLabels] = useState<LabelResponseDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setFailed(false);
      try {
        const token = await sessionTransport.getAccessToken();
        if (token === null) throw new Error('Session expired');
        const result = await sessionApiClient.listLabels(token, householdId);
        if (!cancelled) setAllLabels(result.labels);
      } catch {
        // An unloaded list is not an empty one; say so and offer a retry.
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [householdId, attempt]);

  const handleToggle = useCallback(
    (label: LabelResponseDto) => {
      if (selectedLabelIds.includes(label.id)) {
        onChange(selectedLabelIds.filter((id) => id !== label.id));
      } else {
        onChange([...selectedLabelIds, label.id]);
      }
    },
    [selectedLabelIds, onChange],
  );

  if (loading) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: activeTheme.spacing[2], paddingVertical: activeTheme.spacing[2] }}>
        <Spinner label="正在加载标签" />
        <Text variant="caption" color="inkMuted">加载标签中…</Text>
      </View>
    );
  }

  if (failed) {
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: activeTheme.spacing[2] }}>
        <Text variant="caption" color="destructive" accessibilityRole="alert" style={{ flexShrink: 1 }}>标签没有加载成功。</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="重试加载标签"
          onPress={() => setAttempt(value => value + 1)}
          style={({ pressed }) => ({ minHeight: activeTheme.controlSizes.touchTarget, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
        >
          <Text variant="label" color="link">重试</Text>
        </Pressable>
      </View>
    );
  }

  if (allLabels.length === 0) {
    return (
      <Text variant="caption" color="inkMuted">
        还没有标签。可以在「家庭 → 标签管理」中创建。
      </Text>
    );
  }

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: activeTheme.spacing[2] }}>
      {allLabels.map((label) => {
        const isSelected = selectedLabelIds.includes(label.id);
        return (
          <Pressable
            key={label.id}
            onPress={() => handleToggle(label)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={`${isSelected ? '取消选择' : '选择'}标签 ${label.name}`}
            style={({ pressed }) => ({ minHeight: activeTheme.controlSizes.touchTarget, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
          >
            <LabelChip label={label} selected={isSelected} />
          </Pressable>
        );
      })}
    </View>
  );
}
