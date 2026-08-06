import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { LabelResponseDto } from '@muchakucha/api-client';
import { sessionApiClient, sessionTransport } from '../auth/session-runtime';
import { LabelChip } from './label-chip';
import type { Theme } from '../../ui/theme';
import { Text } from '../../ui/primitives';

interface LabelPickerProps {
  householdId: string;
  selectedLabelIds: string[];
  onChange: (labelIds: string[]) => void;
}

export function LabelPicker({ householdId, selectedLabelIds, onChange }: LabelPickerProps) {
  const activeTheme = useTheme<Theme>();
  const [allLabels, setAllLabels] = useState<LabelResponseDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const token = await sessionTransport.getAccessToken();
        if (token === null) return;
        const result = await sessionApiClient.listLabels(token, householdId);
        if (!cancelled) setAllLabels(result.labels);
      } catch {
        // silently ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [householdId]);

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
        <ActivityIndicator size="small" color={activeTheme.colors.coral} />
        <Text variant="caption" color="inkMuted">加载标签中…</Text>
      </View>
    );
  }

  if (allLabels.length === 0) {
    return (
      <Text variant="caption" color="inkMuted">
        暂无标签。请先在标签管理页面创建标签。
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
            accessibilityLabel={`${isSelected ? '取消选择' : '选择'}标签 ${label.name}`}
            style={({ pressed }) => ({
              opacity: pressed ? 0.7 : isSelected ? 1 : 0.5,
            })}
          >
            <LabelChip label={label} />
          </Pressable>
        );
      })}
    </View>
  );
}
