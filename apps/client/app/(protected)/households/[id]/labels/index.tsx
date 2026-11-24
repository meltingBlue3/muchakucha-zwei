import { useTranslation } from '../../../../../src/i18n';
import { useDesktop } from '../../../../../src/ui/use-desktop';
import { CardActionsMenu } from '../../../../../src/ui/card-actions-menu';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import { ApiClientError, type GetHouseholdMemberDto, type LabelListItemDto, type LabelResponseDto } from '@muchakucha/api-client';
import { sessionApiClient, sessionTransport } from '../../../../../src/features/auth/session-runtime';
import { useHouseholdContext } from '../../../../../src/features/households/household-context';
import { canManageLabels } from '../../../../../src/features/labels/label-permissions';
import { LabelColorChoices } from '../../../../../src/features/labels/label-color-choices';
import { HouseholdScreen } from '../../../../../src/features/households/household-screen';
import { ListGroup, ListRow } from '../../../../../src/ui/list-group';
import { AppDialog } from '../../../../../src/ui/app-dialog';
import { FooterDestructiveAction } from '../../../../../src/ui/detail-fields';
import { FloatingCreateButton } from '../../../../../src/ui/floating-create-button';
import { PageIntro } from '../../../../../src/ui/page-intro';
import { Button, ConfirmActions, EmptyState, FormActions, LoadError, LoadingState, Stack, Text, TextField } from '../../../../../src/ui/primitives';
import { labelColorPresets, labelTint, type Theme } from '../../../../../src/ui/theme';
import { getRouteTrigger, rememberRouteTrigger } from '../../../../../src/platform/overlays/route-trigger';
import { focusFieldOnOpen } from '../../../../../src/platform/keyboard/focus-on-open';
import { UnsavedSwitchDialog } from '../../../../../src/ui/unsaved-switch-dialog';
import { labelName } from '../../../../../src/features/labels/label-name';

type LabelAction = { kind: 'create' } | { kind: 'edit'; label: LabelListItemDto };

// The API accepts any hex colour, and the assistant may choose one outside the
// presets or in lower case. Such a label still opens with its own colour chosen.
const presetFor = (color: string) => labelColorPresets.find(preset => preset.toLowerCase() === color.toLowerCase());
const formColor = (label: LabelResponseDto) => presetFor(label.color) ?? label.color;

