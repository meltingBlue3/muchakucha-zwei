import { useDesktop } from '../../../../../src/ui/use-desktop';
import { CardActionsMenu } from '../../../../../src/ui/card-actions-menu';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { GetHouseholdMemberDto, LabelResponseDto } from '@muchakucha/api-client';
import { sessionApiClient, sessionTransport } from '../../../../../src/features/auth/session-runtime';
import { useHouseholdContext } from '../../../../../src/features/households/household-context';
import { canManageLabels } from '../../../../../src/features/labels/label-permissions';
import { HouseholdScreen } from '../../../../../src/features/households/household-screen';
import { ListGroup, ListRow } from '../../../../../src/ui/list-group';
import { AppDialog } from '../../../../../src/ui/app-dialog';
import { FloatingCreateButton } from '../../../../../src/ui/floating-create-button';
import { PageIntro } from '../../../../../src/ui/page-intro';
import { Button, ConfirmActions, EmptyState, FormActions, LoadError, LoadingState, Stack, Text, TextField } from '../../../../../src/ui/primitives';
import { labelColorPresets, labelTint, type Theme } from '../../../../../src/ui/theme';
import { getRouteTrigger, rememberRouteTrigger } from '../../../../../src/platform/overlays/route-trigger';
import { focusFieldOnOpen } from '../../../../../src/platform/keyboard/focus-on-open';

type LabelAction = { kind: 'create' } | { kind: 'edit' | 'delete'; label: LabelResponseDto };

