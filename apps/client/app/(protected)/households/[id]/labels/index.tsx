import { CardActionsMenu } from '../../../../../src/ui/card-actions-menu';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { LabelResponseDto } from '@muchakucha/api-client';
import { sessionApiClient, sessionTransport } from '../../../../../src/features/auth/session-runtime';
import { useHouseholdContext } from '../../../../../src/features/households/household-context';
import { canManageLabels } from '../../../../../src/features/labels/label-permissions';
import { HouseholdScreen } from '../../../../../src/features/households/household-screen';
import { ListGroup } from '../../../../../src/ui/list-group';
import { AppDialog } from '../../../../../src/ui/app-dialog';
import { PageIntro } from '../../../../../src/ui/page-intro';
import { Button, ConfirmActions, EmptyState, FormActions, LoadError, LoadingState, Stack, Text, TextField } from '../../../../../src/ui/primitives';
import { labelColorPresets, type Theme } from '../../../../../src/ui/theme';
import { getRouteTrigger, rememberRouteTrigger } from '../../../../../src/platform/overlays/route-trigger';
import { focusFieldOnOpen } from '../../../../../src/platform/keyboard/focus-on-open';

type LabelAction = { kind: 'create' } | { kind: 'edit' | 'delete'; label: LabelResponseDto };

