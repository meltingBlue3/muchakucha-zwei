import { useTranslation } from '../../i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import Plus from 'lucide-react-native/icons/plus';
import { ApiClientError, type LabelResponseDto } from '@muchakucha/api-client';
import { sessionApiClient, sessionTransport } from '../auth/session-runtime';
import { useHouseholdContext } from '../households/household-context';
import { LabelChip } from './label-chip';
import { LabelColorChoices } from './label-color-choices';
import { canManageLabels } from './label-permissions';
import { labelColorPresets, type Theme } from '../../ui/theme';
import { Button, Spinner, Stack, Text, TextField } from '../../ui/primitives';
import { useDesktopDensity } from '../../ui/use-desktop';
import { focusFieldOnOpen } from '../../platform/keyboard/focus-on-open';

interface LabelPickerProps {
  householdId: string;
  selectedLabelIds: string[];
  onChange: (labelIds: string[]) => void;
  onLabelsLoaded?: (labels: LabelResponseDto[]) => void;
}

type CreateError = 'nameRequired' | 'picker.duplicate' | 'picker.createError';

function isDuplicateName(failure: unknown): boolean {
  if (!(failure instanceof ApiClientError) || failure.status !== 400) return false;
  const details = (failure.body as { error?: { details?: Array<{ field?: string; codes?: string[] }> } } | undefined)?.error?.details;
  return Array.isArray(details) && details.some((detail) => detail.field === 'name' && detail.codes?.includes('duplicate') === true);
}

export function LabelPicker({ householdId, selectedLabelIds, onChange, onLabelsLoaded }: LabelPickerProps) {
  const { t } = useTranslation(['labels', 'common']);
  const activeTheme = useTheme<Theme>();
  const dense = useDesktopDensity();
  const { households } = useHouseholdContext();
  const onLabelsLoadedRef = useRef(onLabelsLoaded);
  onLabelsLoadedRef.current = onLabelsLoaded;
  // Only owners and admins may create labels; a member is never offered it.
  const canCreate = canManageLabels(households.find((household) => household.id === householdId)?.role);
  const [allLabels, setAllLabels] = useState<LabelResponseDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftColor, setDraftColor] = useState(labelColorPresets[0]!);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<CreateError | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setFailed(false);
      try {
        const token = await sessionTransport.getAccessToken();
        if (token === null) throw new Error('Session expired');
        const result = await sessionApiClient.listLabels(token, householdId);
        if (!cancelled) {
          setAllLabels(result.labels);
          onLabelsLoadedRef.current?.(result.labels);
        }
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

  // A draft can outlive a label someone deleted. It cannot be shown here to
  // unselect, and saving it would be refused, so drop it once the list is known.
  useEffect(() => {
    if (loading || failed) return;
    const known = selectedLabelIds.filter((id) => allLabels.some((label) => label.id === id));
    if (known.length !== selectedLabelIds.length) onChange(known);
  }, [allLabels, loading, failed, selectedLabelIds, onChange]);

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

  const openCreate = () => {
    setDraftName('');
    setDraftColor(labelColorPresets[0]!);
    setCreateError(null);
    setCreating(true);
  };

  // The new label joins the list and the selection together, so the form never
  // has to be left to create one.
  const submitCreate = async () => {
    if (saving) return;
    const name = draftName.trim();
    if (!name) { setCreateError('nameRequired'); return; }
    setSaving(true);
    setCreateError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) throw new Error('Session expired');
      const created = await sessionApiClient.createLabel(token, householdId, { name, color: draftColor });
      setAllLabels((previous) => [...previous, created]);
      onChange([...selectedLabelIds, created.id]);
      setCreating(false);
    } catch (failure) {
      setCreateError(isDuplicateName(failure) ? 'picker.duplicate' : 'picker.createError');
    } finally {
      setSaving(false);
    }
  };

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

  // A fine pointer needs no 44px target, so desktop chips sit in tight rows.
  const chipTarget = ({ pressed }: { pressed: boolean }) => ({ minHeight: dense ? undefined : activeTheme.controlSizes.touchTarget, justifyContent: 'center' as const, borderRadius: activeTheme.borderRadii.full, opacity: pressed ? 0.7 : 1 });
  const createButton = canCreate && !creating ? (
    <Pressable accessibilityRole="button" accessibilityLabel={t('picker.create')} onPress={openCreate} style={chipTarget}>
      {/* Shaped like a label, but dashed: it adds one rather than being one. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: activeTheme.spacing[1], borderWidth: activeTheme.borderWidths.default, borderStyle: 'dashed', borderColor: activeTheme.colors.border, borderRadius: activeTheme.borderRadii.full, paddingHorizontal: dense ? activeTheme.spacing[2] + 2 : activeTheme.spacing[3], ...(dense ? { height: activeTheme.spacing[6] } : { paddingVertical: activeTheme.spacing[1] }) }}>
        <Plus size={dense ? activeTheme.spacing[3] : activeTheme.spacing[4]} color={activeTheme.colors.ink} strokeWidth={activeTheme.controlSizes.iconStroke} />
        <Text variant={dense ? 'meta' : 'bodySm'} color="ink">{t('picker.create')}</Text>
      </View>
    </Pressable>
  ) : null;

  return (
    <Stack gap={2}>
      {allLabels.length === 0 && !creating ? (
        <Text variant="caption" color="inkMuted">{t(canCreate ? 'picker.emptyManager' : 'picker.emptyMember')}</Text>
      ) : null}
      {allLabels.length > 0 || createButton ? (
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
                style={chipTarget}
              >
                <LabelChip label={label} selected={isSelected} dense={dense} />
              </Pressable>
            );
          })}
          {createButton}
        </View>
      ) : null}
      {creating ? (
        // Framed as one step inside the form, so it does not read as more fields of the item.
        <Stack gap={3} style={{ padding: activeTheme.spacing[3], borderWidth: activeTheme.borderWidths.default, borderColor: activeTheme.colors.separator, borderRadius: activeTheme.borderRadii.md }}>
          <TextField
            label={t('name')}
            value={draftName}
            onChangeText={(text) => { setDraftName(text); if (text.trim() && createError === 'nameRequired') setCreateError(null); }}
            maxLength={40}
            disabled={saving}
            autoFocus={focusFieldOnOpen}
            {...(createError === 'nameRequired' ? { error: t('nameRequired') } : {})}
            returnKeyType="done"
            onSubmitEditing={() => void submitCreate()}
          />
          <LabelColorChoices colors={labelColorPresets} value={draftColor} onChange={setDraftColor} disabled={saving} dense={dense} />
          {createError !== null && createError !== 'nameRequired' ? <Text variant="caption" color="destructive" accessibilityRole="alert">{t(createError)}</Text> : null}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: activeTheme.spacing[2] }}>
            <Button label={t('common:cancel')} tone="secondary" size="compact" disabled={saving} onPress={() => setCreating(false)} />
            <Button label={t('picker.createSubmit')} size="compact" loading={saving} onPress={() => void submitCreate()} />
          </View>
        </Stack>
      ) : null}
    </Stack>
  );
}
