import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { LabelResponseDto } from '@muchakucha/api-client';
import { sessionApiClient, sessionTransport } from '../../../../../src/features/auth/session-runtime';
import { useHouseholdContext } from '../../../../../src/features/households/household-context';
import { canManageLabels } from '../../../../../src/features/labels/label-permissions';
import { AccessChangedPanel, AppShell } from '../../../../../src/ui/household-components';
import { AppDialog } from '../../../../../src/ui/app-dialog';
import { PageIntro } from '../../../../../src/ui/page-intro';
import { Button, FormActions, Spinner, Stack, Text, TextField } from '../../../../../src/ui/primitives';
import { labelColorPresets, type Theme } from '../../../../../src/ui/theme';
import { getRouteTrigger, rememberRouteTrigger } from '../../../../../src/platform/overlays/route-trigger';

type LabelAction = { kind: 'create' } | { kind: 'edit' | 'delete'; label: LabelResponseDto };

export default function LabelsIndexRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme<Theme>();
  const { viewState, households, currentHouseholdId, accessChangedHouseholdName, refreshHouseholds } = useHouseholdContext();
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
    setName(next.kind === 'create' ? '' : next.label.name);
    setColor(next.kind === 'create' ? labelColorPresets[0]! : next.label.color);
    setAction(next);
  };
  const close = () => { if (!busy) setAction(null); };
  const submit = async () => {
    if (!householdId || !action || !canManage || busy) return;
    if (action.kind !== 'delete' && !name.trim()) { setActionError('请输入标签名称。'); return; }
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

  if (viewState === 'accessChanged') return <AppShell accessibilityLabel="家庭访问权已变化">
    <AccessChangedPanel hasOtherHouseholds={households.length > 0} {...(accessChangedHouseholdName === undefined ? {} : { householdName: accessChangedHouseholdName })} onChooseOther={() => { void refreshHouseholds().then(() => router.replace('/households')); }} onCreateNew={() => router.replace('/household-handoff')} />
  </AppShell>;
  if (!householdId) return <AppShell accessibilityLabel="页面未找到"><Text>这个页面暂时无法访问。</Text></AppShell>;

  return <AppShell accessibilityLabel="标签管理" title="标签管理" showBack showProfile refreshing={refreshing} onRefresh={() => void refresh()}>
    <Stack gap={4}>
      <PageIntro title="标签" action={canManage ? <Button label="新建" accessibilityLabel="新建标签" onPress={() => open({ kind: 'create' })} /> : undefined} />
      {!canManage ? <Text variant="bodySm" color="inkMuted">标签由家主和管理员维护，你可以给日程和任务使用它们。</Text> : null}
      {loading ? <Spinner label="正在加载标签" /> : null}
      {error ? <Stack gap={2}><Text color="destructive" accessibilityRole="alert">{error}</Text><Button label="重试" tone="secondary" onPress={() => void fetchLabels()} /></Stack> : null}
      {!loading && !error && !labels.length ? <Text color="inkMuted">{canManage ? '还没有标签，点击“新建”为日程和任务分类。' : '还没有标签，家主或管理员创建后即可使用。'}</Text> : null}
      <Stack gap={1}>
        {labels.map(label => <View key={label.id} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2], paddingVertical: theme.spacing[2], borderBottomWidth: theme.borderWidths.default, borderColor: theme.colors.separator }}>
          <View style={{ width: theme.spacing[3], height: theme.spacing[3], borderRadius: theme.borderRadii.full, backgroundColor: label.color }} />
          <Text style={{ flex: 1 }} accessibilityLabel={`标签：${label.name}`}>{label.name}</Text>
          {canManage ? <>
            <Pressable accessibilityRole="button" accessibilityLabel={`编辑标签 ${label.name}`} onPress={() => open({ kind: 'edit', label })} style={{ minHeight: theme.controlSizes.touchTarget, minWidth: theme.controlSizes.touchTarget, justifyContent: 'center', alignItems: 'center' }}><Text variant="label" color="link">编辑</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`删除标签 ${label.name}`} onPress={() => open({ kind: 'delete', label })} style={{ minHeight: theme.controlSizes.touchTarget, minWidth: theme.controlSizes.touchTarget, justifyContent: 'center', alignItems: 'center' }}><Text variant="label" color="destructive">删除</Text></Pressable>
          </> : null}
        </View>)}
      </Stack>
    </Stack>
    {action && canManage ? <AppDialog title={action.kind === 'create' ? '新建标签' : action.kind === 'edit' ? '编辑标签' : '删除标签'} busy={busy} onClose={close} trigger={trigger}>
      <Stack gap={4}>
        {action.kind === 'delete' ? <Text>删除“{action.label.name}”后，它会从所有日程和任务中移除，日程和任务本身会保留。</Text> : <>
          <TextField label={action.kind === 'create' ? '标签名称' : '编辑标签名称'} value={name} onChangeText={setName} maxLength={30} editable={!busy} />
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
        {action.kind === 'delete' ? <>
          <Button label="取消删除" tone="secondary" disabled={busy} onPress={close} />
          <Button label="确认删除" accessibilityLabel={`确认删除标签 ${action.label.name}`} loading={busy} onPress={() => void submit()} />
        </> : <FormActions onCancel={close} onSubmit={() => void submit()} submitting={busy} submitLabel={action.kind === 'create' ? '创建标签' : '保存'} />}
      </Stack>
    </AppDialog> : null}
  </AppShell>;
}
