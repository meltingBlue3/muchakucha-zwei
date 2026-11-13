import { useTranslation } from '../../i18n';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { LabelResponseDto } from '@muchakucha/api-client';
import { sessionApiClient, sessionTransport } from '../auth/session-runtime';
import { LabelChip } from './label-chip';
import type { Theme } from '../../ui/theme';
import { Spinner, Text } from '../../ui/primitives';
import { useDesktopDensity } from '../../ui/use-desktop';

interface LabelPickerProps {
  householdId: string;
  selectedLabelIds: string[];
  onChange: (labelIds: string[]) => void;
}

export function LabelPicker({ householdId, selectedLabelIds, onChange }: LabelPickerProps) {
  const { t } = useTranslation(['labels', 'common']);
  const activeTheme = useTheme<Theme>();
  const dense = useDesktopDensity();
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
        <Spinner label={t('loading')} />
        <Text variant="caption" color="inkMuted">{t('picker.loading')}</Text>
      </View>
    );
  }

  if (failed) {
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: activeTheme.spacing[2] }}>
        <Text variant="caption" color="destructive" accessibilityRole="alert" style={{ flexShrink: 1 }}>{t('picker.error')}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('picker.retry')}
          onPress={() => setAttempt(value => value + 1)}
          style={({ pressed }) => ({ minHeight: activeTheme.controlSizes.touchTarget, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
        >
          <Text variant="label" color="link">{t('common:retry')}</Text>
        </Pressable>
      </View>
    );
  }

  if (allLabels.length === 0) {
    return (
      <Text variant="caption" color="inkMuted">
        {t('picker.empty')}
      </Text>
    );
  }

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: activeTheme.spacing[2], ...(dense ? { paddingVertical: activeTheme.spacing[1] + 2 } : {}) }}>
      {allLabels.map((label) => {
        const isSelected = selectedLabelIds.includes(label.id);
        return (
          <Pressable
            key={label.id}
            onPress={() => handleToggle(label)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={t(isSelected ? 'picker.unselect' : 'picker.select', { name: label.name })}
            // A fine pointer needs no 44px target, so desktop chips sit in tight rows.
            style={({ pressed }) => ({ minHeight: dense ? undefined : activeTheme.controlSizes.touchTarget, justifyContent: 'center', borderRadius: activeTheme.borderRadii.full, opacity: pressed ? 0.7 : 1 })}
          >
            <LabelChip label={label} selected={isSelected} dense={dense} />
          </Pressable>
        );
      })}
    </View>
  );
}