export default function LabelsIndexRoute() {
  const { t } = useTranslation(['labels', 'navigation', 'common', 'shared']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const desktop = useDesktop();
  const theme = useTheme<Theme>();
  const { households, currentHouseholdId } = useHouseholdContext();
  const householdId = id ?? currentHouseholdId;
  const household = households.find(item => item.id === householdId);
  const canManage = canManageLabels(household?.role);
  const [labels, setLabels] = useState<LabelListItemDto[]>([]);
  const [members, setMembers] = useState<GetHouseholdMemberDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loadedHousehold = useRef<string | null>(null);
  const requestGeneration = useRef(0);
  const [error, setError] = useState<'refreshError' | 'loadError' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LabelListItemDto | null>(null);
  const [pendingAction, setPendingAction] = useState<LabelAction | null>(null);
  const [action, setAction] = useState<LabelAction | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(labelColorPresets[0]!);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<'editChanged' | 'saveError' | null>(null);
  const [deleteError, setDeleteError] = useState<'deleteError' | 'deleteChanged' | null>(null);
  const [nameError, setNameError] = useState<'nameRequired' | null>(null);
  const nameInput = useRef<TextInput>(null);
  const trigger = useRef(getRouteTrigger());
  const deleteTrigger = useRef<View>(null);
  const paneDeleteTrigger = useRef<View>(null);
  const submitting = useRef(false);
  const previewName = name.trim() || t('name');
  const swatches = action && action.kind !== 'create' && !presetFor(action.label.color) ? [action.label.color, ...labelColorPresets] : labelColorPresets;
  // A series counts once. No usage at all means a server from before the
  // count, so say nothing rather than claim the label is unused; a server from
  // before notes had labels reports no note count, which means none.
  const usageParts = (label: LabelListItemDto) => label.usage ? [
    label.usage.events > 0 ? t('usageEvents', { count: label.usage.events }) : null,
    label.usage.tasks > 0 ? t('usageTasks', { count: label.usage.tasks }) : null,
    (label.usage.notes ?? 0) > 0 ? t('usageNotes', { count: label.usage.notes }) : null,
  ].filter((part): part is string => part !== null) : null;
  const usageLine = (label: LabelListItemDto) => {
    const parts = usageParts(label);
    return parts === null ? null : parts.length > 0 ? parts.join(' · ') : t('unused');
  };
  const deletePrompt = (label: LabelListItemDto) => {
    const parts = usageParts(label);
    if (parts === null) return t('deletePrompt', { name: labelName(label) });
    // 「2 个日程、1 个任务和 3 篇笔记」: the last part joins with 和.
    const usage = parts.length > 1 ? `${parts.slice(0, -1).join(t('usageSeparator'))}${t('usageAnd')}${parts[parts.length - 1]}` : parts[0];
    return usage ? t('deletePromptUsed', { name: labelName(label), usage }) : t('deletePromptUnused', { name: labelName(label) });
  };

  // Only the wide list names who created each label; the labels stand on their own if the names fail to load.
  const loadMembers = async (token: string, household: string) => {
    try { setMembers((await sessionApiClient.getHousehold(token, household)).members); } catch { setMembers([]); }
  };
  const fetchLabels = useCallback(async () => {
    if (!householdId) return;
    const request = ++requestGeneration.current;
    setError(null);
    if (loadedHousehold.current !== householdId) { setLoading(true); setLabels([]); setAction(null); setDeleteTarget(null); }
    try {
      const token = await sessionTransport.getAccessToken();
      if (request !== requestGeneration.current) return;
      if (token === null) throw new Error('Session expired');
      const result = await sessionApiClient.listLabels(token, householdId);
      if (request !== requestGeneration.current) return;
      setLabels(result.labels);
      loadedHousehold.current = householdId;
      if (desktop) void loadMembers(token, householdId);
    } catch {
      if (request === requestGeneration.current) setError(loadedHousehold.current === householdId ? 'refreshError' : 'loadError');
    } finally { if (request === requestGeneration.current) setLoading(false); }
  }, [householdId, desktop]);
  useFocusEffect(useCallback(() => {
    void fetchLabels();
    return () => { requestGeneration.current++; };
  }, [fetchLabels]));
  const refresh = async () => { setRefreshing(true); await fetchLabels(); setRefreshing(false); };
  const applyOpen = (next: LabelAction) => {
    rememberRouteTrigger();
    trigger.current = getRouteTrigger();
    setActionError(null);
    setNameError(null);
    setName(next.kind === 'create' ? '' : labelName(next.label));
    setColor(next.kind === 'create' ? labelColorPresets[0]! : formColor(next.label));
    setAction(next);
  };
  const open = (next: LabelAction) => {
    if (busy) return;
    if (desktop && action && (name !== (action.kind === 'create' ? '' : labelName(action.label)) || color !== (action.kind === 'create' ? labelColorPresets[0] : formColor(action.label)))) { setPendingAction(next); return; }
    applyOpen(next);
  };
  const close = () => { if (!busy) setAction(null); };
  const openDelete = (label: LabelListItemDto, source?: View | null) => {
    if (busy) return;
    if (!source) rememberRouteTrigger();
    deleteTrigger.current = source ?? getRouteTrigger();
    setDeleteError(null);
    setDeleteTarget(label);
  };
  const closeDelete = () => { if (!submitting.current) setDeleteTarget(null); };
  // A label renamed or recoloured since the list loaded: show it as it is now and let the person confirm again.
  // An edit keeps what was typed; only the version it is saved against moves on.
  const readChangedLabel = async (token: string, household: string, labelId: string) => {
    const latest = (await sessionApiClient.listLabels(token, household)).labels;
    setLabels(latest);
    return latest.find(label => label.id === labelId) ?? null;
  };
  const submit = async () => {
    if (!householdId || !action || !canManage || submitting.current) return;
    if (!name.trim()) { setNameError('nameRequired'); nameInput.current?.focus(); return; }
    submitting.current = true;
    setBusy(true); setActionError(null);
    let token: string | null = null;
    try {
      token = await sessionTransport.getAccessToken();
      if (token === null) throw new Error('Session expired');
      const data = { name: name.trim(), color };
      const result = action.kind === 'create'
        ? await sessionApiClient.createLabel(token, householdId, data)
        : await sessionApiClient.updateLabel(token, householdId, action.label.id, { ...data, expectedName: action.label.name, expectedColor: action.label.color });
      setLabels(previous => action.kind === 'create' ? [...previous, { ...result, usage: { events: 0, tasks: 0, notes: 0 } }] : previous.map(label => label.id === result.id ? { ...label, ...result } : label));
      setAction(null);
    } catch (caught: unknown) {
      setActionError('saveError');
      if (action.kind === 'edit' && token !== null && caught instanceof ApiClientError && caught.status === 409) {
        try {
          const current = await readChangedLabel(token, householdId, action.label.id);
          setAction(current ? { kind: 'edit', label: current } : null);
          setActionError('editChanged');
        } catch { /* Keep the save error if reloading also failed. */ }
      }
      requestAnimationFrame(() => nameInput.current?.focus());
    } finally { submitting.current = false; setBusy(false); }
  };
  const submitDelete = async () => {
    if (!householdId || !deleteTarget || !canManage || submitting.current) return;
    submitting.current = true;
    setBusy(true); setDeleteError(null);
    let token: string | null = null;
    const { id: labelId, name: expectedName, color: expectedColor } = deleteTarget;
    try {
      token = await sessionTransport.getAccessToken();
      if (token === null) throw new Error('Session expired');
      await sessionApiClient.deleteLabel(token, householdId, labelId, { expectedName, expectedColor });
      setLabels(previous => previous.filter(label => label.id !== labelId));
      setAction(previous => previous?.kind === 'edit' && previous.label.id === labelId ? null : previous);
      setDeleteTarget(null);
    } catch (caught: unknown) {
      setDeleteError('deleteError');
      if (token !== null && caught instanceof ApiClientError && caught.status === 409) {
        try {
          const current = await readChangedLabel(token, householdId, labelId);
          setDeleteTarget(current);
          setDeleteError('deleteChanged');
        } catch { /* Keep the delete error if reloading also failed. */ }
      }
    } finally { submitting.current = false; setBusy(false); }
  };

  return <><HouseholdScreen detailOpen={action !== null} active="labels" subpage accessibilityLabel={t('navigation:pages.labels')} width="reading" refreshing={refreshing} onRefresh={() => void refresh()} floatingAction={canManage ? <FloatingCreateButton label={t('create')} onPress={() => open({ kind: 'create' })} /> : undefined}>
    <Stack gap={5}>
      <PageIntro title={t('navigation:pages.labels')} subtitle={`${desktop && !loading && !error ? `${t('count', { count: labels.length })} · ` : ''}${canManage ? t('intro') : t('memberIntro')}`} />
      {loading ? <LoadingState label={t('loading')} /> : null}
      {error ? <LoadError message={t(error)} onRetry={() => void fetchLabels()} /> : null}
      {!loading && !error && !labels.length ? <EmptyState message={canManage ? t('empty') : t('memberEmpty')} /> : null}
      <ListGroup flush>
        {labels.map(label => {
          const usage = usageLine(label);
          const dot = <View style={{ width: desktop ? theme.spacing[2] + 2 : theme.spacing[3], height: desktop ? theme.spacing[2] + 2 : theme.spacing[3], borderRadius: theme.borderRadii.full, backgroundColor: label.color }} />;
          const menu = canManage ? <CardActionsMenu subject={t('subject', { name: labelName(label) })} actions={[
            { kind: 'edit', accessibilityLabel: t('editItem', { name: labelName(label) }), onPress: () => open({ kind: 'edit', label }) },
            { kind: 'delete', accessibilityLabel: t('deleteItem', { name: labelName(label) }), onPress: () => openDelete(label) },
          ]} /> : null;
          if (desktop && canManage) {
            const creator = members.find(member => member.userId === label.createdBy)?.displayName;
            const shown = action?.kind === 'edit' && action.label.id === label.id;
            return <ListRow key={label.id} accessibilityLabel={t('item', { name: labelName(label) })} selected={shown} onPress={() => open({ kind: 'edit', label })}
              leading={<View style={{ width: theme.spacing[6], height: theme.layout.desktopControl, alignItems: 'center', justifyContent: 'center' }}>{dot}</View>}
              trailing={<>{usage ? <Text variant="meta" numberOfLines={1} style={{ width: theme.spacing[10] * 4 }}>{usage}</Text> : null}{creator ? <Text variant="meta" numberOfLines={1} style={{ width: theme.spacing[10] * 3 }}>{t('creator', { name: creator })}</Text> : null}{menu}</>}>
              <Text variant="bodySm" color="ink" numberOfLines={1}>{labelName(label)}</Text>
            </ListRow>;
          }
          return <View key={label.id} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3], minHeight: theme.controlSizes.touchTarget + theme.spacing[2], paddingLeft: theme.spacing[4], paddingRight: theme.spacing[2] }}>
            {dot}
            <View style={{ flex: 1 }}>
              <Text accessibilityLabel={t('item', { name: labelName(label) })}>{labelName(label)}</Text>
              {usage ? <Text variant="caption" color="inkMuted">{usage}</Text> : null}
            </View>
            {menu}
          </View>;
        })}
      </ListGroup>
    </Stack>
  </HouseholdScreen>
    {action && canManage ? <AppDialog title={action.kind === 'create' ? t('create') : t('edit')} size={desktop ? 'editor' : 'standard'} docked={desktop} busy={busy} onClose={close} trigger={trigger} footer={desktop ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] }}>
      {/* Deleting is a quieter, separate choice at the far edge; the two answers to the form sit together on the right. */}
      {action.kind === 'edit' ? <FooterDestructiveAction ref={paneDeleteTrigger} label={t('delete')} disabled={busy} onPress={() => openDelete(action.label, paneDeleteTrigger.current)} /> : null}
      <View style={{ flex: 1 }} />
      <Button label={t('common:cancel')} tone="secondary" size="compact" disabled={busy} onPress={close} />
      <Button label={action.kind === 'create' ? t('shared:create') : t('common:save')} size="compact" loading={busy} onPress={() => void submit()} />
    </View> : null}>
      <Stack gap={4}>
          <TextField ref={nameInput} autoFocus={!desktop && focusFieldOnOpen} label={action.kind === 'create' ? t('name') : t('editName')} value={name} onChangeText={(text) => { setName(text); if (text.trim()) setNameError(null); }} maxLength={40} disabled={busy} {...(nameError === null ? {} : { error: t(nameError) })} returnKeyType="done" onSubmitEditing={() => void submit()} />
          <Stack gap={2}>
            <Text variant="label">{t('color')}</Text>
            <LabelColorChoices colors={swatches} value={color} onChange={setColor} disabled={busy} wide={desktop} />
          </Stack>
          {desktop ? <Stack gap={2}><Text variant="label">{t('preview')}</Text>
            {/* The label as it will appear: a chip, on a task row and on a calendar block. */}
            <Stack gap={3} style={{ padding: theme.spacing[3], borderWidth: theme.borderWidths.default, borderColor: theme.colors.separator, borderRadius: theme.borderRadii.md }}>
              <View style={{ flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: theme.spacing[2], borderWidth: theme.borderWidths.default, borderColor: theme.colors.outline, borderRadius: theme.borderRadii.full, paddingHorizontal: theme.spacing[3], paddingVertical: theme.spacing[1] }}><View style={{ width: theme.spacing[2], height: theme.spacing[2], borderRadius: theme.borderRadii.full, backgroundColor: color }} /><Text variant="bodySm" color="ink">{previewName}</Text></View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] }}><View style={{ width: theme.spacing[4], height: theme.spacing[4], borderRadius: theme.borderRadii.full, borderWidth: theme.borderWidths.focus - 0.5, borderColor: theme.colors.border }} /><Text variant="bodySm" color="ink">{t('sampleTask')}</Text><View style={{ width: theme.spacing[1] * 2, height: theme.spacing[1] * 2, borderRadius: theme.borderRadii.full, backgroundColor: color }} /><Text variant="meta" numberOfLines={1} style={{ flexShrink: 1 }}>{previewName}</Text></View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2], paddingHorizontal: theme.spacing[2], paddingVertical: theme.spacing[1], borderRadius: theme.borderRadii.sm, borderLeftWidth: theme.borderWidths.focus + 1, borderLeftColor: color, backgroundColor: labelTint(color) }}><Text variant="time">16:30</Text><Text variant="bodySm" color="ink">{t('sampleEvent')}</Text></View>
            </Stack>
          </Stack> : null}
        {actionError ? <Text color="destructive" accessibilityRole="alert">{action.kind === 'create' ? t(actionError) : t(actionError, { name: labelName(action.label) })}</Text> : null}
        {!desktop ? <FormActions onCancel={close} onSubmit={() => void submit()} submitting={busy} submitLabel={action.kind === 'create' ? t('shared:create') : t('common:save')} /> : null}
      </Stack>
    </AppDialog> : null}
    {deleteTarget && canManage ? <AppDialog title={t('delete')} busy={busy} onClose={closeDelete} trigger={deleteTrigger} preferCancel>
      <Stack gap={4}>
        <Text>{deletePrompt(deleteTarget)}</Text>
        {deleteError ? <Text color="destructive" accessibilityRole="alert">{t(deleteError, { name: labelName(deleteTarget) })}</Text> : null}
        <ConfirmActions confirmLabel={t('delete')} confirmAccessibilityLabel={t('confirmDeleteItem', { name: labelName(deleteTarget) })} destructive alignEnd busy={busy} onCancel={closeDelete} onConfirm={() => void submitDelete()} />
      </Stack>
    </AppDialog> : null}
    {/* Labels keep no drafts, so switching away from unsaved changes loses them. */}
    {pendingAction ? <UnsavedSwitchDialog discards onKeepEditing={() => setPendingAction(null)} onSwitch={() => { applyOpen(pendingAction); setPendingAction(null); }} /> : null}
  </>;
}