export default function LabelsIndexRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const desktop = useDesktop();
  const theme = useTheme<Theme>();
  const { households, currentHouseholdId } = useHouseholdContext();
  const householdId = id ?? currentHouseholdId;
  const household = households.find(item => item.id === householdId);
  const canManage = canManageLabels(household?.role);
  const [labels, setLabels] = useState<LabelResponseDto[]>([]);
  const [members, setMembers] = useState<GetHouseholdMemberDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loadedHousehold = useRef<string | null>(null);
  const requestGeneration = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [deletingFromPane, setDeletingFromPane] = useState(false);
  const [pendingAction, setPendingAction] = useState<LabelAction | null>(null);
  const [action, setAction] = useState<LabelAction | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(labelColorPresets[0]!);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const nameInput = useRef<TextInput>(null);
  const trigger = useRef(getRouteTrigger());
  const swatch = theme.controlSizes.touchTarget - theme.spacing[3];
  const previewName = name.trim() || '标签名称';

  // Only the wide list names who created each label; the labels stand on their own if the names fail to load.
  const loadMembers = async (token: string, household: string) => {
    try { setMembers((await sessionApiClient.getHousehold(token, household)).members); } catch { setMembers([]); }
  };
  const fetchLabels = useCallback(async () => {
    if (!householdId) return;
    const request = ++requestGeneration.current;
    setError(null);
    if (loadedHousehold.current !== householdId) { setLoading(true); setLabels([]); setAction(null); }
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
      if (request === requestGeneration.current) setError(loadedHousehold.current === householdId ? '刷新失败，仍显示上次的标签。请重试。' : '无法加载标签，请检查网络后重试。');
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
    setDeletingFromPane(false);
    setActionError(null);
    setNameError(null);
    setName(next.kind === 'create' ? '' : next.label.name);
    setColor(next.kind === 'create' ? labelColorPresets[0]! : next.label.color);
    setAction(next);
  };
  const open = (next: LabelAction) => {
    if (busy) return;
    if (desktop && action && action.kind !== 'delete' && (name !== (action.kind === 'create' ? '' : action.label.name) || color !== (action.kind === 'create' ? labelColorPresets[0] : action.label.color))) { setPendingAction(next); return; }
    applyOpen(next);
  };
  const close = () => { if (!busy) { if (pendingAction) setPendingAction(null); else if (action?.kind === 'delete' && deletingFromPane) { setAction({ kind: 'edit', label: action.label }); setDeletingFromPane(false); } else setAction(null); } };
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
      // The busy submit button gave up focus; put it back on the name, inside the form, so typing or Escape still reaches it.
      if (action.kind !== 'delete') requestAnimationFrame(() => nameInput.current?.focus());
    } finally { setBusy(false); }
  };

  return <><HouseholdScreen detailOpen={action !== null && (action.kind !== 'delete' || deletingFromPane)} active="labels" subpage accessibilityLabel="标签管理" width="reading" refreshing={refreshing} onRefresh={() => void refresh()} floatingAction={canManage ? <FloatingCreateButton label="创建标签" onPress={() => open({ kind: 'create' })} /> : undefined}>
    <Stack gap={5}>
      <PageIntro title="标签管理" subtitle={`${desktop && !loading && !error ? `${labels.length} 个 · ` : ''}${canManage ? '给日程和任务分类，全家共用。' : '标签由所有者和管理员维护，你可以给日程和任务使用它们。'}`} />
      {loading ? <LoadingState label="正在加载标签" /> : null}
      {error ? <LoadError message={error} onRetry={() => void fetchLabels()} /> : null}
      {!loading && !error && !labels.length ? <EmptyState message={canManage ? '还没有标签，创建一个来给日程和任务分类。' : '还没有标签，所有者或管理员创建后即可使用。'} /> : null}
      <ListGroup flush>
        {labels.map(label => {
          const dot = <View style={{ width: desktop ? theme.spacing[2] + 2 : theme.spacing[3], height: desktop ? theme.spacing[2] + 2 : theme.spacing[3], borderRadius: theme.borderRadii.full, backgroundColor: label.color }} />;
          const menu = canManage ? <CardActionsMenu subject={`标签 ${label.name}`} actions={[
            { kind: 'edit', accessibilityLabel: `编辑标签 ${label.name}`, onPress: () => open({ kind: 'edit', label }) },
            { kind: 'delete', accessibilityLabel: `删除标签 ${label.name}`, onPress: () => open({ kind: 'delete', label }) },
          ]} /> : null;
          if (desktop && canManage) {
            const creator = members.find(member => member.userId === label.createdBy)?.displayName;
            const shown = action !== null && action.kind !== 'create' && action.label.id === label.id && (action.kind === 'edit' || deletingFromPane);
            return <ListRow key={label.id} accessibilityLabel={`标签：${label.name}`} selected={shown} onPress={() => open({ kind: 'edit', label })}
              leading={<View style={{ width: theme.spacing[6], height: theme.layout.desktopControl, alignItems: 'center', justifyContent: 'center' }}>{dot}</View>}
              trailing={<>{creator ? <Text variant="meta" numberOfLines={1} style={{ width: theme.spacing[10] * 3 }}>{`${creator} 创建`}</Text> : null}{menu}</>}>
              <Text variant="bodySm" color="ink" numberOfLines={1}>{label.name}</Text>
            </ListRow>;
          }
          return <View key={label.id} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3], minHeight: theme.controlSizes.touchTarget + theme.spacing[2], paddingLeft: theme.spacing[4], paddingRight: theme.spacing[2] }}>
            {dot}
            <Text style={{ flex: 1 }} accessibilityLabel={`标签：${label.name}`}>{label.name}</Text>
            {menu}
          </View>;
        })}
      </ListGroup>
    </Stack>
  </HouseholdScreen>
    {action && canManage ? <AppDialog title={pendingAction ? '切换标签？' : action.kind === 'create' ? '创建标签' : action.kind === 'edit' ? '编辑标签' : '删除标签'} size={desktop && action.kind !== 'delete' ? 'editor' : 'standard'} docked={desktop && (action.kind !== 'delete' || deletingFromPane)} busy={busy} onClose={close} trigger={trigger} footer={desktop && !pendingAction && action.kind !== 'delete' ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] }}>
      {/* Deleting is a quieter, separate choice at the far edge; the two answers to the form sit together on the right. */}
      {action.kind === 'edit' ? <Pressable accessibilityRole="button" accessibilityLabel="删除标签" disabled={busy} onPress={() => { setDeletingFromPane(true); setAction({ kind: 'delete', label: action.label }); }} style={({ pressed }) => ({ minHeight: theme.layout.desktopControl, justifyContent: 'center', paddingHorizontal: theme.spacing[2], marginLeft: -theme.spacing[2], borderRadius: theme.borderRadii.md, backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.transparent })}><Text variant="label" color={busy ? 'inkMuted' : 'destructive'}>删除标签</Text></Pressable> : null}
      <View style={{ flex: 1 }} />
      <Button label="取消" tone="secondary" size="compact" disabled={busy} onPress={close} />
      <Button label={action.kind === 'create' ? '创建' : '保存'} size="compact" loading={busy} onPress={() => void submit()} />
    </View> : null}>
      {pendingAction ? <Stack gap={4}><Text>当前标签还有未保存的修改。</Text><ConfirmActions cancelLabel="继续编辑" confirmLabel="放弃修改并切换" onCancel={() => setPendingAction(null)} onConfirm={() => { applyOpen(pendingAction); setPendingAction(null); }} /></Stack> : <Stack gap={4}>
        {action.kind === 'delete' ? <Text>删除“{action.label.name}”后，它会从所有日程和任务中移除，日程和任务本身会保留。</Text> : <>
          <TextField ref={nameInput} autoFocus={!desktop && focusFieldOnOpen} label={action.kind === 'create' ? '标签名称' : '编辑标签名称'} value={name} onChangeText={(text) => { setName(text); if (text.trim()) setNameError(null); }} maxLength={30} disabled={busy} {...(nameError === null ? {} : { error: nameError })} returnKeyType="done" onSubmitEditing={() => void submit()} />
          <Stack gap={2}>
            <Text variant="label">颜色</Text>
            <View accessibilityRole="radiogroup" accessibilityLabel="标签颜色" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[2] }}>
              {/* A wide pane shows each colour as a full swatch and rings the chosen one; a phone keeps small dots in outlined targets. */}
              {labelColorPresets.map(preset => <Pressable key={preset} accessibilityRole="radio" accessibilityLabel={`选择颜色 ${preset}`} accessibilityState={{ checked: color === preset, disabled: busy }} aria-checked={color === preset} disabled={busy} onPress={() => setColor(preset)} style={{ minWidth: theme.controlSizes.touchTarget, minHeight: theme.controlSizes.touchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: theme.borderRadii.full, borderWidth: desktop ? theme.borderWidths.focus : theme.borderWidths.default, borderColor: color === preset ? theme.colors.ink : desktop ? theme.colors.transparent : theme.colors.separator }}>
                <View style={{ width: desktop ? swatch : theme.controlSizes.icon, height: desktop ? swatch : theme.controlSizes.icon, borderRadius: theme.borderRadii.full, backgroundColor: preset }} />
              </Pressable>)}
            </View>
          </Stack>
          {desktop ? <Stack gap={2}><Text variant="label">效果预览</Text>
            {/* The label as it will appear: a chip, on a task row and on a calendar block. */}
            <Stack gap={3} style={{ padding: theme.spacing[3], borderWidth: theme.borderWidths.default, borderColor: theme.colors.separator, borderRadius: theme.borderRadii.md }}>
              <View style={{ flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: theme.spacing[2], borderWidth: theme.borderWidths.default, borderColor: theme.colors.outline, borderRadius: theme.borderRadii.full, paddingHorizontal: theme.spacing[3], paddingVertical: theme.spacing[1] }}><View style={{ width: theme.spacing[2], height: theme.spacing[2], borderRadius: theme.borderRadii.full, backgroundColor: color }} /><Text variant="bodySm" color="ink">{previewName}</Text></View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] }}><View style={{ width: theme.spacing[4], height: theme.spacing[4], borderRadius: theme.borderRadii.full, borderWidth: theme.borderWidths.focus - 0.5, borderColor: theme.colors.border }} /><Text variant="bodySm" color="ink">示例任务</Text><View style={{ width: theme.spacing[1] * 2, height: theme.spacing[1] * 2, borderRadius: theme.borderRadii.full, backgroundColor: color }} /><Text variant="meta" numberOfLines={1} style={{ flexShrink: 1 }}>{previewName}</Text></View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2], paddingHorizontal: theme.spacing[2], paddingVertical: theme.spacing[1], borderRadius: theme.borderRadii.sm, borderLeftWidth: theme.borderWidths.focus + 1, borderLeftColor: color, backgroundColor: labelTint(color) }}><Text variant="time">16:30</Text><Text variant="bodySm" color="ink">示例日程</Text></View>
            </Stack>
          </Stack> : null}
        </>}
        {actionError ? <Text color="destructive" accessibilityRole="alert">{actionError}</Text> : null}
        {action.kind === 'delete' ? <ConfirmActions cancelLabel="取消删除" confirmLabel="确认删除" confirmAccessibilityLabel={`确认删除标签 ${action.label.name}`} destructive busy={busy} onCancel={close} onConfirm={() => void submit()} /> : !desktop ? <FormActions onCancel={close} onSubmit={() => void submit()} submitting={busy} submitLabel={action.kind === 'create' ? '创建' : '保存'} /> : null}
      </Stack>}
    </AppDialog> : null}
  </>;
}