export default function LabelsIndexRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme<Theme>();
  const { households, currentHouseholdId } = useHouseholdContext();
  const householdId = id ?? currentHouseholdId;
  const household = households.find(item => item.id === householdId);
  const canManage = canManageLabels(household?.role);
  const [labels, setLabels] = useState<LabelResponseDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loaded = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<LabelAction | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(labelColorPresets[0]!);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const nameInput = useRef<TextInput>(null);
  const trigger = useRef(getRouteTrigger());

  const fetchLabels = useCallback(async () => {
    if (!householdId) return;
    setError(null);
    if (!loaded.current) setLoading(true);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) throw new Error('Session expired');
      const result = await sessionApiClient.listLabels(token, householdId);
      setLabels(result.labels);
      loaded.current = true;
    } catch {
      setError(loaded.current ? '刷新失败，仍显示上次的标签。请重试。' : '无法加载标签，请检查网络后重试。');
    } finally { setLoading(false); }
  }, [householdId]);
  useFocusEffect(useCallback(() => { void fetchLabels(); }, [fetchLabels]));
  const refresh = async () => { setRefreshing(true); await fetchLabels(); setRefreshing(false); };
  const open = (next: LabelAction) => {
    rememberRouteTrigger();
    trigger.current = getRouteTrigger();
    setActionError(null);
    setNameError(null);
    setName(next.kind === 'create' ? '' : next.label.name);
    setColor(next.kind === 'create' ? labelColorPresets[0]! : next.label.color);
    setAction(next);
  };
  const close = () => { if (!busy) setAction(null); };
  const submit = async () => {
    if (!householdId || !action || !canManage || busy) return;
    if (action.kind !== 'delete' && !name.trim()) { setNameError('请输入标签名称。'); nameInput.current?.focus(); return; }
    setBusy(true); setActionError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) throw new Error('Session expired');
      if (action.kind === 'delete') {
        await sessionApiClient.deleteLabel(token, householdId, action.label.id);
        setLabels(previous => previous.filter(label => label.id !== action.label.id));
      } else {
        const data = { name: name.trim(), color };
        const result = action.kind === 'create'
          ? await sessionApiClient.createLabel(token, householdId, data)
          : await sessionApiClient.updateLabel(token, householdId, action.label.id, data);
        setLabels(previous => action.kind === 'create' ? [...previous, result] : previous.map(label => label.id === result.id ? result : label));
      }
      setAction(null);
    } catch {
      setActionError(action.kind === 'delete' ? '删除失败，请检查网络或权限后重试。' : '保存失败，请检查名称是否重复、网络或权限后重试。');
    } finally { setBusy(false); }
  };

  return <HouseholdScreen active="labels" subpage accessibilityLabel="标签管理" width="reading" refreshing={refreshing} onRefresh={() => void refresh()}>
    <Stack gap={5}>
      <PageIntro title="标签管理" subtitle={canManage ? '给日程和任务分类，全家共用。' : '标签由所有者和管理员维护，你可以给日程和任务使用它们。'} action={canManage ? <Button label="创建" accessibilityLabel="创建标签" onPress={() => open({ kind: 'create' })} /> : undefined} />
      {loading ? <LoadingState label="正在加载标签" /> : null}
      {error ? <LoadError message={error} onRetry={() => void fetchLabels()} /> : null}
      {!loading && !error && !labels.length ? <EmptyState message={canManage ? '还没有标签，点击“创建”为日程和任务分类。' : '还没有标签，所有者或管理员创建后即可使用。'} /> : null}
      <ListGroup>
        {labels.map(label => <View key={label.id} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3], minHeight: theme.controlSizes.touchTarget + theme.spacing[2], paddingLeft: theme.spacing[4], paddingRight: theme.spacing[2] }}>
          <View style={{ width: theme.spacing[3], height: theme.spacing[3], borderRadius: theme.borderRadii.full, backgroundColor: label.color }} />
          <Text style={{ flex: 1 }} accessibilityLabel={`标签：${label.name}`}>{label.name}</Text>
          {canManage ? <CardActionsMenu subject={`标签 ${label.name}`} actions={[
            { kind: 'edit', accessibilityLabel: `编辑标签 ${label.name}`, onPress: () => open({ kind: 'edit', label }) },
            { kind: 'delete', accessibilityLabel: `删除标签 ${label.name}`, onPress: () => open({ kind: 'delete', label }) },
          ]} /> : null}
        </View>)}
      </ListGroup>
    </Stack>
    {action && canManage ? <AppDialog title={action.kind === 'create' ? '创建标签' : action.kind === 'edit' ? '编辑标签' : '删除标签'} busy={busy} onClose={close} trigger={trigger}>
      <Stack gap={4}>
        {action.kind === 'delete' ? <Text>删除“{action.label.name}”后，它会从所有日程和任务中移除，日程和任务本身会保留。</Text> : <>
          <TextField ref={nameInput} autoFocus={focusFieldOnOpen} label={action.kind === 'create' ? '标签名称' : '编辑标签名称'} value={name} onChangeText={(text) => { setName(text); if (text.trim()) setNameError(null); }} maxLength={30} disabled={busy} {...(nameError === null ? {} : { error: nameError })} returnKeyType="done" onSubmitEditing={() => void submit()} />
          <Stack gap={2}>
            <Text variant="label">颜色</Text>
            <View accessibilityRole="radiogroup" accessibilityLabel="标签颜色" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[2] }}>
              {labelColorPresets.map(preset => <Pressable key={preset} accessibilityRole="radio" accessibilityLabel={`选择颜色 ${preset}`} accessibilityState={{ checked: color === preset, disabled: busy }} aria-checked={color === preset} disabled={busy} onPress={() => setColor(preset)} style={{ minWidth: theme.controlSizes.touchTarget, minHeight: theme.controlSizes.touchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: theme.borderRadii.full, borderWidth: theme.borderWidths.default, borderColor: color === preset ? theme.colors.ink : theme.colors.separator }}>
                <View style={{ width: theme.controlSizes.icon, height: theme.controlSizes.icon, borderRadius: theme.borderRadii.full, backgroundColor: preset }} />
              </Pressable>)}
            </View>
          </Stack>
        </>}
        {actionError ? <Text color="destructive" accessibilityRole="alert">{actionError}</Text> : null}
        {action.kind === 'delete' ? <ConfirmActions cancelLabel="取消删除" confirmLabel="确认删除" confirmAccessibilityLabel={`确认删除标签 ${action.label.name}`} destructive busy={busy} onCancel={close} onConfirm={() => void submit()} /> : <FormActions onCancel={close} onSubmit={() => void submit()} submitting={busy} submitLabel={action.kind === 'create' ? '创建' : '保存'} />}
      </Stack>
    </AppDialog> : null}
  </HouseholdScreen>;
}
