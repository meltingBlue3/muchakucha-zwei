import { useTranslation } from '../../i18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { Spinner, Stack, Text, TextField } from '../../ui/primitives';
import { AnchoredPopover } from '../../ui/anchored-popover';
import { PickerActions } from '../../ui/picker-panels';
import { useDesktop, useDesktopDensity } from '../../ui/use-desktop';
import { useWindowStep, type RouteWindowStep } from '../../ui/window-step';
import { focusFieldOnOpen } from '../../platform/keyboard/focus-on-open';
import { labelName } from './label-name';

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
  const desktop = useDesktop();
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const createTrigger = useRef<View>(null);

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

  const closeCreate = useCallback(() => { if (!saving) setCreating(false); }, [saving]);

  // The new label joins the list and the selection together, so the form never
  // has to be left to create one. Whoever reads the list hears of it too.
  const createLabel = useCallback(async (name: string, color: string): Promise<CreateError | null> => {
    setSaving(true);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) throw new Error('Session expired');
      const created = await sessionApiClient.createLabel(token, householdId, { name, color });
      const labels = [...allLabels, created];
      setAllLabels(labels);
      onLabelsLoadedRef.current?.(labels);
      onChange([...selectedLabelIds, created.id]);
      setCreating(false);
      return null;
    } catch (failure) {
      return isDuplicateName(failure) ? 'picker.duplicate' : 'picker.createError';
    } finally {
      setSaving(false);
    }
  }, [householdId, allLabels, selectedLabelIds, onChange]);

  // Opened over the form rather than at its foot, where a short window cut it
  // off: a popover by the button on a wide screen, a step of the window on a phone.
  const createForm = useMemo(() => creating ? <LabelCreateForm saving={saving} dense={dense} onSubmit={createLabel} onCancel={closeCreate} /> : null, [creating, saving, dense, createLabel, closeCreate]);
  const createStep = useMemo<RouteWindowStep | null>(() => createForm && !desktop ? {
    title: t('picker.create'),
    onClose: closeCreate,
    onReturn: () => (createTrigger.current as unknown as { focus?(): void } | null)?.focus?.(),
    content: createForm,
  } : null, [createForm, desktop, closeCreate, t]);
  const inWindow = useWindowStep(createStep);

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
  // It stays in place while the form is open, so the popover keeps its anchor and focus returns to it.
  const createButton = canCreate ? (
    <Pressable ref={createTrigger} accessibilityRole="button" accessibilityLabel={t('picker.create')} accessibilityState={{ expanded: creating }} aria-expanded={creating} aria-haspopup="dialog" onPress={() => { if (creating) closeCreate(); else setCreating(true); }} style={chipTarget}>
      {/* Shaped like a label, but dashed: it adds one rather than being one. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: activeTheme.spacing[1], borderWidth: activeTheme.borderWidths.default, borderStyle: 'dashed', borderColor: activeTheme.colors.border, borderRadius: activeTheme.borderRadii.full, paddingHorizontal: dense ? activeTheme.spacing[2] + 2 : activeTheme.spacing[3], ...(dense ? { height: activeTheme.spacing[6] } : { paddingVertical: activeTheme.spacing[1] }) }}>
        <Plus size={dense ? activeTheme.spacing[3] : activeTheme.spacing[4]} color={activeTheme.colors.ink} strokeWidth={activeTheme.controlSizes.iconStroke} />
        <Text variant={dense ? 'meta' : 'bodySm'} color="ink">{t('picker.create')}</Text>
      </View>
    </Pressable>
  ) : null;

  return (
    <Stack gap={2}>
      {allLabels.length === 0 ? (
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
                accessibilityLabel={t(isSelected ? 'picker.unselect' : 'picker.select', { name: labelName(label) })}
                style={chipTarget}
              >
                <LabelChip label={label} selected={isSelected} dense={dense} />
              </Pressable>
            );
          })}
          {createButton}
        </View>
      ) : null}
      {createForm && desktop ? (
        <AnchoredPopover scrollable title={t('picker.create')} trigger={createTrigger} busy={saving} onClose={closeCreate}>{createForm}</AnchoredPopover>
      ) : createForm && !inWindow ? (
        // Outside a window it opens in place, framed so it does not read as more fields of the item.
        <View style={{ padding: activeTheme.spacing[3], borderWidth: activeTheme.borderWidths.default, borderColor: activeTheme.colors.separator, borderRadius: activeTheme.borderRadii.md }}>{createForm}</View>
      ) : null}
    </Stack>
  );
}

/**
 * 新建标签: a name and a colour. `onSubmit` sends them and answers with what
 * went wrong, if anything; what was typed stays until it succeeds.
 */
function LabelCreateForm({ saving, dense, onSubmit, onCancel }: {
  saving: boolean;
  dense: boolean;
  onSubmit(name: string, color: string): Promise<CreateError | null>;
  onCancel(): void;
}) {
  const { t } = useTranslation('labels');
  const [name, setName] = useState('');
  const [color, setColor] = useState(labelColorPresets[0]!);
  const [error, setError] = useState<CreateError | null>(null);

  const submit = async () => {
    if (saving) return;
    const trimmed = name.trim();
    if (!trimmed) { setError('nameRequired'); return; }
    setError(null);
    const failure = await onSubmit(trimmed, color);
    if (failure !== null) setError(failure);
  };

  return (
    <Stack gap={3}>
      <TextField
        label={t('name')}
        value={name}
        onChangeText={(text) => { setName(text); if (text.trim() && error === 'nameRequired') setError(null); }}
        maxLength={40}
        disabled={saving}
        autoFocus={focusFieldOnOpen}
        {...(error === 'nameRequired' ? { error: t('nameRequired') } : {})}
        returnKeyType="done"
        onSubmitEditing={() => void submit()}
      />
      <LabelColorChoices colors={labelColorPresets} value={color} onChange={setColor} disabled={saving} dense={dense} />
      {error !== null && error !== 'nameRequired' ? <Text variant="caption" color="destructive" accessibilityRole="alert">{t(error)}</Text> : null}
      <PickerActions onCancel={onCancel} onConfirm={() => void submit()} confirmLabel={t('picker.createSubmit')} busy={saving} />
    </Stack>
  );
}
